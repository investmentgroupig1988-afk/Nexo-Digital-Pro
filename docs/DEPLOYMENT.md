# Despliegue aislado de TRENORO

## Topología canónica

| Entorno | Frontend | API | Base de datos |
| --- | --- | --- | --- |
| Staging | `https://staging.trenoro.com` | `https://api-staging.trenoro.com` | PostgreSQL exclusiva de staging |
| Producción futura | `https://www.trenoro.com` | `https://api.trenoro.com` | PostgreSQL exclusiva de producción |

`https://trenoro.com` debe redirigir permanentemente a `https://www.trenoro.com`. `trenoro.lat` y `www.trenoro.lat` son defensivos y deben conservar el path al redirigir al host canónico `.com`. Staging no comparte DB, bot/chat de Telegram, secretos, servicio Railway ni API con producción.

## Vercel staging — acción manual

Usar un proyecto dedicado al frontend de staging (nombre recomendado: `trenoro-staging`).

1. **Settings → Git → Production Branch:** `deploy-ready-v1`.
2. **Settings → Domains:** agregar `staging.trenoro.com` y copiar literalmente el destino DNS que Vercel muestre.
3. **Settings → Environment Variables → Production:** cargar:

```ini
VITE_API_BASE_URL=https://api-staging.trenoro.com
VITE_ARGENTINA_PAYMENTS_ENABLED=false
VITE_LEGAL_OPERATOR_NAME=<nombre y apellido oficial>
VITE_LEGAL_TAX_ID=<CUIT oficial>
VITE_LEGAL_ADDRESS=<domicilio oficial>
VITE_SUPPORT_EMAIL=<email oficial>
VITE_LEGAL_EMAIL=<email legal/privacidad oficial>
VITE_SUPPORT_WHATSAPP_NUMBER=<número oficial para el footer global y AVISAR PAGO POR WHATSAPP, solo dígitos; copia pública de SUPPORT_WHATSAPP_NUMBER y no reemplaza el contacto obligatorio de la solicitud>
```

4. Hacer **Redeploy** sin reutilizar build cache después de cambiar variables.

