# PostgreSQL, autenticación y acceso

## Tablas y relaciones

La migración `lib/db/drizzle/0000_groovy_kat_farrell.sql` crea las tablas de Better Auth `user`, `session`, `account` y `verification`; catálogo `roles`, `permissions` y `role_permissions`; comercial `access_grants` y `audit_logs`; y preparación futura `payments`, `subscriptions` y `signals`. La migración no destructiva `0001_colorful_stryfe.sql` añade `account.issuer`, normaliza las cuentas credential existentes a `local:credential` y cambia la unicidad al par `(issuer, account_id)`, que es el contrato de Better Auth 1.7.

`session`, `account` y `access_grants` pertenecen a `user`; las referencias de actor/revocación y de auditoría usan `SET NULL` para preservar historial. `payments` y `subscriptions` se restringen a usuarios existentes. El email y el username tienen índices únicos case-insensitive sobre `lower(...)`. La migración incluye los roles `user`/`admin` y los permisos `users.read`, `users.block`, `access.grant`, `access.revoke`, `payments.read`, `plans.manage`, `admins.manage` y `analytics.read`; todos los permisos se asignan a `admin`.

`FOUNDERS_LIFETIME` activo no vence (`expires_at = null`). Cada grant conserva plan, tipo (`ADMIN_MANUAL`, `PAYMENT`, `PROMOTION`), fechas, actor y motivo. Las tablas de pagos, suscripciones y señales no reciben registros ni activan ninguna integración en esta fase.

## Seguridad de sesión

Better Auth hashea las contraseñas y emite cookies `HttpOnly`; en producción son `Secure`. `AUTH_COOKIE_SAME_SITE` acepta `lax`, `strict` o `none`, y las mutaciones validan el origin configurado. `CORS_ALLOWED_ORIGINS` es una lista exacta, sin comodines. El límite de auth por defecto es 10 intentos por IP en 15 minutos. El registro usa una transacción PostgreSQL para crear `user`, `account` credential y `session`; los eventos de auditoría se escriben después de que Better Auth confirme la identidad y su fallo se registra sin convertir un alta válida en una cuenta parcialmente creada.

El backend vuelve a verificar sesión, estado de bloqueo, permiso y access grant antes de servir mercado privado o administración. No se confía en rol, acceso ni cookies manipulables por el frontend. Los eventos `USER_REGISTERED`, `USER_LOGIN`, `USER_LOGOUT`, `USER_BLOCKED`, `USER_UNBLOCKED`, `ACCESS_GRANTED`, `ACCESS_REVOKED`, `ACCESS_RESTORED` y `ROLE_CHANGED` se guardan en `audit_logs` sin contraseñas, tokens, cookies o claves.

## Rutas

| Ruta | Protección |
| --- | --- |
| `POST /api/auth/register`, `POST /api/auth/login` | Pública con rate limit de auth |
| `POST /api/auth/logout`, `GET /api/me`, `GET /api/access/me` | Sesión válida |
| `GET /api/market`, `/api/candles`, `/api/indicators` | Sesión + access grant activo |
| `GET /api/admin/users`, `/:id`, `/audit` | Permiso admin correspondiente |
| `POST /api/admin/users/:id/grant-access`, `revoke-access`, `restore-access` | `access.grant` / `access.revoke` |
| `POST /api/admin/users/:id/block`, `unblock`, `role` | `users.block` / `admins.manage` |

La recuperación de contraseña y verificación de email están preparadas pero devuelven `501` hasta que se configure un proveedor de correo. No se integró OAuth ni cobro real.

## Railway staging: pasos exactos

1. En el mismo proyecto Railway de staging, crear un servicio **PostgreSQL**.
2. En Variables del servicio API, añadir `DATABASE_URL` usando la referencia visual al `DATABASE_URL` interno del servicio PostgreSQL. Si el servicio se llama `Postgres`, Railway suele mostrar `${{Postgres.DATABASE_URL}}`; elegir la referencia en el dashboard evita escribir un nombre incorrecto.
3. Añadir en el servicio API:

```text
NODE_ENV=production
BETTER_AUTH_SECRET=<secreto aleatorio de 32+ caracteres>
BETTER_AUTH_URL=https://<host-publico-de-la-api>
CORS_ALLOWED_ORIGINS=https://<host-del-frontend-staging>
TRUST_PROXY_HOPS=1
AUTH_COOKIE_SAME_SITE=none
```

No definir `PORT`: Railway lo suministra. `TWELVEDATA_API_KEY` permanece únicamente en Railway/API. No configurar nunca `DATABASE_URL`, `BETTER_AUTH_SECRET` ni Twelve Data en Vercel.

4. Desplegar la API y confirmar `GET /api/healthz`.
5. Abrir la shell del servicio API de Railway y ejecutar:

```text
corepack pnpm run db:migrate
```

6. Registrar una cuenta desde staging. Agregar temporalmente `ADMIN_EMAIL=<email-de-esa-cuenta>` al servicio API, ejecutar en la shell `corepack pnpm run admin:bootstrap`, comprobar que la cuenta ve Administración, y eliminar `ADMIN_EMAIL` del dashboard.

Para producción, preferir frontend y API en subdominios del mismo dominio registrable. Configurar entonces `AUTH_COOKIE_DOMAIN=.<dominio>` y `AUTH_COOKIE_SAME_SITE=lax`. Si frontend y API están en sitios distintos, `none` exige HTTPS y algunos navegadores pueden limitar cookies de terceros.

## Pruebas de base de datos

La suite normal no usa PostgreSQL. Para activar las pruebas de integración reales se requieren ambas variables y una base aislada cuyo nombre termine en `_test`; la prueba rechaza cualquier otro nombre antes de migrar:

```powershell
$env:TEST_DATABASE_URL = "postgres://<usuario>:<password>@<host>:5432/nexo_digital_pro_test"
$env:RUN_DB_INTEGRATION_TESTS = "true"
corepack pnpm run test
```

Esto prueba registro, duplicados de email/username, login erróneo, sesión, falta de entitlement, admin, grant, revoke, restore, bloqueo, logout y auditoría sobre PostgreSQL real. Si faltan las variables, el test aparece `SKIPPED` y no realiza conexión alguna. La suite normal además ejecuta una prueba aislada PGlite (PostgreSQL en memoria) que comprueba la cuenta credential, login, cookie/sesión, logout y rollback completo si falla la inserción de `account`; no usa `DATABASE_URL` ni se conecta a Railway.
