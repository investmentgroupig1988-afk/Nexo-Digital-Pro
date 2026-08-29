# TRENORO Signal Strategy V4 — offline quality-ranking research — 2026-08-28

Internal research only. These results are not commercial performance claims and must not be presented as guaranteed or expected returns.

## Safety boundary

- The live BASELINE, scheduler, thresholds, R:R, TP, SL, expiry, persistence, and notifications were not changed.
- The manual runner reads public Binance Spot BTCUSDT klines and operates only in memory.
- It cannot write PostgreSQL, signal history, users, grants, payments, or Telegram.
- It is not imported by the live scheduler and is never executed automatically.
- No Strategy V4 change was committed, pushed, deployed, or enabled in shadow mode.

## Dataset and causal policy

- Fixed interval: `2022-08-28T00:00:00.000Z` through `2026-08-28T00:00:00.000Z`.
- Closed candles: 420,972 5m; 140,471 15m; 35,283 1h; 8,986 4h.
- One still-open candle was excluded per timeframe.
- Duplicate and out-of-order timestamps: zero.
- Missing intervals: 16, 5, 1, and 0 respectively; none were fabricated or interpolated.
- Every factor uses only the entry candle and prior candles already closed at the observation time.
- Entries and exits are the frozen BASELINE. V4 only ranks or discards opportunities offline.
- Same-candle TP/SL ambiguity remains a conservative LOSS.

The run reproduced the V2/V3 control exactly: 9,409 signals, 1,050 WIN, 1,504 LOSS, and 6,855 EXPIRED.

## Pre-registered protocol

The chronological partitions remained fixed:

- 45% DEVELOPMENT;
- 25% VALIDATION;
- 15% HOLDOUT;
- 15% PSEUDO_FORWARD.

Only DEVELOPMENT produced score percentile cutoffs. Candidate ordering used DEVELOPMENT and VALIDATION; HOLDOUT and PSEUDO_FORWARD were not accepted by selection functions. The market interval was already observed during V1–V3, so the last two partitions are sealed within V4 but are not genuinely unseen market data.

Nine predeclared factors were normalized to `[0,1]` and given equal weight:

- trend quality;
- market-structure quality;
- higher-timeframe alignment;
- entry extension;
- volatility fit;
- relative volume;
- momentum confirmation;
- breakout/pullback/rejection quality;
- range position and candle-close quality.

There are no learned weights. The only cumulative thresholds were top 30%, top 20%, and top 10%. No TP, SL, R:R, or expiry search was performed. Round-trip friction sensitivity was 0, 5, 10, and 15 bps. These are analytical assumptions rather than claims about a venue or account.

## Acceptance rule fixed before sealed results

A manual score needed a positive rank relationship in both DEVELOPMENT and VALIDATION, positive expectancy and PF above one at 5 bps in both partitions, and non-negative expectancy at 10 bps before sealed periods could support it. Promotion additionally required sufficient samples, positive sealed expectancy with PF at least 1.10, non-negative full-sample expectancy at 10 bps, at least three positive anchored years, lower drawdown than the same-timeframe baseline, and no excessive winner concentration.

The optional interpretable-model experiment was gated behind successful manual factor evidence. No timeframe passed that gate, so logistic regression/tree experiments were deliberately not run.

## Frozen baseline

| TF | Signals | WIN | LOSS | EXPIRED | Exp. 0 bps | Exp. 5 bps | Exp. 10 bps | PF 5 bps | DD 5 bps |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 5m | 6,606 | 727 | 998 | 4,881 | +0.0137 R | -0.1005 R | -0.2147 R | 0.7117 | 669.63 R |
| 15m | 2,140 | 246 | 397 | 1,497 | -0.0229 R | -0.0905 R | -0.1581 R | 0.7404 | 196.04 R |
| 1h | 523 | 62 | 88 | 373 | +0.0153 R | -0.0144 R | -0.0441 R | 0.9531 | 21.24 R |
| 4h | 140 | 15 | 21 | 104 | +0.0050 R | -0.0073 R | -0.0195 R | 0.9734 | 7.53 R |
| ALL | 9,409 | 1,050 | 1,504 | 6,855 | +0.0053 R | -0.0921 R | -0.1894 R | 0.7333 | 871.33 R |

## Factor diagnostics

No single factor established stable, positive post-cost validation evidence across timeframes. On 5m, even the comparatively better upper-factor slices remained negative: HTF alignment was `-0.0806 R` at 5 bps, relative volume `-0.0943 R`, momentum `-0.1012 R`, volatility fit `-0.1016 R`, and range/close quality `-0.1072 R`. Ties in categorical pattern, trend, and structure values also limited their ranking resolution.

The central failure was not merely a strict promotion threshold: higher composite scores did not produce a consistent improvement in future outcomes. A predictive quality score should show approximately monotonic expectancy as score rises; this score did not.

