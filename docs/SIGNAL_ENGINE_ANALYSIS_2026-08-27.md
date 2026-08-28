# Signal Engine quantitative review — 2026-08-27

Internal research only. These figures must not be used as commercial performance claims.

## Safety and scope

- Live strategy, thresholds, stops, targets, expiry, scheduler, and providers were not changed.
- The analysis did not connect to the application database, Telegram, payments, users, or grants.
- Persisted staging totals were obtained separately with read-only queries.
- Simulated signals were never inserted into PostgreSQL.
- Binance BTCUSDT Spot candles were processed chronologically and incomplete candles were excluded.
- Entry generation received only the 200 candles available at each decision time.

## Persisted staging history

The real staging database contained the following settled signals at the time of the review:

| Timeframe | WIN | LOSS | EXPIRED | Total |
| --- | ---: | ---: | ---: | ---: |
| 5m | 0 | 1 | 2 | 3 |
| 15m | 0 | 0 | 1 | 1 |
| 1h | 0 | 0 | 0 | 0 |
| 4h | 0 | 0 | 0 | 0 |
| **All** | **0** | **1** | **3** | **4** |

All-time accuracy under the requested definition is `0 / 4 = 0%`. This sample is real but far too small to support strategy selection.

## Offline dataset and methodology

- Fixed observation cutoff: `2026-08-27T07:29:46.257Z`.
- Lookback: 365 days.
- Source: public Binance Spot BTCUSDT klines.
- Closed candles: 105,339 (5m), 35,259 (15m), 8,979 (1h), and 2,409 (4h).
- One last kline per timeframe was excluded because it closed after the fixed cutoff.
- Duplicate, out-of-order, and missing-interval counts: zero for every timeframe.
- Chronological split: 50% TRAIN, 20% DEVELOPMENT, 15% VALIDATION, 15% OUT_OF_SAMPLE.
- Candidate grids were ranked on TRAIN, selected on DEVELOPMENT, and only reported on VALIDATION/OUT_OF_SAMPLE.
- Candidates reused the exact baseline entry cohort and changed only exit distance and/or expiry. This isolates exit behavior and does not inflate signal frequency.

`WIN` contributes `+R:R`, `LOSS` contributes `-1R`, and `EXPIRED` contributes its signed mark-to-market result at expiry in initial-risk multiples. Same-candle TP/SL ambiguity is resolved as LOSS. Leverage is never modeled or assumed.

Execution friction is reported as sensitivity analysis, not as a claim about a particular exchange or account: `0`, `5`, `10`, and `20 bps` total round trip. The non-zero scenarios apportion total cost as fee/spread/slippage `3/1/1`, `6/2/2`, and `12/3/5 bps`. Cost is converted to R independently for every trade from that trade's entry-to-stop percentage.

## Baseline result

| Timeframe | Signals | WIN | LOSS | EXPIRED | EXPIRED % | Expectancy (R) | Profit factor | Max drawdown (R) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 5m | 1,583 | 153 | 234 | 1,196 | 75.55% | +0.0080 | 1.0288 | 18.70 |
| 15m | 514 | 69 | 88 | 357 | 69.46% | +0.0365 | 1.1287 | 14.28 |
| 1h | 131 | 11 | 17 | 103 | 78.63% | -0.0061 | 0.9775 | 6.57 |
| 4h | 31 | 1 | 2 | 28 | 90.32% | +0.0340 | 1.1455 | 3.46 |
| **All** | **2,259** | **234** | **341** | **1,684** | **74.55%** | **+0.0140** | **1.0505** | **18.70** |

Overall accuracy including expired signals was 10.36%. Win rate excluding expired signals was 40.70%. One final entry was censored by the dataset boundary. The 4h sample is too small for a firm conclusion.

Average duration was 10.67 candles and median duration was 12. The longest settled streaks were two wins and four losses.

### Stability by chronological period

| Period | Signals | EXPIRED % | Expectancy (R) | Profit factor | Max drawdown (R) |
| --- | ---: | ---: | ---: | ---: | ---: |
| TRAIN | 1,083 | 73.59% | +0.0122 | 1.0434 | 18.70 |
| DEVELOPMENT | 467 | 75.59% | -0.0023 | 0.9920 | 16.54 |
| VALIDATION | 356 | 76.40% | +0.0750 | 1.3086 | 6.97 |
| OUT_OF_SAMPLE | 353 | 74.22% | -0.0204 | 0.9300 | 12.44 |

