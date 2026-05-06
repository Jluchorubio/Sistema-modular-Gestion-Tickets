# Sistema Modular de Gestión de Tickets

API REST para gestión de tickets de soporte con arquitectura modular, autenticación completa y control de roles por módulo.

---

## Stack tecnológico

### Backend
| Tecnología | Rol |
|---|---|
| **Node.js 20 + TypeScript** | Runtime y lenguaje principal |
| **NestJS 10** | Framework HTTP (módulos, guards, pipes, filtros) |
| **PostgreSQL 16** | Base de datos principal — schema v6.1 (13 schemas) |
| **TypeORM** | Solo como conector/DataSource — todas las queries son SQL raw |
| **JWT (passport-jwt)** | Autenticación stateless — access 15min / refresh 7 días |
| **bcrypt** | Hash de contraseñas (12 rounds) |
| **speakeasy + qrcode** | TOTP 2FA (Google Authenticator) |
| **Resend** | Envío de emails (OTP, recuperación de contraseña) |
| **passport-google-oauth20** | Login con Google |
| **Helmet + CORS** | Seguridad HTTP |
| **@nestjs/throttler** | Rate limiting: 100 req/60s por IP |
| **Redis** | Preparado para caché y pub/sub (ioredis incluido) |
| **Swagger/OpenAPI** | Documentación automática de endpoints |
| **Docker + Docker Compose** | Contenedores para dev y producción |

### Frontend
| Tecnología | Rol |
|---|---|
| **Next.js 14** | Framework React con App Router |
| **TypeScript** | Lenguaje principal |
| **Tailwind CSS** | Estilos utilitarios |
| **Zustand** | Estado global |
| **SWR** | Fetching y caché de datos |
| **Anime.js** | Animaciones |

---

## Arquitectura

```
Sistema modular Gestion Tickets/
├── apps/
│   ├── backend/                  NestJS API
│   │   └── src/
│   │       ├── gateway/          Guards, filtros, decoradores globales
│   │       ├── health/           Health check endpoint
│   │       ├── infrastructure/   TypeORM CLI config
│   │       ├── shared/           SharedModule (DB connection global)
│   │       └── modules/
│   │           ├── auth/         ✅ Completo
│   │           ├── users/        ✅ Completo
│   │           ├── system-modules/ Parcial
│   │           ├── tickets/      Stub
│   │           ├── inventory/    Stub
│   │           ├── files/        Stub
│   │           ├── notifications/ Stub
│   │           └── reporting/    Stub
│   └── frontend/                 Next.js (en desarrollo)
├── DB_FINAL_v6_1.sql             Schema completo PostgreSQL
├── tests_v6_1.sql                14 tests de regresión del schema
└── docker-compose.yml
```

### Principio de queries
No se usan entidades TypeORM. Todo es SQL raw a través de `DataSource.query()`. Esto permite aprovechar al 100% el schema v6.1 con sus triggers, funciones y constraints sin que TypeORM interfiera.

---

## Levantar el proyecto

### Con Docker (recomendado)
```bash
cp .env.example .env
# editar .env con tus valores

docker compose up -d
```

### Desarrollo local
```bash
# backend
cd apps/backend
cp .env.example .env   # completar variables
npm install
npm run start:dev      # http://localhost:3001

# frontend
cd apps/frontend
cp .env.example .env
npm install
npm run dev            # http://localhost:3000
```

### Variables de entorno — backend
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/tickets_db
JWT_SECRET=tu_secreto_muy_largo
JWT_REFRESH_SECRET=otro_secreto
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=http://localhost:3001/api/v1/auth/google/callback
RESEND_API_KEY=re_...
APP_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000
NODE_ENV=development
```

---

## Swagger UI

Disponible **solo en desarrollo** en `http://localhost:3001/docs`

### Cómo autenticarse en Swagger

