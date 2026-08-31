# TRENORO Signal Engine V11 — forward/shadow validation

## A. BTC frozen baseline candidate

La hipótesis se descubrió en V8 sobre klines Spot públicas de Binance para
`BTCUSDT`, exclusivamente cerradas, desde `2017-10-01T00:00:00Z` hasta
`2026-08-28T00:00:00Z`. El período ya fue inspeccionado durante V1–V10: estos
resultados describen el hallazgo, pero no son evidencia forward independiente.

Definición congelada: divergencia RSI confirmada entre dos pivots causales y
ruptura cerrada de la neckline dentro de seis velas; ejecución `4h`; RSI 14;
pivots `2/2`; diferencia mínima RSI 3 puntos; stop estructural con buffer
`0,10 ATR`, mínimo `0,75 ATR`, máximo `2,50 ATR`; target `1,50R`; expiry 12
velas; una vela que toca stop y target se contabiliza conservadoramente como
LOSS.

| Período | Señales | WIN | LOSS | EXPIRED | Expectancy gross | Exp. 5 bps | Exp. 10 bps | PF gross | DD gross |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| FULL | 50 | 14 | 11 | 25 | +0,218751R | +0,202618R | +0,186484R | 1,724840 | 4,103061R |
| TRAIN | 19 | 7 | 3 | 9 | +0,416325R | +0,405201R | +0,394078R | 2,705053 | 1,000000R |
| DEVELOPMENT | 13 | 3 | 5 | 5 | +0,053788R | +0,033211R | +0,012634R | 1,131443 | 3,800758R |
| VALIDATION | 8 | 2 | 1 | 5 | +0,165522R | +0,148605R | +0,131688R | 1,580592 | 1,802303R |
| OUT-OF-SAMPLE | 10 | 2 | 2 | 6 | +0,100395R | +0,081147R | +0,061899R | 1,352279 | 2,278521R |

Los años positivos a 5 bps fueron `6/9`. El OOS contiene solamente diez
operaciones; su bootstrap por bloques a 5 bps tiene intervalo de expectancy
`[-0,305198R; +0,467492R]`. Por eso la clasificación correcta continúa siendo
**PROMISING BUT INCONCLUSIVE**.

## B. Frozen candidate fingerprint

- Strategy version: `RSI_DIVERGENCE_STRUCTURAL_4H_V1`
- V11 fingerprint: `9bfe79d79c73d17b73a9c7e1eb62532af644cc6065aeecc8b3020783142e6089`
- Source V8 preregistration: `eaca89cf5240c46f0fea0b18f9bd47d1734e0c156ccacd252306d5dcc21e90ed`
- Historical discovery cutoff: `2026-08-28T00:00:00Z`
- Forward cohort eligible after: `2026-08-31T00:00:00Z`

El hash cubre detector, geometría, costes, símbolos, cutoff y gate de evaluación.
Un cambio requiere `V2`; la tabla rechaza por constraint cualquier versión o
fingerprint que intente mezclarse con la cohorte V1.

## C. Shadow architecture

`SHADOW_RESEARCH_ENABLED` vale `false` por defecto. Cuando se habilite sólo en
staging, un scheduler separado consulta cada 60 segundos las últimas 200 velas
`4h` cerradas de `BTCUSDT`, `ETHUSDT`, `BNBUSDT` y `SOLUSDT`. El detector sólo
puede crear una observación cuando la vela confirmatoria más reciente ya cerró.
La resolución posterior reutiliza la semántica conservadora WIN/LOSS/EXPIRED.

La tabla separada `shadow_research_signals` guarda versión, fingerprint,
símbolo, timeframe, hora de detección, cierre de vela fuente, entry/stop/target
hipotéticos, dirección, modelo de costes, expiry, resultado, R y el mínimo
snapshot técnico causal necesario. Nunca guarda información futura al abrir.

## D. Isolation guarantees

- No escribe en `signals` ni `notification_deliveries`.
- No aparece en dashboard, historial ni `HISTORIAL TOTAL` comerciales.
- No llama Telegram, pagos, grants ni usuarios.
- No existe endpoint público; sólo `GET /api/admin/shadow-research`, protegido
  por el boundary global `requireAdminRole()`.
- Dedupe único por versión/símbolo/timeframe/cierre/dirección, más una sola
  observación OPEN por símbolo.
