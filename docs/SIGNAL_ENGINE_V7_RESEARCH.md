# TRENORO Signal Engine V7 — investigación estructural

Fecha de cierre: 30 de agosto de 2026
Estado: **V7 RESULT = NO ROBUST POSITIVE EDGE**

## Resumen ejecutivo

V7 cambió la pregunta respecto de V1–V6: mantuvo congelados entry, TP, SL, R:R y expiry de `BASELINE_V6` e investigó **cuándo** el setup tiene edge mediante regímenes causales, contexto multi-timeframe, sesiones, atribución de features, scores interpretables y selectividad.

El resultado sigue siendo negativo. Ningún candidato superó de forma conjunta TRAIN, DEVELOPMENT, VALIDATION, locked OOS, costes de 5/10 bps, walk-forward y muestra mínima. Los indicios positivos de 1h y 4h son inestables o demasiado pequeños. No justifican shadow mode ni cambios live.

- **ROBUST POSITIVE EDGE: NO**
- **RECOMMEND SHADOW MODE: NO**
- **RECOMMEND LIVE CHANGE: NO**

No se modificaron estrategia live, scheduler, parámetros, PostgreSQL, Telegram, `main` ni production.

## Protocolo, causalidad y límites

- Research ID: `SIGNAL_ENGINE_V7_STRUCTURAL_EDGE_2026_08_30`
- Hash de pre-registro, anterior a observar resultados V7: `998f797a609eff042bbcf074fb9300aed533c6b1a6c30d7e1da7fd7d1f0ff89e`
- Hash de finalistas congelados antes de abrir OOS: `44e17fb5492d6257317cee5533e466b4c3a30df8da332b609666146626df2948`
- Dataset: BTCUSDT Spot, Binance público, `2017-10-01T00:00:00Z` a `2026-08-28T00:00:00Z`.
- Semántica: sólo velas con `closeTime <= effective observation time`; todo contexto superior debía haber cerrado antes del cierre de entrada.
- Salidas: `BASELINE_V6_UNCHANGED`. No se investigaron ATR, TP/SL, pips ni expiry.
- Ambigüedad TP+SL intrabar: misma resolución conservadora de V6/live.
- El replay produjo 35.220/11.260/2.627/684 oportunidades baseline para 5m/15m/1h/4h.

Separación cronológica:

| Segmento | Inicio | Fin exclusivo | Uso V7 |
|---|---|---|---|
| TRAIN | 2017-10-01 | 2022-03-01 | features/modelos/thresholds |
| DEVELOPMENT | 2022-03-01 | 2024-01-01 | ranking pre-validation |
| VALIDATION | 2024-01-01 | 2025-04-01 | gate antes de OOS |
| LOCKED OOS | 2025-04-01 | 2026-08-28 | evaluación final solamente |

Advertencia: esos intervalos ya fueron inspeccionados en V1–V6. El código impide que V7 use VALIDATION/OOS para seleccionar, pero este OOS no es evidencia histórica genuinamente intacta. La evidencia realmente forward comienza el `2026-08-28T00:00:00Z`.

Costes round-trip analíticos, no afirmaciones sobre una cuenta o venue:

| Escenario | Fee | Spread | Slippage | Latencia | Total |
|---|---:|---:|---:|---:|---:|
| Ideal | — | — | — | — | 0 bps |
| Realista | 2 | 1 | 1 | 1 | 5 bps |
| Stress | 5 | 2 | 2 | 1 | 10 bps |

## A. Baseline V6

Dataset checksummed reutilizado sin descargas ni interpolación:

| TF | Velas | Gaps reportados | Duplicadas | Fuera de orden | Abiertas/invalidas | SHA-256 |
|---|---:|---:|---:|---:|---:|---|
| 5m | 935.452 | 1.632 | 0 | 0 | 0 | `36d3356bfd59394d...` |
| 15m | 311.970 | 538 | 0 | 0 | 0 | `2cbaf81b31a62be7...` |
| 1h | 78.170 | 122 | 0 | 0 | 0 | `83faf8996ebf1f1e...` |
| 4h | 19.722 | 16 | 0 | 0 | 0 | `216f123bbdaec667...` |

Locked OOS:

| TF | Signals | W/L/X | Exp. 0bps | PF 0bps | Exp. 5bps | PF 5bps | DD 5bps | Exp. 10bps | Señales/día |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 5m | 2.265 | 209/352/1.704 | +0,00489R | 1,018 | -0,11221R | 0,678 | 261,82R | -0,22932R | 4,407 |
| 15m | 728 | 77/134/517 | -0,02908R | 0,905 | -0,09623R | 0,722 | 72,36R | -0,16339R | 1,416 |
| 1h | 194 | 18/25/151 | +0,02131R | 1,080 | -0,00952R | 0,966 | 10,97R | -0,04034R | 0,377 |
| 4h | 47 | 3/4/40 | +0,04654R | 1,217 | +0,03499R | 1,158 | 3,83R | +0,02344R | 0,091 |

5m y 15m pierden incluso antes de costes en parte del histórico y son claramente negativos netos. 1h queda aproximadamente en break-even neto. 4h es positivo en OOS, pero 47 señales no sostienen una inferencia robusta y su comportamiento temporal no es estable.

## B. Regimes

Taxonomía causal: dirección local (`TREND_UP/DOWN`; ningún trade baseline quedó en `RANGE`), terciles de volatilidad calculados sólo con historia previa y evolución de true-range (`EXPANSION >= 1,25`, `COMPRESSION <= 0,80`). `T/D/V/O` indica el signo de expectancy neta a 5 bps en TRAIN/DEVELOPMENT/VALIDATION/OOS.

| TF | Régimen | OOS signals (W/L/X) | Exp. 5bps | PF | DD | T/D/V/O |
|---|---|---:|---:|---:|---:|---|
| 5m | High / Normal / Low vol | 771 (62/109/600) / 970 (83/137/750) / 524 (64/106/354) | -0,074 / -0,109 / -0,174R | 0,752 / 0,683 / 0,592 | 61,28 / 110,49 / 97,78R | ---- / ---- / ---- |
| 5m | Trend up / down | 1.165 (103/188/874) / 1.100 (106/164/830) | -0,130 / -0,094R | 0,634 / 0,725 | 161,17 / 105,66R | ---- / ---- |
| 5m | Expansion / stable / compression | 716 / 1.086 / 463 | -0,063 / -0,096 / -0,227R | 0,791 / 0,723 / 0,468 | 54,19 / 113,67 / 105,22R | ---- / ---- / ---- |
| 15m | High / Normal / Low vol | 261 (15/41/205) / 312 (40/60/212) / 155 (22/33/100) | -0,092 / -0,085 / -0,125R | 0,691 / 0,765 / 0,683 | 24,81 / 30,22 / 21,02R | ---- / ---- / +--- |
| 15m | Trend up / down | 381 (34/70/277) / 347 (43/64/240) | -0,111 / -0,080R | 0,674 / 0,773 | 44,52 / 38,45R | ---- / ---- |
| 15m | Expansion / stable / compression | 273 / 290 / 165 | -0,043 / -0,153 / -0,084R | 0,855 / 0,605 / 0,764 | 17,69 / 45,91 / 16,13R | +-+- / ---- / ---- |
| 1h | High / Normal / Low vol | 60 (4/3/53) / 96 (11/14/71) / 38 (3/8/27) | +0,008 / +0,010 / -0,085R | 1,034 / 1,033 / 0,766 | 4,52 / 6,94 / 7,36R | +-++ / ++++ / +--- |
| 1h | Trend up / down | 98 (10/10/78) / 96 (8/15/73) | +0,048 / -0,069R | 1,182 / 0,773 | 5,37 / 8,29R | +--+ / ++-- |
| 1h | Expansion / stable / compression | 64 / 83 / 47 | +0,059 / -0,031 / -0,066R | 1,233 / 0,887 / 0,807 | 3,98 / 8,07 / 5,12R | +-++ / +--- / ++-- |
| 4h | High / Normal / Low vol | 11 (0/0/11) / 26 (3/3/20) / 10 (0/1/9) | +0,201 / -0,007 / -0,037R | 4,183 / 0,974 / 0,827 | 0,57 / 3,75 / 1,05R | +--+ / ---- / +-+- |
| 4h | Trend up / down | 23 (2/3/18) / 24 (1/1/22) | +0,013 / +0,056R | 1,060 / 1,254 | 1,98 / 3,78R | +-++ / ---+ |
| 4h | Expansion / stable / compression | 16 / 20 / 11 | +0,298 / -0,261 / +0,190R | 4,532 / 0,312 / 2,431 | 0,97 / 5,25 / 1,05R | ++-+ / +--- / +-++ |

