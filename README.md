# Nexo Digital Pro

## Estado real del repositorio

La versión entregada contiene una API HTTP de consulta de mercado y un frontend Vite funcional de Nexo Digital Pro. El panel permite consultar `BTCUSDT` y `XAUUSD`, seleccionar un timeframe y presentar cotización, velas OHLCV reales, indicadores técnicos, Fibonacci, estructura de mercado y calidad de datos devueltos por la API. **No contiene** autenticación, usuarios, roles, pagos, cartera, ejecución de órdenes, integración con un bróker/exchange, migraciones ni un esquema de base de datos funcional.

No se presentan datos fabricados como reales. Bitcoin usa Binance y oro (`XAUUSD`) usa Twelve Data. La señal `BUY`/`SELL`/`HOLD` es un indicador técnico informativo; no ejecuta órdenes ni constituye asesoramiento financiero. Para oro, la ruta de señal devuelve datos de mercado porque no existe una estrategia implementada para ese instrumento.

## Arquitectura

```text
Usuario
  -> artifacts/mockup-sandbox (React + React Query)
  -> lib/api-client-react (cliente generado, customFetch y URL configurable)
  -> /api en mismo origen o proxy Vite durante desarrollo
  -> artifacts/api-server (Express)
  -> Binance (cripto) / Twelve Data (oro)
  -> respuesta validada con lib/api-zod
```

`lib/api-spec/openapi.yaml` es la fuente de contrato. Desde ese archivo se regeneran `lib/api-client-react` y `lib/api-zod`. `lib/db` y `scripts/market-quotes` no intervienen en el flujo de la API: el primero es un scaffold y el segundo son utilidades aisladas que requieren sus propias credenciales.

## Requisitos

- Node.js 24 (el proyecto se preparó para Node 24; se requiere una versión moderna compatible con pnpm 11).
- Corepack y pnpm 11.19.0, gestionado por el campo `packageManager` del paquete raíz.
- Una cuenta de Twelve Data sólo para consultar oro. El resto de rutas de mercado cripto no requieren esa clave.

## Instalación y desarrollo

1. Copiar `.env.example` a `.env` y completar únicamente las variables necesarias.
2. Ejecutar `corepack pnpm install`.
3. Ejecutar `corepack pnpm run codegen` si se modificó el contrato OpenAPI.
4. Ejecutar `corepack pnpm run dev` para compilar/iniciar la API y el frontend de forma conjunta.

Comandos de verificación:

```text
corepack pnpm run typecheck
corepack pnpm run test
corepack pnpm run build
```

`typecheck` genera automáticamente las declaraciones de `@workspace/api-zod` antes de verificar la API; no requiere pasos manuales ni un `pnpm` anidado. `test` y `build` son orquestadores Node portables, por lo que funcionan cuando se invocan mediante Corepack en Windows.

Comprobaciones individuales:

```text
corepack pnpm --filter @workspace/api-zod build
corepack pnpm --filter @workspace/api-server typecheck
corepack pnpm --filter @workspace/api-server build
corepack pnpm --filter @workspace/mockup-sandbox build
corepack pnpm --filter @workspace/api-client-react test
corepack pnpm --filter @workspace/api-server test
```

Vite usa el puerto `5173` y la base `/` por defecto. `PORT` y `BASE_PATH` son opcionales: si se configuran, el primero debe ser un puerto válido y el segundo debe comenzar con `/`.

El desarrollo local inicia la API en el puerto `5000` y Vite en `5173` por defecto. Vite envía `/api/*` al backend mediante un proxy sólo de desarrollo; no necesita CORS ni una URL localhost embebida en el bundle. En producción el frontend usa rutas relativas `/api` cuando se sirve junto a la API. Si se despliega con API separada, configurar el origen público mediante `VITE_API_BASE_URL` al compilar.

El build de la API queda en `artifacts/api-server/dist` y el del frontend en `artifacts/mockup-sandbox/dist`. El script raíz `dev` usa procesos Node, sin sintaxis específica de PowerShell, cmd o shells Unix.

## Frontend de mercado

La pantalla principal usa exclusivamente estos contratos existentes:

- `GET /api/healthz`
- `GET /api/market?symbol=BTCUSDT|XAUUSD`
- `GET /api/candles?symbol=<símbolo>&timeframe=<timeframe>&limit=200`
- `GET /api/indicators?symbol=<símbolo>&timeframe=<timeframe>`

