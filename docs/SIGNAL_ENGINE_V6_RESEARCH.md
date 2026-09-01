# TRENORO Signal Engine V6 — investigación cuantitativa

Fecha de cierre: 29 de agosto de 2026
Estado: **REJECT — no se demostró un edge positivo robusto**

## Resumen ejecutivo

V6 no justifica cambiar la estrategia live, activar shadow mode ni comercializar una estrategia nueva. La investigación se pre-registró antes de inspeccionar sus resultados, utilizó exclusivamente velas cerradas, separó TRAIN/DEVELOPMENT/VALIDATION/LOCKED OOS y evaluó costes round-trip de 0/5/10 bps.

Las conclusiones obligatorias son:

- **DO WE HAVE EVIDENCE OF A ROBUST POSITIVE EDGE? NO**
- **IS V6 READY FOR SHADOW MODE? NO**
- **WOULD YOU REPLACE BASELINE TODAY? NO**

El baseline casi no tiene ventaja bruta y pierde claramente después de costes en 5m y 15m. 1h y 4h presentan indicios parciales, pero no sobreviven de forma suficientemente consistente la separación temporal, las muestras mínimas y las pruebas de estabilidad. El candidato 5m más atractivo fue positivo en el locked OOS a 5 bps, pero falló VALIDATION, quedó negativo a 10 bps, tuvo sólo 34 señales OOS y no superó walk-forward ni bootstrap.

No se modificaron estrategia live, scheduler, parámetros comerciales, base de datos ni Telegram.

## Protocolo congelado y reproducibilidad

- Research ID: `SIGNAL_ENGINE_V6_PREREGISTERED_2026_08_29`
- Snapshot commit previo a resultados: `41384002ddea8c249f6fd04015be4f281b0c073e`
- Hash de pre-registro: `77b20006436f490760b6967dc60bb5293e62fab9e10db9657e85372535b70788`
- Hash de selección pre-OOS: `df351a2e5fd1a0416783c0fde6225629514b53848f938c23824c19c9681acbb8`
- Símbolo: BTCUSDT, Binance Spot público.
- Regla de vela: `closeTime <= effective observation time`.
- Ambigüedad TP+SL en una misma vela: resolución conservadora como LOSS, igual que el motor live.
- Riesgo normalizado: 1R; no se modeló ni recomendó apalancamiento.
- El cache local comprimido y los resultados JSON generados están excluidos de Git; los metadatos, hashes, runner y tests permiten reproducir la corrida.

Advertencia metodológica: los períodos desde 2018 ya habían sido observados en V3/V4/V5. El locked OOS quedó sellado por código para la selección V6, pero no constituye evidencia histórica genuinamente untouched. La evidencia realmente forward comienza el `2026-08-28T00:00:00Z`.

## A. Dataset

Período de análisis: `2017-10-01T00:00:00Z` a `2026-08-28T00:00:00Z`, con hasta 220 velas previas de warm-up por timeframe.

| TF | Velas | Primera vela de cache | Último cierre | Gaps reportados | Duplicadas | Fuera de orden | Abiertas/invalidas | SHA-256 |
|---|---:|---|---|---:|---:|---:|---:|---|
| 5m | 935,452 | 2017-09-30 05:40Z | 2026-08-27 23:59:59.999Z | 1,632 | 0 | 0 | 0 | `36d3356bfd59394d...` |
| 15m | 311,970 | 2017-09-28 17:00Z | 2026-08-27 23:59:59.999Z | 538 | 0 | 0 | 0 | `2cbaf81b31a62be7...` |
| 1h | 78,170 | 2017-09-21 20:00Z | 2026-08-27 23:59:59.999Z | 122 | 0 | 0 | 0 | `83faf8996ebf1f1e...` |
| 4h | 19,722 | 2017-08-25 08:00Z | 2026-08-27 23:59:59.999Z | 16 | 0 | 0 | 0 | `216f123bbdaec667...` |

Los gaps se contabilizaron y nunca se interpolaron. El protocolo no excluyó ventanas adyacentes a gaps; por ello, cualquier candidato futuro positivo debería repetir una validación pre-registrada que descarte explícitamente esas ventanas antes de promoción. Esta limitación no altera la decisión V6, porque todos los candidatos fueron rechazados.

Separación cronológica:

| Segmento | Inicio | Fin exclusivo | Uso |
|---|---|---|---|
| TRAIN | 2017-10-01 | 2022-03-01 | features, thresholds y primer gate |
| DEVELOPMENT | 2022-03-01 | 2024-01-01 | shortlist pre-OOS |
| VALIDATION | 2024-01-01 | 2025-04-01 | segundo gate |
| LOCKED OOS | 2025-04-01 | 2026-08-28 | apertura final, nunca selección |