Hallazgo: `1h/NORMAL_VOLATILITY` es el único segmento con expectancy positiva en los cuatro períodos, pero OOS PF 1,033 y expectancy +0,0096R están demasiado cerca de cero para superar el gate 1,10; además sólo hay 96 señales OOS. En 4h las cifras llamativas provienen de 10–26 señales por segmento. No hay un régimen con edge material, estable y muestra suficiente.

## C. MTF conditioning

Todo contexto usó la última vela superior ya cerrada. Resultado OOS a 5 bps:

| TF | Contexto | Signals | Exp. | PF | DD | Estabilidad T/D/V/O |
|---|---|---:|---:|---:|---:|---|
| 5m | 15m aligned | 1.581 | -0,105R | 0,696 | 176,25R | ---- |
| 5m | 15m+1h aligned | 952 | -0,073R | 0,785 | 81,93R | ---- |
| 15m | 1h aligned | 473 | -0,087R | 0,753 | 42,70R | ---- |
| 15m | 1h+4h aligned | 301 | -0,046R | 0,866 | 28,14R | +--- |
| 15m | 1h+4h opposed | 38 | +0,048R | 1,184 | 3,18R | +--+ |
| 1h | 4h aligned | 137 | +0,014R | 1,052 | 8,64R | +--+ |
| 1h | 4h neutral | 57 | -0,066R | 0,790 | 5,40R | --+- |
| 4h | local confirmed alignment | 47 | +0,035R | 1,158 | 3,83R | +-++ |

Más confluencia reduce frecuencia, pero no crea edge estable. El aparente beneficio de operar 15m contra el stack superior tiene sólo 38 señales OOS y cambia de signo entre períodos; es ruido, no recomendación.

## D. Sessions

Ventanas UTC fijas y solapadas: Asia 00–08, Europa 07–16, Nueva York 13–22, Asia/Europa 07–08 y Europa/EE.UU. 13–16. Weekend = sábado/domingo UTC.

| TF | Segmento menos negativo/mejor OOS | Signals | Exp. 5bps | PF | Validación temporal |
|---|---|---:|---:|---:|---|
| 5m | Asia/Europa overlap | 103 | +0,008R | 1,028 | TRAIN, DEV y VALIDATION negativos |
| 15m | Europa/EE.UU. overlap | 155 | -0,033R | 0,916 | negativo en los cuatro períodos |
| 1h | Europa | 83 | +0,075R | 1,274 | VALIDATION -0,102R |
| 4h | Asia | 12 | +0,145R | 1,886 | TRAIN/DEV negativos; muestra mínima |

Los weekends fueron peores que weekdays en 5m, 15m y 1h, pero filtrar weekends no hizo positivos a 5m/15m ni estabilizó 1h. Las horas UTC individuales también se calcularon; ninguna regla horaria pre-registrada atravesó todos los gates. No existe una sesión explotable de forma estable.

## E. Feature attribution

Se calcularon distribuciones WIN/LOSS/EXPIRED, quintiles y Spearman contra net R a 5 bps por período para 18 features causales. El score manual sólo admitió features con mismo signo y `|rho| >= 0,03` en TRAIN y DEVELOPMENT.

| TF | Features admitidas por TRAIN+DEV | Resultado posterior |
|---|---|---|
| 5m | HTF alignment, percentil/cambio de volatilidad, ATR%, RSI direccional, stack MTF | asociaciones pequeñas; top 10% negativo en VALIDATION y OOS |
| 15m | HTF, menor extensión, volatilidad/ATR%, RSI, stack MTF, weekday | asociaciones de signo estable, pero score top 10% negativo en DEV/VALIDATION/OOS |
| 1h | estructura, extensión, volatility fit | estructura/extensión invirtieron signo en OOS; score no estable |
| 4h | volatility fit, close quality, percentil/cambio de vol, body ratio, ATR% | varias inversiones en VALIDATION; muestra insuficiente |

