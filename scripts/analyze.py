"""
MEDC Investment-Risk econometrics engine.

Loads cached real prices, builds an aligned daily log-return panel, and runs the
full statistical battery used by the dashboard:

  - Return distribution + normality (Jarque-Bera, skew, excess kurtosis)
  - Historical / Parametric / Monte-Carlo Value-at-Risk & CVaR (1d and 21d/~30 cal.)
  - Multi-factor HAC (Newey-West) OLS factor model  -> channel betas
  - Single-factor Brent & USD/IDR sensitivities (+ semi-betas)
  - CAPM market beta vs IHSG (systematic vs idiosyncratic)
  - Rolling 90d betas (Brent, Copper, USD/IDR, IHSG)
  - GARCH(1,1)-t conditional volatility
  - Maximum drawdown / underwater series
  - Cross-asset correlation matrix
  - Monte-Carlo terminal-price simulation (GBM + historical bootstrap)
  - Factor-based macro stress scenarios

Outputs:
  public/data/results.json  -> scalars, tables, stress, MC summary, distributions
  public/data/series.json   -> time series for charts (returns, rolling beta, vol, dd)
"""
import json
import os
import numpy as np
import pandas as pd
from scipy import stats
import statsmodels.api as sm
from arch import arch_model

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "cache")
PUB = os.path.normpath(os.path.join(HERE, "..", "data"))
os.makedirs(PUB, exist_ok=True)

CURRENT_PRICE = 1145.0          # MEDC last close (IDR), 2026-06-19 — matches report
TRADING_DAYS = 252
HORIZON = 21                    # ~30 calendar days
RNG = np.random.default_rng(20260621)

CONF = [0.90, 0.95, 0.99]


def load_panel():
    raw = json.load(open(os.path.join(DATA, "raw_prices.json"), encoding="utf-8"))
    cols = {}
    for name, blk in raw.items():
        s = pd.Series(blk["series"])
        s.index = pd.to_datetime(s.index)
        cols[name] = s.sort_index()
    px = pd.DataFrame(cols).sort_index()
    # align to MEDC trading days, forward-fill factor prices across holiday gaps
    px = px[px["MEDC"].notna()]
    px = px.ffill()
    meta = {name: {"ticker": blk["ticker"], "currency": blk["currency"], "role": blk["role"]}
            for name, blk in raw.items()}
    return px, meta


def log_returns(px):
    return np.log(px / px.shift(1)).dropna(how="all")


def describe_asset(r):
    r = r.dropna()
    ann_ret = float(r.mean() * TRADING_DAYS)
    ann_vol = float(r.std(ddof=1) * np.sqrt(TRADING_DAYS))
    return {
        "n": int(r.shape[0]),
        "ann_return": ann_ret,
        "ann_vol": ann_vol,
        "daily_vol": float(r.std(ddof=1)),
        "skew": float(stats.skew(r)),
        "excess_kurtosis": float(stats.kurtosis(r)),  # excess (normal=0)
        "sharpe": float(ann_ret / ann_vol) if ann_vol else None,
    }


def jarque_bera(r):
    r = r.dropna()
    jb, p = stats.jarque_bera(r)
    return {"stat": float(jb), "pvalue": float(p),
            "skew": float(stats.skew(r)), "excess_kurtosis": float(stats.kurtosis(r))}


