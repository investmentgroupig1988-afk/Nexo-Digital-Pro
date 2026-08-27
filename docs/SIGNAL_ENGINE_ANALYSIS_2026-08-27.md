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

Execution friction is reported as sensitivity analysis, not as a claim about a particular exchange or account: ideal `0 bps`, low `14 bps` round trip (8 fee + 2 spread + 4 slippage), and conservative `35 bps` (20 + 5 + 10). Cost is converted to R independently for every trade from that trade's entry-to-stop percentage.

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

## Bounded per-timeframe geometry study

A second, deliberately limited grid tested seven volatility-normalized stops (`1`, `1.25`, `1.5`, `1.75`, `2`, `2.5`, and `3 ATR`) against three reward/risk ratios (`1.5`, `1.75`, and `2`), always with the live 12-candle expiry. This is 21 candidates per timeframe, not an unbounded optimizer. Entries, filters, scoring, frequency, and expiry remained frozen.

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

## Robust geometry and entry-quality study

This follow-up kept the live strategy frozen and evaluated 312 bounded offline configurations per timeframe. The grid combined 17 valid `SL/TP` pairs (`SL 0.75–2 ATR`, `TP 1.25–3 ATR`, always `R:R >= 1.5`) with ATR, TRAIN-calibrated price-percentage, and ATR/structure-hybrid exits. It also compared entry-time volume, closed-candle MTF alignment, TRAIN p20–p80 volatility regime, support/resistance path compatibility, and their combined filter. No numeric score was invented because the live strategy has Boolean confluence gates rather than a score.

All candidates reuse the exact baseline entry cohort. A filter can remove an entry but cannot create one; this makes the comparison conservative and guarantees that frequency cannot increase. Features use only information known when the entry candle closed. Candidate selection used conservative friction on TRAIN, DEVELOPMENT, and VALIDATION; OOS was opened only after selection.

### Best non-baseline candidate selected before OOS

| TF | Family / filter | SL | TP | Full signals | WIN | LOSS | EXPIRED | OOS expectancy / PF / DD | Low-friction OOS expectancy / PF |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 5m | Percentage / normal volatility | 0.2936% (2 TRAIN-median ATR) | 0.4404% (3 TRAIN-median ATR) | 1,000 | 223 | 388 | 389 | -0.0426 R / 0.9042 / 20.17 R | -0.5194 R / 0.3135 |
| 15m | Percentage / normal volatility | 0.6022% (2 TRAIN-median ATR) | 0.9034% (3 TRAIN-median ATR) | 308 | 75 | 103 | 130 | +0.0651 R / 1.1560 / 7.13 R | -0.1674 R / 0.6947 |
| 1h | ATR/structure hybrid / volume >= 1.10 | cap 2 ATR | 3 ATR | 103 | 24 | 40 | 39 | -0.2213 R / 0.6072 / 6.51 R | -0.4264 R / 0.4178 |
| 4h | No selection | — | — | — | — | — | — | insufficient OOS sample | — |

The 5m candidate cuts EXPIRED from 77.91% to 42.86% in OOS, but LOSS rises from 14.06% to 36.73%; expectancy and PF worsen even before costs. The 15m candidate cuts EXPIRED from 63.41% to 40.48% and is positive under ideal execution, but it is negative under the low 14 bps scenario. The 1h candidate has only 16 OOS observations and is negative before costs. The 4h OOS contains one settled observation, so no parameter selection is defensible.

### OOS comparison

| Config | Signals | WIN | LOSS | EXPIRED | WIN % incl. EXPIRED | Expectancy | PF | DD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline, all TF | 353 | 31 | 60 | 262 | 8.78% | -0.0204 R | 0.9300 | 12.44 R |
| Selected non-baseline mix | 205 | 44 | 76 | 85 | 21.46% | -0.0345 R | 0.9231 | 20.17 R |
| 5m baseline | 249 | 20 | 35 | 194 | 8.03% | +0.0085 R | 1.0322 | 9.70 R |
| 5m candidate | 147 | 30 | 54 | 63 | 20.41% | -0.0426 R | 0.9042 | 20.17 R |
| 15m baseline | 82 | 10 | 20 | 52 | 12.20% | -0.0652 R | 0.8157 | 11.25 R |
| 15m candidate | 42 | 11 | 14 | 17 | 26.19% | +0.0651 R | 1.1560 | 7.13 R |
| 1h baseline | 21 | 1 | 5 | 15 | 4.76% | -0.1774 R | 0.4962 | 5.22 R |
| 1h candidate | 16 | 3 | 8 | 5 | 18.75% | -0.2213 R | 0.6072 | 6.51 R |
| 4h baseline | 1 | 0 | 0 | 1 | 0% | -0.2422 R | 0 | 0.24 R |

The selected mix is not an economic improvement: it resolves more trades but increases losses, produces worse ideal OOS expectancy, and more than doubles OOS drawdown. Under 14 bps its OOS expectancy is `-0.4400 R` with PF `0.3820`; under 35 bps it is `-1.0484 R` with PF `0.1020`. No selected timeframe passes all promotion checks, and no candidate qualifies for shadow testing.

### Decision from this round

- Baseline TP is too far relative to observed within-horizon movement: **YES descriptively**, but this alone is not a validated change.
- Robust TP range: **none established**. `3 ATR` is the least-bad selected target in the bounded non-baseline set, but only 15m is positive before costs and it fails after low friction.
- Robust SL range: **none established**. `2 ATR` is the least-bad selected stop/cap, but it converts too many expirations into losses in 5m and 1h.
- Preferred geometry family: **inconclusive**. Percentage exits won pre-OOS selection for 5m/15m and the hybrid won for 1h, but none survives costs. ATR/structure remains dimensionally preferable for future research because it adapts to market regime; it is not validated here.
- Timeframes with demonstrated OOS edge after low friction: **none**. Under ideal execution, 5m baseline is barely positive and the 15m candidate is positive, but neither survives 14 bps.
- EXPIRED can be reduced substantially without worsening LOSS: **NO for the selected candidates**.
- Candidate suitable for staging shadow testing: **NO**.

The live recommendation remains **KEEP BASELINE**. A future study should focus on entry quality and use forward/shadow data, not promote the least-bad geometry from this search.

## Reproduction

```bash
corepack pnpm run analyze:signals -- --days=365 --end=2026-08-27T07:29:46.257Z --terse
corepack pnpm run analyze:signals -- --days=365 --end=2026-08-27T07:29:46.257Z --baseline-only
corepack pnpm run analyze:signals -- --days=365 --end=2026-08-27T07:29:46.257Z --geometry
corepack pnpm run analyze:signals -- --days=365 --end=2026-08-27T07:29:46.257Z --selection
corepack pnpm run analyze:signals -- --days=365 --end=2026-08-27T07:29:46.257Z --robust --terse
```

The implementation and methodological caveats are documented in `docs/SIGNAL_ENGINE_ANALYSIS.md`.
