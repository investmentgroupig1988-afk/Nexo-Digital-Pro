# TRENORO — frozen BTCUSDT 1h robustness audit

Date: 2026-08-29

Final classification: `REJECT`
Promote to commercial staging: `NO`

## Frozen integrity

- Hypothesis: `TRENORO_1H_QUALITY_PULLBACK_HTF_V3_FROZEN_2026_08_28`
- Configuration hash:
  `de60baccbfe80ee6a5c8fd516470ff1d845b86f271f6710a266bd6bfba659da4`
- Cutoff: `2026-08-28T00:00:00.000Z`
- Official parameters remained `SL 1.5 ATR / TP 2.25 ATR / R:R 1.5 / expiry 12`.
- Hash recomputation passed before the study.
- The forward ledger was not executed, written, truncated, or otherwise changed.
- No strategy, scheduler, database, Telegram, staging, production, or `main`
  integration exists in this study.

## Methodology fixed before results

- BTCUSDT public Binance Spot candles, closed-candle semantics.
- Full interval: `2018-08-28` through the frozen cutoff `2026-08-28`.
- `2018-08-28 → 2022-08-28` is treated as external to the recorded V3/V4
  discovery interval.
- `2022-08-28 → 2026-08-28` is selection-contaminated and is reported
  separately.
- Four non-overlapping two-year windows.
- Seven diagnostic rolling two-year windows, stepped annually; these overlap and
  are not independent.
- Cost stress fixed at `0 / 5 / 10 / 15 bps` round trip.
- Sensitivity fixed at exactly `SL 1.4 / 1.5 / 1.6 ATR × expiry 10 / 12 / 14`,
  always with `R:R 1.5`. It is diagnostic only; no alternative was selected.
- Sequence uncertainty: 10,000 deterministic circular moving-block bootstrap
  samples, block length five, using chronological net-R at 5 bps.

Data quality: 70,278 1h candles and 17,746 4h candles; no duplicates,
out-of-order candles, or admitted incomplete candles. Binance data contains 70
reported 1h gaps and six 4h gaps over eight years. Gaps were not fabricated or
silently filled.

## Official BTC result and cost stress

| Period | Signals | WIN | LOSS | EXPIRED | Exp. 0 bps | PF 0 | Exp. 5 bps | PF 5 | DD 5 | Exp. 10 bps | PF 10 | Exp. 15 bps |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Full 2018–2026 | 79 | 22 | 35 | 22 | -0.005354R | 0.988861 | -0.053903R | 0.893839 | 9.057210R | -0.102452R | 0.808631 | -0.151001R |
| Pre-discovery 2018–2022 | 35 | 7 | 17 | 11 | -0.173352R | 0.671167 | -0.212170R | 0.615740 | 8.685833R | -0.250988R | 0.565230 | -0.289806R |
| Discovery era 2022–2026 | 44 | 15 | 18 | 11 | +0.128280R | 1.289096 | +0.071991R | 1.152384 | 5.379232R | +0.015701R | 1.031277 | -0.040588R |

The full and pre-discovery samples have no positive break-even cost because
their gross expectancy is already negative. The contaminated discovery-era
sample crosses approximate break-even at `11.394707 bps`.

## BTC regimes

Trend and volatility are separate overlapping segmentations. Trend uses the
latest confirmed 4h context. Volatility uses a causal percentile of confirmed
4h realized range; `HIGH` is at or above the causal 75th percentile.

### Confirmed 4h trend

| Regime | Signals | WIN | LOSS | EXPIRED | Exp. 5 bps | PF 5 | DD 5 | Exp. 10 bps | PF 10 | DD 10 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Bullish | 46 | 14 | 20 | 12 | -0.016477R | 0.966402 | 5.737625R | -0.065676R | 0.873012 | 6.386490R |
| Bearish | 29 | 6 | 13 | 10 | -0.150581R | 0.717953 | 7.056229R | -0.200191R | 0.645206 | 8.151821R |
| Sideways | 4 | 2 | 2 | 0 | +0.216612R | 1.418535 | 2.070193R | +0.183224R | 1.342412 | 2.140385R |

The sideways result has only four signals and is not actionable. Bullish is
near flat before additional uncertainty; bearish is clearly negative.

### Confirmed 4h volatility

| Regime | Signals | WIN | LOSS | EXPIRED | Exp. 5 bps | PF 5 | DD 5 | Exp. 10 bps | PF 10 | DD 10 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| High | 21 | 7 | 6 | 8 | +0.293669R | 1.938708 | 1.369706R | +0.257078R | 1.783893 | 1.463901R |
| Normal/low | 58 | 15 | 29 | 14 | -0.179748R | 0.689187 | 13.188475R | -0.232627R | 0.618934 | 15.361301R |

The high-volatility segment is an interesting diagnostic, but it contains only
21 signals and was inspected after hypothesis discovery. Turning it into an
entry filter would change the frozen setup and would require a separately
pre-registered forward hypothesis. It cannot rescue or promote this candidate.

## Chronological stability

### Independent, non-overlapping windows

