/* =======================================================================
   app.js — load data, build the panels (chart + narration), lay them out.
   ======================================================================= */
(async function () {
  let R, S;
  try {
    [R, S] = await Promise.all([
      fetch("./data/results.json").then(r => r.json()),
      fetch("./data/series.json").then(r => r.json()),
    ]);
  } catch (e) {
    document.getElementById("boot").innerHTML =
      '<div class="boot__txt">Could not load analysis data. Run <code>python scripts/analyze.py</code> first.</div>';
    return;
  }

  /* ---- narration helpers (all numbers live from the analysis) ---- */
  const P = (x, d = 1) => (x * 100).toFixed(d) + "%";
  const SP = (x, d = 1) => (x >= 0 ? "+" : "") + (x * 100).toFixed(d) + "%";
  const RP = x => "Rp" + Math.round(x).toLocaleString("en-US");
  const N = (x, d = 2) => Number(x).toFixed(d);
  const seg = (cls, label, html) => `<div class="seg ${cls}"><h4>${label}</h4>${html}</div>`;
  const note = (m, r, mit) => seg("method", "Method", m) + seg("result", "Result", r) + seg("mitig", "Why invest anyway", mit);

  const v = R.var.levels;
  const v95 = v.find(l => l.conf === 0.95), v99 = v.find(l => l.conf === 0.99), v90 = v.find(l => l.conf === 0.90);
  const brent = R.brent_sensitivity, fx = R.fx_sensitivity, capm = R.capm;
  const tf = R.timeframe_betas, mc = R.monte_carlo, g = R.garch, dd = R.drawdown, dist = R.distribution;
  const mfW = {}; R.multifactor_weekly.coefs.forEach(c => mfW[c.name] = c);

  /* ---- panel definitions ---- */
  const PANELS = [
    {
      id: "matrix", tag: "RISK MAP", tagClass: "risk", h: 470,
      title: "Investment-Risk Matrix", sub: "R1 · R2 · R3 — severity × likelihood",
      render: (d) => chartRiskMatrix(d, R),
      note: note(
        "Each thesis risk is plotted on a severity (loss magnitude) × likelihood plane. Severity is anchored to the data-driven stress losses below; likelihood reflects how frequently the underlying factor shocks historically.",
        `<b>R2 Commodity</b> sits in the critical zone — it carries the largest measured price impact (Brent β=<b>${N(brent.beta)}</b>, weekly oil R²=<b>${P(tf.weekly.Brent.r2,0)}</b>). <b>R1 FX</b> is high-likelihood (IDR moves constantly) but lower per-event severity. <b>R3 Gas price-cap</b> is high-severity yet low-likelihood (discrete regulatory event).`,
        `No single risk is existential. The three channels are imperfectly correlated, so a diversified energy + power + copper (AMMN) portfolio means one shock rarely fires alone — exactly what the factor model below shows.`),
    },
    {
      id: "var", tag: "IR-2", tagClass: "method", h: 470,
      title: "30-Day Value-at-Risk", sub: "Historical · Parametric · CVaR @ 90/95/99% CL",
      render: (d) => chartVaR(d, R),
      note: note(
        `21-trading-day (~30 calendar-day) losses from <b>${R.multifactor.n.toLocaleString()}</b> overlapping windows of real returns. Historical VaR is the empirical quantile; parametric assumes normality; <b>CVaR</b> is the average loss <em>beyond</em> VaR (tail expectation).`,
        `At 95% confidence MEDC can lose <span class="neg">${P(v95.var_hist)}</span> in a month → floor near <b>${RP(v95.price_hist)}</b>. The 1-in-100 case (99%) is <span class="neg">${P(v99.var_hist)}</span> → <b>${RP(v99.price_hist)}</b>, with CVaR of <span class="neg">${P(v99.cvar_hist)}</span>. Historical &gt; parametric — the tail is fatter than Normal.`,
        `These are <em>price</em> drawdowns, not capital impairment. MEDC's US$8.6/boe cash cost keeps it free-cash-flow positive far below current Brent, so VaR-sized dips are sentiment, not solvency. Size positions to the 99% figure and the risk is survivable.`),
    },
    {
      id: "mc", tag: "IR-5", tagClass: "method", h: 480,
      title: "Monte-Carlo Price Simulation", sub: `${mc.n_sims.toLocaleString()} bootstrap paths · ${mc.horizon}-day horizon`,
      render: (d) => chartMonteCarlo(d, R),
      note: note(
        `${mc.n_sims.toLocaleString()} forward price paths drawn by <b>block-bootstrapping actual daily returns</b> (preserves the real fat-tailed, skewed shape rather than imposing a bell curve). Terminal prices form the distribution shown.`,
        `Median outcome <b>${RP(mc.bootstrap.median_price)}</b>; the 5th percentile lands at <b>${RP(mc.bootstrap.p05)}</b> and the 95th at <b>${RP(mc.bootstrap.p95)}</b>. Probability of <em>any</em> loss over the month ≈ <b>${P(mc.bootstrap.prob_loss,0)}</b> — essentially a coin-flip short-term, with a right-skewed upside.`,
        `The upside tail (p95 ${RP(mc.bootstrap.p95)}) is wider than the downside tail relative to spot — consistent with the asymmetric BUY thesis. Over a 12-month horizon the positive drift and AMMN optionality dominate this near-term noise.`),
    },
    {
      id: "stress", tag: "STRESS", tagClass: "risk", h: 440,
      title: "Macro Stress Scenarios", sub: "factor-based, sustained (weekly-β) shocks",
      render: (d) => chartStress(d, R),
      note: note(
        `Each scenario shocks the macro factors simultaneously, then translates them into a MEDC move via the <b>weekly multifactor HAC-OLS betas</b> (R²=${P(R.multifactor_weekly.r2,0)}). Weekly betas are used because stresses are sustained, not one-day, moves.`,
        `A <b>2020-style demand collapse</b> implies ${SP(R.stress.find(s=>s.name.includes("COVID")).expected_return)} → ${RP(R.stress.find(s=>s.name.includes("COVID")).implied_price)}. A <b>global recession</b> ${SP(R.stress.find(s=>s.name.includes("recession")).expected_return)}. A pure <b>oil correction below $75</b> only ${SP(R.stress.find(s=>s.name.includes("correction")).expected_return)} — single-factor shocks are modest.`,
        `The worst case requires <em>multiple</em> factors to break at once. In milder, more probable scenarios (oil −15%, IDR −15%) the implied drawdown is single-digit — well inside the dividend + AMMN earnings cushion.`),
    },
    {
      id: "brent", tag: "IR-4", tagClass: "risk", h: 480,
      title: "Brent Crude Sensitivity (R2)", sub: "MEDC vs Brent — daily, single-factor OLS",
      render: (d) => chartBrent(d, R),
      note: note(
        `OLS of MEDC daily returns on Brent returns with Newey–West (HAC) standard errors. The slope is the oil β; the <em>semi-betas</em> split it into down-oil vs up-oil days to test for asymmetry.`,
        `β = <b>${N(brent.beta)}</b> (t=${N(brent.t_beta,1)}, highly significant), R²=<b>${P(brent.r2)}</b> intraday. Crucially the <span class="neg">down-oil β (${N(brent.semi.beta_down)})</span> exceeds the up-oil β (${N(brent.semi.beta_up)}) — MEDC falls faster than it rises with crude.`,
        `Oil exposure is real but partial — a 10% Brent drop maps to ≈${P(brent.beta*0.10,1)} on the stock, not 1-for-1. The US$8.6/boe cost floor, 54.6% USD revenue and the copper/power segments absorb the rest, capping the true downside.`),
    },
    {
      id: "transmission", tag: "IR-3", tagClass: "macro", h: 450,
      title: "Risk Transmission Map", sub: "how macro shocks reach the share price",
      render: (d) => chartTransmission(d, R),
      note: note(
        `A parsimonious 4-factor model (IHSG, Brent, Copper, USD/IDR) decomposes how each macro driver flows into MEDC. Link width = absolute β (strength of transmission) from the daily HAC regression.`,
        `The dominant pathway is <b>systemic market β</b> (IHSG β≈${N(R.channel_model.coefs.find(c=>c.name==="IHSG").beta)}), followed by the <b>commodity channel</b> (Brent + copper). The currency channel is comparatively thin at daily frequency — the natural hedge at work.`,
        `Because the biggest channel is broad market risk (not idiosyncratic blow-ups), MEDC's drawdowns are mostly diversifiable beta. An investor already holding IHSG exposure is not taking much <em>new</em> systematic risk here.`),
    },
    {
      id: "betas", tag: "FACTORS", tagClass: "method", h: 470,
      title: "Multi-Factor β (95% CI)", sub: "joint daily model · HAC standard errors",
      render: (d) => chartFactorBetas(d, R),
      note: note(
        `One joint OLS of MEDC on all five factors at once, isolating each independent contribution (controlling for the others). Bars are 95% confidence intervals on HAC standard errors; teal = statistically significant.`,
        `Market (IHSG β=<b>${N(mfW.IHSG ? R.multifactor.coefs.find(c=>c.name==="IHSG").beta : 0)}</b>) and Brent are robustly significant. Copper and USD/IDR are weak <em>daily</em> — their effect lives at lower frequency (next panel) and through equity-accounted AMMN earnings, not tick-by-tick.`,
        `The clean result: MEDC's daily risk is ~1× the local market plus a measured oil tilt. There is no hidden, statistically significant factor blowing a hole in the model — what you see is what you underwrite.`),
    },
    {
      id: "tfbeta", tag: "TIMEFRAMES", tagClass: "method", h: 460,
      title: "β Across Timeframes", sub: "daily vs weekly vs monthly",
      render: (d) => chartTimeframeBetas(d, R),
      note: note(
        `The same single-factor betas re-estimated on daily, weekly and monthly returns. Noise averages out as the horizon lengthens, revealing the structural (fundamental) sensitivity.`,
        `Oil β strengthens <b>${N(tf.daily.Brent.beta)} → ${N(tf.monthly.Brent.beta)}</b> and copper β <b>${N(tf.daily.Copper.beta)} → ${N(tf.monthly.Copper.beta)}</b> from daily to monthly. USD/IDR flips strongly negative monthly (β=<b>${N(tf.monthly.USDIDR.beta)}</b>, t=${N(tf.monthly.USDIDR.t,1)}) — the EM de-rating channel behind R1.`,
        `Long-horizon investors carry the higher commodity β — but also the higher commodity <em>upside</em>. The monthly FX sensitivity is the one to hedge; MEDC's USD revenue + active debt management (next: rolling β) is precisely that hedge in action.`),
    },
    {
      id: "fx", tag: "R1 · FX", tagClass: "risk", h: 470,
      title: "USD/IDR Sensitivity (R1)", sub: "the 'natural hedge', measured",
      render: (d) => chartFX(d, R),
      note: note(
        `OLS of MEDC returns on USD/IDR returns (a positive move = a weaker Rupiah). HAC errors; semi-betas split depreciation vs appreciation days.`,
        `Daily β = <b>${N(fx.beta)}</b> with R² of just <b>${P(fx.r2,1)}</b> — statistically the natural hedge largely <em>neutralises</em> day-to-day FX risk. The mild negative tilt comes from foreign-outflow days (down-β ${N(fx.semi.beta_down)} vs up-β ${N(fx.semi.beta_up)}).`,
        `54.6% of sales are USD-denominated, so a weaker Rupiah lifts revenue even as it raises USD-debt servicing — the two largely cancel, which is exactly why the measured FX β is small. BI's defensive 5.75% policy rate further caps tail depreciation.`),
    },
    {
      id: "rollbeta", tag: "DYNAMIC", tagClass: "method", h: 440,
      title: "Rolling 90-Day β", sub: "exposures are regime-dependent",
      render: (d) => chartRollingBeta(d, S),
      note: note(
        `90-day rolling regression betas to Brent, copper and USD/IDR. Shows whether sensitivities are stable or shift across crises, oil cycles and policy regimes.`,
        `Oil β spikes during demand shocks (2020) and oil rallies; copper β only becomes meaningful after the 2023 AMMN listing; FX β swings around zero, confirming the hedge holds on average but loosens in stress windows.`,
        `Time-varying β means risk is manageable with rebalancing, not static. The exposures mean-revert — no permanent regime of extreme sensitivity — so episodic spikes are tactical, not structural, threats.`),
    },
    {
      id: "garch", tag: "VOLATILITY", tagClass: "method", h: 430,
      title: "GARCH(1,1)-t Volatility", sub: "conditional risk & clustering",
      render: (d) => chartGarch(d, S, R),
      note: note(
        `A GARCH(1,1) model with Student-t innovations estimates time-varying conditional volatility — capturing the way risk clusters (calm begets calm, shocks beget shocks).`,
        `Volatility persistence α+β = <b>${N(g.persistence)}</b> (high but stationary); current annualised σ ≈ <b>${P(g.current_ann_vol,0)}</b> vs a long-run anchor of <b>${P(g.long_run_ann_vol,0)}</b>. The t-distribution (ν=${N(g.nu,1)}) confirms fat tails.`,
        `Because vol mean-reverts to ~${P(g.long_run_ann_vol,0)}, today's elevated readings are not the new normal. Entering during high-σ regimes historically offered better risk-adjusted entry as volatility normalised.`),
    },
    {
      id: "drawdown", tag: "DRAWDOWN", tagClass: "risk", h: 420,
      title: "Underwater / Max Drawdown", sub: "worst peak-to-trough history",
      render: (d) => chartDrawdown(d, S, R),
      note: note(
        `The 'underwater' curve plots cumulative loss from each prior high. The trough is the maximum historical drawdown.`,
        `Max drawdown was <span class="neg">${P(dd.max_drawdown)}</span>, peak ${dd.peak} → trough ${dd.trough} — the 2018 oil top into the 2020 COVID crash. The stock has since recovered multiples off that low.`,
        `That worst case bundled an oil war <em>and</em> a pandemic — a genuine tail. The recovery to current levels shows the franchise survives extreme stress; today's lower leverage and Ba3/idAA- credit make a repeat less likely.`),
    },
    {
      id: "corr", tag: "CORRELATION", tagClass: "macro", h: 540,
      title: "Cross-Asset Correlation", sub: "MEDC vs 10 macro factors",
      render: (d) => chartCorrelation(d, R),
      note: note(
        `Pearson correlation matrix of daily returns across MEDC and every risk factor. Teal = positive co-movement, red = negative.`,
        `MEDC's strongest links are to <b>IHSG</b> and <b>Brent/WTI</b>; copper is moderate, gold low. Correlation to USD/IDR and DXY is near-zero to negative — the hedge again. Oil and copper are only loosely correlated, so the two commodity bets diversify each other.`,
        `Low correlation among MEDC's own drivers means the risks don't compound. A position here is not a concentrated bet on one macro variable but a basket with built-in internal diversification.`),
    },
    {
      id: "dist", tag: "NORMALITY", tagClass: "method", h: 450,
      title: "Return Distribution vs Normal", sub: "why we use fat-tailed methods",
      render: (d) => chartDistribution(d, R),
      note: note(
        `Empirical daily-return histogram against a fitted Normal, with a Jarque–Bera test for normality (joint skew + kurtosis).`,
        `Excess kurtosis <b>${N(dist.excess_kurtosis,1)}</b> and skew ${N(dist.skew,2)}; Jarque–Bera <b>rejects normality</b> (p${dist.pvalue < 1e-6 ? " < 1e-6" : "=" + N(dist.pvalue,3)}). Real tails are far heavier than the bell curve.`,
        `This is <em>why</em> the VaR and Monte-Carlo above use historical/bootstrap methods, not Normal assumptions — so the stated risk numbers already price in the fat tails rather than understating them.`),
    },
    {
      id: "mcfan", tag: "PROJECTION", tagClass: "method", h: 420,
      title: "Monte-Carlo Fan Chart", sub: "percentile cone over the horizon",
      render: (d) => chartMCFan(d, R),
      note: note(
        `The bootstrap simulation re-plotted as a forward percentile cone: median path with 25–75% and 5–95% bands widening over the ${mc.horizon}-day horizon.`,
        `Dispersion grows with √time. By day ${mc.horizon} the 90% band spans roughly ${RP(mc.fan.p05[mc.horizon])}–${RP(mc.fan.p95[mc.horizon])} around a median near ${RP(mc.fan.p50[mc.horizon])}.`,
        `The cone is the honest picture of near-term uncertainty — and it is bounded. Even the 5% edge stays above the 99% monthly VaR floor, reinforcing that catastrophic short-term loss is a low-probability event.`),
    },
    {
      id: "priceidx", tag: "CONTEXT", tagClass: "macro", h: 430,
      title: "MEDC vs Risk Factors", sub: "10-year rebased history",
      render: (d) => chartPriceIndex(d, S),
      note: note(
        `All series rebased to 100 at the start of the sample so relative trajectories are comparable on one axis.`,
        `MEDC broadly tracks Brent and IHSG through the cycle but has compounded well above both since 2021, as production scale (170 mboepd), the Corridor consolidation and AMMN re-rated the equity beyond pure oil beta.`,
        `The chart frames the risks in context: the same volatility that produced the 2020 drawdown also drove multi-bagger upside. The thesis is that the structural drivers (gas scarcity, copper, power) keep the long-run slope positive through the noise.`),
    },
  ];

  /* ---- build DOM ---- */
  const canvas = document.getElementById("canvas");
  document.getElementById("boot").remove();
  LM.init(canvas);

  const charts = [];
  PANELS.forEach(cfg => {
    const el = document.createElement("section");
    el.className = "panel";
    el.id = "p-" + cfg.id;
    el.style.height = cfg.h + "px";
    el.innerHTML = `
      <div class="panel__head">
        <span class="panel__tag ${cfg.tagClass || ""}">${cfg.tag}</span>
        <div class="panel__titles">
          <div class="panel__title">${cfg.title}</div>
          <div class="panel__sub">${cfg.sub}</div>
        </div>
        <span class="panel__grip">⠿</span>
      </div>
      <div class="panel__body">
        <div class="panel__chart" id="c-${cfg.id}"></div>
        <div class="panel__note">${cfg.note}</div>
      </div>`;
    canvas.appendChild(el);
    const chartDiv = el.querySelector(".panel__chart");
    charts.push({ cfg, chartDiv });
    LM.add(el, chartDiv, cfg.h);
  });

  // position first (gives panels real width), then render charts one-per-tick
  // so the main thread never blocks on a single long synchronous task.
  LM.tidy(true);
  let ci = 0;
  function renderNext() {
    if (ci >= charts.length) {
      setTimeout(() => LM.tidy(false), 60);
      canvas.removeAttribute("aria-busy");
      return;
    }
    const { cfg, chartDiv } = charts[ci++];
    try { cfg.render(chartDiv); }
    catch (e) { chartDiv.innerHTML = '<div style="padding:20px;color:#ff5d73;font-family:monospace">chart error: ' + e.message + '</div>'; console.error(cfg.id, e); }
    setTimeout(renderNext, 0);
  }
  setTimeout(renderNext, 0);

  /* ---- header ticker + stamp ---- */
  const snap = R.snapshot;
  const order = [["MEDC","MEDC"],["Brent","BRENT"],["Copper","COPPER"],["USDIDR","USD/IDR"],["IHSG","IHSG"],["Amman","AMMN"]];
  const tick = order.filter(([k]) => snap[k]).map(([k, lbl]) => {
    const s = snap[k]; const up = s.chg >= 0;
    const val = k === "USDIDR" || k === "IHSG" || k === "MEDC" || k === "Amman"
      ? Math.round(s.last).toLocaleString("en-US")
      : s.last.toFixed(2);
    return `<span class="ticker__item">${lbl} <b>${val}</b> <span class="${up?"up":"down"}">${SP(s.chg,2)}</span></span>`;
  }).join("");
  document.getElementById("tickerStrip").innerHTML = tick;
  document.getElementById("stamp").textContent =
    `sample ${R.meta.sample_start} → ${R.meta.sample_end} · ${R.meta.n_obs.toLocaleString()} obs · spot ${RP(R.meta.current_price)} · generated ${R.meta.generated}`;

  /* ---- toolbar ---- */
  document.getElementById("resetLayout").addEventListener("click", () => LM.reset());
  document.getElementById("tidyLayout").addEventListener("click", () => LM.tidy(false));
})();