The small positive full-sample result is not stable: the untouched out-of-sample segment is negative. This does not support a live strategy change.

## Distance and duration scale

| Timeframe | Median SL % | Median TP % | SL ATR | TP ATR | MFE ATR | MAE ATR | Median duration | EXPIRED % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 5m | 0.530% | 0.795% | 3.93 | 5.90 | 1.58 | 1.68 | 12 candles / 60 min | 75.55% |
| 15m | 0.977% | 1.465% | 3.50 | 5.25 | 1.43 | 1.46 | 12 candles / 180 min | 69.46% |
| 1h | 2.200% | 3.300% | 3.57 | 5.35 | 1.35 | 1.45 | 12 candles / 720 min | 78.63% |
| 4h | 4.697% | 7.046% | 3.63 | 5.44 | 1.25 | 1.24 | 12 candles / 2,880 min | 90.32% |

Median favorable excursion before resolution was only 1.25–1.58 ATR, while median targets were 5.25–5.90 ATR. The targets are therefore ambitious relative to the current 12-candle horizon. Median stops are also wide in volatility terms, but the tested narrower variants did not improve robustness out of sample.

### Full distance distributions (P25 / P50 / P75 / P90)

| TF | SL % | TP % | SL ATR | TP ATR |
| --- | --- | --- | --- | --- |
| 5m | 0.349 / 0.530 / 0.834 / 1.262 | 0.524 / 0.795 / 1.250 / 1.893 | 3.10 / 3.93 / 4.81 / 5.64 | 4.65 / 5.90 / 7.22 / 8.47 |
| 15m | 0.612 / 0.977 / 1.481 / 2.265 | 0.918 / 1.465 / 2.222 / 3.397 | 2.72 / 3.50 / 4.38 / 5.20 | 4.08 / 5.25 / 6.58 / 7.81 |
| 1h | 1.362 / 2.200 / 3.348 / 4.330 | 2.042 / 3.300 / 5.022 / 6.495 | 2.79 / 3.57 / 4.41 / 5.22 | 4.19 / 5.35 / 6.62 / 7.83 |
| 4h | 3.762 / 4.697 / 6.768 / 7.430 | 5.644 / 7.046 / 10.151 / 11.145 | 3.15 / 3.63 / 4.32 / 5.12 | 4.72 / 5.44 / 6.48 / 7.68 |

| TF | MFE % | MAE % | MFE ATR | MAE ATR |
| --- | --- | --- | --- | --- |
| 5m | 0.081 / 0.214 / 0.463 / 0.821 | 0.102 / 0.221 / 0.397 / 0.672 | 0.60 / 1.58 / 2.99 / 5.07 | 0.80 / 1.68 / 2.67 / 3.83 |
| 15m | 0.171 / 0.407 / 0.857 / 1.462 | 0.189 / 0.401 / 0.736 / 1.241 | 0.64 / 1.43 / 2.93 / 4.52 | 0.76 / 1.46 / 2.54 / 3.49 |
| 1h | 0.296 / 0.828 / 1.701 / 2.647 | 0.477 / 0.916 / 1.613 / 2.626 | 0.45 / 1.35 / 2.69 / 3.94 | 0.78 / 1.45 / 2.51 / 3.67 |
| 4h | 0.787 / 1.906 / 4.585 / 5.248 | 0.948 / 1.796 / 3.146 / 3.829 | 0.50 / 1.25 / 2.96 / 3.49 | 0.70 / 1.24 / 2.37 / 3.07 |

| TF | Candles to MFE | Candles to MAE | Candles to TP (WIN only) | Candles to SL (LOSS only) |
| --- | --- | --- | --- | --- |
| 5m | 2 / 5 / 9 / 12 | 2 / 6 / 10 / 12 | 5 / 7 / 10 / 11 | 4 / 7 / 10 / 11 |
| 15m | 2 / 4 / 8 / 11 | 2 / 5 / 9 / 12 | 4 / 6 / 9 / 11 | 4 / 6 / 9 / 11 |
| 1h | 1 / 4 / 9 / 11 | 2 / 6 / 10 / 12 | 6.5 / 8 / 9.5 / 10 | 3 / 5 / 11 / 11.4 |
| 4h | 1.5 / 4 / 8.5 / 12 | 2 / 5 / 11 / 12 | 4 / 4 / 4 / 4 | 6.75 / 8.5 / 10.25 / 11.3 |