React Query cancela las solicitudes cuyo símbolo/timeframe deja de estar activo y actualiza cotización cada 30 segundos. Velas e indicadores se actualizan entre 30 segundos y 10 minutos según timeframe. El panel no consume `/api/signal`, no muestra `BUY`/`SELL` ni ejecuta operaciones. Ante `UNAVAILABLE` o `INSUFFICIENT_DATA`, presenta el estado y el motivo recibido sin inventar valores.

## API pública actual

- `GET /api/healthz` — disponibilidad del proceso.
- `GET /api/market?symbol=BTCUSDT` — cotización y cambio de 24 h; `symbol=XAUUSD` requiere Twelve Data.
- `GET /api/candles?symbol=BTCUSDT&timeframe=1h&limit=200` — velas de Binance.
- `GET /api/indicators?symbol=BTCUSDT&timeframe=1h` — indicadores técnicos calculados sobre las velas.
- `GET /api/signal?symbol=BTCUSDT` — señal técnica determinista para cripto; no es trading real.

Todas las rutas de mercado son de lectura. El servidor valida parámetros, aplica límite de solicitudes por IP, restringe CORS a orígenes configurados y no devuelve trazas de error al cliente.

## Variables de entorno

| Variable | Uso | Obligatoria |
| --- | --- | --- |
| `PORT` | Puerto de la API (por defecto `5000`). | No |
| `NODE_ENV` | `development` o `production`. | No |
| `LOG_LEVEL` | Nivel de logging de Pino. | No |
| `RATE_LIMIT_MAX` | Solicitudes por IP y minuto (por defecto `120`). | No |
| `CORS_ALLOWED_ORIGINS` | Orígenes separados por coma para despliegue con frontend separado. | En producción si hay frontend separado |
| `CORS_ORIGINS` | Alias legado de `CORS_ALLOWED_ORIGINS`. | No para configuraciones nuevas |
| `TRUST_PROXY_HOPS` | Saltos de proxy de confianza para preservar IP real en rate limiting. | `1` en Railway; `0` local |
| `TWELVEDATA_API_KEY` | Consulta de oro mediante Twelve Data. | Sólo para `XAUUSD` |
| `VITE_API_BASE_URL` | Origen público de una API alojada por separado; se incorpora al bundle. | No; por defecto se usa `/api` |
| `VITE_API_PROXY_TARGET` | Destino del proxy de Vite durante desarrollo. | No; por defecto `http://127.0.0.1:5000` |
| `VITE_PORT` | Puerto del servidor Vite local. | No; por defecto `5173` |
| `FINNHUB_API_KEY` | Utilidad aislada `scripts/market-quotes`; no la API. | No |
| `ALPHAVANTAGE_API_KEY` | Utilidad aislada `scripts/market-quotes`; no la API. | No |
| `OPENAI_API_KEY` | Utilidad aislada `scripts/market-quotes`; no la API. | No |

Sólo las tres variables `VITE_*` documentadas arriba son públicas y no contienen secretos. No expongas claves de proveedor ni credenciales como variables `VITE_*`. `.env` está ignorado por Git y `.env.example` no contiene secretos.

## Deployment

El repositorio incluye CI para GitHub, `railway.json` para la API y `vercel.json` para el frontend. La guía de staging, producción, variables, comandos exactos, smoke test y rollback está en [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). No hay deployment automático ni credenciales de cuentas incluidas.

## Seguridad y despliegue

En desarrollo se permiten `http://localhost:5173` y `http://localhost:3000` de forma explícita. El proxy de Vite hace que la UI use el mismo origen de desarrollo y evita configurar CORS en el navegador. En producción la lista queda vacía salvo que se configure `CORS_ALLOWED_ORIGINS`; usar exclusivamente origins HTTPS exactos del frontend y preferir el mismo origen cuando sea posible. El servidor no usa cookies, sesión ni JWT porque el repositorio no tiene autenticación. Si se añaden usuarios u operaciones financieras, se debe incorporar autenticación y autorización exclusivamente del lado servidor antes de exponer esas capacidades.

El almacenamiento de datos y las operaciones con exchanges no están implementados. No ejecutar `pnpm --filter @workspace/db run push` o `push-force`: no hay schema ni migraciones que soporten una base de datos operativa.

## Limitaciones y siguiente evolución

Las siguientes fases requieren diseño de usuarios/roles/sesiones, esquema y migraciones de PostgreSQL, y una integración explícita de paper trading o de un bróker. Ninguna de esas capas debe simularse ni activarse con datos inventados. La vista actual depende de la disponibilidad real de Binance y, para `XAUUSD`, de una clave válida de Twelve Data.
