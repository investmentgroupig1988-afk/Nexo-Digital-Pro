# TRENORO Signal Engine V8 — estructuras e indicadores causales

Fecha de cierre: 31 de agosto de 2026
Estado: **NO ROBUST POSITIVE EDGE**

## Resumen ejecutivo

V8 dejó de ajustar la misma señal y comparó seis familias de entrada estructuralmente diferentes: BOS con retest, CHOCH confirmado, squeeze de Bollinger con MACD y volumen, triple EMA, divergencia RSI con ruptura estructural y retest de order block. Todas se ejecutaron sólo con velas cerradas, sin look-ahead, con un único modelo de salida fijo para aislar la calidad de entrada.

El resultado no justifica cambiar el bot comercial:

- En `5m` y `15m`, las seis familias pierden fuera de muestra incluso antes de costes o se degradan claramente con 5 bps.
- En `1h`, CHOCH es la menos mala, pero sigue negativa a 5 bps (`-0,0103R`, PF `0,975`).
- En `4h`, Bollinger + MACD es la pista con mayor muestra y estabilidad, pero queda por debajo del gate pre-registrado: OOS `+0,0427R`, PF `1,093`, 62 señales y sólo 61,06% de muestras bootstrap positivas.
- En `4h`, la divergencia RSI supera el gate mecánico, pero sólo tiene 10 señales OOS. Su intervalo bootstrap de expectancy cruza cero ampliamente. Es evidencia insuficiente, no una estrategia validada.
- El order block 4h obtiene un OOS muy favorable con sólo nueve señales, pero pierde `-1,0202R` por señal en VALIDATION. Se rechaza.

Conclusiones obligatorias:

- **ROBUST POSITIVE EDGE: NO**
- **RECOMMEND SHADOW MODE: NO**
- **RECOMMEND LIVE CHANGE: NO**
- **PROFITABILITY CLAIM: NOT SUPPORTED**

No se modificaron la estrategia live, scheduler, parámetros comerciales, base de datos, Telegram, `main` ni production.

## 1. Protocolo congelado

- Research ID: `SIGNAL_ENGINE_V8_CAUSAL_SETUP_RESEARCH_2026_08_30`
- Hash pre-registrado antes de abrir resultados: `eaca89cf5240c46f0fea0b18f9bd47d1734e0c156ccacd252306d5dcc21e90ed`
- Símbolo: BTCUSDT Spot.
- Fuente: klines públicas de Binance ya cacheadas y checksummed.
- Período: `2017-10-01T00:00:00Z` a `2026-08-28T00:00:00Z`.
- Semántica: sólo candles con `closeTime <= observedAt`.
- Splits cronológicos: TRAIN, DEVELOPMENT, VALIDATION y locked OOS; nunca random shuffle.
- Costes: 0, 5 y 10 bps round-trip analíticos.
- Salida común para aislar entry: R:R `1,5`, expiry `12` velas, stop estructural limitado a `0,75–2,5 ATR` y buffer `0,1 ATR`.
- Sin overrides por línea de comandos ni búsqueda de parámetros.

Advertencia metodológica: todo el intervalo histórico ya había sido observado en V1–V7. V8 impide seleccionar usando sus resultados, pero este OOS no constituye evidencia histórica genuinamente intacta. La evidencia forward real comienza después de `2026-08-28T00:00:00Z`.

## 2. Dataset e integridad

| TF | Candles cerradas | SHA-256 (prefijo) |
|---|---:|---|
| 5m | 935.452 | `36d3356bfd59` |
| 15m | 311.970 | `2cbaf81b31a6` |
| 1h | 78.170 | `83faf8996ebf` |
| 4h | 19.722 | `216f123bbdae` |

La carga reutiliza el validador de dataset de V6/V7: orden cronológico, duplicados, OHLC, timestamps, gaps y exclusión de velas abiertas. No interpola velas faltantes. Los resultados JSON son artefactos ignorados por Git; no se incorpora el dataset pesado al repositorio.

## 3. Familias evaluadas