def var_block(r, current_price):
    """Historical, parametric-normal and (separately) MC VaR/CVaR at 1d & 21d."""
    r = r.dropna().values
    mu, sd = r.mean(), r.std(ddof=1)

    # 21-day overlapping cumulative simple returns (historical)
    cum = pd.Series(r)
    roll = cum.rolling(HORIZON).sum().dropna().values        # log space
    simple_21 = np.exp(roll) - 1.0
    out = {"horizon_days": HORIZON, "current_price": current_price, "levels": []}
    for c in CONF:
        a = 1 - c
        # Historical (21d)
        q_hist = np.quantile(simple_21, a)                   # negative number (loss)
        var_hist = -q_hist
        cvar_hist = -simple_21[simple_21 <= q_hist].mean()
        # Parametric normal (21d) using sqrt-time scaling of daily log moments
        z = stats.norm.ppf(a)
        cum_mu, cum_sd = mu * HORIZON, sd * np.sqrt(HORIZON)
        q_par_log = cum_mu + z * cum_sd
        var_par = -(np.exp(q_par_log) - 1.0)
        out["levels"].append({
            "conf": c,
            "var_hist": float(var_hist),
            "cvar_hist": float(cvar_hist),
            "var_param": float(var_par),
            "price_hist": float(current_price * (1 - var_hist)),
            "price_param": float(current_price * (1 - var_par)),
        })
    # 1-day historical VaR for reference
    out["var_1d"] = {str(c): float(-np.quantile(r, 1 - c)) for c in CONF}
    out["dist_21d"] = {
        "values_sample": [float(x) for x in simple_21],   # for histogram
        "mean": float(simple_21.mean()),
        "min": float(simple_21.min()),
        "max": float(simple_21.max()),
    }
    return out


def hac_ols(y, X, names):
    """OLS with Newey-West HAC SE. Returns coef table + R2."""
    Xc = sm.add_constant(X)
    n = len(y)
    L = int(np.floor(4 * (n / 100) ** (2 / 9)))             # Newey-West rule of thumb
    model = sm.OLS(y, Xc).fit(cov_type="HAC", cov_kwds={"maxlags": L})
    coefs = []
    allnames = ["const"] + names
    params = np.asarray(model.params); bse = np.asarray(model.bse)
    tv = np.asarray(model.tvalues); pv = np.asarray(model.pvalues)
    ci = np.asarray(model.conf_int())
    for i, nm in enumerate(allnames):
        coefs.append({
            "name": nm,
            "beta": float(params[i]),
            "se": float(bse[i]),
            "t": float(tv[i]),
            "p": float(pv[i]),
            "ci_low": float(ci[i, 0]),
            "ci_high": float(ci[i, 1]),
        })
    return {"coefs": coefs, "r2": float(model.rsquared),
            "r2_adj": float(model.rsquared_adj), "n": int(n), "hac_lags": L}


def single_factor(y, x):
    Xc = sm.add_constant(x)
    n = len(y)
    L = int(np.floor(4 * (n / 100) ** (2 / 9)))
    m = sm.OLS(y, Xc).fit(cov_type="HAC", cov_kwds={"maxlags": L})
    params = np.asarray(m.params); tv = np.asarray(m.tvalues)
    pv = np.asarray(m.pvalues); ci = np.asarray(m.conf_int())
    return {
        "alpha": float(params[0]), "beta": float(params[1]),
        "t_beta": float(tv[1]), "p_beta": float(pv[1]),
        "r2": float(m.rsquared), "n": int(n),
        "ci_low": float(ci[1, 0]), "ci_high": float(ci[1, 1]),
    }


def semi_beta(y, x):
    """Down-market vs up-market beta to a factor (tail asymmetry)."""
    down = x < 0
    up = x > 0
    def b(mask):
        if mask.sum() < 30:
            return None
        m = sm.OLS(y[mask], sm.add_constant(x[mask])).fit()
        return float(m.params.iloc[1])
    return {"beta_down": b(down), "beta_up": b(up)}


def rolling_beta(y, x, win=90):
    df = pd.concat([y, x], axis=1).dropna()
    df.columns = ["y", "x"]
    cov = df["y"].rolling(win).cov(df["x"])
    var = df["x"].rolling(win).var()
    beta = (cov / var).dropna()
    return beta