The 4h timing percentiles are descriptive only: the entire cohort contains 31 signals, one WIN, and two LOSS outcomes.

## What happened after baseline expiry

Each expired signal was followed for up to three additional baseline expiry horizons without modifying its persisted result.

| Timeframe | Expired | Later TP | Later SL | Neither | Median extra candles to a barrier |
| --- | ---: | ---: | ---: | ---: | ---: |
| 5m | 1,196 | 255 (21.3%) | 413 (34.5%) | 528 (44.1%) | 13 |
| 15m | 357 | 81 (22.7%) | 113 (31.7%) | 163 (45.7%) | 14 |
| 1h | 103 | 23 (22.3%) | 30 (29.1%) | 50 (48.5%) | 16 |
| 4h | 28 | 5 (17.9%) | 6 (21.4%) | 17 (60.7%) | 8 |

Across every timeframe, more expired signals reached SL than TP later, and a large fraction reached neither. Increasing expiry alone is not supported.

## Exit/expiry matrix

| Configuration | EXPIRED % | Expectancy (R) | Profit factor | Max drawdown (R) |
| --- | ---: | ---: | ---: | ---: |
| Current TP/SL + current 12-candle expiry | 74.55% | +0.0140 | 1.0505 | 18.70 |
| Current TP/SL + 18-candle expiry | 63.57% | +0.0162 | 1.0489 | 23.72 |
| Current TP/SL + 24-candle expiry | 55.11% | +0.0141 | 1.0382 | 30.59 |

Longer horizons reduce the visible EXPIRED count but do not produce a meaningful expectancy improvement and materially worsen drawdown.

## Baseline versus selected experimental candidates

| Configuration | Full-sample EXPIRED % | Full expectancy (R) | Full max DD (R) | OOS expectancy (R) | OOS profit factor | OOS max DD (R) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| BASELINE | 74.55% | +0.0140 | 18.70 | -0.0204 | 0.9300 | 12.44 |
| A: cap risk at 1.5 ATR, R:R 1.5, expiry 12 | 20.75% | +0.0012 | 64.54 | -0.0059 | 0.9886 | 20.96 |
| B: 2 ATR stop / 3 ATR target, expiry 12 | 38.34% | -0.0016 | 46.84 | -0.0147 | 0.9681 | 16.99 |
| C: ATR and expiry selected per timeframe | 6.59% | +0.0095 | 67.01 | -0.0818 | 0.8661 | 33.75 |

All experimental candidates convert many expirations into settled outcomes, but mostly by adding losses and substantially increasing drawdown. Candidate C is a clear example of why minimizing EXPIRED in isolation is unsafe.

The baseline currently emits only R:R 1.5 entries, so the requested R:R buckets above 1.75 contain no observations. There is no empirical basis in this dataset for changing the 1.5 minimum.

## Earlier bounded per-timeframe geometry study

This earlier exploratory pass is retained for reproducibility and used the then-declared `14/35 bps` friction scenarios. It was superseded by the final bounded matrix below, which uses the requested `0/5/10/20 bps` scenarios. It tested seven volatility-normalized stops (`1`, `1.25`, `1.5`, `1.75`, `2`, `2.5`, and `3 ATR`) against three reward/risk ratios (`1.5`, `1.75`, and `2`), always with the live 12-candle expiry. Entries, filters, scoring, frequency, and expiry remained frozen.

Candidates were ranked independently per timeframe using only TRAIN and DEVELOPMENT. The ranking maximized the worse of their conservative-friction expectancies, with average expectancy, profit factor, and drawdown as tie-breakers. VALIDATION and OUT_OF_SAMPLE remained sealed until a candidate had been selected. A candidate still had to pass every promotion gate; being the least-bad grid member did not make it deployable.

### Best exploratory candidate by timeframe