Todas las decisiones usan únicamente información confirmada hasta el cierre observado.

1. **BOS + retest + tendencia**: ruptura cerrada de swing confirmado en dirección EMA21/EMA55 y retest del nivel en hasta tres velas.
2. **CHOCH confirmado**: quiebre del swing contrario después de estructura HH/HL o LH/LL, con dirección MACD.
3. **Bollinger + MACD squeeze**: ruptura cerrada después de compresión causal de bandwidth, histograma MACD en expansión y volumen relativo mínimo.
4. **Triple EMA / semáforo**: EMA9/21/55 alineadas y con pendiente, pullback a EMA21, reclaim de EMA9, RSI acotado y entrada no extendida más de 1 ATR.
5. **Divergencia RSI + estructura**: divergencia entre pivots confirmados y ruptura posterior de neckline dentro de seis velas.
6. **Order block + retest**: desplazamiento con cuerpo/rango/volumen mínimos, ruptura estructural y retest causal de la última vela opuesta.

MACD, Bollinger, EMA, RSI, ATR y volumen relativo son indicadores derivados de candles y volumen reales; no se inventaron datos. BOS, CHOCH, swings y order blocks se confirmaron con pivots que necesitan dos velas derechas ya cerradas, por lo que no repintan retroactivamente durante el replay.

Hombro-cabeza-hombro, doble techo/suelo y patrones armónicos se excluyeron deliberadamente: tolerancias de simetría, neckline, ratios y elección de pivots agregan demasiados grados de libertad para mezclarlos honestamente en esta ronda fija. Requieren hipótesis y tolerancias pre-registradas aparte. No se utilizó ML.

## 4. Baseline V6 — locked OOS

| TF | Signals | W/L/X | Exp. 0 bps | Exp. 5 bps | PF 5 bps | DD 5 bps | Exp. 10 bps |
|---|---:|---:|---:|---:|---:|---:|---:|
| 5m | 2.265 | 209/352/1.704 | +0,0049R | -0,1122R | 0,678 | 261,82R | -0,2293R |
| 15m | 728 | 77/134/517 | -0,0291R | -0,0962R | 0,722 | 72,36R | -0,1634R |
| 1h | 194 | 18/25/151 | +0,0213R | -0,0095R | 0,966 | 10,97R | -0,0403R |
| 4h | 47 | 3/4/40 | +0,0465R | +0,0350R | 1,158 | 3,83R | +0,0234R |

El baseline confirma el problema conocido: 5m/15m son negativos después de costes; 1h está aproximadamente en break-even; 4h es positivo pero con muestra pequeña.

## 5. Resultados de las familias — locked OOS a 5 bps

