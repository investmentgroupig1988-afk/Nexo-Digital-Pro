# TRENORO Signal Engine V9 — chartismo causal

Fecha: 31 de agosto de 2026
Estado: **NO ROBUST POSITIVE EDGE**

## Conclusión

V9 pre-registró cuatro familias antes de abrir resultados: doble techo/suelo con ruptura de neckline, HCH/invertido confirmado, AB=CD confirmado y reversión Bollinger/RSI en régimen lateral. No se ajustó ninguna tolerancia después del replay.

Ninguna familia pasó el gate conjunto de TRAIN, DEVELOPMENT, VALIDATION, locked OOS, muestra, costes, años positivos y bootstrap.

- **ROBUST POSITIVE EDGE: NO**
- **RECOMMEND SHADOW MODE: NO**
- **RECOMMEND LIVE CHANGE: NO**

No se modificaron estrategia live, scheduler, DB, Telegram, `main` ni production.

## Protocolo

- Research ID: `SIGNAL_ENGINE_V9_CAUSAL_CHART_PATTERNS_2026_08_31`
- Hash pre-registrado: `719f80b0da84437a2996f253f8392707446e34d92a6815d198c59428c5a14f24`
- BTCUSDT Spot, Binance, `2017-10-01` a `2026-08-28`.
- Sólo velas cerradas y pivots confirmados con tres velas derechas ya cerradas.
- Splits cronológicos TRAIN/DEVELOPMENT/VALIDATION/OOS.
- Costes 0/5/10 bps.
- Salida fija: R:R 1,5, expiry 12 y stop estructural 0,75–2,5 ATR. No hubo optimización de exits.

El histórico ya había sido observado en V1–V8. V9 es screening exploratorio, no evidencia independiente.

## Locked OOS a 5 bps

| TF | Patrón | Signals | W/L/X | Expectancy | PF | DD | Exp. 10 bps |
|---|---|---:|---:|---:|---:|---:|---:|
| 5m | Doble techo/suelo | 250 | 45/91/114 | -0,1938R | 0,626 | 48,46R | -0,3750R |
| 5m | HCH | 57 | 15/25/17 | -0,2593R | 0,600 | 17,63R | -0,5420R |
| 5m | AB=CD | 94 | 25/38/31 | -0,1762R | 0,704 | 19,74R | -0,4178R |
| 5m | BB/RSI range | 409 | 136/247/26 | -0,5679R | 0,380 | 232,27R | -1,0565R |
| 15m | Doble techo/suelo | 137 | 22/48/67 | -0,1530R | 0,685 | 20,96R | -0,2588R |
| 15m | HCH | 30 | 4/15/11 | -0,3955R | 0,360 | 13,13R | -0,5428R |
| 15m | AB=CD | 39 | 8/18/13 | -0,2711R | 0,557 | 12,12R | -0,4017R |
| 15m | BB/RSI range | 133 | 49/72/12 | -0,2172R | 0,685 | 31,61R | -0,4705R |
| 1h | Doble techo/suelo | 40 | 9/16/15 | -0,0164R | 0,963 | 5,83R | -0,0658R |
| 1h | HCH | 9 | 1/4/4 | -0,2124R | 0,597 | 2,41R | -0,2919R |
| 1h | AB=CD | 10 | 3/3/4 | +0,1872R | 1,505 | 2,15R | +0,1067R |
| 1h | BB/RSI range | 42 | 14/27/1 | -0,2699R | 0,627 | 11,84R | -0,3962R |
| 4h | Doble techo/suelo | 15 | 2/8/5 | -0,3123R | 0,460 | 5,29R | -0,3348R |
| 4h | HCH | 3 | 0/0/3 | -0,1007R | 0,724 | 1,09R | -0,1255R |
| 4h | AB=CD | 1 | 0/1/0 | -1,0253R | 0 | 1,03R | -1,0507R |
| 4h | BB/RSI range | 16 | 4/9/3 | -0,1654R | 0,721 | 3,21R | -0,2158R |

## La anomalía AB=CD 1h

AB=CD 1h fue positivo únicamente en el período OOS reciente, con diez señales. Se rechaza porque:

- TRAIN: `-0,2585R` por señal;
- DEVELOPMENT: `-0,7000R`;
- VALIDATION: `-0,4435R`;
- años 2018–2024: todos negativos;
- 2025–2026: positivos con sólo once operaciones combinadas;
- intervalo bootstrap 95%: `[-0,1303R; +0,5047R]`.

Seleccionarlo por el único tramo positivo sería data mining.

## Diagnóstico

- Los patrones visualmente reconocibles no muestran por sí mismos ventaja negociable.
- Confirmar neckline evita look-ahead, pero llega tarde con frecuencia; el coste relativo y las pérdidas posteriores eliminan el supuesto edge en 5m/15m.
- La reversión Bollinger/RSI en rango es particularmente mala: “sobreventa/sobrecompra” no implica reversión inmediata en BTC.
- HCH y AB=CD son demasiado infrecuentes en 4h para inferir nada y no mejoran al bajar de timeframe.

La conclusión no es que estos patrones nunca funcionen. Es que estas definiciones causales, fijas y ejecutables no demostraron edge en este dataset después de costes.