## B. Baseline corregido

El live y el replay comparten la misma semántica de velas cerradas. La corrida verificó paridad de dirección y geometría contra el evaluador live en todas las oportunidades baseline:

| TF | Oportunidades comparadas | Discrepancias dirección | Discrepancias geometría |
|---|---:|---:|---:|
| 5m | 35,220 | 0 | 0 |
| 15m | 11,260 | 0 | 0 |
| 1h | 2,627 | 0 | 0 |
| 4h | 684 | 0 | 0 |

Resultados baseline de todo el período:

| TF | Signals | WIN | LOSS | EXPIRED | Exp. 0bps | PF 0bps | Exp. 5bps | PF 5bps | DD 5bps | Señales/día |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 5m | 14,849 | 1,639 | 2,280 | 10,930 | +0.00698R | 1.025 | -0.08277R | 0.754 | 1,234.78R | 4.565 |
| 15m | 4,856 | 595 | 883 | 3,378 | +0.00195R | 1.007 | -0.05068R | 0.846 | 268.96R | 1.493 |
| 1h | 1,176 | 141 | 207 | 828 | +0.03972R | 1.142 | +0.01587R | 1.054 | 21.35R | 0.362 |
| 4h | 329 | 32 | 53 | 244 | +0.02377R | 1.092 | +0.01390R | 1.053 | 12.99R | 0.101 |

Locked OOS baseline:

| TF | Signals | Exp. 0bps | PF 0bps | Exp. 5bps | PF 5bps | DD 5bps | Exp. 10bps |
|---|---:|---:|---:|---:|---:|---:|---:|
| 5m | 2,265 | +0.00489R | 1.018 | -0.11221R | 0.678 | 261.82R | -0.22932R |
| 15m | 728 | -0.02908R | 0.905 | -0.09623R | 0.722 | 72.36R | -0.16339R |
| 1h | 194 | +0.02131R | 1.080 | -0.00952R | 0.966 | 10.97R | -0.04034R |
| 4h | 47 | +0.04654R | 1.217 | +0.03499R | 1.158 | 3.83R | +0.02344R |

La señal positiva 4h no es concluyente: sólo hay 47 observaciones OOS y los segmentos anteriores no son estables. No se la considera edge validado.

## C. Diagnóstico

Diagnóstico principal: **MIX — geometría TP/SL + régimen/timeframe + selectividad de entrada**.

- El target baseline mediano está cerca de 5 ATR, mientras el MFE mediano está entre 1.38 y 1.47 ATR. Existe una incompatibilidad clara entre target típico y excursión típica.
- Acercar exits resolvió más operaciones, pero los candidatos no fueron estables: en varios períodos las expiraciones se transformaron principalmente en LOSS.
- La métrica estrecha de adversidad dominante en la primera vela fue baja (1.23%–3.65%), por lo que no respalda afirmar que todas las entradas fallen inmediatamente.
- Los resultados por régimen y por tiempo cambian de signo. El problema no es únicamente expiry.
- Entre las expiradas baseline, ampliar el horizonte habría producido tanto TP como SL y muchas habrían seguido laterales:

| TF | EXPIRED | TP después | SL después | Ninguno |
|---|---:|---:|---:|---:|
| 5m | 10,930 | 2,450 | 3,582 | 4,898 |
| 15m | 3,378 | 779 | 1,139 | 1,460 |
| 1h | 828 | 198 | 258 | 372 |
| 4h | 244 | 56 | 60 | 128 |

Por eso, aumentar expiry de forma aislada no es defendible.

## D. TP analysis

Distribución de MFE en ATR antes de cerrar/expirar:

| TF | MFE P25 | MFE P50 | MFE P75 | MFE P90 | MFE P95 | TP baseline P50 |
|---|---:|---:|---:|---:|---:|---:|
| 5m | 0.635 | 1.468 | 2.853 | 4.729 | 6.079 | 5.278 |
| 15m | 0.604 | 1.393 | 2.852 | 4.561 | 5.722 | 4.956 |
| 1h | 0.608 | 1.422 | 2.881 | 4.678 | 5.778 | 4.972 |
| 4h | 0.586 | 1.379 | 2.487 | 4.263 | 5.344 | 4.997 |