Ejemplos de inestabilidad: en 1h `STRUCTURE_QUALITY` tuvo rho -0,103/-0,031/-0,114/+0,014 en T/D/V/O; `ENTRY_EXTENSION`, -0,104/-0,030/-0,191/+0,044. En 4h `VOLATILITY_CHANGE_RATIO` fue +0,105/+0,229/-0,271/+0,151. Algunas features de 5m/15m conservaron signo débil, pero no se combinaron en una curva de expectancy positiva.

Conclusión de atribución: hay información descriptiva débil, no separación predictiva monotónica y estable suficiente.

## F. Simple models

- Regresión logística: TRAIN only, estandarización TRAIN, 400 iteraciones, LR 0,05, L2 0,1, sin tuning.
- Decision stump: un feature y un decil TRAIN, diagnóstico hasta superar DEV/VALIDATION.
- Gradient boosting: **no ejecutado**; manual score y logística no demostraron estabilidad suficiente para justificar más grados de libertad.

La logística aumentó la selectividad pero empeoró OOS en 5m/15m. En 1h, top 10% pasó de TRAIN +0,222R y DEV +0,037R a VALIDATION -0,329R, luego OOS +0,075R: alternancia incompatible con robustez. En 4h, top 10% alternó +0,276/-0,143/+0,250/-0,175R. Los stumps que parecían positivos en TRAIN tampoco atravesaron los gates posteriores.

## G. Quality score

El score manual orientó features por TRAIN/DEV, las transformó por CDF empírica TRAIN y usó pesos iguales. No eligió thresholds mirando VALIDATION/OOS.

El caso más tentador fue 1h top 10%: VALIDATION +0,092R/PF 1,520 y OOS +0,109R/PF 1,553 con 42 señales. **No es seleccionable** porque DEVELOPMENT fue -0,148R/PF 0,482. Elegirlo ahora sería selección post-hoc sobre los períodos que debían confirmar, exactamente lo que el protocolo prohíbe.

En 4h top 10% ocurrió lo inverso: DEVELOPMENT positivo, VALIDATION -0,237R y OOS +0,264R con sólo 7 señales. También se rechaza.

## H. Selectivity curve

Expectancy OOS neta a 5 bps al aceptar top 100/75/50/25/10%:

| TF | Score manual | Score logístico | Lectura |
|---|---|---|---|
| 5m | -0,112 / -0,063 / -0,024 / -0,017 / -0,048R | -0,112 / -0,123 / -0,137 / -0,181 / -0,231R | no cruza cero; logística empeora |
| 15m | -0,096 / -0,070 / -0,060 / -0,027 / -0,054R | -0,096 / -0,118 / -0,105 / -0,090 / -0,056R | mejora parcial, nunca edge |
| 1h | -0,010 / -0,027 / -0,061 / +0,020 / +0,109R | -0,010 / +0,007 / +0,023 / +0,071 / +0,075R | OOS atractivo, pero no monotónico/estable en DEV+VALIDATION |
| 4h | +0,035 / +0,086 / -0,004 / +0,042 / +0,264R | +0,035 / +0,066 / -0,022 / -0,084 / -0,175R | muestras de 7–47; signos alternantes |

No existe una curva robusta `menos señales -> mejor expectancy` a través de los períodos. En 5m/15m la selectividad reduce parte del daño pero no crea edge; en 1h/4h los extremos atractivos son inestables o demasiado pequeños.

## I. Timeframe portfolio

Portfolio OOS neto a 5 bps, sumando resultados cronológicamente y midiendo concurrencia:

| Timeframes | Signals | Exp. | PF | DD | Máx. concurrentes |
|---|---:|---:|---:|---:|---:|
| 5m | 2.265 | -0,112R | 0,678 | 261,82R | 2 |
| 15m | 728 | -0,096R | 0,722 | 72,36R | 2 |
| 1h | 194 | -0,010R | 0,966 | 10,97R | 2 |
| 4h | 47 | +0,035R | 1,158 | 3,83R | 2 |
| 1h + 4h | 241 | -0,001R | 0,997 | 10,20R | 3 |
| 5m + 15m | 2.993 | -0,108R | 0,688 | 332,59R | 3 |
| todos | 3.234 | -0,100R | 0,707 | 334,09R | 5 |

Correlación diaria neta 5 bps: 5m/15m 0,196; 15m/1h 0,164; las demás entre -0,010 y 0,080. La diversificación temporal no compensa expectancy negativa. Combinar todos los timeframes diluye los indicios débiles de 1h/4h.

