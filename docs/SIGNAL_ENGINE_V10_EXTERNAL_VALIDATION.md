# TRENORO Signal Engine V10 — generalización externa de pistas V8

Fecha: 31 de agosto de 2026
Estado: **PROMISING BUT INCONCLUSIVE — NOT ELIGIBLE**

## Objetivo

V10 no buscó nuevos parámetros. Antes de descargar datos externos congeló exactamente los detectores V8 `BB_MACD_SQUEEZE` y `RSI_DIVERGENCE_STRUCTURE` en 4h, y los aplicó sin retuning a `ETHUSDT`, `BNBUSDT` y `SOLUSDT`.

- Hash V10: `da5f4d461d95106f325456d2d5b71522d488a4f0464602565c729563200d7f4f`
- Hash fuente V8: `eaca89cf5240c46f0fea0b18f9bd47d1734e0c156ccacd252306d5dcc21e90ed`
- Período: `2020-09-01` a `2026-08-28`.
- Timeframe: 4h.
- Costes: 0/5/10 bps.
- Activos y reglas fijados antes del resultado; se reportan los tres.
- Sólo velas cerradas de Binance, cacheadas con checksum.

## Dataset

| Asset | Candles 4h | SHA-256 (prefijo) |
|---|---:|---|
| ETHUSDT | 13.342 | `8e53d902801d` |
| BNBUSDT | 13.342 | `f344d2be0754` |
| SOLUSDT | 13.247 | `4d7307afb3b9` |

## Bollinger squeeze + MACD

| Asset | Signals | W/L/X | Exp. 0 bps | Exp. 5 bps | PF 5 bps | DD | Exp. 10 bps |
|---|---:|---:|---:|---:|---:|---:|---:|
| ETH | 266 | 70/113/83 | +0,0113R | -0,0067R | 0,986 | 12,51R | -0,0247R |
| BNB | 237 | 61/99/77 | +0,0172R | -0,0038R | 0,992 | 21,20R | -0,0249R |
| SOL | 257 | 78/97/82 | +0,0941R | +0,0823R | 1,189 | 11,50R | +0,0705R |
| **Agregado** | **760** | — | — | **+0,0243R** | **1,053** | **24,06R** | **+0,0074R** |

El agregado positivo depende de SOL. ETH y BNB quedan ligeramente negativos después de 5 bps. La primera mitad fue positiva (`+0,0681R`, PF 1,157) y la segunda negativa (`-0,0171R`, PF 0,965). La hipótesis no generaliza.

## Divergencia RSI + confirmación estructural

| Asset | Signals | W/L/X | Exp. 0 bps | Exp. 5 bps | PF 5 bps | DD | Exp. 10 bps |
|---|---:|---:|---:|---:|---:|---:|---:|
| ETH | 36 | 5/8/23 | +0,0219R | +0,0094R | 1,028 | 4,18R | -0,0031R |
| BNB | 24 | 4/5/15 | +0,1510R | +0,1362R | 1,490 | 2,03R | +0,1214R |
| SOL | 28 | 6/5/17 | +0,1251R | +0,1163R | 1,370 | 3,23R | +0,1075R |
| **Agregado** | **88** | **15/18/55** | — | **+0,0780R** | **1,249** | **5,15R** | **+0,0661R** |

La primera mitad agregada fue `+0,1096R`, PF 1,422; la segunda `+0,0517R`, PF 1,144. Bootstrap por bloques: 81,06% de expectancy positiva, pero IC 95% `[-0,0952R; +0,2459R]`.

La estabilidad por activo no es completa:

| Asset | Primera mitad N / Exp. / PF | Segunda mitad N / Exp. / PF |
|---|---|---|
| ETH | 21 / +0,1556R / 1,568 | 15 / -0,1952R / 0,541 |
| BNB | 8 / +0,0035R / 1,018 | 16 / +0,2026R / 1,638 |
| SOL | 11 / +0,0989R / 1,359 | 17 / +0,1275R / 1,376 |

Por año agregado, 2020/2022/2023/2026 fueron positivos y 2021/2024/2025 negativos. Sólo 88 trades agregados, BNB y SOL no llegan a 30 cada uno y el mínimo pre-registrado agregado era 120.

## Veredicto

- **BB + MACD 4h: REJECT como edge generalizable.**
- **RSI divergence + structure 4h: PROMISING BUT INCONCLUSIVE.**
- **ROBUST EXTERNAL GENERALIZATION: NO.**
- **READY FOR LIVE: NO.**
- **READY FOR COMMERCIAL SIGNALS: NO.**

La divergencia RSI 4h es el primer patrón de estas rondas que muestra el mismo signo positivo en los tres activos y en ambas mitades agregadas después de costes. Eso justifica congelarla para paper/forward observation, no promocionarla.

El siguiente paso correcto no es retocar RSI, pivots, expiry o R:R con estos resultados. Es conservar exactamente el hash V8, acumular señales verdaderamente futuras y comprobar si el intervalo de incertidumbre deja de incluir expectancy negativa.

No se modificaron estrategia live, scheduler, PostgreSQL, Telegram, usuarios, `main` ni production.