El TP mediano baseline queda alrededor del percentil 90 de MFE de todas las señales, no cerca del movimiento típico. Esto explica buena parte de las expiraciones. Sin embargo, no basta para promocionar targets más cercanos: el único candidato con geometría distinta que llegó al reporte final falló VALIDATION y stress cost.

## E. SL analysis

| TF | MAE P25 | MAE P50 | MAE P75 | MAE P90 | MAE P95 | SL baseline P50 | SL % P50 | TP % P50 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 5m | 0.790 | 1.567 | 2.510 | 3.553 | 4.338 | 3.518 ATR | 0.714% | 1.072% |
| 15m | 0.727 | 1.505 | 2.483 | 3.586 | 4.328 | 3.304 ATR | 1.227% | 1.840% |
| 1h | 0.713 | 1.447 | 2.392 | 3.695 | 4.663 | 3.315 ATR | 2.727% | 4.091% |
| 4h | 0.710 | 1.302 | 2.249 | 3.473 | 4.258 | 3.332 ATR | 5.955% | 8.933% |

El SL baseline también es amplio respecto de la MAE mediana. Un stop menor reduce duración, pero la evidencia V6 muestra que puede elevar LOSS y sensibilidad a fricción. No se recomienda cambiarlo sin datos forward.

## F. Timeframes

| TF | Evaluación V6 | Evidencia |
|---|---|---|
| 5m | WEAK | Baseline OOS 5bps -0.112R/PF 0.678; candidato selectivo falla VALIDATION y 10bps. |
| 15m | WEAK | Negativo en full sample, VALIDATION y OOS después de costes; sólo 1/7 ventanas walk-forward positiva. |
| 1h | INVESTIGATE, NO EDGE | Full sample 5bps levemente positivo, pero OOS -0.0095R y candidatos inestables. Requiere forward genuino, no retuning. |
| 4h | INSUFFICIENT EVIDENCE | Baseline OOS positivo con 47 señales, pero fuerte inestabilidad por segmentos y candidatos finales negativos. |

## G. Regímenes

Métricas full-sample a 5 bps:

| TF | Régimen | Signals | Expectancy | PF | DD |
|---|---|---:|---:|---:|---:|
| 5m | Volatilidad alta | 4,959 | -0.0568R | 0.797 | 288.03R |
| 5m | Volatilidad normal | 6,256 | -0.0777R | 0.773 | 492.65R |
| 5m | Volatilidad baja | 3,634 | -0.1270R | 0.685 | 469.28R |
| 15m | Volatilidad alta | 1,592 | -0.0280R | 0.895 | 50.85R |
| 15m | Volatilidad normal | 1,968 | -0.0645R | 0.812 | 131.14R |
| 15m | Volatilidad baja | 1,296 | -0.0576R | 0.851 | 107.12R |
| 1h | Contexto HTF alineado | 800 | +0.0302R | 1.105 | 17.71R |
| 1h | Volatilidad normal | 550 | +0.0521R | 1.190 | 11.38R |
| 1h | Volatilidad alta | 322 | +0.0031R | 1.013 | 14.55R |
| 1h | Volatilidad baja | 304 | -0.0361R | 0.907 | 20.62R |
| 4h | Volatilidad alta | 97 | +0.0899R | 1.595 | 4.03R |
| 4h | Volatilidad normal | 145 | -0.0712R | 0.759 | 14.99R |
| 4h | Volatilidad baja | 87 | +0.0710R | 1.214 | 5.68R |

Los aparentes nichos 1h/4h son post-hoc y no sobreviven de manera uniforme DEVELOPMENT/VALIDATION/OOS. Son hipótesis forward, no reglas promovibles.

## H. Feature ablation

Se eliminó un único filtro baseline por vez, manteniendo las salidas baseline. Ninguna ablación produjo una mejora temporalmente consistente a 5 bps.

