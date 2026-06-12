# NEXO ITSM

Plataforma modular de gestión de servicios TI (ITSM) para helpdesk, inventario, gestión administrativa, reportes y auditoría. Arquitectura monorepo NestJS 11 + Next.js 15 con RBAC granular, SLA automático, notificaciones en tiempo real y soporte PWA.

**Demo en producción:** https://nexo.proyectoscampus.top

---

## Módulos del sistema

### Mesa de Ayuda (Helpdesk)

Gestión completa del ciclo de atención de incidentes y solicitudes técnicas:

- Creación de tickets con prioridad, categoría y descripción
- Asignación manual, round-robin y por especialización
- Máquina de estados (FSM) con transiciones por rol
- Escalamiento automático y manual
- SLA con pausas, reanudaciones y horarios laborales
- Workspace del ticket: timeline unificada, comentarios internos/públicos, adjuntos, reuniones
- Validación y calificación del cierre por el usuario
- Base de conocimiento con permisos por rol
- Dashboard SLA (breached / critical / warning / ok / met)
- Centro de técnicos con disponibilidad y workload en tiempo real
- Reportes por operación, técnicos y SLA

### Inventario

Gestión CMDB de activos tecnológicos:

- Fichas CMDB con specs dinámicas por tipo de activo
- Generación y escaneo de código QR
- Importación masiva desde CSV
- Historial de custodia y movimientos
- Galería de imágenes con gestión visual
- Jerarquía padre-hijo entre activos
- Integración bidireccional con tickets del Helpdesk
- Trazabilidad completa por activo

### Gestión Administrativa

Centralización de solicitudes internas no técnicas:

- Solicitudes de cambio de rol, acceso a módulo, corrección de datos, entre otras
- Flujo de 5 etapas: pending → taken → in_progress → under_review → approved / rejected
- Aprobaciones con justificación y escalamiento automático
- Auditoría completa de cada acción
- Enrutamiento automático al admin del módulo correspondiente

### Reportes

Información operativa y ejecutiva:

- KPIs por módulo: total, activos, resueltos, reprocesos, tiempo promedio
- Cumplimiento SLA global y por módulo
- Productividad por técnico (resolución, rating, reprocesos)
- Métricas de inventario
- Exportación CSV
- Auditoría filtrable con export

### Administración y Configuración

- Gestión de usuarios (CRUD, roles por módulo, skills, disponibilidad)
- RBAC: 60 permisos granulares, asignación por usuario/módulo
- Organigrama visual interactivo (drag & drop, jerarquías dinámicas)
- Configuración de SLA por categoría y prioridad
- Horarios laborales y días feriados
- Motor de prioridad configurable
- Papelera con soft-delete 90 días y eliminación con re-autenticación

---

## Stack tecnológico

### Backend
| Tecnología | Rol |
|---|---|
| **NestJS 11 + TypeScript** | Framework principal |
| **PostgreSQL 16 (Railway)** | Base de datos — schema v7.0, 15 schemas |
| **JWT (passport-jwt)** | Auth stateless — access 15 min / refresh 7 días |
| **bcrypt** | Hash de contraseñas (12 rounds) |
| **speakeasy + qrcode** | TOTP 2FA (Google Authenticator) |
| **Resend** | Emails transaccionales (OTP, recuperación) |
| **passport-google-oauth20** | Login OAuth Google |
| **Socket.IO** | Notificaciones en tiempo real (WebSocket) |
| **EventEmitter2** | Bus de eventos interno |
| **@nestjs/schedule** | Schedulers (SLA auto-escalation cada 30 min) |
| **Helmet + CORS + Throttler** | Seguridad HTTP y rate limiting |
| **Swagger/OpenAPI** | Documentación automática en `/docs` |

### Frontend
| Tecnología | Rol |
|---|---|
| **Next.js 15 + App Router** | Framework React |
| **TypeScript** | Lenguaje principal |
| **CSS Modules** | Estilos por componente |
| **Zustand** | Estado global |
| **TanStack Query** | Fetching, caché e invalidación |
| **Socket.IO Client** | Notificaciones en tiempo real |
| **Recharts** | Gráficos y reportes |
| **Lucide React** | Iconografía |

### Infraestructura
| Tecnología | Rol |
|---|---|
| **Docker + Docker Compose** | Contenedores dev y producción |
| **Nginx** | Proxy reverso y SSL termination |
| **GitHub Actions** | CI/CD — deploy automático vía SSH |
| **Railway** | PostgreSQL gestionado en producción |

---

## Arquitectura del monorepo

