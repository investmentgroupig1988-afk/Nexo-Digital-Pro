# TRENORO Signal Strategy V5 — preregistered offline research — 2026-08-29

Internal research only. These results are not commercial performance claims and must not be presented as guaranteed or expected returns.

## Decision

- Final classification: **REJECT**.
- Promote to forward/paper observation: **NO**.
- Promote to commercial live: **NO**.
- Live strategy, scheduler, persistence, database, Telegram, symbols, and commercial timeframes changed: **NO**.

No V5 candidate passed every preregistered research, validation, stability, locked-OOS, external-audit, and bootstrap gate. The most interesting 1h result failed external generalization and had only nine locked-OOS trades. It is not a defensible edge.

## Immutable preregistration

- Research ID: `SIGNAL_ENGINE_V5_PREREGISTERED_2026_08_29`.
- SHA-256 snapshot: `bcfd606e06b72204337ae925028c3434a4c9898cd2003927a52fbe6bdb1ba32f`.
- Symbol/provider: BTCUSDT, Binance public Spot klines.
- Closed-candle rule: a candle is usable only when `closeTime <= effective observation time`; every higher-timeframe context is causal.
- Objective: net expectancy, PF, drawdown, temporal stability, parameter stability, and post-cost robustness—not win-rate maximization.

The snapshot fixed three entry families, three exit families, four timeframes, the chronological partitions, costs, minimum samples, shortlist size, stability surface, and promotion gates before the V5 result was read. The runner rejects runtime parameters and verifies the snapshot hash before fetching data.

### Entry families

All families retain the existing baseline confluence and require direction alignment. 5m/15m require confirmed 1h and 4h agreement; 1h requires confirmed 4h agreement; 4h requires local non-sideways EMA/trend agreement.

1. `HIGH_VOL_TREND_QUALITY`: causal 4h volatility percentile 0.75–1.00, extension no more than 1 ATR, relative volume at least 1.00, plus one existing causal quality pattern.
2. `TREND_MOMENTUM_LIQUID`: 4h volatility percentile 0.60–0.95, extension no more than 1.25 ATR, relative volume at least 1.05, plus confirmed breakout or momentum.
3. `STRUCTURE_PULLBACK_REGIME`: 4h volatility percentile 0.60–1.00, extension no more than 0.75 ATR, relative volume at least 1.00, plus pullback continuation or structural rejection.

The volatility hypothesis was explicitly treated as post-hoc motivation and then preregistered as a new V5 hypothesis; it was not treated as already validated.

### Exit families

- ATR risk 1.00, target 1.50 R, expiry 12 candles.
- ATR risk 1.25, target 1.50 R, expiry 12 candles.
- Percentage-normalized risk by timeframe: 0.35% / 0.50% / 0.75% / 1.25% for 5m / 15m / 1h / 4h, target 1.50 R, expiry 12 candles.

This produced exactly 36 primary combinations: 3 entry families × 3 exit families × 4 timeframes. There was no unbounded search.

### Costs

- 0 bps: ideal diagnostic.
- 5 bps primary: 3 fee + 1 spread + 1 slippage.
- 10 bps stress: 6 fee + 2 spread + 2 slippage.

Costs are modeled as total round-trip friction consistently by the existing backtest summarizer. They are analytical assumptions, not venue/account claims.

## Dataset and temporal validity

| Partition | Interval UTC | Selection access | Caveat |
| --- | --- | --- | --- |
| External pre-sample audit | 2017-10-01 → 2018-08-28 | No | New to V5 selection, but chronologically earlier—not forward |
| RESEARCH | 2018-08-28 → 2022-08-28 | Yes | Previously inspected during V3/V4 robustness work |
| VALIDATION | 2022-08-28 → 2024-08-28 | Yes | Overlaps V3/V4 discovery-era work |
| LOCKED_OOS | 2024-08-28 → 2026-08-28 | No | Locked against V5 code-level selection, but aggregate era was previously seen |
| True forward | From 2026-08-28 | No backtest evidence yet | Required for any future promotion |

