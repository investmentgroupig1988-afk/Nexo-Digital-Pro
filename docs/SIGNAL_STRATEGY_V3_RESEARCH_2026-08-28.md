# TRENORO Signal Strategy V3 — offline entry-quality research — 2026-08-28

Internal research only. These results are not commercial performance claims and must not be presented as guaranteed or expected returns.

## Safety boundary

- The live BASELINE, scheduler, thresholds, R:R, TP, SL, expiry, persistence, and notifications were not changed.
- The manual runner reads public Binance Spot BTCUSDT klines and operates only in memory.
- It cannot write PostgreSQL, signal history, users, grants, payments, or Telegram.
- It is not imported by the live scheduler and is never executed automatically.
- No commit, push, staging deployment, or production operation was performed for V3.

## Dataset and causal policy

- Fixed interval: `2022-08-28T00:00:00.000Z` through `2026-08-28T00:00:00.000Z`.
- Closed candles: 420,972 5m; 140,471 15m; 35,283 1h; 8,986 4h.
- One still-open candle was excluded per timeframe.
- Duplicate timestamps: zero. Out-of-order timestamps: zero.
- Missing intervals: 16, 5, 1, and 0 respectively; none were fabricated or interpolated.
- A candle or higher-timeframe context is visible only when its Binance `closeTime` is at or before the execution candle's effective observation time.
- Entry is the close of a confirmed execution candle. Resolution begins on the following candle.
- Same-candle TP/SL ambiguity remains a conservative LOSS.

The baseline result reproduced V2 exactly, including the 4h execution control.

## Pre-registered protocol

The partitions were frozen before inspecting V3 results:

- 45% DEVELOPMENT;
- 25% VALIDATION;
- 15% HOLDOUT;
- 15% PSEUDO_FORWARD.

HOLDOUT and PSEUDO_FORWARD were not passed to ranking or selection functions. Nevertheless, all dates overlap periods inspected during V1/V2. They are sealed within the V3 protocol but are not genuinely unseen market data. Truly forward evidence still requires future observations.

Twenty-five entry variants were declared before the four-year run. All used the unchanged baseline exit first. An entry could enter the four-item exit study only if DEVELOPMENT and VALIDATION had positive expectancy and PF above one at 5 bps, non-negative expectancy at 10 bps, and the predeclared sample floors.

The small exit set contained only:

- BASELINE;
- capped 1.5 ATR stop, 1.5 R:R, 12 candles;
- 1.5 ATR stop, 1.5 R:R, 12 candles;
- 2 ATR stop, 1.5 R:R, 12 candles.

There was no broad exit grid, expiry grid, session selection, or partial-exit model.

Round-trip friction assumptions were:

- 0 bps: analytical ceiling;
- 5 bps: 3 fee + 1 spread + 1 slippage;
- 10 bps: 6 fee + 2 spread + 2 slippage.

These are sensitivity assumptions, not claims about a venue or account.

## Promotion rule fixed before results

`PROMISING` required:

- entry gate passed before sealed periods were inspected;
- positive expectancy and PF greater than one at 5 bps in DEVELOPMENT, VALIDATION, HOLDOUT, and PSEUDO_FORWARD;
- non-negative full-sample expectancy at 10 bps;
- predeclared minimum sample in every partition;
- at least three positive anchored years;
- drawdown below the same-timeframe baseline.

`ROBUST` additionally required positive PSEUDO_FORWARD at 10 bps, four positive anchored years, and no excessive concentration in the five best trades. A cost or sealed-period failure is `REJECT` regardless of relative rank.

## Frozen baseline

| TF | Signals | WIN | LOSS | EXPIRED | Exp. 0 bps | Exp. 5 bps | Exp. 10 bps | PF 5 bps | DD 5 bps |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 5m | 6,606 | 727 | 998 | 4,881 | +0.0137 R | -0.1005 R | -0.2147 R | 0.7117 | 669.63 R |
| 15m | 2,140 | 246 | 397 | 1,497 | -0.0229 R | -0.0905 R | -0.1581 R | 0.7404 | 196.04 R |
| 1h | 523 | 62 | 88 | 373 | +0.0153 R | -0.0144 R | -0.0441 R | 0.9531 | 21.24 R |
| 4h | 140 | 15 | 21 | 104 | +0.0050 R | -0.0073 R | -0.0195 R | 0.9734 | 7.53 R |
| ALL | 9,409 | 1,050 | 1,504 | 6,855 | +0.0053 R | -0.0921 R | -0.1894 R | 0.7333 | 871.33 R |

## Baseline regime analysis

All 5m and 15m volatility regimes remained negative at 5 bps. Higher volatility was less negative, but still had PF below one.

| TF | Regime | Signals | Exp. 5 bps | PF 5 bps | EXPIRED |
| --- | --- | ---: | ---: | ---: | ---: |
| 5m | low volatility | 1,500 | -0.1680 R | 0.6065 | 67.27% |
| 5m | normal volatility | 2,785 | -0.0972 R | 0.7256 | 73.61% |
| 5m | high volatility | 2,321 | -0.0609 R | 0.7912 | 78.50% |
| 15m | low volatility | 507 | -0.1619 R | 0.6176 | 62.33% |
| 15m | normal volatility | 877 | -0.0883 R | 0.7566 | 67.50% |
| 15m | high volatility | 756 | -0.0452 R | 0.8398 | 77.91% |
| 1h | low volatility | 112 | -0.1376 R | 0.6825 | 56.25% |
| 1h | normal volatility | 264 | +0.0367 R | 1.1288 | 71.59% |
| 1h | high volatility | 147 | -0.0123 R | 0.9505 | 82.31% |