| TF | SL | TP | R:R | OOS signals | OOS WIN / LOSS / EXPIRED | OOS EXPIRED | OOS expectancy | OOS PF | OOS DD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 5m | 3 ATR | 5.25 ATR | 1.75 | 249 | 28 / 54 / 167 | 67.07% | +0.0423 R | 1.1327 | 9.78 R |
| 15m | 3 ATR | 6 ATR | 2.0 | 82 | 4 / 22 / 56 | 68.29% | -0.0757 R | 0.8058 | 12.28 R |
| 1h | 3 ATR | 6 ATR | 2.0 | 21 | 0 / 6 / 15 | 71.43% | -0.2239 R | 0.4025 | 6.29 R |
| 4h | — | — | — | — | — | — | — | — | — |

The 4h TRAIN/DEVELOPMENT sample did not satisfy the predeclared minimum (30/12), so no 4h candidate was selected.

### Baseline versus selected candidate, untouched OOS

| TF | Variant | WIN | LOSS | EXPIRED | EXPIRED % | Expectancy | PF | DD |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 5m | Baseline | 20 | 35 | 194 | 77.91% | +0.0085 R | 1.0322 | 9.70 R |
| 5m | 3 ATR / 5.25 ATR | 28 | 54 | 167 | 67.07% | +0.0423 R | 1.1327 | 9.78 R |
| 15m | Baseline | 10 | 20 | 52 | 63.41% | -0.0652 R | 0.8157 | 11.25 R |
| 15m | 3 ATR / 6 ATR | 4 | 22 | 56 | 68.29% | -0.0757 R | 0.8058 | 12.28 R |
| 1h | Baseline | 1 | 5 | 15 | 71.43% | -0.1774 R | 0.4962 | 5.22 R |
| 1h | 3 ATR / 6 ATR | 0 | 6 | 15 | 71.43% | -0.2239 R | 0.4025 | 6.29 R |
| 4h | Baseline only | 0 | 0 | 1 | 100% | -0.2422 R | 0 | 0.24 R |

The 5m candidate is directionally interesting only before costs: 27 fewer expirations became eight additional wins and 19 additional losses. It slightly improves ideal OOS expectancy and PF without materially changing OOS drawdown, but TRAIN and DEVELOPMENT are both negative even before friction. The other timeframes do not improve OOS.

### Robustness across chronological partitions (ideal execution)

| TF candidate | TRAIN expectancy | DEVELOPMENT | VALIDATION | OOS | Stable? |
| --- | ---: | ---: | ---: | ---: | --- |
| 5m: 3 ATR / 5.25 ATR | -0.0098 R | -0.0143 R | +0.1046 R | +0.0423 R | NO |
| 15m: 3 ATR / 6 ATR | +0.0630 R | +0.0384 R | -0.0195 R | -0.0757 R | NO |
| 1h: 3 ATR / 6 ATR | +0.0742 R | -0.0718 R | +0.0701 R | -0.2239 R | NO |
| 4h | insufficient sample | insufficient sample | insufficient sample | insufficient sample | NO |

### Fees, spread, and slippage sensitivity

| Variant / OOS | Ideal expectancy / PF | Low 14 bps expectancy / PF | Conservative 35 bps expectancy / PF |
| --- | ---: | ---: | ---: |
| Baseline, all TF | -0.0204 / 0.9300 | -0.3880 / 0.2913 | -0.9394 / 0.0756 |
| Selected per-TF mix | -0.0017 / 0.9948 | -0.4581 / 0.2957 | -1.1426 / 0.0694 |
| 5m selected | +0.0423 / 1.1327 | -0.5003 / 0.2751 | -1.3142 / 0.0490 |
| 15m selected | -0.0757 / 0.8058 | -0.3594 / 0.3809 | -0.7850 / 0.1513 |
| 1h selected | -0.2239 / 0.4025 | -0.3514 / 0.2528 | -0.5426 / 0.1337 |

No candidate survives the low-friction scenario. Because stops are a small fraction of BTC price, even modest notional round-trip costs consume a material fraction of one R. Exact costs will vary by venue and execution, but a candidate that needs zero-cost execution is not suitable for live promotion.

## Special 5m excursion evidence

For the baseline 5m cohort, median stop and target are `3.93 ATR` and `5.90 ATR`. MFE percentiles are `0.60 ATR` (p25), `1.58 ATR` (p50), `2.99 ATR` (p75), and `5.07 ATR` (p90). MAE percentiles are `0.80`, `1.68`, `2.67`, and `3.83 ATR` respectively. A baseline WIN reaches TP in a median seven candles; a LOSS reaches SL in a median seven candles. Baseline EXPIRED signals have median MFE `1.61 ATR`, median MAE `1.53 ATR`, and remain unresolved for all 12 candles.