## J. Costs

Los costes destruyen casi todo el margen bruto. Ejemplo OOS: 5m pasa de +0,0049R/PF 1,018 a -0,1122R/PF 0,678 con 5 bps. 1h pasa de +0,0213R/PF 1,080 a -0,0095R/PF 0,966. Sólo 4h sigue positivo a 10 bps, pero con 47 señales baseline y 7 en su candidato selectivo.

Ningún candidato con muestra suficiente sobrevive de forma estable el escenario realista y stress.

## K. OOS results y robustez temporal

Walk-forward anual baseline, fracción de ventanas con expectancy neta 5 bps positiva:

| TF | Ventanas positivas / utilizables |
|---|---:|
| 5m | 0/7 |
| 15m | 1/7 |
| 1h | 5/7 |
| 4h | 4/7 |

1h es el timeframe menos débil, pero su locked OOS neto es negativo y los filtros finalistas no superaron VALIDATION. 4h carece de muestra para distinguir edge de varianza.

## L. Candidates

Se evaluaron 22 definiciones pre-registradas por timeframe: 13 reglas estructurales, cinco niveles de score manual, cinco de logística con baseline compartido y un stump diagnóstico (las definiciones redundantes se contabilizan una sola vez en el runner). Como máximo se congeló un finalista por TF antes de abrir OOS. Cuando ningún gate TRAIN/DEV pasó, se conservó sólo un fallback determinista **no elegible** para documentar el fracaso.

| TF | Finalista congelado | OOS signals (W/L/X) | Exp. 5bps | PF | DD | Exp. 10bps | WF+ | Bootstrap P(exp>0) | Estado |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 5m | manual score top 10% (fallback) | 155 (5/15/135) | -0,0476R | 0,812 | 13,74R | -0,0895R | 0/7 | 16,69% | REJECT |
| 15m | MTF stack aligned (fallback) | 308 (39/59/210) | -0,0625R | 0,821 | 29,25R | -0,1240R | 1/7 | 10,94% | REJECT |
| 1h | Europe/US overlap | 73 (5/8/60) | -0,0114R | 0,956 | 6,08R | -0,0377R | 5/7 | 43,29% | REJECT |
| 4h | manual score top 10% | 7 (0/0/7) | +0,2635R | 4,777 | 0,25R | +0,2567R | 4/7 | 95,88% | REJECT: 7 señales y falló VALIDATION |

El finalista 1h pasó TRAIN/DEV (+0,110/+0,078R) pero falló VALIDATION (-0,029R) antes de resultar también negativo OOS. El de 4h tuvo VALIDATION -0,237R y sólo siete observaciones OOS. No hay candidato V8 elegible.

## M. Recommendation

**ROBUST POSITIVE EDGE: NO**

**RECOMMEND SHADOW MODE: NO**
**RECOMMEND LIVE CHANGE: NO**
La respuesta a la pregunta V7 —“¿cuándo esta señal tiene edge?”— es: **no se identificó un contexto causal con edge positivo material, estable, neto de costes y muestra suficiente**. 5m y 15m son estructuralmente negativos en todos los regímenes relevantes. 1h contiene señales descriptivas débiles, pero ninguna regla atraviesa DEVELOPMENT, VALIDATION y OOS de forma estable. 4h es inconcluso por tamaño muestral.

El siguiente experimento cuantitativamente defendible no es otro tuning sobre este histórico. Debe ser evidencia forward posterior al `2026-08-28`, con reglas pre-registradas antes de observar resultados, o un núcleo de setup conceptualmente distinto evaluado sobre un holdout genuinamente nuevo. El baseline actual no debe presentarse como estrategia con rentabilidad validada.

## Aislamiento y reproducibilidad

- Tooling V7: exclusivamente servicios/scripts de research invocados manualmente.
- Escrituras DB: ninguna.
- Telegram: ninguna llamada.
- Scheduler/live imports: ninguno.
- Cambios de parámetros live: ninguno.
- Resultados completos reproducibles: `research/output/signal-engine-v7-results.json` (ignorado por Git).
- Comando: `corepack pnpm --filter @workspace/api-server analyze:signals:v7`.
- Tests: `corepack pnpm --filter @workspace/api-server test:v7`.
