# NEXO ITSM — Sistema Modular de Gestión de Tickets

Plataforma ITSM enterprise para gestión de tickets, inventario, solicitudes administrativas y reportes. Arquitectura monorepo NestJS 11 + Next.js 14 con autenticación completa, RBAC por módulo, SLA automático y soporte multi-módulo.

---

## Stack tecnológico

### Backend
| Tecnología | Rol |
|---|---|
| **Node.js 20 + TypeScript** | Runtime y lenguaje principal |
| **NestJS 11** | Framework HTTP (módulos, guards, pipes, filtros) |
| **PostgreSQL 16** | Base de datos principal — schema v7.0 (15 schemas) |
| **TypeORM** | Solo como conector/DataSource — queries 100% SQL raw |
| **JWT (passport-jwt)** | Autenticación stateless — access 15min / refresh 7 días |
| **bcrypt** | Hash de contraseñas (12 rounds) |
| **speakeasy + qrcode** | TOTP 2FA (Google Authenticator) |
| **Resend** | Envío de emails (OTP, recuperación de contraseña) |
| **passport-google-oauth20** | Login con Google OAuth2 |
| **Helmet + CORS** | Seguridad HTTP |
| **@nestjs/throttler** | Rate limiting: 100 req/60s por IP |
| **@nestjs/schedule** | Schedulers (SLA auto-escalation cada 30 min) |
| **EventEmitter2** | Bus de eventos interno (notificaciones, escalation) |
| **Redis (ioredis)** | Caché y pub/sub |
| **Swagger/OpenAPI** | Documentación automática en `/docs` |
| **Docker + Docker Compose** | Contenedores para dev y producción |

### Frontend
| Tecnología | Rol |
|---|---|
| **Next.js 14** | Framework React con App Router |
| **TypeScript** | Lenguaje principal |
| **CSS Modules** | Estilos por componente |
| **Zustand** | Estado global |
| **SWR** | Fetching y caché de datos |
| **Recharts** | Gráficos y reportes |
| **Anime.js** | Animaciones |
| **Lucide React** | Iconografía |

---

## Arquitectura del monorepo

```
Sistema modular Gestion Tickets/
├── apps/
│   ├── backend/                   NestJS API
│   │   ├── src/
│   │   │   ├── gateway/           Guards, filtros, decoradores globales
│   │   │   ├── health/            Health check endpoint
│   │   │   ├── infrastructure/    TypeORM CLI config
│   │   │   ├── shared/            SharedModule (DataSource global)
│   │   │   └── modules/
│   │   │       ├── auth/          ✅ JWT, 2FA TOTP, Google OAuth, OTP
│   │   │       ├── users/         ✅ CRUD, roles, skills, disponibilidad
│   │   │       ├── system-modules/ ✅ Módulos organizacionales
│   │   │       ├── tickets/       ✅ CRUD, SLA, asignación, timeline
│   │   │       ├── inventory/     ✅ CMDB-style, assets, specs
│   │   │       ├── requests/      ✅ Flujo 5-etapas, SLA, scheduler
│   │   │       ├── notifications/ ✅ Bell, email, EventEmitter2
│   │   │       ├── reporting/     ✅ Reportes enterprise, PDF/Excel
│   │   │       ├── audit/         ✅ Audit log, timeline por entidad
│   │   │       ├── calendar/      ✅ Grid mensual/anual, reuniones
│   │   │       ├── config/        ✅ SLA, categorías, horarios, RBAC
│   │   │       ├── trash/         ✅ Soft-delete, 90 días, bulk re-auth
│   │   │       └── files/         ✅ Upload local/S3
│   │   └── Dockerfile
│   └── frontend/                  Next.js 14 App Router
│       └── src/
│           ├── app/(app)/         Rutas autenticadas
│           │   ├── dashboard/     Métricas globales
│           │   ├── tickets/       Módulo Helpdesk
│           │   ├── inventory/     Módulo Inventario
│           │   ├── requests/      Solicitudes (superadmin: oversight)
│           │   ├── helpdesk/requests/  Solicitudes desde Helpdesk
│           │   ├── inventory/requests/ Solicitudes desde Inventario
│           │   ├── calendar/      Calendario + reuniones
│           │   ├── config/        Configuración global
│           │   ├── users/         Gestión de usuarios
│           │   ├── roles/         RBAC + permisos
│           │   ├── reports/       Reportes enterprise
│           │   ├── audit/         Auditoría
│           │   └── trash/         Papelera
│           ├── services/          Clientes HTTP (SWR + fetch)
│           ├── stores/            Zustand stores
│           └── types/             Tipos compartidos
├── database/
│   ├── SCHEMA_MASTER.sql          Schema completo v7.0 (15 schemas)
│   └── migrations/                Migraciones incrementales (001–037+)
├── nginx/
│   └── nginx.conf                 Proxy reverso (HTTP/HTTPS)
├── docker-compose.yml             Producción: Railway DB por defecto (sin postgres local)
├── docker-compose.local.yml       Override: activa postgres local + sobreescribe DATABASE_URL
├── docker-compose.railway.yml     Alias legacy (equivalente al docker-compose.yml actual)
└── start-dev.bat                  Atajo Windows — arranca backend + frontend
```