```
Sistema modular Gestion Tickets/
├── apps/
│   ├── backend/                   NestJS API
│   │   └── src/modules/
│   │       ├── auth/              JWT, 2FA TOTP, Google OAuth, OTP
│   │       ├── users/             CRUD, roles, skills, disponibilidad
│   │       ├── tickets/           Helpdesk, FSM, SLA, asignación
│   │       ├── inventory/         CMDB, assets, specs dinámicas
│   │       ├── requests/          Solicitudes administrativas, flujo 5 etapas
│   │       ├── notifications/     Bell, email, Socket.IO
│   │       ├── calendar/          Grid mensual, reuniones
│   │       ├── reporting/         KPIs, SLA, técnicos, export CSV
│   │       ├── audit/             Timeline por entidad, filtros
│   │       ├── config/            SLA, horarios, feriados, organigrama
│   │       ├── trash/             Soft-delete 90 días, bulk restore
│   │       └── system-modules/    Módulos organizacionales
│   └── frontend/                  Next.js 15 App Router
│       └── src/app/(app)/
│           ├── dashboard/         Módulos y métricas globales
│           ├── tickets/           Vista Helpdesk
│           ├── inventory/         Vista Inventario
│           ├── requests/          Gestión administrativa
│           ├── calendar/          Calendario + reuniones
│           ├── notifications/     Historial de notificaciones
│           ├── reports/           Reportes globales
│           ├── audit/             Auditoría
│           ├── users/             Gestión de usuarios
│           ├── roles/             RBAC + permisos
│           ├── config/            Configuración global
│           └── trash/             Papelera
├── database/
│   ├── SCHEMA_MASTER.sql          Schema completo v7.0
│   └── migrations/                Migraciones 001–037+
├── nginx/nginx.conf               Proxy reverso
├── docker-compose.yml             Producción (Railway DB)
└── docker-compose.local.yml       Override con PostgreSQL local
```

---

## Seguridad

- **Autenticación JWT** — access token 15 min + refresh token 7 días
- **2FA TOTP** — Google Authenticator (speakeasy)
- **Google OAuth 2.0** — login sin contraseña
- **RBAC granular** — 60 permisos, 5 roles por módulo, bypass superadmin
- **Rate limiting** — 100 req/60s por IP
- **Bloqueo temporal** — 3 intentos fallidos → bloqueo progresivo
- **Auditoría completa** — toda acción crítica queda registrada con actor, IP y timestamp
- **Soft-delete con re-auth** — eliminación definitiva requiere contraseña

---

## Despliegue con Docker

```bash
# Producción (Railway DB — default)
docker compose up -d

# Desarrollo con PostgreSQL local
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d
```

Contenedores:

| Contenedor | Puerto | Descripción |
|---|---|---|
| `tickets_backend` | 3001 | API NestJS |
| `tickets_frontend` | 3000 | App Next.js |
| `tickets_nginx` | 80/443 | Proxy reverso |

URLs locales:

| Servicio | URL |
|---|---|
| App web | http://localhost |
| API | http://localhost:3001/api/v1 |
| Swagger | http://localhost:3001/docs |
| Health | http://localhost:3001/health |

---

## Desarrollo local (sin Docker)

```bat
rem Windows — script automático
start-dev.bat
```

```bash
# Backend
cd apps/backend && npm install && npm run start:dev

# Frontend (otra terminal)
cd apps/frontend && npm install && npm run dev
```

---

## Variables de entorno principales

### `apps/backend/.env`

```env
DATABASE_URL=postgresql://...
JWT_SECRET=...
JWT_REFRESH_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=https://nexo.proyectoscampus.top/api/v1/auth/google/callback
RESEND_API_KEY=re_...
APP_URL=https://nexo.proyectoscampus.top
ALLOWED_ORIGINS=https://nexo.proyectoscampus.top
NODE_ENV=production
```

### `apps/frontend/.env.local`

```env
NEXT_PUBLIC_API_URL=https://nexo.proyectoscampus.top
```

---

## RBAC — Jerarquía de roles

```
superadmin           → acceso total, bypass completo
  │
admin_modulo         → gestión completa de su(s) módulo(s)
  │
jefe_tecnico         → supervisión operativa del módulo
  │
tecnico              → resolución de tickets asignados
  │
usuario              → creación de tickets/solicitudes propias
```

60 permisos granulares agrupados por recurso (`tickets:create`, `inventory:edit`, `requests:view_all`, etc.).

---

## Credenciales de demo

| Campo | Valor |
|---|---|
| Email | `joselu.rubio2008@gmail.com` |
| Password | `AdminPass2026!` |
| Rol | Superadmin |

---

## Estado del proyecto

| Módulo / Feature | Estado |
|---|---|
| Auth (JWT, 2FA, OAuth Google, OTP) | ✅ Completo |
| Helpdesk (tickets, SLA, FSM, workspace) | ✅ Completo |
| Inventario (CMDB, QR, custodia, tickets) | ✅ Completo |
| Gestión Administrativa (solicitudes) | ✅ Funcional |
| Notificaciones (in-app + email + WebSocket) | ✅ Completo |
| Calendario (grid custom, reuniones) | ✅ Completo |
| Reportes (KPIs, SLA, técnicos, CSV) | ✅ Funcional |
| Auditoría (timeline, filtros, export) | ✅ Completo |
| RBAC (60 permisos, PermissionGuard) | ✅ Completo |
| Organigrama (React Flow + Dagre) | ✅ Completo |
| Papelera (soft-delete, bulk, re-auth) | ✅ Completo |
| Usuarios (CRUD, roles, skills) | ✅ Completo |
| PWA (manifest, SW, install prompt) | ✅ Completo |
| Dark mode | ✅ Completo |
| Responsive (header, sidebar, módulos) | ✅ Completo |
| CI/CD (GitHub Actions → SSH deploy) | ✅ Activo |

---

## Autor

Proyecto desarrollado como solución formativa orientada a la transformación digital de procesos organizacionales mediante buenas prácticas ITSM.