| Window | Signals | Exp. 5 bps | PF 5 | DD 5 | Exp. 10 bps | PF 10 |
|---|---:|---:|---:|---:|---:|---:|
| 2018–2020 | 16 | -0.081977R | 0.811726 | 3.107665R | -0.125222R | 0.726630 |
| 2020–2022 | 19 | -0.321806R | 0.505261 | 6.376665R | -0.356897R | 0.473361 |
| 2022–2024 | 25 | +0.067755R | 1.145559 | 5.379232R | +0.008751R | 1.017675 |
| 2024–2026 | 19 | +0.077564R | 1.161066 | 3.219099R | +0.024846R | 1.048614 |

Both windows before the recorded discovery interval are negative. Both positive
windows are inside the interval used to discover the hypothesis. This is the
opposite of the temporal consistency required for promotion.

### Rolling two-year windows, annual step

| Window | Signals | Exp. 5 bps | PF 5 | Exp. 10 bps | PF 10 |
|---|---:|---:|---:|---:|---:|
| 2018–2020 | 16 | -0.081977R | 0.811726 | -0.125222R | 0.726630 |
| 2019–2021 | 16 | -0.176712R | 0.680614 | -0.215321R | 0.627497 |
| 2020–2022 | 19 | -0.321806R | 0.505261 | -0.356897R | 0.473361 |
| 2021–2023 | 25 | -0.149712R | 0.739143 | -0.202642R | 0.664207 |
| 2022–2024 | 25 | +0.067755R | 1.145559 | +0.008751R | 1.017675 |
| 2023–2025 | 21 | +0.202559R | 1.464823 | +0.152759R | 1.332888 |
| 2024–2026 | 19 | +0.077564R | 1.161066 | +0.024846R | 1.048614 |

Four of seven rolling windows are negative at both 5 and 10 bps. The sign shift
occurs only in the already observed recent era.

## Parameter sensitivity

| SL ATR | TP ATR | Expiry | Full exp. 5 bps | PF 5 | DD 5 | Pre-discovery exp. 5 bps | Discovery-era exp. 5 bps |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1.4 | 2.1 | 10 | -0.124291R | 0.764130 | 15.520991R | -0.286949R | +0.008793R |
| 1.4 | 2.1 | 12 | -0.100805R | 0.813284 | 12.819537R | -0.214060R | -0.010717R |
| 1.4 | 2.1 | 14 | -0.116614R | 0.793450 | 12.374263R | -0.247099R | -0.012819R |
| 1.5 | 2.25 | 10 | -0.074375R | 0.848958 | 12.082422R | -0.268007R | +0.084051R |
| **1.5** | **2.25** | **12** | **-0.053903R** | **0.893839** | **9.057210R** | **-0.212170R** | **+0.071991R** |
| 1.5 | 2.25 | 14 | -0.071806R | 0.865514 | 8.757028R | -0.244911R | +0.065891R |
| 1.6 | 2.4 | 10 | -0.029761R | 0.934660 | 10.392571R | -0.241827R | +0.142851R |
| 1.6 | 2.4 | 12 | -0.035250R | 0.928039 | 8.233476R | -0.205583R | +0.099432R |
| 1.6 | 2.4 | 14 | -0.064099R | 0.876098 | 8.171219R | -0.236144R | +0.071936R |

Positive full-sample cells at 5 bps: `0 / 9`.

Positive pre-discovery cells at 5 bps: `0 / 9`.
Positive in both: `0 / 9`.

Classification: `GLOBALLY NEGATIVE ZONE`. The official point is not an isolated
positive peak; its entire predeclared neighborhood fails the external temporal
sample. No alternative cell is promoted.

## Sequence and sample uncertainty

At 5 bps, full 79-signal block bootstrap:

- expectancy 95% interval: `-0.245638R → +0.143195R`;
- median expectancy: `-0.055931R`;
- probability of positive sampled expectancy: `29.55%`;
- median / 95th percentile drawdown: `10.842122R / 20.443421R`;
- median / 95th percentile consecutive negative-return streak: `6 / 9`;
- probability of at least five consecutive negative-return trades: `82.87%`.

For the 35-signal pre-discovery temporal sample:

- expectancy 95% interval: `-0.470468R → +0.087048R`;
- median expectancy: `-0.217649R`;
- probability of positive sampled expectancy: `7.22%`;
- median / 95th percentile drawdown: `10.007755R / 16.378567R`;
- probability of at least five consecutive negative-return trades: `81.82%`.

The bootstrap preserves short local clusters through circular blocks of five,
but cannot prove stationarity or recreate unseen regime transitions. A
negative-return streak is based on net R, not only the categorical `LOSS`
status. Sparse signals make all intervals wide; that uncertainty weakens rather
than strengthens the case for promotion.

## Required conclusion

`REJECT`

The frozen hypothesis is negative over eight years even at zero friction,
strongly negative in the pre-discovery temporal sample, unstable across market
eras, negative throughout the complete sensitivity neighborhood, and has
unfavorable sequence-risk estimates. Recent discovery-era performance is not
sufficient external evidence.

`¿Promoverías a staging comercial? NO`

The high-volatility observation may only become a new, separately frozen
forward research hypothesis if explicitly authorized later. It must not be
retrofitted into this rejected candidate.
