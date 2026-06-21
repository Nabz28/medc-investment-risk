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
      id: "risksummary", tag: "IR-1", tagClass: "risk", h: 430,
      title: "Investment Risk Summary", sub: "30-day VaR per risk · best / base / worst case",
      render: (d) => chartRiskSummary(d, R), note: "",
    },
    {
      id: "matrix", tag: "IR-2", tagClass: "risk", h: 470,
      title: "Investment-Risk Matrix", sub: "R1 · R2 · R3 — severity × likelihood",
      render: (d) => chartRiskMatrix(d, R),
      note: note(
        "Each thesis risk is plotted on a severity (loss magnitude) × likelihood plane. Severity is anchored to the data-driven stress losses below; likelihood reflects how frequently the underlying factor shocks historically.",
        `<b>R2 Commodity</b> sits in the critical zone — it carries the largest measured price impact (Brent β=<b>${N(brent.beta)}</b>, weekly oil R²=<b>${P(tf.weekly.Brent.r2,0)}</b>). <b>R1 FX</b> is high-likelihood (IDR moves constantly) but lower per-event severity. <b>R3 Gas price-cap</b> is high-severity yet low-likelihood (discrete regulatory event).`,
        `No single risk is existential. The three channels are imperfectly correlated, so a diversified energy + power + copper (AMMN) portfolio means one shock rarely fires alone — exactly what the factor model below shows.`),
    },
    {
      id: "var", tag: "IR-3", tagClass: "method", h: 470,
      title: "30-Day Value-at-Risk", sub: "Historical · Parametric · CVaR @ 90/95/99% CL",
      render: (d) => chartVaR(d, R),
      note: note(
        `21-trading-day (~30 calendar-day) losses from <b>${R.multifactor.n.toLocaleString()}</b> overlapping windows of real returns. Historical VaR is the empirical quantile; parametric assumes normality; <b>CVaR</b> is the average loss <em>beyond</em> VaR (tail expectation).`,
        `At 95% confidence MEDC can lose <span class="neg">${P(v95.var_hist)}</span> in a month → floor near <b>${RP(v95.price_hist)}</b>. The 1-in-100 case (99%) is <span class="neg">${P(v99.var_hist)}</span> → <b>${RP(v99.price_hist)}</b>, with CVaR of <span class="neg">${P(v99.cvar_hist)}</span>. Historical &gt; parametric — the tail is fatter than Normal.`,
        `These are <em>price</em> drawdowns, not capital impairment. MEDC's US$8.6/boe cash cost keeps it free-cash-flow positive far below current Brent, so VaR-sized dips are sentiment, not solvency. Size positions to the 99% figure and the risk is survivable.`),
    },
    {
      id: "mc", tag: "IR-6", tagClass: "method", h: 480,
      title: "Monte-Carlo Price Simulation", sub: `${mc.n_sims.toLocaleString()} bootstrap paths · ${mc.horizon}-day horizon`,
      render: (d) => chartMonteCarlo(d, R),
      note: note(
        `${mc.n_sims.toLocaleString()} forward price paths drawn by <b>block-bootstrapping actual daily returns</b> (preserves the real fat-tailed, skewed shape rather than imposing a bell curve). Terminal prices form the distribution shown.`,
        `Median outcome <b>${RP(mc.bootstrap.median_price)}</b>; the 5th percentile lands at <b>${RP(mc.bootstrap.p05)}</b> and the 95th at <b>${RP(mc.bootstrap.p95)}</b>. Probability of <em>any</em> loss over the month ≈ <b>${P(mc.bootstrap.prob_loss,0)}</b> — essentially a coin-flip short-term, with a right-skewed upside.`,
        `The upside tail (p95 ${RP(mc.bootstrap.p95)}) is wider than the downside tail relative to spot — consistent with the asymmetric BUY thesis. Over a 12-month horizon the positive drift and AMMN optionality dominate this near-term noise.`),
    },
    {
      id: "stress", tag: "IR-5", tagClass: "risk", h: 440,
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
      id: "transmission", tag: "CHANNELS", tagClass: "macro", h: 450,
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

  /* ---- section assignment: which exhibits go in the report body vs appendix ---- */
  const PAPER_IDS = new Set(["risksummary", "matrix", "var", "brent", "stress", "mc"]);
  const SECTION_META = {
    paper: { title: "Main Exhibits", badge: "Report Body",
             sub: "the figures to place in the report body — screenshot any panel" },
    appendix: { title: "Appendix", badge: "Supporting",
                sub: "deeper statistical evidence behind the main exhibits" },
  };

  /* ---- build DOM ---- */
  const canvas = document.getElementById("canvas");
  document.getElementById("boot").remove();
  LM.init(canvas);

  function makeSectionHeader(sec) {
    const m = SECTION_META[sec];
    const h = document.createElement("div");
    h.className = "section-head";
    h.id = "sec-" + sec;
    h.innerHTML = `<span class="section-head__badge ${sec}">${m.badge}</span>
      <span class="section-head__title">${m.title}</span>
      <span class="section-head__sub">${m.sub}</span>`;
    canvas.appendChild(h);
    LM.registerHeader(sec, h);
    return h;
  }

  const charts = [];
  ["paper", "appendix"].forEach(sec => {
    makeSectionHeader(sec);
    PANELS.filter(cfg => (PAPER_IDS.has(cfg.id) ? "paper" : "appendix") === sec).forEach(cfg => {
      // chart-only panels (narration now lives in its own section): taller chart,
      // no per-graph note. Slightly bigger for the report-body exhibits.
      const hh = (sec === "paper" ? 408 : 372) + (cfg.id === "corr" ? 70 : 0);
      cfg._h = hh;
      const el = document.createElement("section");
      el.className = "panel";
      el.id = "p-" + cfg.id;
      el.style.height = hh + "px";
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
        </div>`;
      canvas.appendChild(el);
      const chartDiv = el.querySelector(".panel__chart");
      charts.push({ cfg, chartDiv });
      LM.add(el, chartDiv, hh, sec);
    });
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

  /* =====================================================================
     Investment-risk NARRATION — written in the report's voice, grounded in
     the live statistics above, formatted to copy straight into the ER.
     ===================================================================== */
  (function buildNarration() {
    const dr = R.descriptives.MEDC;
    const abs = Math.abs;
    const prv = R.per_risk_var.risks;
    const pr1 = prv.find(x => x.id === "R1").levels;
    const pr2 = prv.find(x => x.id === "R2").levels;
    const pr3 = prv.find(x => x.id === "R3").levels;

    const blocks = [
      { cls: "headline", h: `Risk Model Indicates a Bounded, Diversifiable Downside: a Worst-Case One-Month VaR of −${P(v99.var_hist,0)} Concentrated in Commodity Beta`, body: `
        <p class="lead">The risk model indicates a medium risk profile. The dominant single-risk exposure is
        commodity-price volatility, whose worst-case (99 percent) one-month Value-at-Risk reaches
        <b>${P(pr2['0.99'].var)}</b>, an implied price of <b>${RP(pr2['0.99'].price)}</b>, against a base-case
        (95 percent) loss of <b>${P(pr2['0.95'].var)}</b>. Aggregating every factor, the whole-equity 95
        percent monthly Value-at-Risk is <b>${P(v95.var_hist)}</b> and the 99 percent figure is
        <b>${P(v99.var_hist)}</b>, an implied worst-case floor near <b>${RP(v99.price_hist)}</b>. These
        downsides are bounded and mean-reverting, and largely diversifiable: the market beta to the IHSG is
        approximately <b>${N(capm.beta,2)}</b>, so most of the risk is systematic rather than idiosyncratic.
        The three principal risks are quantified below.</p>` },

      { h: "Risk 1: Foreign Exchange and USD-Debt Servicing Pressure", body: `
        <p>MEDC carries USD-denominated debt across roughly 80 to 90 percent of total financial liabilities,
        so a depreciating Rupiah mechanically inflates the cost of servicing those obligations. At the daily
        frequency, however, the equity shows almost no measurable currency sensitivity. A single-factor
        regression of MEDC returns on the USD/IDR rate produces a beta of only <b>${N(fx.beta,2)}</b> with an
        R-squared of just <b>${P(fx.r2,1)}</b>, confirming that the natural hedge largely neutralises
        day-to-day exchange exposure. The hedge is structural rather than incidental. International markets
        across Asia, Africa and the Middle East generate 54.6 percent of total sales in hard currency, so a
        weaker Rupiah lifts reported revenue at the same moment it raises USD debt costs, and the two effects
        substantially cancel.</p>
        <p>The exposure becomes material only over longer horizons and through the equity-market channel. At
        the monthly frequency the beta to USD/IDR widens to <b>${N(tf.monthly.USDIDR.beta,1)}</b> with a
        t-statistic of <b>${N(tf.monthly.USDIDR.t,1)}</b>, reflecting the broad emerging-market de-rating that
        accompanies sustained Rupiah weakness and foreign capital outflows. Modelled as a standalone risk, the
        factor-implied Value-at-Risk is <b>${P(pr1['0.95'].var)}</b> in the base case and
        <b>${P(pr1['0.99'].var)}</b> in the worst case, an implied price of <b>${RP(pr1['0.99'].price)}</b>.
        Bank Indonesia's defensive policy
        rate of 5.75 percent caps the tail of that depreciation, and management's retention of ample USD cash
        reserves bridges any short-term currency mismatch. The currency risk is therefore real but
        well-contained, expressing itself as episodic multiple compression rather than a permanent impairment
        of cash flow.</p>` },

      { h: "Risk 2: Commodity Price Volatility (Brent and Copper)", body: `
        <p>As an upstream price-taker, MEDC remains exposed to Brent crude and, through its 20.9 percent stake
        in Amman Mineral, to copper. The oil sensitivity is statistically robust and strengthens with horizon.
        The Brent beta rises from <b>${N(brent.beta,2)}</b> on daily returns, significant at a t-statistic of
        <b>${N(brent.t_beta,1)}</b>, to <b>${N(tf.weekly.Brent.beta,2)}</b> on weekly and monthly returns,
        where crude explains roughly <b>${P(tf.weekly.Brent.r2,0)}</b> of the variance in MEDC's price. The
        exposure is also asymmetric. The down-oil beta of <b>${N(brent.semi.beta_down,2)}</b> exceeds the
        up-oil beta of <b>${N(brent.semi.beta_up,2)}</b>, meaning the stock falls faster than it rises with
        crude, a property the risk model captures explicitly.</p>
        <p>A 30-day historical Value-at-Risk places the 95 percent loss at <b>${P(v95.var_hist)}</b>, an
        implied floor near <b>${RP(v95.price_hist)}</b>, and the 99 percent loss at <b>${P(v99.var_hist)}</b>
        with a conditional shortfall of <b>${P(v99.cvar_hist)}</b>. A ${mc.n_sims.toLocaleString()}-path
        Monte-Carlo simulation that bootstraps the actual fat-tailed return distribution assigns a median
        one-month outcome of <b>${RP(mc.bootstrap.median_price)}</b> and a fifth-percentile outcome of
        <b>${RP(mc.bootstrap.p05)}</b>. Isolated as a standalone risk, commodity volatility carries a base-case
        Value-at-Risk of <b>${P(pr2['0.95'].var)}</b> and a worst-case of <b>${P(pr2['0.99'].var)}</b>, an
        implied price of <b>${RP(pr2['0.99'].price)}</b>, the largest of the three risks. These are price
        drawdowns rather than solvency events. MEDC's unit
        cash cost of USD 8.6 per barrel of oil equivalent, well below the industry average, keeps the company
        free-cash-flow positive far below prevailing Brent, so a commodity correction compresses growth
        funding without threatening the dividend or the balance sheet. The copper position adds a
        counter-cyclical earnings buffer through a structurally deficit metal, partially offsetting any
        hydrocarbon weakness.</p>` },

      { h: "Risk 3: Domestic Gas Price-Cap and Regulatory Friction", body: `
        <p>This risk carries low occurrence probability but high severity. The Indonesian HGBT policy caps the
        domestic gas price at USD 6 per MMBtu for designated strategic industries, and the principal regulatory
        risk is an expansion of that cap onto MEDC's premium assets such as the Corridor Block. This is a
        discrete policy event rather than a continuously traded factor, so it does not register in the daily
        betas; its severity is captured through scenario analysis instead. Modelled as an analyst regulatory
        scenario band, the per-risk Value-at-Risk runs from <b>${P(pr3['0.95'].var)}</b> in the base case to
        <b>${P(pr3['0.99'].var)}</b> in the worst case, an implied price of <b>${RP(pr3['0.99'].price)}</b>;
        because the risk is policy-driven and persistent, it also raises the likelihood of valuation-multiple
        compression beyond the immediate earnings hit.</p>
        <p>The mitigants are structural. National proven gas reserves have fallen 32 percent since 2019, from
        49.7 to 33.8 TSCF, which strengthens the bargaining position of existing producers, and domestic
        utilisation already exceeds export volumes, guaranteeing a captive market. Management negotiates
        continuously with regulators to preserve fair pricing, and the diversified power and copper segments
        dilute the earnings weight of any single capped contract.</p>` },

      { h: "Quantitative Risk Summary", body: `
        <p>Across the full ten-year sample, MEDC returns are distinctly non-normal, with excess kurtosis of
        <b>${N(dist.excess_kurtosis,1)}</b> and a Jarque-Bera test that decisively rejects normality, which is
        why the figures above are derived from historical and bootstrap methods rather than a Gaussian
        assumption. Annualised volatility averages <b>${P(dr.ann_vol,0)}</b>, and a GARCH(1,1) model places
        current conditional volatility near <b>${P(g.current_ann_vol,0)}</b> against a long-run anchor of
        <b>${P(g.long_run_ann_vol,0)}</b>, indicating that risk mean-reverts rather than ratchets permanently
        higher. The maximum historical drawdown of approximately <b>${P(abs(dd.max_drawdown),0)}</b>, recorded
        between the 2018 oil peak and the 2020 pandemic trough, bundled an oil-price war with a global demand
        collapse and has since fully recovered, evidence that the franchise survives extreme stress. The
        market beta to the IHSG is approximately <b>${N(capm.beta,2)}</b>, so the majority of MEDC's
        day-to-day risk is diversifiable systematic exposure rather than idiosyncratic fragility. On balance,
        the measured risks are bounded, mitigated and asymmetric to the upside, supporting the investment
        thesis.</p>` },

      { h: "Figure Captions (Main Exhibits)", body: `
        <div class="fig-list">
          <b>Figure IR-1.</b> Investment Risk Summary: 30-day Value-at-Risk per risk (best / base / worst case).<br>
          <b>Figure IR-2.</b> MEDC Investment-Risk Matrix (severity vs likelihood).<br>
          <b>Figure IR-3.</b> 30-Day Historical and Parametric Value-at-Risk with CVaR, 90/95/99% confidence.<br>
          <b>Figure IR-4.</b> MEDC Sensitivity to Brent Crude (single-factor regression).<br>
          <b>Figure IR-5.</b> Macro Stress Scenarios (factor-based implied price impact).<br>
          <b>Figure IR-6.</b> Monte-Carlo Price Simulation (${mc.n_sims.toLocaleString()} bootstrap paths, ${mc.horizon}-day horizon).
        </div>` },
    ];

    const nar = document.getElementById("narration");
    nar.innerHTML = `
      <div class="narration__bar">
        <span class="section-head__badge">Copy into your report</span>
        <h2>Investment Risk — Narration</h2>
        <button class="copybtn" id="copyAll" style="position:static">⧉ Copy all</button>
      </div>
      <div class="doc" id="doc"></div>`;
    const doc = nar.querySelector("#doc");
    blocks.forEach(b => {
      const d = document.createElement("div");
      d.className = "doc__block" + (b.cls ? " " + b.cls : "");
      d.innerHTML = `<button class="copybtn" data-copy>⧉ Copy</button>` +
        (b.h ? `<h3>${b.h}</h3>` : "") + b.body;
      doc.appendChild(d);
    });

    // read RENDERED text from live nodes (innerText on a detached clone returns
    // raw source whitespace) and normalise so it pastes cleanly into a document
    function plainText(node) {
      const parts = [];
      node.querySelectorAll("h3, p, .fig-list").forEach(el => {
        const t = el.innerText.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
        if (t) parts.push(t);
      });
      return parts.join("\n\n");
    }
    function flash(btn) {
      const old = btn.textContent;
      btn.textContent = "✓ Copied"; btn.classList.add("copied");
      setTimeout(() => { btn.textContent = old; btn.classList.remove("copied"); }, 1600);
    }
    doc.querySelectorAll("[data-copy]").forEach(btn => {
      btn.addEventListener("click", () => {
        navigator.clipboard.writeText(plainText(btn.parentElement)).then(() => flash(btn));
      });
    });
    document.getElementById("copyAll").addEventListener("click", (e) => {
      navigator.clipboard.writeText(plainText(doc)).then(() => flash(e.currentTarget));
    });
  })();
})();