---

## Levantar con Docker

### Prioridad de variables de entorno

```
apps/backend/.env  (env_file)   ← DATABASE_URL Railway — SIEMPRE GANA
environment block               ← NO define DATABASE_URL — no sobreescribe
```

El bloque `environment` de Docker Compose tiene mayor precedencia que `env_file`.
Por eso `DATABASE_URL` fue **eliminado** del bloque `environment` en `docker-compose.yml`.
El backend lee el valor directamente de `apps/backend/.env`, donde está la URL de Railway.

---

### Modo por defecto — Railway (producción)

`apps/backend/.env` debe tener `DATABASE_URL` apuntando a Railway antes de levantar.

```bash
# Verificar que DATABASE_URL en apps/backend/.env es Railway:
# DATABASE_URL=postgresql://postgres:<pass>@tramway.proxy.rlwy.net:16466/railway

docker compose up -d
```

Contenedores que arrancan:

| Contenedor | Imagen | Puerto | Descripción |
|---|---|---|---|
| `tickets_redis` | redis:7-alpine | `6379` | Caché y pub/sub |
| `tickets_backend` | build local | `3001` | API NestJS → Railway DB |
| `tickets_frontend` | build local | `3000` | App Next.js |
| `tickets_nginx` | nginx:alpine | `80` / `443` | Proxy reverso |

`tickets_postgres` **no arranca** — la DB es Railway.

#### URLs disponibles

| Servicio | URL |
|---|---|
| **App web** | http://localhost (vía nginx) |
| **Frontend directo** | http://localhost:3000 |
| **API backend** | http://localhost:3001/api/v1 |
| **Swagger UI** | http://localhost:3001/docs |
| **Health check** | http://localhost:3001/health |

#### Verificar que el backend usa Railway

```bash
docker exec tickets_backend printenv DATABASE_URL
# Debe mostrar: postgresql://postgres:...@tramway.proxy.rlwy.net:16466/railway
```

---

### Modo desarrollo aislado — PostgreSQL local

Usa `docker-compose.local.yml` como override. Este archivo:
- Quita la restricción de perfil del servicio `postgres` → arranca el contenedor
- Sobreescribe `DATABASE_URL` → apunta al postgres local
- Activa `MIGRATIONS_DIR` → corre migraciones al iniciar

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d
```

Contenedores adicionales que arrancan:

| Contenedor | Imagen | Puerto | Descripción |
|---|---|---|---|
| `tickets_postgres` | postgres:16-alpine | `5432` | PostgreSQL local con schema aplicado |

---

### Comandos útiles de Docker

```bash
# Detener todo
docker compose down

# Detener y borrar volúmenes (reset completo de DB local)
docker compose down -v