| TF | Filtro eliminado | Full exp. | DEVELOPMENT | VALIDATION | OOS exp. / PF |
|---|---|---:|---:|---:|---:|
| 5m | volumen | -0.0876R | -0.1012R | -0.0814R | -0.1150R / 0.673 |
| 5m | banda RSI | -0.0802R | -0.0933R | -0.0729R | -0.1098R / 0.673 |
| 5m | stack EMA | -0.0842R | -0.0999R | -0.0732R | -0.1122R / 0.676 |
| 5m | estructura | -0.0856R | -0.1006R | -0.0777R | -0.1291R / 0.661 |
| 5m | dirección Fibonacci | -0.0882R | -0.1130R | -0.0774R | -0.1227R / 0.656 |
| 15m | volumen | -0.0455R | -0.0577R | -0.0740R | -0.0763R / 0.765 |
| 15m | banda RSI | -0.0388R | -0.0441R | -0.0895R | -0.0794R / 0.755 |
| 15m | stack EMA | -0.0481R | -0.0685R | -0.0847R | -0.0850R / 0.750 |
| 15m | estructura | -0.0415R | -0.0638R | -0.0495R | -0.0633R / 0.826 |
| 15m | dirección Fibonacci | -0.0467R | -0.0725R | -0.0704R | -0.0880R / 0.745 |
| 1h | volumen | -0.0040R | -0.0252R | -0.0285R | -0.0287R / 0.901 |
| 1h | banda RSI | +0.0213R | -0.0018R | -0.0328R | +0.0038R / 1.015 |
| 1h | stack EMA | +0.0169R | -0.0072R | -0.0686R | -0.0017R / 0.994 |
| 1h | estructura | -0.0069R | -0.0401R | -0.0692R | +0.0152R / 1.046 |
| 1h | dirección Fibonacci | +0.0083R | -0.0007R | -0.0190R | -0.0331R / 0.892 |
| 4h | volumen | +0.0349R | -0.0866R | -0.0358R | +0.0563R / 1.242 |
| 4h | banda RSI | +0.0343R | -0.0102R | +0.0437R | +0.0347R / 1.157 |
| 4h | stack EMA | +0.0148R | -0.1508R | +0.0489R | +0.0404R / 1.171 |
| 4h | estructura | +0.0238R | -0.0170R | -0.0064R | +0.0072R / 1.024 |
| 4h | dirección Fibonacci | +0.0245R | -0.1046R | +0.0081R | +0.0088R / 1.037 |

Quitar filtros aumenta fuertemente la frecuencia, especialmente en 5m/15m, sin crear edge. No hay evidencia para simplificar live mediante estas ablaciones.

## I. Candidatos V6 y separación temporal

Al no pasar ninguna familia de entrada todos los gates TRAIN+DEVELOPMENT, el protocolo dejó avanzar exactamente un fallback diagnóstico por timeframe, marcado desde el inicio como no elegible. Se muestran como V6_A–D sólo para comparar; no son finalistas promovibles.

| ID | Definición | TRAIN exp/PF | DEV exp/PF | VALIDATION exp/PF | OOS N | OOS exp/PF/DD 5bps | OOS exp 10bps | Estado |
|---|---|---:|---:|---:|---:|---:|---:|---|
| V6_A | 5m; alta vol.+HTF+quality; SL 1.5 ATR; TP 3 ATR; RR 2; expiry 24 | +0.042/1.069 | +0.136/1.232 | -0.762/0.208 | 34 | +0.115/1.179/9.71R | -0.030R | REJECT |
| V6_B | 15m; HTF fuerte; exit baseline | +0.017/1.054 | -0.014/0.960 | -0.087/0.749 | 308 | -0.063/0.821/29.25R | -0.124R | REJECT |
| V6_C | 1h; volatilidad normal; exit baseline | +0.114/1.468 | +0.004/1.012 | -0.006/0.979 | 106 | -0.016/0.949/8.88R | -0.047R | REJECT |
| V6_D | 4h; quality top 30%; exit baseline | +0.054/1.199 | -0.100/0.696 | +0.020/1.063 | 26 | -0.090/0.598/2.71R | -0.102R | REJECT |

V6_A redujo EXPIRED OOS a 5.88%, pero lo hizo con 18 LOSS frente a 14 WIN y una muestra insuficiente. Su VALIDATION fue muy negativa y el edge desapareció a 10 bps. Es el ejemplo exacto de por qué reducir EXPIRED no basta.

## J. Walk-forward

| Candidato | Ventanas positivas / útiles | Fracción | Lectura |
|---|---:|---:|---|
| V6_A 5m | 4 / 7 | 57.1% | Tres años positivos al inicio, dos años muy negativos y recuperación final: inestable. |
| V6_B 15m | 1 / 7 | 14.3% | Negativo en seis ventanas. |
| V6_C 1h | 4 / 7 | 57.1% | Alterna signo; último período negativo. |
| V6_D 4h | 2 / 7 | 28.6% | Muestra pequeña y signo inestable. |

Ninguno alcanzó el mínimo pre-registrado de 60% de ventanas positivas.

## K. Costes

Escenarios round-trip analíticos:

- IDEAL 0 bps: 0 fee + 0 spread + 0 slippage + 0 latency.
- REALISTIC 5 bps: 2 fee + 1 spread + 1 slippage + 1 latency.
- STRESS 10 bps: 5 fee + 2 spread + 2 slippage + 1 latency.