| TF | Familia | Signals | W/L/X | Expectancy | PF | DD | Exp. 10 bps |
|---|---|---:|---:|---:|---:|---:|---:|
| 5m | BOS retest | 1.080 | 229/420/431 | -0,2453R | 0,582 | 266,18R | -0,4651R |
| 5m | CHOCH | 815 | 136/306/373 | -0,2574R | 0,543 | 210,32R | -0,4797R |
| 5m | BB + MACD | 1.711 | 426/734/551 | -0,2546R | 0,591 | 435,68R | -0,4925R |
| 5m | Triple EMA | 1.737 | 530/848/359 | -0,3465R | 0,522 | 601,95R | -0,6977R |
| 5m | RSI divergence | 266 | 37/106/123 | -0,3290R | 0,454 | 87,50R | -0,5387R |
| 5m | Order block | 217 | 73/103/41 | -0,3158R | 0,575 | 72,91R | -0,6892R |
| 15m | BOS retest | 456 | 94/171/191 | -0,1646R | 0,686 | 83,85R | -0,2818R |
| 15m | CHOCH | 344 | 55/122/167 | -0,1824R | 0,636 | 67,69R | -0,3046R |
| 15m | BB + MACD | 865 | 240/390/235 | -0,1412R | 0,756 | 128,68R | -0,2773R |
| 15m | Triple EMA | 693 | 204/314/175 | -0,1867R | 0,693 | 138,68R | -0,3769R |
| 15m | RSI divergence | 96 | 18/36/42 | -0,1511R | 0,700 | 15,94R | -0,2762R |
| 15m | Order block | 91 | 19/54/18 | -0,4111R | 0,444 | 38,46R | -0,5790R |
| 1h | BOS retest | 120 | 25/50/45 | -0,1715R | 0,678 | 22,03R | -0,2291R |
| 1h | CHOCH | 83 | 17/25/41 | -0,0103R | 0,975 | 10,24R | -0,0749R |
| 1h | BB + MACD | 226 | 59/97/70 | -0,0618R | 0,880 | 27,85R | -0,1295R |
| 1h | Triple EMA | 157 | 50/69/38 | -0,0429R | 0,921 | 18,22R | -0,1261R |
| 1h | RSI divergence | 35 | 4/15/16 | -0,2361R | 0,551 | 8,39R | -0,2886R |
| 1h | Order block | 22 | 6/10/6 | -0,1635R | 0,722 | 6,79R | -0,2372R |
| 4h | BOS retest | 23 | 7/9/7 | +0,0196R | 1,041 | 4,25R | -0,0077R |
| 4h | CHOCH | 13 | 1/4/8 | -0,1249R | 0,681 | 3,44R | -0,1441R |
| 4h | BB + MACD | 62 | 18/24/20 | +0,0427R | 1,093 | 6,17R | +0,0141R |
| 4h | Triple EMA | 34 | 10/14/10 | +0,0225R | 1,048 | 5,23R | -0,0130R |
| 4h | RSI divergence | 10 | 2/2/6 | +0,0811R | 1,276 | 2,35R | +0,0619R |
| 4h | Order block | 9 | 5/3/1 | +0,5198R | 2,504 | 2,09R | +0,4898R |

La cifra de order block 4h no es promovible: tuvo sólo tres operaciones en VALIDATION y las tres fueron LOSS (`-1,0202R` netas por señal). La selección por su OOS sería data mining.

## 6. Pistas 4h y robustez

| Familia | Full N | Exp./PF full 5 bps | OOS N | Exp./PF OOS 5 bps | Años positivos | Break-even OOS | Bootstrap P(exp>0) | IC bootstrap exp. 95% |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| BOS retest | 174 | +0,0649 / 1,163 | 23 | +0,0196 / 1,041 | 6/9 | 8,60 bps | 57,95% | [-0,3023; +0,2965]R |
| BB + MACD | 407 | +0,1141 / 1,273 | 62 | +0,0427 / 1,093 | 7/9 | 12,47 bps | 61,06% | [-0,2313; +0,3345]R |
| RSI divergence | 50 | +0,2026 / 1,654 | 10 | +0,0811 / 1,276 | 6/9 | 26,08 bps | 69,10% | [-0,3052; +0,4675]R |
| Order block | 32 | +0,1420 / 1,355 | 9 | +0,5198 / 2,504 | 5/9 | 91,67 bps | 91,09% | [-0,1999; +1,2394]R |

El bootstrap es un diagnóstico post-hoc, no parte de la selección pre-registrada. Usa 10.000 remuestreos circulares por bloques de cinco operaciones para conservar agrupamiento local corto. No modela cambios de régimen ni crea observaciones nuevas. Todos los intervalos de expectancy incluyen valores negativos.

`BB_MACD_SQUEEZE/4h` es la pista técnicamente más interesante porque tiene la muestra mayor, es positiva en TRAIN/DEV/VALIDATION/OOS y mantiene expectancy positiva a 10 bps. Sin embargo, PF OOS `1,093` no alcanza el gate `1,10`, su bootstrap sólo da 61,06% de probabilidad de expectancy positiva y el límite inferior es muy negativo. No es edge demostrado.

`RSI_DIVERGENCE_STRUCTURE/4h` pasó el gate mecánico pre-registrado, pero ese gate permitía un mínimo de sólo diez señales para 4h. La revisión estadística demuestra que ese mínimo fue demasiado permisivo para afirmar robustez. El resultado se clasifica como **hipótesis forward congelable**, no como candidato live ni shadow.