# Reconstruir backend (después de cambios de código)
docker compose build backend && docker compose up -d backend

# Reconstruir frontend
docker compose build frontend && docker compose up -d frontend

# Ver variable DATABASE_URL en runtime (confirmar Railway)
docker exec tickets_backend printenv DATABASE_URL

# Acceder al shell del backend
docker exec -it tickets_backend sh

# Acceder a PostgreSQL local (solo en modo local)
docker exec -it tickets_postgres psql -U tickets_user -d tickets_db

# Ver logs del scheduler SLA
docker compose logs backend | grep -i scheduler

# Activar RabbitMQ (perfil opcional)
docker compose --profile rabbitmq up -d
# RabbitMQ Management UI: http://localhost:15672
```

---

## Desarrollo local (sin Docker)

### Windows — script automático

```bat
start-dev.bat
```

Libera puertos 3000 y 3001, abre dos ventanas CMD: backend en 3001 y frontend en 3000.

### Manual

```bash
# Backend
cd apps/backend
npm install
npm run start:dev          # http://localhost:3001

# Frontend (otra terminal)
cd apps/frontend
npm install
npm run dev                # http://localhost:3000
```

---

## Variables de entorno

### `apps/backend/.env`

```env
# Base de datos
DATABASE_URL=postgresql://tickets_user:tickets_pass@localhost:5432/tickets_db

# JWT
JWT_SECRET=secreto_muy_largo_minimo_32_chars
JWT_REFRESH_SECRET=otro_secreto_diferente

# Google OAuth
GOOGLE_CLIENT_ID=tu_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=tu_google_secret
GOOGLE_CALLBACK_URL=http://localhost:3001/api/v1/auth/google/callback

# Email (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxx

# URLs
APP_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000

# Entorno
NODE_ENV=development

# Redis
REDIS_URL=redis://localhost:6379

# Storage
STORAGE_DRIVER=local    # o 's3' para producción
```

### `apps/frontend/.env` (opcional en dev)

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

> **IMPORTANTE:** Nunca commitear `apps/backend/.env` — contiene credenciales reales y está en `.gitignore`.

---

## Swagger UI

Disponible **solo en desarrollo** en `http://localhost:3001/docs`

### Autenticarse en Swagger

1. `POST /api/v1/auth/login` → ejecutar con email y password
2. Copiar `access_token` de la respuesta
3. Clic en **Authorize** (candado arriba a la derecha)
4. Pegar en campo `BearerAuth` → **Authorize**

> El `access_token` expira en 15 min. Usar `POST /api/v1/auth/refresh` con el `refresh_token` para renovar.

### Flujo con 2FA en Swagger

Si el usuario tiene TOTP activo, el login retorna `{ requires_mfa: true, mfa_token }`.

1. Copiar `mfa_token` → autorizar con ese token
2. `POST /api/v1/auth/mfa/verify` con el código del authenticator
3. Retorna tokens reales → autorizar con `access_token`

---

## Módulos del sistema

| Módulo | Descripción | Estado |
|---|---|---|
| **auth** | JWT, refresh, 2FA TOTP, Google OAuth, OTP email, recuperación password | ✅ |
| **users** | CRUD usuarios, roles por módulo, skills, disponibilidad de técnicos | ✅ |
| **system-modules** | Gestión de módulos organizacionales, asignación de admins | ✅ |
| **tickets** | CRUD tickets, SLA, asignación, timeline, categorías, prioridades | ✅ |
| **inventory** | CMDB-style: assets, specs dinámicas por tipo, asociación con tickets | ✅ |
| **requests** | Solicitudes administrativas 5 etapas, SLA auto-escalation, oversight | ✅ |
| **notifications** | Bell, email, EventEmitter2, badges en tiempo real | ✅ |
| **calendar** | Grid mensual/anual custom, reuniones Teams/Zoom, multi-módulo | ✅ |
| **config** | SLA por categoría, horarios laborales, holidays, RBAC master | ✅ |
| **reporting** | Reportes enterprise por módulo, Recharts, PDF/Excel export | ✅ |
| **audit** | Timeline por entidad, filtros, export CSV/PDF, KPIs | ✅ |
| **trash** | Papelera unificada, soft-delete 90 días, bulk restore/delete con re-auth | ✅ |
| **files** | Upload local y S3, asociación con tickets/assets | ✅ |