This confirms the descriptive hypothesis that most 5m targets are far beyond ordinary within-horizon movement. It does **not** validate moving them closer live: the selected bounded-grid geometry still targets `5.25 ATR`, converts many expirations into losses, is negative on TRAIN/DEVELOPMENT, and fails after modeled friction. More aggressive reductions ranked worse before OOS was opened.

## Findings

- **Are current targets too ambitious? YES, relative to the current horizon.** Their ATR scale is far above observed median favorable excursion. Reducing them alone is nevertheless not supported by out-of-sample results.
- **Are current stops too wide? INCONCLUSIVE as a change recommendation.** They are wide in ATR terms, but the tested narrower stops increased losses and drawdown.
- **Is current expiry too short? NO as a global diagnosis.** Longer expiry reduces the label count but worsens risk without robust expectancy improvement.
- **Should dynamic ATR exits be adopted? INCONCLUSIVE.** They are dimensionally appropriate, but the tested variants failed out of sample.
- **Should configuration differ by timeframe? INCONCLUSIVE.** Behavior is heterogeneous, but the per-timeframe candidate failed and 4h has insufficient observations.
- **Should the live strategy change now? NO.** Keep the baseline and collect more forward data.

Recommended candidate: **BASELINE / KEEP**. No experimental exit configuration is suitable for promotion.

## Closed-candle correction

The live historical-data adapter and the offline runner now share the same inclusive close-time predicate: a kline is eligible only when its provider `closeTime` is less than or equal to the observation cutoff. Live BTCUSDT fetches use Binance server time, request one additional kline when possible, remove every still-forming kline, and then retain the requested number of most recent closed candles. No strategy parameter was changed.

### PRE-FIX versus CLOSED-CANDLE baseline

The baseline was rerun after the live fix with the exact original cutoff and `--baseline-only`, so no candidate grid executed. The pre-fix research runner already excluded `row.closeTime > observedAt`; the fix replaced that local comparison with the same shared predicate now enforced by the live adapter. Consequently the reproducible research baseline is invariant, as expected:

| Period | Variant | Signals | WIN | LOSS | EXPIRED | Expectancy | PF | DD |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Full | PRE-FIX BASELINE | 2,259 | 234 | 341 | 1,684 | +0.014012 R | 1.050509 | 18.701155 R |
| Full | CLOSED-CANDLE BASELINE | 2,259 | 234 | 341 | 1,684 | +0.014012 R | 1.050509 | 18.701155 R |
| TRAIN | PRE / POST | 1,083 | 116 | 170 | 797 | +0.012199 R | 1.043404 | 18.701155 R |
| DEVELOPMENT | PRE / POST | 467 | 47 | 67 | 353 | -0.002280 R | 0.992002 | 16.537034 R |
| VALIDATION | PRE / POST | 356 | 40 | 44 | 272 | +0.074979 R | 1.308585 | 6.965515 R |
| OOS | PRE / POST | 353 | 31 | 60 | 262 | -0.020355 R | 0.930044 | 12.436825 R |

Every measured delta is zero. This is not evidence that a forming candle could never have changed a live decision; historical final OHLC does not contain the sequence of partial intrabar snapshots needed to reconstruct that counterfactual without fabrication. It demonstrates that the fix changes only the live input-validity boundary and leaves the closed-candle strategy baseline unchanged.

## Robust geometry and entry-quality study — final bounded matrix

This follow-up kept the live strategy frozen and evaluated 342 bounded offline configurations per timeframe: six baseline/filter controls; 20 ATR geometries and the corresponding 20 baseline-structure/ATR-cap geometries; and 16 fixed-percentage geometries, each crossed with six entry-time filters. Stops were `0.75`, `1`, `1.25`, `1.5`, or `2 ATR`, or `0.25%`, `0.30%`, `0.40%`, or `0.50%`; reward/risk was `1.25`, `1.5`, `1.75`, or `2`. The live minimum remains `1.5`; `1.25` exists only inside this offline sensitivity study. Expiry remained 12 candles.

