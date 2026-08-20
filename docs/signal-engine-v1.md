# Signal Engine V1

`NEXO_CONFLUENCE_V1` evaluates real BTCUSDT candles and never emits a signal merely because the dashboard was opened.

Commercial timeframes are 5m, 15m, 1h, and 4h. The API refreshes all four immediately on startup and every 60 seconds afterward, so opening the dashboard is not required to create, resolve, or expire a signal. Concurrent instances and restarts remain safe because database uniqueness and configuration fingerprints are authoritative.

## Entry and no-signal rule

A LONG requires bullish market structure (higher high and higher low), price and EMA 20/50/200 aligned upward, RSI between 52 and 70, an upward Fibonacci swing, valid ATR, and volume ratio at least 1 when volume is available. SHORT mirrors those conditions with bearish structure, descending averages, RSI between 30 and 48, and a downward swing. Missing data, mixed structure, extreme RSI, weak volume, or any failed confluence returns `NO_SIGNAL`.

Detailed indicator values and the full technical snapshot are stored internally for audit and reproducibility. The commercial response exposes only trend, market condition, and objective strength.

## Risk, targets, and expiration

Entry is the close of the evaluated candle. Initial risk is 1.5 ATR and the stop is extended to include the current structural support (LONG) or resistance (SHORT) when it is farther away. Take profit is exactly 1.5 times that risk, so persisted signals must satisfy R:R >= 1.5 at both application and database levels.

A signal expires after 12 candles of its own timeframe. Expiration closes it at the last available close within that window and records the directional percentage movement as `returnPct`.

## Resolution

Candles after the entry candle are processed chronologically. TP before SL is `WIN`; SL before TP is `LOSS`. OHLC data cannot reveal intrabar ordering, so a candle containing both TP and SL is conservatively classified as `LOSS`. Targets reached after expiration do not change an expired signal.

## Idempotency and metrics

Only one OPEN signal may exist per symbol, timeframe, and strategy version. A SHA-256 fingerprint of the relevant evaluated configuration also prevents recreating the same setup after it closes.

Performance metrics include only persisted `WIN` and `LOSS` rows. Win and loss rates use that settled count. Accumulated return is the arithmetic sum of each signal's directional `returnPct`; it is not compounded, money, position sizing, or user P&L. `EXPIRED` and `CANCELLED` remain visible in history but do not affect win/loss metrics.

The selected analysis timeframe controls evaluation and the active signal. Metrics and history have an independent `all | 5m | 15m | 1h | 4h` scope and are filtered server-side. Multi-timeframe trend labels reuse the same real market-structure calculation; a bullish label is context, not permission to create a signal.