## 7. Diagnóstico por indicador y estructura

- **BOS/CHOCH:** no producen ventaja en 5m/15m; 1h CHOCH queda cerca de cero, pero no sobrevive costes con margen. El concepto de estructura por sí solo no alcanza.
- **Bollinger + MACD + volumen:** falla en 5m/15m/1h, pero 4h ofrece la señal más consistente de V8. Sugiere que la compresión/expansión necesita tiempo para resolver y que el ruido/coste relativo destruye el setup en temporalidades menores.
- **Triple EMA:** aumenta mucho la actividad en 5m/15m y empeora drawdown. La estrategia semáforo no filtra suficiente ruido en BTC bajo estas reglas.
- **RSI divergence:** sólo ofrece una pista en 4h, con frecuencia extremadamente baja (aprox. 0,59 señales/mes OOS). La muestra no permite confiar en el resultado.
- **Order blocks:** su definición causal es demasiado selectiva en 4h y muy mala en 5m/15m. El OOS positivo 4h está contradicho directamente por VALIDATION.
- **Chartismo complejo/harmónicos:** no debe añadirse como una lista de patrones hasta definir causalidad, tolerancias y pivots antes de ver resultados. De lo contrario el motor puede “encontrar” figuras retrospectivamente que no existían en tiempo real.

## 8. Qué se aprendió sobre el bot

Agregar más indicadores no crea rentabilidad automáticamente. En 5m y 15m, incluso señales conceptualmente razonables quedan muy negativas al contabilizar costes y ruido. El edge potencial, si existe, parece concentrarse en eventos 4h de expansión confirmada, no en producir señales frecuentes.

Por eso la dirección “pocas señales, pero buenas” sigue siendo correcta, pero V8 todavía no demuestra cuáles son suficientemente buenas. Activar cualquiera ahora implicaría vender incertidumbre estadística como rentabilidad.

## 9. Próximo experimento defendible

Sin modificar live, el siguiente paso de menor riesgo sería congelar exactamente dos observadores forward, sin retuning:

1. `4h_BB_MACD_SQUEEZE_V8_FROZEN` como hipótesis principal por tamaño y estabilidad histórica.
2. `4h_RSI_DIVERGENCE_STRUCTURE_V8_FROZEN` como hipótesis secundaria por mayor efecto estimado pero muestra mínima.

Ambos deberían registrar paper trades posteriores al cutoff, con el mismo coste de 5/10 bps, sin Telegram, dashboard, métricas comerciales ni acceso de usuarios. No deben combinarse ni modificarse tras observar resultados. Un mínimo sensato para reevaluar sería acumular una muestra forward material y diversidad de regímenes; no se fija una fecha de promoción ni se promete que pasarán.

Los patrones HCH/doble techo/armónicos sólo merecen un estudio separado si se pre-registran antes: algoritmo de pivots, tolerancias, simetría, invalidación, confirmación y mínimo de muestra. No deben incorporarse como filtros discrecionales al candidato 4h.

## 10. Aislamiento técnico

La infraestructura V8:

- se ejecuta únicamente mediante scripts manuales de research;
- no es importada por scheduler, API o Signal Engine live;
- no escribe PostgreSQL ni historial;
- no envía Telegram;
- no publica señales;
- no requiere secretos;
- no cambia parámetros live;
- conserva outputs grandes fuera de Git.

## Recomendación final

**¿Hay una forma demostrada de obtener rentabilidad con estos indicadores? NO.**

**¿Hay una pista cuantitativa que merezca observación forward? YES: BB + MACD squeeze en 4h, seguida de divergencia RSI 4h.**

**¿Cambiaría hoy el bot live? NO.**
**¿Prometería rentabilidad a usuarios? NO.**

El mejor bot posible no es el que contiene más indicadores, sino el que conserva sólo una ventaja simple que sobreviva costes, períodos independientes y mercado forward. V8 encontró hipótesis, no esa prueba final.