All candidates reuse the exact baseline entry cohort. Filters may remove entries but cannot create them, so frequency cannot increase. Volume, closed-candle multi-timeframe alignment, TRAIN-derived volatility regime, and entry-time support/resistance compatibility use only information available at the signal decision. Candidates were ranked using the worst 20-bps expectancy across TRAIN, DEVELOPMENT, and VALIDATION, then average expectancy, profit factor, and drawdown. The final 15% OOS was opened only after selection.

### Baseline and the three pre-OOS selections

`SL %` and `TP %` are fixed values for percentage candidates and observed full-sample medians for ATR/hybrid candidates.

| Candidate | TF | SL % | TP % | R:R | Signals | Signals/day | WIN | LOSS | EXPIRED | Win % | Expectancy | PF | Max DD | OOS expectancy | OOS PF | OOS DD |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| BASELINE | all | 0.654 | 0.981 | 1.5 | 2,259 | 6.189 | 234 | 341 | 1,684 | 10.36% | +0.0140 R | 1.0505 | 18.70 R | -0.0204 R | 0.9300 | 12.44 R |
| Percentage + normal volatility | 5m | 0.500 | 1.000 | 2.0 | 1,000 | 2.740 | 60 | 179 | 761 | 6.00% | -0.0015 R | 0.9951 | 23.94 R | +0.0028 R | 1.0100 | 15.60 R |
| ATR/structure cap + normal volatility | 15m | 0.569 | 1.138 | 2.0 | 308 | 0.844 | 51 | 114 | 143 | 16.56% | +0.0307 R | 1.0685 | 17.51 R | +0.1134 R | 1.2263 | 7.32 R |
| ATR/structure cap + volume >= 1.10 | 1h | 1.243 | 1.864 | 1.5 | 103 | 0.282 | 24 | 40 | 39 | 23.30% | -0.0234 R | 0.9492 | 8.41 R | -0.2213 R | 0.6072 | 6.51 R |

No 4h candidate was selected because its predeclared chronological sample minimum was not met. Its annual cohort has only 31 signals and the OOS partition only one observation.

### Chronological stability before costs

| TF candidate | TRAIN expectancy | DEVELOPMENT | VALIDATION | OOS | Walk-forward positive folds at 20 bps |
| --- | ---: | ---: | ---: | ---: | ---: |
| 5m percentage 0.50% / 1.00% | -0.0286 R | -0.0200 R | +0.0961 R | +0.0028 R | 0 / 4 |
| 15m hybrid 2 ATR cap / 4 ATR target | +0.0058 R | +0.0433 R | +0.0136 R | +0.1134 R | 0 / 4 |
| 1h hybrid 2 ATR cap / 3 ATR target | -0.0154 R | +0.0004 R | +0.0977 R | -0.2213 R | 0 / 4 |

The anchored walk-forward uses only the first 85% of the year. Its four folds train on `0–35`, `0–50`, `0–65`, and `0–75%`, then test the immediately following `15`, `15`, `10`, and `10%` windows. The final 15% OOS remains untouched by all fold selection. None of the selected families produced a positive-expectancy, PF-above-one test fold after 20 bps.

### OOS friction sensitivity

Friction is total round trip and is converted into R using each trade's actual stop percentage.

| Variant | 0 bps expectancy / PF / DD | 5 bps | 10 bps | 20 bps |
| --- | --- | --- | --- | --- |
| BASELINE, all TF | -0.0204 / 0.9300 / 12.44 | -0.1516 / 0.5932 / 55.63 | -0.2829 / 0.3938 / 101.16 | -0.5455 / 0.1909 / 193.45 |
| 5m selected | +0.0028 / 1.0100 / 15.60 | -0.0972 / 0.7124 / 25.42 | -0.1972 / 0.5112 / 35.65 | -0.3972 / 0.2746 / 59.57 |
| 15m selected | +0.1134 / 1.2263 / 7.32 | +0.0175 / 1.0316 / 8.41 | -0.0783 / 0.8712 / 9.95 | -0.2700 / 0.6272 / 16.31 |
| 1h selected | -0.2213 / 0.6072 / 6.51 | -0.2945 / 0.5278 / 7.29 | -0.3678 / 0.4623 / 8.18 | -0.5143 / 0.3613 / 10.35 |

The 15m candidate is the only one that remains marginally positive at 5 bps, but 42 OOS signals are not enough to call this stable; it fails at 10 and 20 bps and every conservative-friction walk-forward fold. The combined selected mix reduces EXPIRED from 74.55% to 66.83%, but increases LOSS enough to leave OOS expectancy negative from 5 bps onward.

