# MEDC · Investment Risk Engine

An interactive, statistically-grounded **investment-risk dashboard** for
**PT Medco Energi Internasional Tbk (IDX:MEDC)** — the risk section of the Cap Cap Capital
equity report, rebuilt as live, draggable, resizable graphs with English narration.

Every risk in the thesis — macro, domestic and global — is **measured against 10 years of real
market data** (no hand-set numbers), stress-tested on the MEDC price across daily / weekly /
monthly horizons, and projected forward with Monte-Carlo.

## What it covers

| Panel | Method | Risk |
|-------|--------|------|
| Investment-Risk Matrix | data-anchored severity × likelihood | R1·R2·R3 |
| 30-Day Value-at-Risk | historical + parametric VaR, CVaR @ 90/95/99% | tail loss |
| Monte-Carlo Simulation | 60k block-bootstrap price paths | forward risk |
| Macro Stress Scenarios | weekly multifactor HAC-OLS β translation | combined |
| Brent Sensitivity | single-factor OLS + semi-betas | R2 commodity |
| Risk Transmission Map | 4-factor channel decomposition (Sankey) | macro plumbing |
| Multi-Factor β | joint OLS, HAC s.e., 95% CI | systematic |
| β Across Timeframes | daily vs weekly vs monthly betas | structural |
| USD/IDR Sensitivity | OLS, the "natural hedge" measured | R1 FX |
| Rolling 90-day β | regime-dependent exposures | dynamic |
| GARCH(1,1)-t Volatility | conditional vol & clustering | vol regime |
| Drawdown / Underwater | max peak-to-trough | tail |
| Cross-Asset Correlation | Pearson matrix vs 10 factors | diversification |
| Return Distribution | histogram vs Normal + Jarque–Bera | fat tails |
| Monte-Carlo Fan | forward percentile cone | projection |
| MEDC vs Risk Factors | 10-year rebased context | context |

Each panel carries a **Method → Result → Why-invest-anyway** narration with the live numbers.

## Data sources

Daily adjusted closes from Yahoo Finance, 2016–2026:
`MEDC.JK`, Brent (`BZ=F`), WTI (`CL=F`), Henry Hub gas (`NG=F`), Copper (`HG=F`), Gold (`GC=F`),
`USDIDR=X`, US Dollar Index (`DX-Y.NYB`), IHSG (`^JKSE`), VIX (`^VIX`), US 10Y (`^TNX`),
Amman Mineral (`AMMN.JK`).

## Regenerate the analysis

```bash
pip install -r requirements.txt
python scripts/fetch_data.py     # -> scripts/cache/raw_prices.json
python scripts/analyze.py        # -> data/results.json, data/series.json
```

## Run locally

```bash
python -m http.server 8799       # then open http://127.0.0.1:8799
```

Static site (HTML + Plotly + interact.js). No build step. Deployed on Vercel.

---
*Educational risk analysis. Not investment advice.*