1. Ir a `POST /api/v1/auth/login` → ejecutar con email y password
2. Copiar el `access_token` de la respuesta
3. Clic en el botón **Authorize** (candado arriba a la derecha)
4. Pegar el token en el campo `BearerAuth` → **Authorize**
5. Todos los endpoints protegidos ahora envían el header `Authorization: Bearer <token>`

> El `access_token` expira en 15 minutos. Usar `POST /api/v1/auth/refresh` con el `refresh_token` para obtener uno nuevo sin volver a loguearse.

### Flujo con 2FA en Swagger

Si el usuario tiene 2FA activo, el login retorna `{ requires_mfa: true, mfa_token }` en vez de los tokens finales.

1. Copiar el `mfa_token`
2. Pegar en Authorize (reemplaza el token anterior)
3. Ejecutar `POST /api/v1/auth/mfa/verify` con el código del authenticator
4. Retorna los tokens reales → autorizar con el `access_token`

---

## Gestión de usuarios — flujo del administrador

**No hay registro público.** El superadmin crea todos los usuarios desde la API.

### Crear un usuario

```
POST /api/v1/users
Authorization: Bearer <access_token_superadmin>

{
  "first_name": "Juan",
  "last_name": "García",
  "email": "juan@empresa.com",
  "password": "Password123!",
  "phone": "+573001234567",
  "is_superadmin": false
}
```

Retorna el perfil completo con `id`. Guardar ese `id` para el siguiente paso.

### Asignar rol en un módulo

```
POST /api/v1/users/:id/roles
Authorization: Bearer <access_token_superadmin_o_admin_modulo>

{
  "module_id": "uuid-del-modulo",
  "role_id": "uuid-del-rol"
}
```

Roles disponibles por módulo (seeds en `DB_FINAL_v6_1.sql`):
- `usuario` — puede crear tickets
- `tecnico` — puede resolver tickets
- `jefe_tecnico` — supervisa técnicos
- `admin_modulo` — administra el módulo completo

### Editar usuario existente

```
PATCH /api/v1/users/:id
{
  "is_active": false   // desactivar acceso
}
```

### Quitar rol

```
DELETE /api/v1/users/:id/roles/:umrId
```

---

## Referencia de endpoints

> Base URL: `http://localhost:3001/api/v1`
> Todos los endpoints marcados con 🔒 requieren `Authorization: Bearer <token>`

---

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

---

### Users — `/users`

> Crear/listar/editar usuarios requiere rol `superadmin` o `admin_modulo`.
> Perfil propio accesible para cualquier usuario autenticado.

#### Administración de usuarios

| Método | Ruta | Rol requerido | Descripción |
|---|---|---|---|
| POST | `/users` | superadmin \| admin_modulo | Crear usuario. Genera perfil + credencial + preferencias |
| GET | `/users` | superadmin \| admin_modulo | Listar usuarios. Filtros: `search`, `is_active`, `is_superadmin`, `page`, `limit` |
| GET | `/users/:id` | superadmin \| admin_modulo | Perfil completo + roles en todos sus módulos |
| PATCH | `/users/:id` | superadmin \| admin_modulo | Actualizar campos. Solo superadmin toca `is_superadmin` |
| DELETE | `/users/:id` | superadmin | Soft-delete + revocar todas sus sesiones |

#### Perfil propio

| Método | Ruta | Rol requerido | Descripción |
|---|---|---|---|
| GET | `/users/me` | 🔒 cualquier usuario | Perfil propio + preferencias + roles |
| PATCH | `/users/me` | 🔒 cualquier usuario | Actualizar nombre, teléfono, avatar |
| PATCH | `/users/me/password` | 🔒 cualquier usuario | Cambiar contraseña — revoca todas las sesiones activas |
| GET | `/users/me/preferences` | 🔒 cualquier usuario | Ver preferencias (idioma, timezone, notificaciones) |
| PUT | `/users/me/preferences` | 🔒 cualquier usuario | Actualizar preferencias completas |