### Decision from this round

- **Is any candidate clearly superior to BASELINE? NO.** None satisfies positive OOS expectancy/PF, controlled drawdown, chronological stability, and realistic friction together.
- **Is baseline TP too far? YES descriptively.** Median targets are 5.25–5.90 ATR while median MFE is 1.25–1.58 ATR. This diagnosis does not validate a replacement.
- **Robust TP range:** none established. The selected geometries span roughly 1.0% on 5m, 4 ATR on 15m, and 3 ATR on 1h, but all fail at 10–20 bps or lack stability.
- **Robust SL range:** none established. Selected stops/caps are 0.50% or 2 ATR, but results vary materially by period and timeframe.
- **ATR, percentage, structure, or hybrid? INCONCLUSIVE.** The winners differ by timeframe. ATR/hybrid remains dimensionally sensible, while fixed percentages are less regime-adaptive, but neither family demonstrates a durable edge here.
- **Timeframes with demonstrated OOS edge after friction:** none. 15m is only marginal at 5 bps; 5m and 1h fail, and 4h is under-sampled.
- **Can EXPIRED be reduced materially without worsening LOSS? NO in a robust way.** The selected mix lowers EXPIRED by 9.67 percentage points, but its OOS LOSS count rises enough to erase the benefit after costs.
- **Candidate suitable for paper/shadow staging:** NO. The least-bad research lead is 15m with a 2 ATR cap, 4 ATR target, R:R 2, and normal-volatility filter, but it should not enter staging until more forward data and venue-specific friction validate it.

The live recommendation remains **KEEP BASELINE**. No parameter, threshold, filter, scheduler behavior, Telegram path, or persisted signal was changed.

## Reproduction

```bash
corepack pnpm run analyze:signals -- --days=365 --end=2026-08-27T07:29:46.257Z --terse
corepack pnpm run analyze:signals -- --days=365 --end=2026-08-27T07:29:46.257Z --baseline-only
corepack pnpm run analyze:signals -- --days=365 --end=2026-08-27T07:29:46.257Z --geometry
corepack pnpm run analyze:signals -- --days=365 --end=2026-08-27T07:29:46.257Z --selection
corepack pnpm run analyze:signals -- --days=365 --end=2026-08-27T07:29:46.257Z --robust --terse
corepack pnpm run analyze:signals -- --days=365 --end=2026-08-27T07:29:46.257Z --robust --selection
corepack pnpm run analyze:signals -- --days=365 --end=2026-08-27T07:29:46.257Z --robust --selection --focus=15m
```

The implementation and methodological caveats are documented in `docs/SIGNAL_ENGINE_ANALYSIS.md`.

## Four-year closed-candle extension — 2022-08-28 to 2026-08-28

This extension supersedes the one-year sample for robustness conclusions, but not as a promise of future performance. It uses the immutable live baseline with the same closed-candle rule as the live adapter: a Binance kline is available only when `closeTime <= observationTime`. No live threshold, exit, expiry, scheduler, database record, or notification was changed.

The fixed dataset contains 420,972 5m, 140,471 15m, 35,283 1h, and 8,986 4h closed candles. The downloader excluded one still-open candle per timeframe. It found no duplicate or out-of-order timestamps; it found 16, 5, 1, and 0 missing intervals respectively. Missing intervals were reported and never fabricated or interpolated.

### Corrected baseline over four years

| TF | Signals | WIN | LOSS | EXPIRED | EXPIRED % | Ideal expectancy / PF | 5 bps expectancy / PF | 10 bps expectancy / PF |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 5m | 6,606 | 727 | 998 | 4,881 | 73.89% | +0.0137 / 1.0486 | -0.1005 / 0.7117 | -0.2147 / 0.4939 |
| 15m | 2,140 | 246 | 397 | 1,497 | 69.95% | -0.0229 / 0.9255 | -0.0905 / 0.7404 | -0.1581 / 0.5972 |
| 1h | 523 | 62 | 88 | 373 | 71.32% | +0.0153 / 1.0527 | -0.0144 / 0.9531 | -0.0441 / 0.8637 |
| 4h | 140 | 15 | 21 | 104 | 74.29% | +0.0050 / 1.0187 | -0.0073 / 0.9734 | -0.0195 / 0.9303 |
| **All** | **9,409** | **1,050** | **1,504** | **6,855** | **72.86%** | **+0.0053 / 1.0184** | **-0.0921 / 0.7333** | **-0.1894 / 0.5371** |