The 1h normal-volatility slice is the only sizeable regime with positive aggregate performance. Aggregate slicing is diagnostic, not promotion evidence: it did not independently establish stable sealed-period performance under the V3 rule.

Higher-timeframe agreement reduced some weak setups but did not create edge in 5m or 15m. At 5m, aligned entries were still `-0.0760 R` with PF `0.7771`; at 15m they were `-0.0749 R` with PF `0.7850`; at 1h they were `-0.0182 R` with PF `0.9413`.

## Entry families investigated

| Family | Fixed variants | Result |
| --- | ---: | --- |
| Regime | local trend, sideways, low/normal/high/extreme volatility, trend plus normal volatility | 5m and 15m remained negative; 1h normal volatility is diagnostic-only evidence |
| Higher timeframe | 1h aligned, 4h aligned, dual aligned, no strong contradiction | no 5m/15m edge; no promotable candidate |
| Extension | maximum 0.75, 1.00, and 1.25 ATR from EMA20 | none survived the entry gate and sealed tests |
| Volume | relative volume at least 1.0 and 1.2 | neither produced robust post-cost edge |
| Breakout | direct, confirmed, retest | confirmed/retest samples became too small or remained negative |
| Pullback/momentum/rejection | pullback continuation, confirmed momentum, structure rejection | only the combined 1h pullback hypothesis passed the pre-sealed entry gate |
| Combined quality | breakout+HTF, pullback+HTF, momentum+dual HTF | 1h pullback+HTF advanced; its selected exit failed PSEUDO_FORWARD |

No hour was used as a filter. Session analysis remained diagnostic to avoid choosing the best-looking clock bucket retrospectively. Examples: 5m at 15 UTC was only slightly positive (`+0.0184 R`, PF `1.0748`, 312 signals); 15m at 21 UTC was positive (`+0.1104 R`, PF `1.4723`, 75 signals), but no temporal stability test authorized it as a candidate. The 1h hourly buckets were too small for a reliable session conclusion.

## Frozen leaderboard

These definitions were selected using only DEVELOPMENT and VALIDATION. Relative rank does not imply fitness.

| Candidate | TF | Signals | Signals/day | WIN | LOSS | EXPIRED | Exp. 0 bps | Exp. 5 bps | Exp. 10 bps | PF 5 bps | DD 5 bps | Validation | Holdout | Pseudo-forward | Status |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Extreme volatility + baseline exit | 5m | 1,548 | 1.060 | 132 | 182 | 1,234 | +0.0283 R | -0.0418 R | -0.1119 R | 0.8477 | 73.79 R | -0.0280 R | -0.0627 R | +0.0207 R | REJECT |
| High volatility + baseline exit | 15m | 870 | 0.595 | 78 | 126 | 666 | -0.0076 R | -0.0512 R | -0.0947 R | 0.8259 | 48.13 R | -0.0257 R | -0.0941 R | -0.1168 R | REJECT |
| Quality pullback HTF + 1.5 ATR / 1.5 R:R | 1h | 44 | 0.030 | 15 | 18 | 11 | +0.1283 R | +0.0720 R | +0.0157 R | 1.1524 | 5.38 R | +0.2417 R | +0.1686 R | -0.3050 R | REJECT |

The 1h candidate generated approximately 0.21 signals per week. HOLDOUT contained only two trades and PSEUDO_FORWARD only seven. Its apparent aggregate edge was not statistically sufficient and reversed materially in the newest sealed partition.

The underlying 1h quality-pullback entry with the unchanged baseline exit produced 42 signals, `+0.0914 R` expectancy and PF `1.2632` at 5 bps, and `+0.0529 R` at 10 bps. Only nine trades remained outside DEVELOPMENT and VALIDATION combined. It is an `INVESTIGATE` hypothesis for genuinely future data, not a Strategy V3 candidate suitable for shadow mode.

## Temporal robustness of the selected 1h definition

| Anchored year | Signals | Exp. 5 bps | PF 5 bps |
| --- | ---: | ---: | ---: |
| 2022-08-28 → 2023-08-28 | 15 | +0.1410 R | 1.3170 |
| 2023-08-28 → 2024-08-27 | 10 | -0.0422 R | 0.9150 |
| 2024-08-27 → 2025-08-27 | 11 | +0.4250 R | 2.1162 |
| 2025-08-27 → 2026-08-28 | 8 | -0.4002 R | 0.3546 |

The candidate depended strongly on the third anchored year and failed the most recent year. The five largest winners contributed 30.65% of gross positive R, so concentration was not its primary failure; temporal instability and sample size were.

## Decision

- V3 with evidence superior to BASELINE: **NO**.
- Survives the complete 5 bps promotion rule: **NO**.
- Survives sealed HOLDOUT plus PSEUDO_FORWARD with sufficient sample: **NO**.
- Promote to staging shadow mode: **NO**.
- PROMISING candidates: **none**.
- ROBUST candidates: **none**.

The next scientifically valid step is not another retrospective grid. Preserve the 1h normal-volatility and quality-pullback hypotheses without further tuning, then collect genuinely forward observations under a new precommitted paper protocol. No live or shadow change is authorized by this report.

## Reproduction

```bash
corepack pnpm run analyze:signals:v3 -- --days=1461 --end=2026-08-28T00:00:00.000Z --terse
```
