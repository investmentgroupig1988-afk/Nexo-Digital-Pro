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

`WIN` contributes `+R:R`, `LOSS` contributes `-1R`, and `EXPIRED` contributes its signed mark-to-market result at expiry in initial-risk multiples. Fees, spread, slippage, intra-candle execution ordering beyond the conservative same-candle rule, and leverage are not modeled.

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

## Findings

- **Are current targets too ambitious? YES, relative to the current horizon.** Their ATR scale is far above observed median favorable excursion. Reducing them alone is nevertheless not supported by out-of-sample results.
- **Are current stops too wide? INCONCLUSIVE as a change recommendation.** They are wide in ATR terms, but the tested narrower stops increased losses and drawdown.
- **Is current expiry too short? NO as a global diagnosis.** Longer expiry reduces the label count but worsens risk without robust expectancy improvement.
- **Should dynamic ATR exits be adopted? INCONCLUSIVE.** They are dimensionally appropriate, but the tested variants failed out of sample.
- **Should configuration differ by timeframe? INCONCLUSIVE.** Behavior is heterogeneous, but the per-timeframe candidate failed and 4h has insufficient observations.
- **Should the live strategy change now? NO.** Keep the baseline and collect more forward data.

Recommended candidate: **BASELINE / KEEP**. No experimental exit configuration is suitable for promotion.

## Correctness issue for a later round

The offline runner explicitly excludes an exchange kline whose close time is after the observation cutoff. The current live historical-data adapter maps the most recent REST klines without an equivalent close-time exclusion, so a scan can evaluate a still-forming candle. This is a high-priority correctness issue because it can make a close-based strategy depend on unconfirmed prices. It was not changed in this analysis-only round because doing so changes live signal behavior and requires separate authorization and staging validation.

## Reproduction

```bash
corepack pnpm run analyze:signals -- --days=365 --end=2026-08-27T07:29:46.257Z --terse
```

The implementation and methodological caveats are documented in `docs/SIGNAL_ENGINE_ANALYSIS.md`.