---

## RBAC — Jerarquía de roles

```
superadmin           → acceso total al sistema, sin restricción de módulo
  │
admin_modulo         → gestión completa de su(s) módulo(s) asignados
  │
jefe_tecnico         → supervisión de técnicos en su módulo
  │
tecnico              → resolución de tickets asignados
  │
usuario              → creación de tickets/solicitudes
```

El motor RBAC maneja **60 permisos granulares** agrupados por recurso (`tickets:create`, `inventory:edit`, `requests:view_all`, etc.). Los permisos se asignan por usuario/módulo desde `/config/roles`.

---

## Flujo de solicitudes (Requests)

Las solicitudes pasan por 5 etapas con control de permisos en cada transición:

```
pending → taken → in_progress → under_review → approved / rejected
                                              ↘ cancelled
```

El **scheduler SLA** corre cada 30 minutos y escala automáticamente las solicitudes cuyo `sla_due_at` haya vencido sin completarse.

---

## Base de datos

Schema v7.0 con 15 schemas PostgreSQL:

`app`, `auth`, `users`, `config`, `modules`, `tickets`, `inventory`, `files`, `notifications`, `audit`, `events`, `reports`, `maintenance`, `calendar`, `requests`

El schema maestro está en `database/SCHEMA_MASTER.sql`. Al usar `docker-compose.yml` se aplica automáticamente al crear el contenedor de PostgreSQL.

Para aplicar manualmente:

```bash
psql -U tickets_user -d tickets_db -f database/SCHEMA_MASTER.sql
```

Las migraciones incrementales (para bases existentes) están en `database/migrations/`. Se aplican automáticamente al iniciar el backend cuando `MIGRATIONS_DIR` apunta a esa ruta.

---

## Referencia de endpoints

> Base URL: `http://localhost:3001/api/v1`
> 🔒 = requiere `Authorization: Bearer <token>`

### Auth — `/auth`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/auth/login` | ❌ | Login email+password. Retorna tokens o challenge MFA |
| POST | `/auth/refresh` | ❌ | Rotar access_token con refresh_token |
| GET | `/auth/me` | 🔒 | Usuario autenticado + estado MFA |
| POST | `/auth/logout` | 🔒 | Revocar refresh_token activo |
| GET | `/auth/google` | ❌ | Redirige a Google OAuth (abrir en browser) |
| GET | `/auth/google/callback` | ❌ | Callback OAuth — redirige con tokens en URL hash |
| POST | `/auth/mfa/verify` | mfa_token | Verificar código TOTP — retorna tokens reales |
| GET | `/auth/mfa/setup` | 🔒 | Generar QR para Google Authenticator |
| POST | `/auth/mfa/enable` | 🔒 | Confirmar enrolamiento TOTP con primer código |
| POST | `/auth/otp/verify` | otp_token | Verificar código OTP de email |
| POST | `/auth/otp/enable` | 🔒 | Habilitar 2FA por email |
| POST | `/auth/otp/disable` | 🔒 | Deshabilitar 2FA por email |
| POST | `/auth/password/forgot` | ❌ | Enviar email con link de recuperación |
| POST | `/auth/password/reset` | ❌ | Resetear contraseña con token del email |