def garch_vol(r):
    rp = r.dropna() * 100.0
    am = arch_model(rp, mean="Constant", vol="GARCH", p=1, q=1, dist="t")
    res = am.fit(disp="off")
    cond = res.conditional_volatility / 100.0            # back to decimal daily
    ann = cond * np.sqrt(TRADING_DAYS)
    p = res.params
    alpha = float(p.get("alpha[1]", np.nan))
    beta = float(p.get("beta[1]", np.nan))
    omega = float(p.get("omega", np.nan))
    persistence = alpha + beta
    lr_var_pct = omega / (1 - persistence) if persistence < 1 else np.nan   # in %^2
    lr_daily = np.sqrt(lr_var_pct) / 100.0
    return {
        "series": ann,
        "current_ann_vol": float(ann.iloc[-1]),
        "alpha": alpha, "beta": beta, "persistence": float(persistence),
        "long_run_ann_vol": float(lr_daily * np.sqrt(TRADING_DAYS)),
        "nu": float(p.get("nu", np.nan)),
    }


def drawdown(px_medc):
    idx = px_medc / px_medc.iloc[0]
    runmax = idx.cummax()
    dd = idx / runmax - 1.0
    mdd = float(dd.min())
    trough = dd.idxmin()
    peak = idx[:trough].idxmax()
    return dd, {"max_drawdown": mdd, "peak": str(peak.date()), "trough": str(trough.date())}


def monte_carlo(r, current_price, n_sims=60000, horizon=HORIZON):
    r = r.dropna().values
    mu, sd = r.mean(), r.std(ddof=1)
    # --- GBM (normal) ---
    shocks = RNG.normal(mu, sd, size=(n_sims, horizon))
    paths_gbm = current_price * np.exp(shocks.sum(axis=1))
    # --- Historical bootstrap (fat tails, real empirical shape) ---
    boot = RNG.choice(r, size=(n_sims, horizon), replace=True)
    paths_bs = current_price * np.exp(boot.sum(axis=1))

    def summ(term):
        ret = term / current_price - 1.0
        return {
            "mean_price": float(term.mean()),
            "median_price": float(np.median(term)),
            "p05": float(np.quantile(term, 0.05)),
            "p01": float(np.quantile(term, 0.01)),
            "p10": float(np.quantile(term, 0.10)),
            "p25": float(np.quantile(term, 0.25)),
            "p75": float(np.quantile(term, 0.75)),
            "p95": float(np.quantile(term, 0.95)),
            "prob_loss": float((ret < 0).mean()),
            "var95": float(-np.quantile(ret, 0.05)),
            "cvar95": float(-ret[ret <= np.quantile(ret, 0.05)].mean()),
        }
    # histogram (bootstrap engine = headline)
    lo, hi = np.quantile(paths_bs, [0.002, 0.998])
    bins = np.linspace(lo, hi, 51)
    hist, edges = np.histogram(paths_bs, bins=bins, density=True)
    centers = (edges[:-1] + edges[1:]) / 2

    # percentile fan over the horizon (bootstrap)
    fan_steps = list(range(0, horizon + 1))
    boot_full = np.cumsum(np.concatenate([np.zeros((n_sims, 1)),
                                          RNG.choice(r, size=(n_sims, horizon), replace=True)], axis=1), axis=1)
    fan_prices = current_price * np.exp(boot_full)
    fan = {
        "steps": fan_steps,
        "p05": [float(x) for x in np.quantile(fan_prices, 0.05, axis=0)],
        "p25": [float(x) for x in np.quantile(fan_prices, 0.25, axis=0)],
        "p50": [float(x) for x in np.quantile(fan_prices, 0.50, axis=0)],
        "p75": [float(x) for x in np.quantile(fan_prices, 0.75, axis=0)],
        "p95": [float(x) for x in np.quantile(fan_prices, 0.95, axis=0)],
    }
    return {
        "n_sims": n_sims, "horizon": horizon, "current_price": current_price,
        "gbm": summ(paths_gbm), "bootstrap": summ(paths_bs),
        "hist": {"centers": [float(x) for x in centers],
                 "density": [float(x) for x in hist]},
        "fan": fan,
    }