There is no claim that 2018–2026 is genuinely untouched market history. V5's OOS is procedurally sealed for this fixed experiment, while only observations after the cutoff can supply true forward evidence.

| TF | Closed candles | Duplicates | Out of order | Missing intervals | Open candle excluded |
| --- | ---: | ---: | ---: | ---: | ---: |
| 5m | 935,452 | 0 | 0 | 1,632 | 1 |
| 15m | 311,970 | 0 | 0 | 538 | 1 |
| 1h | 78,170 | 0 | 0 | 122 | 1 |
| 4h | 19,722 | 0 | 0 | 16 | 1 |

Missing intervals were reported and never fabricated or interpolated.

## Gates fixed before results

Research required positive expectancy and PF above one at 5 bps, non-negative expectancy and PF at least one at 10 bps, and minimum samples of 40/25/12/6 for 5m/15m/1h/4h. At most three research candidates per timeframe reached validation. Validation applied the same cost gates with minimum samples 15/10/5/3.

Only a research+validation finalist could see LOCKED_OOS or the external pre-sample. Final promotion additionally required:

- positive 5-bps and non-negative 10-bps locked-OOS results;
- an external pre-sample of at least five trades with positive 5-bps expectancy and PF above one;
- at least five positive cells in a preregistered 3×3 local risk/expiry stability surface;
- 5-bps block-bootstrap median expectancy above zero and at least 60% probability of positive expectancy.

Passing could only mean `PROMOTE TO FORWARD`, never live promotion.

## Rejected V3/V4 historical control

The frozen 1h V3/V4 control remained rejected and unchanged.

| Period | Signals | Exp. 5 bps | PF 5 bps | DD 5 bps |
| --- | ---: | ---: | ---: | ---: |
| RESEARCH | 35 | -0.2122 R | 0.6157 | 8.69 R |
| VALIDATION | 25 | +0.0678 R | 1.1456 | 5.38 R |
| LOCKED_OOS | 19 | +0.0776 R | 1.1611 | 3.22 R |
| External pre-sample | 6 | -0.1079 R | 0.8019 | 2.22 R |

Its positive later partitions do not repair the negative research and external generalization failure.

## V5 research and validation

| TF | Baseline opportunities | Research passers | Validation result | Final status |
| --- | ---: | ---: | --- | --- |
| 5m | 35,220 | 0/9 | No candidate eligible | REJECT |
| 15m | 11,260 | 3/9 | All three sharply negative at 5/10 bps | REJECT |
| 1h | 2,627 | 3/9 | One finalist passed validation | REJECT after external audit |
| 4h | 684 | 3/9 | All three negative in validation | REJECT |

### 15m collapse after research

Research passers at 5 bps had expectancy `+0.1252` to `+0.2111 R` and PF `1.2497` to `1.4431`, at approximately 0.96–1.27 signals/month. In validation, those same frozen definitions produced expectancy `-0.4256` to `-0.4814 R`, PF `0.3469` to `0.4121`, and drawdown `10.89–11.55 R`. They fail temporal stability before OOS.

### 4h collapse after research

The three research passers used only 9–10 trades each. Research expectancy at 5 bps ranged from `+0.1158` to `+0.3626 R`. Validation produced `-0.3099` to `-0.4662 R`, with PF `0.3445–0.4575`. The sample is small and unstable; no 4h finalist was allowed to inspect OOS.

### 1h finalist

The sole finalist was `HIGH_VOL_TREND_QUALITY + ATR_1_0`: risk 1 ATR, target 1.5 ATR, R:R 1.5, expiry 12 candles.