No cargar `DATABASE_URL`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY` ni `TELEGRAM_BOT_TOKEN` en Vercel.

## Railway staging — acción manual

Crear/usar el environment **staging**, un servicio API separado y un PostgreSQL separado. En el servicio API:

1. **Settings → Source:** repositorio de TRENORO, branch trigger `deploy-ready-v1`, automatic deployments **Enabled**.
2. **Settings → Networking → Custom Domain:** `api-staging.trenoro.com`; copiar literalmente el destino DNS mostrado por Railway.
3. **Variables:** cargar:

```ini
NODE_ENV=production
DATABASE_URL=<URL de PostgreSQL staging; nunca producción>
BETTER_AUTH_SECRET=<secreto staging distinto, 32+ caracteres>
BETTER_AUTH_URL=https://api-staging.trenoro.com
CORS_ALLOWED_ORIGINS=https://staging.trenoro.com
AUTH_COOKIE_SAME_SITE=lax
AUTH_COOKIE_DOMAIN=
TRUST_PROXY_HOPS=1
ARGENTINA_PAYMENTS_ENABLED=false
RESEND_API_KEY=<credencial de staging>
AUTH_EMAIL_FROM=<remitente verificado>
APP_PUBLIC_URL=https://staging.trenoro.com
TELEGRAM_BOT_TOKEN=<bot exclusivo de staging>
TELEGRAM_CHAT_ID=<chat/canal exclusivo de staging>
NOTIFICATION_PUBLIC_URL=https://staging.trenoro.com/
SHADOW_RESEARCH_ENABLED=false
LEGAL_OPERATOR_NAME=<nombre y apellido oficial>
LEGAL_TAX_ID=<CUIT oficial>
LEGAL_ADDRESS=<domicilio oficial>
SUPPORT_EMAIL=<email oficial>
LEGAL_EMAIL=<email legal/privacidad oficial>
SUPPORT_WHATSAPP_NUMBER=<número oficial para soporte y AVISAR PAGO POR WHATSAPP, solo dígitos; no reemplaza el contacto obligatorio de la solicitud>
WHATSAPP_COMMUNITY_URL=<opcional; invitación https://chat.whatsapp.com/...; vacío oculta el botón>
```

V11 shadow se entrega apagado. Sólo después de aplicar la migración y revisar
`/api/admin/shadow-research`, cambiar `SHADOW_RESEARCH_ENABLED=true` en Railway
**staging** y redeployar ese environment. No existe variable equivalente en Vercel.

Los valores entre `<...>` son acciones manuales, no valores para copiar literalmente. Railway debe generar secretos distintos para staging y producción. Después de cargar variables, hacer redeploy y comprobar `/api/healthz`; luego ingresar como admin y revisar `/api/admin/readiness`.

## Habilitar Argentina sólo para QA de staging

Los datos oficiales y el precio fijo están en código. El método queda **READY BUT DISABLED**. Para una prueba controlada:

1. Railway staging: `ARGENTINA_PAYMENTS_ENABLED=true` y redeploy.
2. Vercel staging: `VITE_ARGENTINA_PAYMENTS_ENABLED=true` y redeploy.
3. Ejecutar solicitud, revisión, APPROVE/REJECT/NEEDS_REVIEW y comprobar auditoría/grant.
4. Volver ambos flags a `false` al terminar si todavía no existe autorización de lanzamiento.

Cambiar únicamente el flag del frontend no habilita el backend. No hay cotización externa: el precio es `$40.500 ARS` y la referencia comercial fija es `USD 27 × $1.500 ARS`.

## Producción futura — preparar, no activar

Railway producción:

Mantener **Settings → Source → branch `main`** y **Automatic Deployments → Disabled** hasta que el lanzamiento sea autorizado. No usar `Deploy Latest Commit`, redeploy ni mergear desde `deploy-ready-v1`.

```ini
NODE_ENV=production
BETTER_AUTH_URL=https://api.trenoro.com
CORS_ALLOWED_ORIGINS=https://www.trenoro.com
AUTH_COOKIE_SAME_SITE=lax
AUTH_COOKIE_DOMAIN=
TRUST_PROXY_HOPS=1
ARGENTINA_PAYMENTS_ENABLED=false
APP_PUBLIC_URL=https://www.trenoro.com
NOTIFICATION_PUBLIC_URL=https://www.trenoro.com/
DATABASE_URL=<secreto producción>
BETTER_AUTH_SECRET=<secreto producción distinto>
RESEND_API_KEY=<secreto Resend>
AUTH_EMAIL_FROM=<remitente verificado>
TELEGRAM_BOT_TOKEN=<bot producción>
TELEGRAM_CHAT_ID=<chat producción>
SHADOW_RESEARCH_ENABLED=false
SUPPORT_WHATSAPP_NUMBER=<número oficial para soporte y AVISAR PAGO POR WHATSAPP, solo dígitos; no reemplaza el contacto obligatorio de la solicitud>
WHATSAPP_COMMUNITY_URL=<opcional; invitación https://chat.whatsapp.com/...; vacío oculta el botón>
LEGAL_OPERATOR_NAME=<dato oficial>
LEGAL_TAX_ID=<dato oficial>
LEGAL_ADDRESS=<dato oficial>
SUPPORT_EMAIL=<dato oficial>
LEGAL_EMAIL=<dato oficial>
```

Vercel producción:

```ini
VITE_API_BASE_URL=https://api.trenoro.com
VITE_ARGENTINA_PAYMENTS_ENABLED=false
VITE_LEGAL_OPERATOR_NAME=<dato oficial>
VITE_LEGAL_TAX_ID=<dato oficial>
VITE_LEGAL_ADDRESS=<dato oficial>
VITE_SUPPORT_EMAIL=<dato oficial>
VITE_LEGAL_EMAIL=<dato oficial>
VITE_SUPPORT_WHATSAPP_NUMBER=<número oficial para el footer global y AVISAR PAGO POR WHATSAPP, solo dígitos; copia pública de SUPPORT_WHATSAPP_NUMBER>
```

No hacer cutover hasta que staging, email, Telegram, migraciones y readiness admin estén validados.

## DNS — acción manual

Crear estos hostnames en el proveedor DNS y copiar literalmente los valores dinámicos mostrados por cada plataforma:

| Hostname | Destino gestionado por |
| --- | --- |
| `staging` | Vercel staging |
| `api-staging` | Railway staging |
| `www` | Vercel producción |
| `api` | Railway producción |

Configurar el apex `trenoro.com` y `trenoro.lat`/`www.trenoro.lat` como redirects permanentes hacia `https://www.trenoro.com`. No inventar CNAME, TXT ni targets. Los dominios históricos pueden conservarse durante la transición y redirigirse sólo después del cutover autorizado.

## Resend y Telegram

- Resend: crear cuenta/proyecto, verificar un dominio o subdominio de envío, copiar exactamente los SPF/DKIM que Resend genere y definir DMARC con la política aprobada por el titular. Configurar `RESEND_API_KEY` y `AUTH_EMAIL_FROM` sólo en Railway.
- Telegram: crear un bot y chat exclusivos de staging. Las tres variables necesarias son `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` y `NOTIFICATION_PUBLIC_URL`. Los tests usan proveedores falsos y nunca el bot real.

## Orden de migración y verificación

1. PostgreSQL descartable cuyo nombre termine en `_test`.
2. PostgreSQL de staging, después de backup/snapshot.
3. PostgreSQL de producción únicamente tras autorización explícita y staging aprobado.

En cada entorno: ejecutar migraciones, ejecutar nuevamente para comprobar el journal, validar conteos y comprobar que el identificador histórico fue transformado sin cambiar IDs ni fingerprints.

Checklist no destructivo de staging:

- `/api/healthz` público devuelve sólo estado mínimo.
- `/api/admin/readiness` informa DB, auth, email, Telegram, scheduler, market provider, legal y gates.
- CORS devuelve únicamente `https://staging.trenoro.com` con credenciales.
- Registro, login, `/api/me`, logout, reset y verificación funcionan.
- Scheduler registra scans reales; `NO_SIGNAL` no se trata como error.
- XAUUSD está bloqueado, 1m rechazado y Argentina deshabilitada salvo QA explícito.
- Telegram usa exclusivamente el bot/chat de staging y entrega una sola vez.