## Score buckets — 5m diagnostic

The largest sample makes 5m the clearest diagnostic. These bands are mutually exclusive and their cutoffs were derived from DEVELOPMENT only.

| Score bucket | Signals | Signals/day | Exp. 5 bps | PF 5 bps | DD 5 bps | EXPIRED |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Bottom 30% | 2,719 | 1.861 | -0.1280 R | 0.6175 | — | 79.22% |
| Middle 40% | 3,801 | 2.602 | -0.1002 R | 0.7130 | — | 74.01% |
| Top 20–30% | 1,389 | 0.951 | -0.0776 R | 0.7781 | — | 72.64% |
| Top 10–20% | 1,331 | 0.911 | -0.1170 R | 0.6825 | — | 72.50% |
| Top 10% | 1,301 | 0.890 | -0.1224 R | 0.6952 | — | 65.10% |

The middle-high band was less negative, but the top 20% deteriorated again. DEVELOPMENT and VALIDATION rank correlation were both only `0.20`; strict monotonicity failed. Therefore there is no defensible score threshold.

## Pre-sealed threshold leaderboard

These are the best available cumulative thresholds selected without using HOLDOUT or PSEUDO_FORWARD. “Best available” does not mean viable; every row is rejected.

| Candidate | TF | Signals | Signals/week | WIN | LOSS | EXPIRED | Exp. 0 bps | Exp. 5 bps | Exp. 10 bps | PF 5 bps | DD 5 bps | Validation | Holdout | Pseudo-forward | Status |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Quality top 30% | 5m | 3,045 | 14.59 | 381 | 511 | 2,153 | +0.0140 R | -0.1033 R | -0.2206 R | 0.7203 | 317.52 R | -0.0694 R | -0.1515 R | -0.1214 R | REJECT |
| Quality top 20% | 15m | 692 | 3.32 | 113 | 162 | 417 | -0.0073 R | -0.0786 R | -0.1498 R | 0.8003 | 58.48 R | -0.1066 R | -0.0830 R | -0.0684 R | REJECT |
| Quality top 30% | 1h | 209 | 1.00 | 31 | 46 | 132 | -0.0029 R | -0.0337 R | -0.0645 R | 0.9026 | 19.74 R | -0.0055 R | -0.1481 R | -0.0246 R | REJECT |
| Quality top 30% | 4h | 61 | 0.29 | 6 | 12 | 43 | -0.0350 R | -0.0472 R | -0.0595 R | 0.8330 | 5.17 R | -0.1459 R | -0.0292 R | -0.1612 R | REJECT |

Filtering reduced frequency and, in places, expired rate, but it did not create positive post-cost expectancy. The 1h aggregate was closest to the baseline control, yet all three sealed/validation readings shown above were negative.

## MFE/MAE and target feasibility

For 5m, median MFE in the three constituent top-30 bands remained approximately `1.55–1.68 ATR`; P75 was `3.11–3.25 ATR` and P90 `5.27–5.40 ATR`. Median MAE was approximately `1.65–1.79 ATR`, and median time to MFE was four candles. The top score band therefore did not separate cleanly favourable from adverse excursion.

For the small selected 4h slice, MFE percentiles were `0.57 / 1.20 / 1.96 / 3.96 ATR` at P25/P50/P75/P90, while MAE was `0.93 / 1.63 / 2.43 / 3.85 ATR`; median time to MFE was four candles. This sample is insufficient for a target recommendation.

The score does not justify changing exits. Descriptively, the prior finding remains: baseline targets around `5.25–5.90 ATR` exceed typical favourable excursion. However, V2 showed that moving exits closer converted many EXPIRED outcomes into LOSS and did not survive costs. V4 supplies no new evidence that overrides that rejection.

## Frozen 1h forward hypothesis

`QUALITY_PULLBACK_HTF_1H` remains labelled `FORWARD_RESEARCH_ONLY`. V4 does not optimize it, combine it with the score, or reuse its historical result as confirmation. It requires genuinely future observations collected under its frozen definition.

## Decision

- EDGE FOUND: **NO**.
- Survives 5 bps: **NO**.
- Survives HOLDOUT/PSEUDO_FORWARD: **NO**.
- SHADOW MODE: **NO**.
- MODIFY LIVE: **NO**.
- Best threshold candidate: **none**.
- Interpretable ML experiment: **not eligible and not executed**.

The result is a useful rejection: the equal-weight manual score does not rank opportunities reliably enough to justify a threshold, a learned model, shadow mode, or a live change. Further retrospective combinations would increase data-mining risk. The scientifically valid next step is to freeze specific hypotheses and gather genuinely future paper observations.

## Reproduction

```bash
corepack pnpm run analyze:signals:v4 -- --days=1461 --end=2026-08-28T00:00:00.000Z --summary
```

Omit `--summary` for the full per-factor, per-bucket, per-period, and excursion report.