### Users — `/users`

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/users` | Crear usuario (superadmin / admin_modulo) |
| GET | `/users` | Listar con filtros: `search`, `is_active`, `page`, `limit` |
| GET | `/users/:id` | Perfil completo + roles en todos sus módulos |
| PATCH | `/users/:id` | Actualizar datos del usuario |
| DELETE | `/users/:id` | Soft-delete + revocar sesiones (superadmin) |
| GET | `/users/me` | Perfil propio |
| PATCH | `/users/me` | Actualizar nombre, teléfono, avatar |
| PATCH | `/users/me/password` | Cambiar contraseña |
| GET | `/users/module/:moduleId` | Usuarios activos del módulo con roles |
| POST | `/users/:id/roles` | Asignar rol en módulo |
| DELETE | `/users/:id/roles/:umrId` | Quitar rol |
| GET | `/users/:id/availability` | Estado de disponibilidad |
| PUT | `/users/:id/availability` | Setear disponible/no disponible |
| GET | `/users/:id/skills` | Skills del técnico |
| POST | `/users/:id/skills` | Agregar skill |
| PATCH | `/users/:id/skills/:skillId` | Editar skill |
| DELETE | `/users/:id/skills/:skillId` | Desactivar skill |

### Requests — `/requests`

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/requests` | Crear solicitud |
| GET | `/requests/me` | Mis solicitudes |
| DELETE | `/requests/me/:id` | Cancelar mi solicitud |
| PATCH | `/requests/me/:id/complete` | Marcar completada (usuario) |
| GET | `/requests/stats` | Estadísticas globales (admin) |
| GET | `/requests/stats/mine` | Mis estadísticas |
| GET | `/requests/user/:id` | Solicitudes de un usuario |
| GET | `/requests` | Todas (con filtros: módulo, estado, escalado) |
| PATCH | `/requests/:id/review` | Aprobar/rechazar solicitud |
| POST | `/requests/:id/take` | Tomar solicitud asignada |
| PATCH | `/requests/:id/progress` | Actualizar progreso |
| POST | `/requests/:id/escalate` | Escalar manualmente |
| DELETE | `/requests/:id/escalate` | Des-escalar |
| GET | `/requests/:id/timeline` | Timeline de la solicitud |

### System Modules — `/system-modules`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/system-modules` | Listar módulos activos |
| GET | `/system-modules/:id` | Módulo con conteo de miembros |
| POST | `/system-modules` | Crear módulo |

### Health

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado del servicio (sin prefijo `/api/v1`) |

---

## Gestión de usuarios — flujo del administrador

No hay registro público. El superadmin crea todos los usuarios desde la app o la API.

### Crear usuario vía API

```
POST /api/v1/users
Authorization: Bearer <access_token_superadmin>

{
  "first_name": "Juan",
  "last_name": "García",
  "email": "juan@empresa.com",
  "password": "Password123!",
  "phone": "+573001234567"
}
```

### Asignar rol en un módulo

```
POST /api/v1/users/:id/roles
Authorization: Bearer <access_token_superadmin_o_admin_modulo>

{
  "module_id": "uuid-del-modulo",
  "role_id": "uuid-del-rol"
}
```

---

## Credenciales de demo

| Campo | Valor |
|---|---|
| Email | `joselu.rubio2008@gmail.com` |
| Password | `AdminPass2026!` |
| Rol | Superadmin |

---

## Roadmap

| Fase | Descripción | Estado |
|---|---|---|
| Fase 0 | Fundación: auth, users, RBAC, módulos | ✅ Completo |
| Fase 1 | Tickets + Inventario core | ✅ Completo |
| Fase 2 | Solicitudes + SLA + Scheduler | ✅ Completo |
| Fase 3 | Gestión administrativa: config, SLA engine, routing | ✅ Completo |
| Fase 4 | Calendar, Trash, Notifications enterprise | ✅ Completo |
| Fase 5 | Responsive 100% (todos los módulos) | ✅ Completo |
| Fase 6 | Reports enterprise + Auditoría enterprise | 🔄 En progreso |
| Fase 7 | Merge a main + Deploy WDS | ⏳ Pendiente |
| Fase 8 | Security: httpOnly cookies, refresh rotation, rate limit por usuario | ⏳ Pendiente |