- Restart y concurrencia no crean una segunda observación.
- BTC sigue siendo el único activo comercial; ETH/BNB/SOL son cohortes research.

## E. Metrics

La vista admin informa total, OPEN, WIN, LOSS, EXPIRED, expectancy bruta,
expectancy neta a 5/10 bps, PF, drawdown, racha de LOSS y desglose por símbolo.
Los costes son ida y vuelta y se convierten a R según el riesgo porcentual real
de cada observación. Estas métricas no se agregan a endpoints comerciales.

## F. Evaluation criteria

El gate se congeló antes de iniciar la cohorte:

- al menos 120 operaciones resueltas agregadas;
- al menos 60 BTC resueltas y 36 meses observados;
- expectancy neta 5 bps `> 0` y a 10 bps `>= 0`;
- PF a 5 bps `>= 1,10`;
- drawdown observado `<= 12R` y percentil bootstrap 95 `<= 20R`;
- límite inferior 95% del bootstrap por bloques de expectancy `> 0`;
- al menos tres símbolos con expectancy positiva;
- al menos dos tercios de ventanas rolling positivas;
- BTC debe aprobar por sí mismo.

Sesenta BTC es un piso, no una garantía de precisión. Con esta frecuencia puede
requerir años; el intervalo de incertidumbre prevalece sobre el conteo y no se
reduce el mínimo para facilitar una promoción.

## G. Additional external validation

V10 fijó previamente tres activos líquidos con histórico limpio, sin selección
posterior. La misma V1 produjo:

| Asset | Señales | WIN | LOSS | EXPIRED | Expectancy 5 bps | PF 5 bps | DD 5 bps | Expectancy 10 bps |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ETHUSDT | 36 | 5 | 8 | 23 | +0,009412R | 1,027935 | 4,180311R | -0,003101R |
| BNBUSDT | 24 | 4 | 5 | 15 | +0,136208R | 1,489612 | 2,034097R | +0,121420R |
| SOLUSDT | 28 | 6 | 5 | 17 | +0,116297R | 1,369915 | 3,231827R | +0,107539R |
| Agregado | 88 | 15 | 18 | 55 | +0,078002R | 1,248617 | 5,150401R | +0,066063R |

ETH falla a 10 bps, BNB/SOL tienen menos de 30 observaciones y el agregado no
alcanzó 120. No se agregan mercados nuevos post-hoc: forward testing es la
fuente de evidencia siguiente.

## H. Multiple-testing / false-discovery considerations

El registro conservador V1–V10 contiene al menos **85 variantes nombradas de
entrada, filtros, ablations, score o modelo**: 33 en el bloque legacy V1–V4, 3
en V5, 14 entradas + 5 ablations en V6, 13 reglas + 5 cortes de score + 2
modelos simples en V7, 6 patrones V8 y 4 patrones V9. V10 reutilizó dos leads
sin crear un detector nuevo. Este conteo excluye cientos de geometrías de salida
y contiene controles/solapamientos, por lo que no equivale a 85 experimentos
independientes; sí demuestra riesgo material de false discovery.

El `81,06%` de V10 es la fracción de muestras bootstrap por bloques, construidas
a partir de los 88 trades externos observados, cuya media remuestreada fue
positiva. **No** es una probabilidad de 81,06% de que el bot sea rentable, no
incorpora el proceso de selección V1–V10, no modela cambios de régimen futuros y
su intervalo de confianza cruza cero.

## I. Tests

- flag OFF: cero fetch y cero escritura;
- aislamiento: cero filas comerciales y cero outbox Telegram;
- cuatro símbolos separados;
- dedupe y restart;
- resolución WIN/LOSS/EXPIRED;
- constraint de fingerprint/version inmutable;
- endpoint detrás del boundary admin;
- hash, cutoff y gate reproducibles;
- exclusión explícita de velas abiertas.

## J. Recommendation

La implementación es apta para una observación forward controlada en staging,
pero no existe todavía evidencia suficiente para uso comercial. Antes de
activar se debe aplicar la migración, mantener production con el flag en
`false`, habilitar `SHADOW_RESEARCH_ENABLED=true` solamente en Railway staging y
comprobar la vista admin.

**READY FOR SHADOW: YES**

**READY FOR LIVE: NO**
