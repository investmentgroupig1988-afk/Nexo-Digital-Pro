# Signal Engine offline analysis

This runner measures the current TRENORO strategy without changing the live engine.

## Safety boundary

- It reads public BTCUSDT Spot klines from Binance.
- It never connects to PostgreSQL.
- It never calls Telegram, payments, users, grants, or the scheduler.
- It never persists simulated signals.
- The current entry logic remains the immutable `BASELINE`.
- Experimental candidates reuse the exact baseline entries and only vary stop, target, or expiry.

## Reproducible run

```bash
corepack pnpm run analyze:signals -- --days=365 --terse
corepack pnpm run analyze:signals -- --days=365 --baseline-only
corepack pnpm run analyze:signals -- --days=365 --geometry
corepack pnpm run analyze:signals -- --days=365 --selection
```

Use `--end=<ISO-8601 timestamp>` to reproduce a fixed cutoff. Use `--baseline-only` when validating the immutable strategy without running any candidate grid. Omit `--terse` for the complete report.

## Methodology

The runner processes candles chronologically and excludes any Binance kline whose `closeTime` is later than the observation cutoff. Every entry evaluation receives only the 200 candles available through that close, preventing future candles from influencing signal creation.

The sample is split chronologically:

- 50% `TRAIN`
- 20% `DEVELOPMENT`
- 15% `VALIDATION`
- 15% `OUT_OF_SAMPLE`

Candidate grids are ranked on `TRAIN`; only the three finalists advance. `DEVELOPMENT` selects one candidate. `VALIDATION` and `OUT_OF_SAMPLE` are reporting-only and never select parameters.

The bounded geometry study evaluates 21 configurations per timeframe: seven ATR-normalized stop distances times three R:R values, all at or above 1.5 and all with the live expiry unchanged. It requires minimum TRAIN/DEVELOPMENT samples, ranks only with those two partitions, and opens VALIDATION/OOS only after selection. A selected grid member is exploratory until every promotion gate passes.

`EXPIRED` is handled in two distinct and explicit ways:

- Accuracy: it remains in the denominator and never counts as a win.
- Economic expectancy: it contributes its signed mark-to-market return at expiry, expressed in initial risk multiples (`R`).

`WIN` contributes the configured reward multiple and `LOSS` contributes `-1R`. Profit factor and drawdown use the same realized-R series. A candle touching TP and SL is treated as `LOSS`, matching the conservative live-engine rule.

The report also includes MFE/MAE, distance in USD/percent/ATR, duration, post-expiry barrier outcomes, data gaps, duplicates, ordering, incomplete-candle exclusions, and round-trip friction sensitivity. Friction is converted to R separately for each trade from its risk percentage. The low and conservative scenarios are explicit assumptions, not claims about a specific venue or account.

## Interpretation limits

This is a candle-level research tool, not evidence of executable fills. Fees, spread, and slippage are modeled only as aggregate sensitivity scenarios; latency within a candle, liquidity, and leverage are not modeled. A candidate must remain stable after realistic venue-specific costs and in forward testing before any live change is considered.
