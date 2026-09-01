# Signal Engine offline analysis

This runner measures the current TRENORO strategy without changing the live engine.

## Safety boundary

- It reads public BTCUSDT Spot klines from Binance.
- It never connects to PostgreSQL.
- It never calls Telegram, payments, users, grants, or the scheduler.
- It never persists simulated signals.
- The current entry logic remains the immutable `BASELINE`.
- Experimental candidates reuse the exact baseline entries. The bounded geometry study varies exits offline; the long-horizon study keeps baseline exits immutable and can only discard entries through seven predeclared quality hypotheses.

## Reproducible run

```bash
corepack pnpm run analyze:signals -- --days=365 --terse
corepack pnpm run analyze:signals -- --days=365 --baseline-only
corepack pnpm run analyze:signals -- --days=365 --geometry
corepack pnpm run analyze:signals -- --days=365 --selection
corepack pnpm run analyze:signals -- --days=365 --robust --terse
corepack pnpm run analyze:signals -- --days=365 --robust --selection
corepack pnpm run analyze:signals -- --days=1461 --end=2026-08-28T00:00:00.000Z --long-horizon --compact
corepack pnpm run analyze:signals -- --days=1461 --end=2026-08-28T00:00:00.000Z --long-horizon --compact --focus=15m
corepack pnpm run analyze:signals:v2 -- --days=1461 --end=2026-08-28T00:00:00.000Z --compact
corepack pnpm run analyze:signals:v3 -- --days=1461 --end=2026-08-28T00:00:00.000Z --terse
corepack pnpm run analyze:signals:v4 -- --days=1461 --end=2026-08-28T00:00:00.000Z --summary
```

Use `--end=<ISO-8601 timestamp>` to reproduce a fixed cutoff. Use `--baseline-only` when validating the immutable strategy without running any candidate grid. `--robust --selection --focus=<5m|15m|1h|4h>` prints one timeframe without changing the study. Omit `--terse` for the complete report.

## Methodology

The runner processes candles chronologically and excludes any Binance kline whose `closeTime` is later than the observation cutoff. Every entry evaluation receives only the 200 candles available through that close, preventing future candles from influencing signal creation.

The sample is split chronologically:

- 50% `TRAIN`
- 20% `DEVELOPMENT`
- 15% `VALIDATION`
- 15% `OUT_OF_SAMPLE`

The latest bounded study evaluates 342 configurations per timeframe. It crosses five ATR stops and four fixed-percentage stops with R:R `1.25`, `1.5`, `1.75`, and `2`, ATR/baseline-structure hybrid exits, and six entry-time filters. The live minimum remains `1.5`; `1.25` is enabled only inside the offline evaluator. Expiry remains unchanged.

Candidates are ranked on conservative-friction results across `TRAIN`, `DEVELOPMENT`, and `VALIDATION`; `OUT_OF_SAMPLE` is opened only after a candidate is frozen. An anchored four-fold walk-forward runs entirely inside the first 85% of the dataset, keeping final OOS sealed. A selected grid member is exploratory until every promotion gate passes.

`EXPIRED` is handled in two distinct and explicit ways:

- Accuracy: it remains in the denominator and never counts as a win.
- Economic expectancy: it contributes its signed mark-to-market return at expiry, expressed in initial risk multiples (`R`).

`WIN` contributes the configured reward multiple and `LOSS` contributes `-1R`. Profit factor and drawdown use the same realized-R series. A candle touching TP and SL is treated as `LOSS`, matching the conservative live-engine rule.

The report also includes MFE/MAE, distance in USD/percent/ATR, duration, post-expiry barrier outcomes, data gaps, duplicates, ordering, incomplete-candle exclusions, and round-trip friction sensitivity. Friction is converted to R separately for each trade from its risk percentage. The low and conservative scenarios are explicit assumptions, not claims about a specific venue or account.

## Multi-year regime study

`--long-horizon` freezes baseline entries and exits and evaluates a fixed four-year interval by default. It adds causal, offline-only classifications for:

- the last closed 4h reference trend available at entry;
- signal/reference-trend alignment;
- realized true-range volatility percentile calculated only from the 200 closed candles available at entry;
- seven predeclared entry-quality hypotheses, with no exit grid or parameter search.

Its anchored chronological folds are `0-40/40-55`, `0-55/55-70`, `0-70/70-85`, and `0-85/85-100`. Candidate choice in every fold uses only the preceding portion at 10 bps. The latest 15% is therefore a holdout inside that run, but it is not described as genuinely untouched because its dates overlap the earlier one-year research. Observations after the earlier fixed cutoff are reported separately and must accumulate before they can validate a strategy.

Volatility and trend labels are descriptive research dimensions. They do not alter the scheduler, live strategy, persisted history, Telegram, or any production path. A result is not considered robust unless it survives multiple chronological windows, friction, sufficient sample size, concentration checks, and the final holdout.

Strategy V2 uses a separate manual runner and a staged selection protocol: entry quality first, then a bounded ATR exit grid, then expiry, with the final 20% withheld from every selector. Its results and rejection decision are documented in `docs/SIGNAL_STRATEGY_V2_RESEARCH_2026-08-28.md`.

Strategy V3 freezes 25 entry-quality hypotheses, evaluates every entry first with the baseline exit, and permits a four-item exit study only after a pre-sealed entry gate. HOLDOUT and PSEUDO_FORWARD remain unavailable to selectors. Its results and rejection decision are documented in `docs/SIGNAL_STRATEGY_V3_RESEARCH_2026-08-28.md`.

Strategy V4 uses nine equally weighted, causal factors to rank the frozen baseline opportunities. Score percentiles come only from DEVELOPMENT, and HOLDOUT/PSEUDO_FORWARD remain unavailable to selectors. Its negative result, rejection of every threshold, and decision not to run the optional ML experiment are documented in `docs/SIGNAL_STRATEGY_V4_RESEARCH_2026-08-28.md`.

## Interpretation limits

This is a candle-level research tool, not evidence of executable fills. Fees, spread, and slippage are modeled only as aggregate sensitivity scenarios; latency within a candle, liquidity, and leverage are not modeled. A candidate must remain stable after realistic venue-specific costs and in forward testing before any live change is considered.
