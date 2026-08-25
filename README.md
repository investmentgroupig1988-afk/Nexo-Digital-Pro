# TRENORO

TRENORO es una aplicación React/Vite y API Express con dashboard comercial de señales persistidas para `BTCUSDT`. El motor usa datos reales e indicadores internos, no fuerza señales y no ejecuta operaciones. `XAUUSD` permanece bloqueado y no forma parte de este release candidate.

## Arquitectura actual

```text
Browser (React + React Query)
  -> lib/api-client-react (customFetch + cookies HttpOnly)
  -> Vite /api proxy local o VITE_API_BASE_URL desplegado
  -> Express API
  -> Better Auth + Drizzle -> PostgreSQL
  -> Binance / Twelve Data
```

La landing es pública. El registro e inicio de sesión son reales y usan email, contraseña y username único. Un usuario autenticado sin `access_grant` puede ver su cuenta y el estado comercial, pero no los endpoints ni el panel privado de análisis. El backend verifica sesión, bloqueo y entitlement; el frontend no es la autoridad de permisos.

## Requisitos e instalación

- Node.js `>=24 <25`
- Corepack con pnpm `11.19.0` (fijado en `packageManager`)
- PostgreSQL 13+ para auth, acceso y administración

```text
corepack pnpm install
corepack pnpm run db:migrate
corepack pnpm run dev
```

Copiar `.env.example` a `.env` antes de migrar y configurar `DATABASE_URL`, `BETTER_AUTH_SECRET` (32 caracteres o más) y `BETTER_AUTH_URL=http://localhost:5000`. El comando `dev` inicia API en `5000` y Vite en `5173`; el proxy de Vite mantiene `/api` en local. No se necesita URL localhost embebida para producción: Vercel usa el valor público `VITE_API_BASE_URL` al construir.

## Base de datos y administración

El schema Drizzle está en `lib/db/src/schema/index.ts` y su migración inicial reproducible en `lib/db/drizzle/0000_groovy_kat_farrell.sql`.

```text
corepack pnpm run db:generate  # crear una migración tras cambiar el schema
corepack pnpm run db:migrate   # aplicar migraciones con DATABASE_URL
corepack pnpm run auth:diagnose # diagnóstico de solo lectura; requiere AUTH_DIAGNOSTIC_EMAILS
```

Después de registrar la primera cuenta, definir temporalmente `ADMIN_EMAIL` para esa cuenta y ejecutar:

```text
corepack pnpm run admin:bootstrap
```

No existe usuario admin ni contraseña predefinida. El rol `admin` tiene el catálogo de permisos inicial completo y cada grant, revocación, bloqueo, desbloqueo o cambio de rol queda en `audit_logs`.

La guía completa de schema, rutas, cookies, pruebas de PostgreSQL y Railway está en [docs/AUTH_AND_DATABASE.md](docs/AUTH_AND_DATABASE.md). La guía de despliegue Vercel/Railway continúa en [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Para investigar de forma segura cuentas creadas por una versión anterior e incompleta, consultar [docs/AUTH_STAGING_RECOVERY.md](docs/AUTH_STAGING_RECOVERY.md).

## Rutas

Públicas: `GET /api/healthz`, `POST /api/auth/register`, `POST /api/auth/login` y las rutas de recuperación/verificación preparadas (devuelven `501` hasta configurar correo).

Con sesión: `POST /api/auth/logout`, `GET /api/me`, `GET /api/access/me`.

Con acceso activo: `GET /api/market`, `GET /api/candles`, `GET /api/indicators`. `/api/signal` se conserva sin cambios y no se presenta en la interfaz comercial.

Administración: `/api/admin/users`, `/api/admin/users/:id`, concesión/revocación/restauración de acceso, bloqueo/desbloqueo, cambio de rol y `/api/admin/audit`. Todos se verifican server-side.

## Verificación

```text
corepack pnpm run typecheck
corepack pnpm run test
corepack pnpm run build
```

Las pruebas de integración de auth no contactan ninguna DB de forma predeterminada. Sólo se habilitan con una base exclusiva cuyo nombre termina en `_test` y las dos variables siguientes:

```powershell
$env:TEST_DATABASE_URL = "postgres://<usuario>:<password>@<host>:5432/trenoro_test"
$env:RUN_DB_INTEGRATION_TESTS = "true"
corepack pnpm run test
```

`TWELVEDATA_API_KEY`, `DATABASE_URL`, `BETTER_AUTH_SECRET` y cualquier credencial son exclusivamente server-side. Nunca deben definirse como `VITE_*` ni incluirse en Git.

## Alcance pendiente

La versión actual incorpora solicitudes manuales de pago, grants comerciales y señales persistidas con resolución e historial. No incorpora Stripe, ejecución automática, copy trading, paper trading ni conexión con cuentas del usuario.