def timeframe_betas(px, factors=("Brent", "Copper", "USDIDR", "IHSG")):
    """Beta of MEDC to each factor at daily / weekly / monthly frequency.

    Fundamental commodity linkages are noisy intraday but sharpen as the
    horizon lengthens, so we measure the same exposure across timeframes.
    """
    out = {}
    freqs = {"daily": None, "weekly": "W-FRI", "monthly": "ME"}
    for fname, rule in freqs.items():
        p = px if rule is None else px.resample(rule).last()
        rr = np.log(p / p.shift(1)).dropna(how="all")
        row = {}
        for f in factors:
            d = rr.dropna(subset=["MEDC", f])
            if len(d) < 24:
                continue
            sf = single_factor(d["MEDC"].values, d[f].values)
            row[f] = {"beta": sf["beta"], "t": sf["t_beta"], "r2": sf["r2"], "n": sf["n"]}
        out[fname] = row
    return out


def stress_scenarios(betas):
    """Translate macro shocks into expected MEDC move using estimated factor betas.

    betas: dict name->beta from the multifactor model (daily log-return betas).
    Shocks are expressed as the factor's own log return over the event.
    """
    b = betas
    scen = [
        ("2020 COVID demand collapse", {"Brent": -0.55, "IHSG": -0.28, "USDIDR": 0.16, "Copper": -0.22}),
        ("2022 Fed shock / EM outflow", {"DXY": 0.10, "USDIDR": 0.13, "IHSG": -0.16, "Brent": 0.18}),
        ("Global recession (R2)", {"Brent": -0.30, "Copper": -0.25, "IHSG": -0.20, "USDIDR": 0.08}),
        ("Oil correction below $75", {"Brent": -0.15}),
        ("Hard IDR depreciation +15%", {"USDIDR": 0.15, "DXY": 0.06}),
        ("Copper deficit rally", {"Copper": 0.25, "IHSG": 0.05}),
    ]
    out = []
    for name, shocks in scen:
        impact = 0.0
        contrib = {}
        for f, s in shocks.items():
            be = b.get(f, 0.0)
            c = be * s
            impact += c
            contrib[f] = {"shock": s, "beta": be, "contribution": float(c)}
        out.append({
            "name": name,
            "shocks": shocks,
            "expected_return": float(impact),
            "implied_price": float(CURRENT_PRICE * np.exp(impact)),
            "contrib": contrib,
        })
    return out