| Period | Signals | WIN | LOSS | EXPIRED | Exp. 0 bps | Exp. 5 bps | Exp. 10 bps | PF 5 bps | DD 5 bps |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| RESEARCH | 19 | 8 | 7 | 4 | +0.2771 R | +0.2396 R | +0.2022 R | 1.5970 | 2.03 R |
| VALIDATION | 13 | 7 | 5 | 1 | +0.4128 R | +0.3592 R | +0.3055 R | 1.8597 | 3.97 R |
| LOCKED_OOS | 9 | 4 | 4 | 1 | +0.1744 R | +0.1119 R | +0.0494 R | 1.2123 | 3.16 R |
| External pre-sample | 4 | 1 | 2 | 1 | -0.0245 R | -0.0479 R | -0.0712 R | 0.9051 | 2.02 R |

From 2018–2026 it generated 41 resolved/evaluated signals: about `0.014/day`, `0.098/week`, or `0.427/month`. This is selective, but the OOS sample is only nine and the external audit only four—below the preregistered minimum and negative after costs.

## Parameter stability and bootstrap

For the 1h finalist, all nine preregistered local cells (risk 0.9/1.0/1.1 of the selected ATR distance × expiry 10/12/14) were positive on combined RESEARCH+VALIDATION at 5 bps:

- expectancy range: `+0.2230` to `+0.3703 R`;
- PF range: `1.5455` to `1.9210`;
- maximum drawdown range: `3.14` to `4.38 R`.

This is a stable local surface, not a single parameter spike. It is still insufficient because external generalization failed and sample size is small.

The deterministic moving-block bootstrap used the nine chronological OOS trades, block length five, and 10,000 iterations at 5 bps:

- expectancy P2.5/P50/P97.5: `-0.2198 / +0.1119 / +0.4435 R`;
- probability positive expectancy: `82.4%`;
- drawdown P50/P90/P95/P97.5: `3.16 / 4.26 / 4.86 / 5.29 R`;
- probability of a negative streak of at least five: `6.34%`.

The interval includes materially negative expectancy. A nine-trade bootstrap cannot establish a robust market edge or model non-stationary regime changes, even though it passes the deliberately minimal preregistered median/probability check.

## Comparison with the rejected live baseline at 5 bps

| TF | Period | Baseline signals | Baseline expectancy | Baseline PF | Baseline DD |
| --- | --- | ---: | ---: | ---: | ---: |
| 5m | LOCKED_OOS | 3,290 | -0.1068 R | 0.6906 | 359.12 R |
| 15m | LOCKED_OOS | 1,092 | -0.0952 R | 0.7172 | 108.26 R |
| 1h | LOCKED_OOS | 260 | +0.0167 R | 1.0601 | 10.97 R |
| 4h | LOCKED_OOS | 69 | +0.0570 R | 1.2395 | 3.83 R |

The selective 1h V5 finalist improved the observed locked-OOS point estimate and drawdown, but reduced the sample from 260 to nine. Its external result was negative. This is not enough to infer that filtering created an exploitable edge. The 15m and 4h research improvements were explicitly contradicted by validation; 5m never passed research.

## Reproducibility and safety

- `signal-strategy-v5-snapshot.ts` contains the immutable protocol and hash.
- `signal-strategy-v5.ts` contains pure filtering, period, exit, stability, and selection functions.
- `signal-strategy-v5.test.ts` tests snapshot integrity, causality, partition access, shortlist/validation gates, and bounded stability.
- `analyze-signal-v5.ts` is a manual offline runner using public klines and in-memory computation only.
- The runner has no database imports, no Telegram imports, no persistence calls, and no scheduler registration.
- It is not executed by build, start, tests, CI, or production automatically.

## Final recommendation

`REJECT`

Do not promote V5 to forward/paper observation from these results. In particular, do not promote the attractive 1h OOS point estimate: it is based on nine trades, its bootstrap uncertainty crosses zero, and the separate external pre-sample is both insufficient and negative after costs.

The only honest next evidence would be genuinely future, preregistered data after `2026-08-28T00:00:00Z`; V5 itself should remain frozen and rejected rather than retuned on the observed partitions.