Son supuestos explícitos, no afirmaciones sobre una cuenta o exchange específico. La decisión primaria usa 5 bps y exige supervivencia a 10 bps. V6_A es el único diagnóstico OOS positivo a 5 bps y queda negativo a 10 bps. Los otros tres ya son negativos a 5 bps.

## L. Drawdown, Monte Carlo y cartera de timeframes

Bootstrap circular por bloques, 10,000 iteraciones, bloque 5, costes 5 bps:

| Candidato | P(expectancy > 0) | IC 95% expectancy | DD P50 | DD P95 | Racha negativa P95 |
|---|---:|---:|---:|---:|---:|
| V6_A 5m | 64.35% | [-0.420R, +0.697R] | 7.98R | 15.97R | 10 |
| V6_B 15m | 11.21% | [-0.163R, +0.037R] | 27.75R | 49.76R | 15 |
| V6_C 1h | 41.49% | [-0.151R, +0.125R] | 8.80R | 17.14R | 10 |
| V6_D 4h | 13.47% | [-0.222R, +0.079R] | 3.65R | 5.80R | 5 |

La simulación preserva clustering local corto, pero no modela cambios de régimen no estacionarios ni demuestra independencia.

Si se combinaran ingenuamente los cuatro diagnósticos rechazados a 1R por señal, el locked OOS produciría 474 cierres, expectancy -0.0409R, PF 0.885 y DD 32.35R. Hubo hasta 3 señales concurrentes de BTC. La correlación Pearson de contribuciones net-R diarias fue baja (máxima 0.136 entre 5m y 15m), pero eso no elimina la exposición simultánea al mismo activo ni constituye una recomendación de sizing.

## M. Estabilidad de parámetros

Se evaluó una vecindad 3×3×3 alrededor de riesgo, R:R y expiry seleccionados.

| Candidato | Celdas positivas VALIDATION | Celdas positivas OOS | Diagnóstico |
|---|---:|---:|---|
| V6_A 5m | 0.0% | 88.9% | Cambio de régimen; OOS positivo no respaldado por VALIDATION. |
| V6_B 15m | 0.0% | 0.0% | Zona negativa. |
| V6_C 1h | 11.1% | 22.2% | Zona mayormente negativa. |
| V6_D 4h | 88.9% | 0.0% | Inversión completa en OOS. |

No existe una meseta positiva estable a través de VALIDATION y OOS.

## N. Salidas inteligentes y riesgo simultáneo

No se abrieron trailing stop, breakeven ni parciales como grados de libertad adicionales: ningún candidato superó los gates de entrada/validation/OOS. Modelarlos para rescatar resultados habría aumentado el riesgo de data mining y exigiría un modelo intrabar/ejecución más preciso.

El análisis de cartera no suma R como si las señales fueran independientes: registra concurrencia, drawdown combinado ingenuo y correlación diaria. Antes de cualquier estrategia futura será necesario definir exposición máxima simultánea, pero sólo después de demostrar edge; no se propone leverage.

## O. Recomendación

### Best candidate

**Ninguno.** V6_A 5m es el menos descartable visualmente, pero no es defendible: falló VALIDATION antes de abrir OOS, no alcanzó muestra mínima OOS, perdió a 10 bps, tuvo bootstrap de sólo 64.35% y menos del 50% de meses OOS rentables.

### Respuestas obligatorias

- **DO WE HAVE EVIDENCE OF A ROBUST POSITIVE EDGE? NO**
- **IS V6 READY FOR SHADOW MODE? NO**
- **WOULD YOU REPLACE BASELINE TODAY? NO**

### Siguiente experimento cuantitativamente defendible

Congelar V6 y acumular datos verdaderamente forward posteriores al 28 de agosto de 2026 sin retuning. No volver a buscar parámetros en este mismo histórico contaminado. Cuando exista muestra suficiente, evaluar una hipótesis pre-registrada simple y única contra ese forward; si falla, rechazarla. No hay justificación actual para modificar la estrategia comercial.

## Ejecución reproducible

Desde la raíz del repositorio:

```bash
corepack pnpm run analyze:signals:v6
```

Validación específica:

```bash
corepack pnpm --filter @workspace/api-server test:v6
corepack pnpm run typecheck
corepack pnpm run test:backend
corepack pnpm run test:frontend
corepack pnpm run build
git diff --check
```

Los artefactos generados quedan en `artifacts/api-server/research/output/` y el cache en `artifacts/api-server/research/cache/`; ambos están ignorados por Git.