#### Roles por módulo

| Método | Ruta | Rol requerido | Descripción |
|---|---|---|---|
| GET | `/users/module/:moduleId` | superadmin \| admin_modulo | Usuarios activos del módulo con roles y disponibilidad |
| GET | `/users/:id/roles` | superadmin \| admin_modulo | Todos los roles del usuario en todos los módulos |
| POST | `/users/:id/roles` | superadmin \| admin_modulo del módulo | Asignar rol. Reactiva si existía inactivo |
| DELETE | `/users/:id/roles/:umrId` | superadmin \| admin_modulo del módulo | Quitar rol (soft — mantiene historial) |

#### Disponibilidad de técnicos

| Método | Ruta | Rol requerido | Descripción |
|---|---|---|---|
| GET | `/users/:id/availability` | 🔒 cualquier usuario | Estado de disponibilidad por módulo |
| PUT | `/users/:id/availability` | superadmin \| admin_modulo del módulo | Setear disponible/no disponible con razón y fechas |

Razones de no disponibilidad: `vacation`, `maternity_leave`, `sick_leave`, `training`, `other`

#### Skills de técnicos

| Método | Ruta | Rol requerido | Descripción |
|---|---|---|---|
| GET | `/users/:id/skills` | 🔒 cualquier usuario | Skills activas del técnico ordenadas por prioridad |
| POST | `/users/:id/skills` | superadmin \| admin_modulo del módulo | Agregar skill. Reactiva si existía eliminada |
| PATCH | `/users/:id/skills/:skillId` | superadmin \| admin_modulo del módulo | Editar `max_concurrent` y/o `priority` |
| DELETE | `/users/:id/skills/:skillId` | superadmin \| admin_modulo del módulo | Desactivar skill (soft-delete) |

---

### System Modules — `/system-modules`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/system-modules` | Listar módulos activos |
| GET | `/system-modules/:id` | Módulo con conteo de miembros |
| POST | `/system-modules` | Crear módulo |

---

### Health — `/health`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado del servicio (sin prefijo `/api/v1`) |

---

## Seguridad — cómo funciona la autorización

```
Request
  │
  ▼
JwtAuthGuard          → verifica token JWT válido y no es challenge MFA/OTP
  │
  ▼
RolesGuard (si aplica) → verifica is_superadmin en DB
                         o al menos un rol admin_modulo activo en algún módulo
  │
  ▼
Service               → para operaciones de módulo específico, verifica
                         que el actor sea superadmin O tenga admin_modulo
                         en ESE módulo en particular
```

### Jerarquía de roles

```
superadmin           → acceso total, sin restricción de módulo
  │
admin_modulo         → gestión completa de su(s) módulo(s)
  │
jefe_tecnico         → supervisión de técnicos en su módulo
  │
tecnico              → resolución de tickets asignados
  │
usuario              → creación de tickets
```

---

## Estado de módulos

| Módulo | Estado | Endpoints |
|---|---|---|
| auth | ✅ Completo | 14 endpoints |
| users | ✅ Completo | 18 endpoints |
| system-modules | 🔄 Parcial | 3 endpoints básicos |
| tickets | ⏳ Pendiente | — |
| inventory | ⏳ Pendiente | — |
| files | ⏳ Pendiente | — |
| notifications | ⏳ Pendiente | — |
| reporting | ⏳ Pendiente | — |

---

## Schema de base de datos

El archivo `DB_FINAL_v6_1.sql` contiene el schema completo. Ejecutar en PostgreSQL antes de levantar el backend:

```bash
psql -U tickets_user -d tickets_db -f DB_FINAL_v6_1.sql
```

13 schemas: `app`, `auth`, `users`, `config`, `modules`, `tickets`, `inventory`, `files`, `notifications`, `audit`, `events`, `reports`, `maintenance`.

Tests de regresión:
```bash
psql -U tickets_user -d tickets_db -f tests_v6_1.sql
```