def main():
    px, meta = load_panel()
    r = log_returns(px)

    common = r.dropna(subset=["MEDC", "Brent", "Copper", "USDIDR", "IHSG", "DXY"])
    print("Panel:", px.index.min().date(), "->", px.index.max().date(),
          "| common-sample obs:", len(common))

    results = {"meta": {
        "generated": "2026-06-21",
        "current_price": CURRENT_PRICE,
        "sample_start": str(px.index.min().date()),
        "sample_end": str(px.index.max().date()),
        "n_obs": int(len(r)),
        "horizon_days": HORIZON,
        "tickers": meta,
    }}
    series = {}

    # --- descriptives ---
    assets = ["MEDC", "Brent", "WTI", "Copper", "Gold", "HenryHubGas", "USDIDR", "DXY", "IHSG", "VIX"]
    results["descriptives"] = {a: describe_asset(r[a]) for a in assets if a in r}

    # --- distribution / normality ---
    results["distribution"] = jarque_bera(r["MEDC"])
    hr = r["MEDC"].dropna().values
    lo, hi = np.quantile(hr, [0.005, 0.995])
    bins = np.linspace(lo, hi, 61)
    hist, edges = np.histogram(hr, bins=bins, density=True)
    centers = (edges[:-1] + edges[1:]) / 2
    results["distribution"]["hist"] = {
        "centers": [float(x) for x in centers],
        "density": [float(x) for x in hist],
        "mu": float(hr.mean()), "sigma": float(hr.std(ddof=1)),
    }

    # --- VaR ---
    results["var"] = var_block(r["MEDC"], CURRENT_PRICE)

    # --- multifactor model (R1+R2 channels) ---
    y = common["MEDC"]
    Xnames = ["IHSG", "Brent", "Copper", "USDIDR", "DXY"]
    X = common[Xnames]
    mf = hac_ols(y.values, X.values, Xnames)
    results["multifactor"] = mf
    betas = {c["name"]: c["beta"] for c in mf["coefs"]}

    # parsimonious channel model for the transmission diagram
    Xnames2 = ["IHSG", "Brent", "Copper", "USDIDR"]
    mf2 = hac_ols(common["MEDC"].values, common[Xnames2].values, Xnames2)
    results["channel_model"] = mf2

    # weekly multifactor model -> betas for SUSTAINED-shock stress scenarios
    pw = px.resample("W-FRI").last()
    rw = np.log(pw / pw.shift(1)).dropna(how="all")
    cw = rw.dropna(subset=["MEDC", "IHSG", "Brent", "Copper", "USDIDR", "DXY"])
    mf_w = hac_ols(cw["MEDC"].values, cw[["IHSG", "Brent", "Copper", "USDIDR", "DXY"]].values,
                   ["IHSG", "Brent", "Copper", "USDIDR", "DXY"])
    results["multifactor_weekly"] = mf_w
    betas_w = {c["name"]: c["beta"] for c in mf_w["coefs"]}

    # --- single factor sensitivities ---
    sf = r.dropna(subset=["MEDC", "Brent"])
    results["brent_sensitivity"] = single_factor(sf["MEDC"].values, sf["Brent"].values)
    results["brent_sensitivity"]["semi"] = semi_beta(sf["MEDC"], sf["Brent"])
    # scatter sample (cap points for payload, keep representative)
    results["brent_sensitivity"]["scatter"] = {
        "x": [float(v) for v in sf["Brent"].values],
        "y": [float(v) for v in sf["MEDC"].values],
    }
    fx = r.dropna(subset=["MEDC", "USDIDR"])
    results["fx_sensitivity"] = single_factor(fx["MEDC"].values, fx["USDIDR"].values)
    results["fx_sensitivity"]["semi"] = semi_beta(fx["MEDC"], fx["USDIDR"])
    results["fx_sensitivity"]["scatter"] = {
        "x": [float(v) for v in fx["USDIDR"].values],
        "y": [float(v) for v in fx["MEDC"].values],
    }
    cp = r.dropna(subset=["MEDC", "Copper"])
    results["copper_sensitivity"] = single_factor(cp["MEDC"].values, cp["Copper"].values)

    # --- CAPM market beta ---
    mk = r.dropna(subset=["MEDC", "IHSG"])
    capm = single_factor(mk["MEDC"].values, mk["IHSG"].values)
    capm["systematic_share"] = capm["r2"]
    capm["idiosyncratic_share"] = 1 - capm["r2"]
    results["capm"] = capm

    # --- rolling betas ---
    for f in ["Brent", "Copper", "USDIDR", "IHSG"]:
        rb = rolling_beta(r["MEDC"], r[f], win=90)
        series[f"rollbeta_{f}"] = {
            "dates": [d.strftime("%Y-%m-%d") for d in rb.index],
            "values": [float(x) for x in rb.values],
        }

    # --- GARCH ---
    g = garch_vol(r["MEDC"])
    series["garch_vol"] = {
        "dates": [d.strftime("%Y-%m-%d") for d in g["series"].index],
        "values": [float(x) for x in g["series"].values],
    }
    results["garch"] = {k: v for k, v in g.items() if k != "series"}

    # --- drawdown ---
    dd, ddinfo = drawdown(px["MEDC"])
    series["drawdown"] = {
        "dates": [d.strftime("%Y-%m-%d") for d in dd.index],
        "values": [float(x) for x in dd.values],
    }
    results["drawdown"] = ddinfo

    # --- price + factor normalized series (for context chart) ---
    norm_assets = ["MEDC", "Brent", "Copper", "USDIDR", "IHSG"]
    sub = px[norm_assets].dropna()
    series["price_index"] = {
        "dates": [d.strftime("%Y-%m-%d") for d in sub.index],
        **{a: [float(x) for x in (sub[a] / sub[a].iloc[0] * 100).values] for a in norm_assets},
    }

    # --- correlation matrix ---
    corr_assets = ["MEDC", "Brent", "WTI", "Copper", "Gold", "HenryHubGas", "USDIDR", "DXY", "IHSG", "VIX", "US10Y"]
    corr_assets = [a for a in corr_assets if a in r]
    cm = r[corr_assets].dropna().corr()
    results["correlation"] = {
        "labels": corr_assets,
        "matrix": [[float(cm.iloc[i, j]) for j in range(len(corr_assets))] for i in range(len(corr_assets))],
    }

    # --- Monte Carlo ---
    results["monte_carlo"] = monte_carlo(r["MEDC"], CURRENT_PRICE)

    # --- multi-timeframe betas ---
    results["timeframe_betas"] = timeframe_betas(px)

    # --- stress scenarios (sustained shocks -> weekly betas) ---
    results["stress"] = stress_scenarios(betas_w)
    results["stress_beta_basis"] = "weekly multifactor HAC-OLS betas"

    # --- snapshot for header ticker (last close + 1d % change) ---
    snap = {}
    for a in ["MEDC", "Brent", "WTI", "Copper", "Gold", "USDIDR", "DXY", "IHSG", "VIX", "Amman"]:
        if a in px:
            s = px[a].dropna()
            chg = float(s.iloc[-1] / s.iloc[-2] - 1.0)
            snap[a] = {"last": float(s.iloc[-1]), "chg": chg,
                       "currency": meta.get(a, {}).get("currency")}
    results["snapshot"] = snap

    # --- write ---
    json.dump(results, open(os.path.join(PUB, "results.json"), "w"), separators=(",", ":"))
    json.dump(series, open(os.path.join(PUB, "series.json"), "w"), separators=(",", ":"))
    print("results.json", os.path.getsize(os.path.join(PUB, "results.json")) // 1024, "KB")
    print("series.json", os.path.getsize(os.path.join(PUB, "series.json")) // 1024, "KB")

    # console sanity read
    print("\n--- SANITY ---")
    print("MEDC ann vol:", round(results["descriptives"]["MEDC"]["ann_vol"], 3))
    print("JB p:", results["distribution"]["pvalue"], "exc-kurt:", round(results["distribution"]["excess_kurtosis"], 2))
    print("Brent beta:", round(results["brent_sensitivity"]["beta"], 3), "R2:", round(results["brent_sensitivity"]["r2"], 3))
    print("FX beta:", round(results["fx_sensitivity"]["beta"], 3), "R2:", round(results["fx_sensitivity"]["r2"], 3))
    print("CAPM beta:", round(results["capm"]["beta"], 3), "R2:", round(results["capm"]["r2"], 3))
    print("GARCH persist:", round(results["garch"]["persistence"], 3), "cur ann vol:", round(results["garch"]["current_ann_vol"], 3))
    print("MaxDD:", round(results["drawdown"]["max_drawdown"], 3), results["drawdown"]["peak"], "->", results["drawdown"]["trough"])
    for lv in results["var"]["levels"]:
        print(f"VaR{int(lv['conf']*100)} 21d hist: {lv['var_hist']*100:.1f}% -> Rp{lv['price_hist']:.0f}")
    print("MC bootstrap prob_loss:", round(results["monte_carlo"]["bootstrap"]["prob_loss"], 3),
          "p05:", round(results["monte_carlo"]["bootstrap"]["p05"], 0))
    print("multifactor betas:", {k: round(v, 3) for k, v in betas.items()})


if __name__ == "__main__":
    main()
