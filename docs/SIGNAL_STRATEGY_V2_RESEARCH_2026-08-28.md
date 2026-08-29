# TRENORO Signal Strategy V2 — offline research — 2026-08-28

Internal research only. These results are not commercial performance claims and must not be shown as guaranteed or expected returns.

## Safety boundary

- The live BASELINE, scheduler, thresholds, R:R, TP, SL, expiry, persistence, and notifications were not changed.
- The runner reads public Binance Spot BTCUSDT klines and operates only in memory.
- It cannot write PostgreSQL, signal history, users, grants, payments, or Telegram.
- Entry, exit, and expiry candidates exist only in the manual `analyze:signals:v2` command.
- Leverage and position sizing are not modeled or recommended.

## Dataset and causal policy

- Fixed interval: `2022-08-28T00:00:00.000Z` through `2026-08-28T00:00:00.000Z`.
- Closed candles: 420,972 5m; 140,471 15m; 35,283 1h; 8,986 4h.
- A candle or higher-timeframe context is visible only when its Binance `closeTime` is at or before the execution candle's effective observation time.
- Entry is the close of the confirmed execution candle. Resolution starts on the following candle.
- Same-candle TP/SL ambiguity remains a conservative LOSS.
- No random split: 50% DEVELOPMENT, 30% VALIDATION, 20% FINAL HOLDOUT.
- FINAL HOLDOUT is never passed to a selection function. Its dates were visible in earlier baseline research, so it is a methodological holdout for V2 rather than a never-before-observed market sample.

Data checks found no duplicate or out-of-order timestamps. Missing intervals were 16, 5, 1, and 0 respectively and were not fabricated or interpolated. One still-open candle was excluded per timeframe.

## Bounded research protocol

Six entry hypotheses were declared before the four-year run:

1. higher-timeframe trend plus pullback;
2. dual higher-timeframe trend plus pullback;
3. confirmed breakout with closed body, volume, and causal volatility constraints;
4. the same breakout aligned with the primary higher timeframe;
5. local momentum during a normal causal-volatility regime and aligned higher timeframe;
6. multi-timeframe confluence.

Only existing EMA, RSI, ATR, volume, market-structure, and closed higher-timeframe context are used. No score or new live indicator was invented.

Entry families were ranked on DEVELOPMENT using the same baseline-like exit. Only two per timeframe entered a 12-configuration ATR grid built from `0.75`, `1`, `1.25`, `1.5`, `2`, and `2.5 ATR`, retaining only R:R from `1.25` through `2.5`. One exit was selected on DEVELOPMENT plus VALIDATION at 5 bps, with 10 bps and drawdown as secondary controls. Only then were expiry values `6`, `12`, `18`, `24`, and `36` evaluated. The holdout remained sealed until entry, exit, and expiry were fixed.

Friction is round trip and converted independently into R from each trade's stop percentage:

- 0 bps: analytical ceiling;
- 5 bps: 3 fee + 1 spread + 1 slippage;
- 10 bps: 6 fee + 2 spread + 2 slippage.

These are sensitivity assumptions, not claims about a particular venue or account.

## Baseline control

| Candidate | Signals | Signals/day | WIN % | LOSS % | EXPIRED % | Exp. 0 bps | Exp. 5 bps | Exp. 10 bps | PF 5 bps | DD 5 bps | Holdout exp. 5 bps |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| BASELINE all TF | 9,409 | 6.440 | 11.16% | 15.98% | 72.86% | +0.0053 R | -0.0921 R | -0.1894 R | 0.7333 | 871.33 R | -0.0713 R |

## Candidate leaderboard

These are the three configurations fixed before opening FINAL HOLDOUT. Ranking does not imply suitability.

| Candidate | TF | SL / TP | R:R | Expiry | Signals | Signals/day | WIN % | LOSS % | EXPIRED % | Exp. 0 bps | Exp. 5 bps | Exp. 10 bps | PF 5 bps | DD 5 bps | Holdout exp. 5 bps | Status |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| HTF confirmed breakout | 5m | 2 / 2.5 ATR | 1.25 | 6 | 2,241 | 1.534 | 27.18% | 34.76% | 38.06% | -0.0308 R | -0.2225 R | -0.4142 R | 0.5927 | 498.66 R | -0.2762 R | REJECT |
| Momentum + normal regime | 15m | 2 / 2.5 ATR | 1.25 | 6 | 760 | 0.520 | 22.24% | 23.95% | 53.82% | +0.0070 R | -0.0937 R | -0.1945 R | 0.7756 | 73.88 R | -0.0192 R | REJECT |
| HTF confirmed breakout | 1h | 1.5 / 2.5 ATR | 1.67 | 12 | 265 | 0.181 | 31.70% | 50.57% | 17.74% | +0.0255 R | -0.0282 R | -0.0818 R | 0.9504 | 21.66 R | -0.0783 R | REJECT |

The 5m candidate reduced EXPIRED but converted too many setups into LOSS and was negative even before costs. The 15m candidate was approximately flat before costs and failed at 5 bps. The 1h candidate came closest to break-even but failed VALIDATION and FINAL HOLDOUT.

## Entry-quality observations

- 5m: every predeclared entry family was negative in both DEVELOPMENT and VALIDATION at 5 bps. More selective breakouts did not create edge.
- 15m: multi-timeframe confluence was nearly flat in DEVELOPMENT (`-0.0039 R`) but deteriorated in VALIDATION (`-0.1308 R`). Momentum/normal-regime was also negative in both partitions.
- 1h: the predeclared momentum/normal-regime entry control was positive in DEVELOPMENT and VALIDATION at 5 and 10 bps. It ranked third on DEVELOPMENT and therefore did not advance through the predeclared top-two exit pipeline. This is an `INVESTIGATE` entry hypothesis only, not a candidate result and not authorization to inspect holdout or change live behavior.
- Direct 4h execution was not expanded in V2; 4h remained a causal context filter and baseline control because its direct sample is insufficient.

## TP/SL and expiry conclusions

No TP/SL range is recommended. The selected configurations clustered around 1.5–2 ATR stops and 2.5 ATR targets, but all failed the 5 bps promotion criteria or holdout. This is not evidence that those distances are optimal.

No expiry is recommended. Six candles frequently reduced EXPIRED, but it increased realized losses enough to leave expectancy negative. The 1h candidate retained 12 candles and still failed. Choosing expiry solely to reduce EXPIRED remains rejected.

## Decision

- Strategy V2 with evidence superior to BASELINE: **NO**.
- Promote Strategy V2 to staging shadow mode: **NO**.
- Robust candidates: **none**.
- Promising candidates: **none**.
- Final configurations: **all REJECT**.

The only reasonable next research item is the already-declared 1h momentum/normal-regime entry hypothesis. It must be evaluated under a new precommitted protocol and genuinely forward/unseen data; this report does not authorize reopening the current holdout or tuning it retrospectively.

## Reproduction

```bash
corepack pnpm run analyze:signals:v2 -- --days=1461 --end=2026-08-28T00:00:00.000Z --compact
```
