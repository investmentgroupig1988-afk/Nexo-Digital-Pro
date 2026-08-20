# Deployment: GitHub, Railway y Vercel

Este repositorio despliega dos servicios independientes:

```text
GitHub (main / deploy-ready-v1)
  -> Railway: API Express
  -> Vercel: frontend Vite
  -> navegador: frontend -> API pública HTTPS
```

El frontend no contiene claves de proveedores. `TWELVEDATA_API_KEY` es estrictamente una variable de Railway para la API; nunca debe definirse en Vercel ni usar un prefijo `VITE_`.

## Antes de conectar servicios

1. Crear un repositorio en GitHub y subir este proyecto sin `.env`, `node_modules`, `dist` ni archivos generados. `.gitignore` ya impide esos archivos.
2. Elegir `main` como rama de producción. Para staging, crear una rama `staging` desde `main`.
3. En GitHub, proteger `main`: requerir pull request y que el workflow **CI** sea exitoso antes de integrar cambios.
4. El workflow `.github/workflows/ci.yml` se ejecuta en pull requests hacia `main` y en cada push a `main`. No necesita secretos ni despliega nada.

La versión de Node se fija en `>=24 <25` y pnpm queda fijado mediante `packageManager` en el `package.json` raíz.

## Variables por entorno

| Dónde | Variable | Valor / regla |
| --- | --- | --- |
| Local API | `PORT` | `5000` por defecto. |
| Local API | `NODE_ENV` | `development`. |
| Local API | `CORS_ALLOWED_ORIGINS` | `http://localhost:5173,http://localhost:3000`. |
| Local API | `TRUST_PROXY_HOPS` | `0`. |
| Railway staging/producción | `NODE_ENV` | `production`. |
| Railway staging/producción | `PORT` | No crearla manualmente: Railway la proporciona. |
| Railway staging/producción | `CORS_ALLOWED_ORIGINS` | Origin HTTPS exacto del frontend Vercel correspondiente, sin ruta final. |
| Railway staging/producción | `TRUST_PROXY_HOPS` | `1`. |
| Railway staging/producción | `TWELVEDATA_API_KEY` | No es necesaria para la V1 comercial; XAUUSD permanece bloqueado. |
| Vercel staging/producción | `VITE_API_BASE_URL` | Origin HTTPS exacto del backend Railway correspondiente, sin ruta final. Es público. |

`CORS_ORIGINS` continúa funcionando como alias de compatibilidad, pero usar `CORS_ALLOWED_ORIGINS` en configuraciones nuevas. Se admiten varios origins separados por coma. Cada valor se valida como un origin `http(s)` sin paths, credenciales, query ni hash; no se aceptan comodines.

## Staging: Railway API

Crear primero un proyecto y entorno **staging** en Railway, conectarlo al repositorio GitHub y elegir la rama `staging`. Usar el directorio raíz del repositorio (`.`). Railway encuentra `railway.json` en la raíz.

En el dashboard, confirmar estos valores (también están declarados en `railway.json`):

| Campo | Valor exacto |
| --- | --- |
| Build Command | `corepack pnpm --filter @workspace/api-server run build` |
| Start Command | `corepack pnpm db:migrate && corepack pnpm --filter @workspace/api-server run start` |
| Healthcheck Path | `/api/healthz` |
| Healthcheck Timeout | `100` |
| Restart policy | `on_failure`, hasta `10` reintentos |

Definir inicialmente `NODE_ENV=production` y `TRUST_PROXY_HOPS=1`. Railway inyecta `PORT`; la API lo utiliza y conserva `5000` sólo como default local. Generar un dominio Railway HTTPS y guardar el origin resultante como `https://<backend-staging>.up.railway.app` (placeholder, no un valor literal).

En esta primera instancia todavía se puede dejar `CORS_ALLOWED_ORIGINS` vacío para obtener el dominio y ejecutar el smoke test; la API no otorgará acceso cross-origin hasta configurarlo en el paso siguiente.

## Staging: Vercel frontend

Crear un proyecto Vercel separado para staging desde el mismo repositorio, con la rama de producción del proyecto apuntando a `deploy-ready-v1`. Usar **Root Directory: `.`**, no `artifacts/mockup-sandbox`: el frontend depende de workspaces en `lib/`, que Vercel no puede leer si su root se limita al subdirectorio.

Usar estos ajustes exactos, ya fijados también en `vercel.json`:

| Campo | Valor exacto |
| --- | --- |
| Framework Preset | `Vite` |
| Node.js | `24.x` |
| Root Directory | `.` |
| Install Command | `corepack pnpm install --frozen-lockfile` |
| Build Command | `corepack pnpm --filter @workspace/mockup-sandbox run build` |
| Output Directory | `artifacts/mockup-sandbox/dist` |

Crear en Vercel (entorno **Production** de ese proyecto staging) sólo:

```text
VITE_API_BASE_URL=https://<backend-staging>.up.railway.app
```

No crear en Vercel `TWELVEDATA_API_KEY`, `CORS_ALLOWED_ORIGINS`, `PORT`, tokens ni credenciales. Volver a desplegar el frontend después de modificar una variable `VITE_*`, porque Vite la incorpora durante el build.

Usar el alias estable de la rama, no la URL efímera de cada deployment. Para el proyecto actual, volver a Railway y definir:

```text
CORS_ALLOWED_ORIGINS=https://nexo-digital-pro-git-deploy-ready-v1-nexo-digital5.vercel.app
```

Re-desplegar Railway. Los previews efímeros no se habilitan automáticamente; no usar `*`, regex amplias ni reflexión del header `Origin` cuando hay cookies. Agregar otro origin exacto sólo si se decide mantener un preview específico.

Para la producción prevista, usar exactamente `CORS_ALLOWED_ORIGINS=https://www.nexodigitalpro.lat` en Railway y `VITE_API_BASE_URL=https://api.nexodigitalpro.lat` en Vercel.

## Smoke test de staging

El smoke test sólo consulta el healthcheck y no consume cuota de Binance ni Twelve Data. Ejecutarlo desde PowerShell tras el deploy de Railway:

```powershell
$env:API_BASE_URL = "https://<backend-staging>.up.railway.app"
corepack pnpm run smoke:api
```

Debe informar `API healthcheck passed`. Después, en el navegador, comprobar `GET /api/market?symbol=BTCUSDT`, velas e indicadores desde la interfaz. `XAUUSD` sólo debe probarse si configuraste una clave de Twelve Data válida y el plan/licencia del proveedor lo permite.

## Promoción a producción

1. Esperar CI verde y aprobar staging.
2. Crear el entorno/servicio Railway de producción desde la rama `main`; usar los mismos comandos y healthcheck.
3. Generar el dominio HTTPS del backend de producción.
4. Crear el proyecto Vercel de producción desde `main`; usar los mismos ajustes de build y `VITE_API_BASE_URL=https://<backend-production>.up.railway.app`.
5. Con el dominio Vercel definitivo, configurar en Railway producción `CORS_ALLOWED_ORIGINS=https://<frontend-production>.vercel.app` o el origin HTTPS del dominio propio futuro.
6. Ejecutar smoke test contra Railway producción y repetir las comprobaciones del navegador.

No se incluyen dominios, proyectos, IDs ni credenciales de cuenta en el repositorio. Si posteriormente se usa un dominio propio, mantener HTTPS en frontend y backend; no cargar una API `http://` desde una página `https://`.

## Checklist de release

- [ ] CI verde en el commit que se va a desplegar.
- [ ] `GET /api/healthz` responde `200` y `{ "status": "ok" }`.
- [ ] El frontend carga por HTTPS sin contenido mixto.
- [ ] `VITE_API_BASE_URL` apunta al backend del mismo entorno.
- [ ] `CORS_ALLOWED_ORIGINS` contiene sólo el origin HTTPS exacto del frontend.
- [ ] BTCUSDT y el dashboard de señales responden desde la interfaz.
- [ ] XAUUSD permanece bloqueado en frontend y backend.
- [ ] No hay secretos en GitHub, Vercel ni logs del navegador.
- [ ] Los logs de Railway no revelan tokens ni valores completos de headers sensibles.
- [ ] Rate limiting, headers defensivos y healthcheck siguen activos.
- [ ] Se registró el deployment anterior para poder seleccionar **Rollback** en Railway/Vercel si el smoke test o la interfaz falla.

## Rollback

No editar variables de producción para intentar reparar una versión defectuosa. Volver al deployment anterior exitoso de Railway y Vercel desde sus dashboards, verificar `/api/healthz`, y recién después investigar el commit. Si el problema es sólo de configuración, corregir la variable en el entorno afectado y redeployar ese servicio.
