# TRENORO — frozen 1h hypothesis external validation

Date: 2026-08-28

Status: `INCONCLUSIVE` / `FORWARD_RESEARCH_ONLY`
Commercial promotion: `NO`

This protocol freezes the previously discovered 1h hypothesis before using any
external-asset or post-cutoff observation. It is research-only: it does not
change the live strategy, scheduler, commercial symbols, database, dashboard,
Telegram, staging, production, or `main`.

## Frozen hypothesis

- ID: `TRENORO_1H_QUALITY_PULLBACK_HTF_V3_FROZEN_2026_08_28`
- SHA-256 configuration hash:
  `de60baccbfe80ee6a5c8fd516470ff1d845b86f271f6710a266bd6bfba659da4`
- Cutoff: `2026-08-28T00:00:00.000Z`
- Execution timeframe: `1h`
- Entry candidate: `QUALITY_PULLBACK_HTF`
- Baseline confluence: `TRENORO_CONFLUENCE_V1`
- Pullback rule: local EMA direction agrees with the signal, the closed candle
  touches EMA20 and closes in the signal direction, and close extension is at
  most `0.75 ATR`.
- Context rule: confirmed 1h trend and EMA direction agree with the signal.
  This is the exact discovered rule. Despite the historical `HTF` label, 4h
  alignment is not required by this frozen 1h candidate and was not added after
  discovery.
- Volatility: causal `NORMAL` regime (`25th < percentile < 75th`).
- Exit: `1.5 ATR` stop, `1.5 R:R` target, `12` closed 1h candles expiry.
- Same-candle TP/SL ambiguity: conservative `LOSS`.
- Primary costs: `5 bps` total (`3 fee + 1 spread + 1 slippage`).
- Sensitivity: `10 bps` total (`6 fee + 2 spread + 2 slippage`).
- Candle rule: only a kline with `closeTime <= observedAt` is usable.

The snapshot is deeply frozen in code and its deterministic hash is asserted by
tests before either research mode can run. The CLI exposes no asset, date,
candidate, threshold, exit, or cost parameter that could be used to retune the
protocol after seeing results.

## External validation

Fixed assets: `ETHUSDT`, `BNBUSDT`, `SOLUSDT` — no post-result asset selection.
Fixed interval: `2022-08-28T00:00:00.000Z` through
`2026-08-28T00:00:00.000Z`.
Provider: public Binance Spot klines, closed candles only.

| Asset | Signals | WIN | LOSS | EXPIRED | Trades/year | Exp. 5 bps | PF 5 bps | DD 5 bps | Exp. 10 bps |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| ETHUSDT | 37 | 15 | 16 | 6 | 9.25 | +0.100108R | 1.200479 | 6.171539R | +0.049062R |
| BNBUSDT | 24 | 8 | 10 | 6 | 6.00 | +0.025316R | 1.054103 | 4.008013R | -0.041031R |
| SOLUSDT | 41 | 14 | 22 | 5 | 10.25 | -0.061502R | 0.894773 | 9.238988R | -0.088908R |
| Aggregate | 102 | 37 | 48 | 17 | 25.50 | +0.017549R | 1.033353 | 15.149997R | -0.027595R |

At 10 bps the aggregate PF is `0.950056` and aggregate drawdown is
`16.814171R`. Data-quality checks found no duplicates, out-of-order candles, or
admitted incomplete candles. Binance data contained one 1h gap per asset in the
fixed period; the protocol reports rather than fills it.

## Interpretation

The hypothesis generalized positively to ETH at both tested costs. BNB was only
marginally positive at 5 bps and failed at 10 bps. SOL failed at both costs. The
aggregate edge at 5 bps is very small and disappears at 10 bps, while each asset
has only 24–41 completed signals over four years.

Therefore this is not a robust cross-asset edge. The evidence is
`INCONCLUSIVE`: it is more informative than a total cross-asset failure, but it
is neither stable enough across assets/costs nor large enough to justify
commercial staging.

## Forward BTC ledger

The manual research command `research:forward:btc-1h` evaluates only BTCUSDT 1h
observations strictly after `2026-08-28T00:00:00.000Z`. It stores a separate,
git-ignored JSONL ledger containing:

- closed-candle evaluation timestamp, entry-candle open time, and 1h timeframe;
- theoretical entry, stop and target;
- result and close timestamp;
- gross R and net R at 5/10 bps;
- assumed costs;
- duration;
- immutable hypothesis ID and configuration hash.

Rows are deduplicated deterministically. An unresolved `CENSORED` row may only
be replaced by its later settled result. This command is manual, is not imported
by application runtime, and has no database, scheduler, Telegram, dashboard, or
commercial signal integration.

## Decision

- Generalization: `INCONCLUSIVE`
- Robust edge: `NO`
- Promote to commercial staging: `NO`
- Continue frozen forward observation: `YES`