At 20 bps the combined expectancy is `-0.3842 R`, PF `0.3020`, and maximum drawdown `3617.41 R`. Even the 5 bps sensitivity removes the idealized edge. The five largest positive trades contribute only 0.27% of total positive R, so the failure is not caused by one isolated winner; it is broad after costs.

The prior one-year cutoff is inside this interval. Only four signals occur after `2026-08-27T07:29:46.257Z`; all four are EXPIRED. That genuinely new sample is far too small to serve as an independent final OOS.

### Regime evidence

| TF | Most favorable descriptive regime | Signals | Ideal expectancy / PF | 5 bps expectancy / PF | 10 bps expectancy / PF | Interpretation |
| --- | --- | ---: | --- | --- | --- | --- |
| 5m | reference-trend aligned | 3,132 | +0.0316 / 1.1113 | negative | -0.1868 / 0.5527 | Large sample, but no edge after costs. |
| 15m | bullish 4h context | 821 | +0.0097 / 1.0334 | negative | -0.1222 / 0.6703 | The earlier favorable year was period-dependent. |
| 1h | normal causal volatility | 264 | +0.0646 / 1.2387 | +0.0367 / 1.1288 | +0.0088 / 1.0295 | Interesting subgroup, but the corresponding walk-forward candidates fail every test window at 10 bps. |
| 4h | low causal volatility | 34 | +0.1131 / 1.3282 | +0.0967 / 1.2742 | +0.0802 / 1.2225 | Too few signals; result concentration is high and final holdout fails. |

The 15m baseline yearly ideal expectancy was `-0.0220`, `-0.0039`, `-0.0923`, and `+0.0365 R`. This explains why the previous 15m hypothesis looked favorable in the latest annual slice: it did not generalize across regimes or years.

### Entry-quality hypotheses and walk-forward

Seven simple hypotheses were declared before evaluation: baseline, volume confirmation, closed-candle MTF confirmation, 4h reference-trend alignment, exclusion of high causal volatility, structural path compatibility, and MTF plus non-high volatility. All retain baseline TP, SL, R:R, and expiry; filters can remove but never add signals.

No candidate passed the required combination of positive expectancy, PF above one after friction, chronological stability, sufficient sample, limited concentration, and final holdout. At 10 bps, the selected final-fold results were:

| TF | Selected from prior data | Holdout signals | WIN / LOSS / EXPIRED | Expectancy | PF | DD |
| --- | --- | ---: | --- | ---: | ---: | ---: |
| 5m | 4h reference-trend aligned | 457 | 57 / 56 / 344 | -0.1219 R | 0.6723 | not promotion-grade |
| 15m | structural path compatible | 3 | insufficient | -0.9322 R | 0 | insufficient |
| 1h | volume confirmation | 69 | 7 / 7 / 55 | -0.0398 R | 0.8651 | 7.94 R |
| 4h | MTF plus non-high volatility | 13 | 0 / 2 / 11 | -0.1946 R | 0.3975 | 3.49 R |

The 4h full-sample MTF/non-high-volatility result remains an investigation lead only: 72 total observations and positive 10/20 bps full-sample metrics are overridden by its negative final holdout and tiny sample.

### Evidence classification

- **5m — WEAK:** abundant observations, near-flat ideal edge, clearly negative after friction and in every selected walk-forward test.
- **15m — WEAK:** negative full-sample ideal expectancy and unstable year-to-year behavior; the prior cap hypothesis remains rejected.
- **1h — INVESTIGATE:** closest to break-even after low friction and a plausible normal-volatility subgroup, but no robust walk-forward edge.
- **4h — INSUFFICIENT:** potentially favorable low-volatility slices, but only 140 baseline signals and a failed 13-signal final holdout.

**NO ROBUST CANDIDATE FOUND.** There is not yet sufficient evidence of an edge suitable for commercial use. The live strategy remains BASELINE apart from the already-published closed-candle input correction.

Reproduce the compact four-year report with:

```bash
corepack pnpm run analyze:signals -- --days=1461 --end=2026-08-28T00:00:00.000Z --long-horizon --compact
```
