/* =======================================================================
   chart builders — one per panel. Each reads from R (results) / S (series).
   ======================================================================= */

/* legend helper for multi-series time charts */
function topLegend() {
  return { showlegend: true, legend: {
    orientation: "h", x: 0, y: 1.13, font: { size: 11, color: C.inkDim },
    bgcolor: "rgba(0,0,0,0)" } , margin: { t: 30, l: 56, r: 18, b: 40 } };
}

/* ---------- 1. Risk matrix (R1/R2/R3) ---------- */
function chartRiskMatrix(div, R) {
  // Position risks by data-derived severity (stress loss) & a likelihood score.
  const fx = R.fx_sensitivity, brent = R.brent_sensitivity;
  const risks = [
    { id: "R1", name: "FX / Debt-Servicing", short: "FX / Debt", sev: 3.3, lik: 3.6, col: C.amber,
      hov: "USD debt 80–90% of liabilities · monthly USD/IDR β=" + R.timeframe_betas.monthly.USDIDR.beta.toFixed(2) },
    { id: "R2", name: "Commodity (Brent + Cu)", short: "Commodity", sev: 4.3, lik: 4.0, col: C.red,
      hov: "Brent β=" + brent.beta.toFixed(2) + " · weekly oil R²=" + (R.timeframe_betas.weekly.Brent.r2*100).toFixed(0) + "%" },
    { id: "R3", name: "Gas Price-Cap (HGBT)", short: "Gas Price-Cap", sev: 3.2, lik: 2.3, col: C.blue,
      hov: "Regulatory · HGBT cap US$6/MMBtu" },
  ];
  const traces = [{
    type: "scatter", mode: "markers+text",
    x: risks.map(r => r.lik), y: risks.map(r => r.sev),
    text: risks.map(r => r.id), textposition: "middle center",
    textfont: { family: MONO, size: 13, color: "#06121f" },
    marker: {
      size: risks.map(r => 26 + r.sev * 5), color: risks.map(r => r.col),
      line: { color: "#06121f", width: 2 }, opacity: .92,
    },
    customdata: risks.map(r => [r.name, r.hov]),
    hovertemplate: "<b>%{text} · %{customdata[0]}</b><br>severity %{y} · likelihood %{x}<br>%{customdata[1]}<extra></extra>",
  }];
  const layout = {
    margin: { l: 64, r: 18, t: 16, b: 48 },
    xaxis: { title: { text: "Likelihood →", font: { size: 11 } }, range: [1, 5], dtick: 1,
             gridcolor: "rgba(150,162,184,.3)" },
    yaxis: { title: { text: "Severity →", font: { size: 11 } }, range: [1, 5], dtick: 1,
             gridcolor: "rgba(150,162,184,.3)" },
    shapes: [
      // high-risk quadrant tint
      { type: "rect", x0: 3, x1: 5, y0: 3, y1: 5, fillcolor: "rgba(255,93,115,.07)", line: { width: 0 }, layer: "below" },
      { type: "rect", x0: 1, x1: 3, y0: 1, y1: 3, fillcolor: "rgba(40,224,180,.05)", line: { width: 0 }, layer: "below" },
    ],
    annotations: risks.map(r => ({
      x: r.lik, y: r.sev - 0.58, text: r.short, showarrow: false,
      font: { size: 10, color: C.inkDim, family: MONO },
    })).concat([
      { x: 4.9, y: 4.85, text: "CRITICAL ZONE", showarrow: false, xanchor: "right",
        font: { size: 9.5, color: C.redSoft, family: MONO } },
      { x: 1.1, y: 1.15, text: "low-risk", showarrow: false, xanchor: "left",
        font: { size: 9.5, color: C.teal, family: MONO } },
    ]),
  };
  draw(div, traces, layout);
}

/* ---------- 2. Value-at-Risk (30-day) ---------- */
function chartVaR(div, R) {
  const L = R.var.levels;
  const cats = L.map(l => (l.conf * 100).toFixed(0) + "% CL");
  const hist = L.map(l => -l.var_hist * 100);
  const para = L.map(l => -l.var_param * 100);
  const cvar = L.map(l => -l.cvar_hist * 100);
  const priceTxt = L.map(l => fmt.rp(l.price_hist));
  const traces = [
    { type: "bar", orientation: "h", y: cats, x: hist, name: "Historical VaR",
      marker: { color: C.red, line: { width: 0 } },
      hovertemplate: "Historical VaR %{y}: %{x:.1f}%<extra></extra>" },
    { type: "bar", orientation: "h", y: cats, x: para, name: "Parametric (Normal)",
      marker: { color: "rgba(91,140,255,.6)", line: { color: C.blue, width: 1 } },
      hovertemplate: "Parametric VaR %{y}: %{x:.1f}%<extra></extra>" },
    { type: "scatter", mode: "markers", y: cats, x: cvar, name: "CVaR (Expected Shortfall)",
      marker: { color: C.gold, size: 11, symbol: "diamond", line: { color: "#06121f", width: 1 } },
      hovertemplate: "CVaR %{y}: %{x:.1f}%<extra></extra>" },
  ];
  const rightPad = Math.abs(Math.min(...cvar)) * 0.62;
  const layout = deepMerge(topLegend(), {
    barmode: "group", bargap: .34, bargroupgap: .12,
    legend: { orientation: "h", x: 0, y: 1.18, font: { size: 10.5, color: C.inkDim } },
    margin: { l: 64, r: 18, t: 36, b: 40 },
    xaxis: { title: { text: "30-day loss (% of price)", font: { size: 11 } },
             range: [Math.min(...cvar) * 1.18, rightPad], ticksuffix: "%", zeroline: true,
             zerolinecolor: C.line2, zerolinewidth: 1.5 },
    yaxis: { autorange: "reversed" },
    // implied price + VaR% labels in the clean positive zone, right of the zero baseline
    annotations: L.map((l, i) => ({
      x: 0, y: cats[i], xanchor: "left", xshift: 8, showarrow: false,
      text: `${hist[i].toFixed(1)}% → <b>${priceTxt[i]}</b>`,
      font: { family: MONO, size: 11, color: C.redSoft },
    })),
  });
  draw(div, traces, layout);
}

/* ---------- 3. Risk transmission map (Sankey) ---------- */
function chartTransmission(div, R) {
  const b = {}; R.channel_model.coefs.forEach(c => b[c.name] = c.beta);
  const A = Math.abs;
  const labels = [
    "Brent Crude", "Copper (AMMN)", "USD/IDR", "IHSG / Systemic",  // 0-3 sources
    "R2 · Commodity", "R1 · Currency", "Market β",                  // 4-6 channels
    "MEDC Share Price",                                             // 7
  ];
  const node = {
    label: labels, pad: 18, thickness: 18,
    color: [C.amber, C.gold, C.red, C.blue, C.amber, C.red, C.blue, C.teal],
    line: { color: "#06121f", width: 1 },
  };
  const link = {
    source: [0, 1, 2, 3, 4, 5, 6],
    target: [4, 4, 5, 6, 7, 7, 7],
    value: [A(b.Brent), A(b.Copper), A(b.USDIDR), A(b.IHSG),
            A(b.Brent) + A(b.Copper), A(b.USDIDR), A(b.IHSG)],
    color: ["rgba(255,180,84,.35)", "rgba(245,215,122,.35)", "rgba(255,93,115,.35)",
            "rgba(91,140,255,.35)", "rgba(255,180,84,.3)", "rgba(255,93,115,.3)", "rgba(91,140,255,.3)"],
    hovertemplate: "β contribution %{value:.2f}<extra></extra>",
  };
  const traces = [{ type: "sankey", orientation: "h", node, link,
    textfont: { family: MONO, size: 11, color: C.ink } }];
  draw(div, traces, { margin: { l: 8, r: 8, t: 10, b: 10 } });
}

/* ---------- 4. Brent sensitivity scatter + OLS ---------- */
function thin(xs, ys, max = 1600) {
  if (xs.length <= max) return [xs, ys];
  const step = xs.length / max, ox = [], oy = [];
  for (let i = 0; i < max; i++) { const k = Math.floor(i * step); ox.push(xs[k]); oy.push(ys[k]); }
  return [ox, oy];
}
function scatterReg(div, sens, xlab, color) {
  const sc = sens.scatter;
  const [xs, ys] = thin(sc.x, sc.y);
  const xmin = Math.min(...sc.x), xmax = Math.max(...sc.x);
  const lx = [xmin, xmax], ly = lx.map(x => sens.alpha + sens.beta * x);
  const traces = [
    { type: "scatter", mode: "markers", x: xs, y: ys,
      marker: { size: 3.4, color: color, opacity: .28 },
      hovertemplate: `${xlab} %{x:.2%}<br>MEDC %{y:.2%}<extra></extra>`, name: "daily" },
    { type: "scatter", mode: "lines", x: lx, y: ly,
      line: { color: C.ink, width: 2.5 },
      hovertemplate: `β = ${sens.beta.toFixed(3)}<extra></extra>`, name: "OLS fit" },
  ];
  const layout = {
    margin: { l: 56, r: 16, t: 14, b: 44 },
    xaxis: { title: { text: `${xlab} daily log-return`, font: { size: 11 } }, tickformat: ".0%",
             range: [xmin * 1.02, xmax * 1.02] },
    yaxis: { title: { text: "MEDC daily log-return", font: { size: 11 } }, tickformat: ".0%" },
    annotations: [{
      xref: "paper", yref: "paper", x: .03, y: .97, align: "left", showarrow: false,
      text: `β = <b>${sens.beta.toFixed(3)}</b>  ·  t = ${sens.t_beta.toFixed(1)}  ·  R² = ${(sens.r2*100).toFixed(1)}%`,
      font: { family: MONO, size: 11.5, color: C.ink },
      bgcolor: "rgba(255,255,255,.92)", bordercolor: color, borderpad: 5, borderwidth: 1,
    }],
  };
  draw(div, traces, layout);
}
function chartBrent(div, R) { scatterReg(div, R.brent_sensitivity, "Brent", C.amber); }
function chartFX(div, R) { scatterReg(div, R.fx_sensitivity, "USD/IDR", C.red); }

/* ---------- 5. Monte Carlo terminal-price histogram ---------- */
function chartMonteCarlo(div, R) {
  const mc = R.monte_carlo, h = mc.hist, cp = mc.current_price, bs = mc.bootstrap;
  const traces = [{
    type: "bar", x: h.centers, y: h.density,
    marker: {
      color: h.centers.map(c => c < cp ? "rgba(255,93,115,.6)" : "rgba(40,224,180,.6)"),
      line: { width: 0 },
    },
    hovertemplate: "Price %{x:.0f}<br>density %{y:.4f}<extra></extra>", name: "paths",
  }];
  const ymax = Math.max(...h.density) * 1.08;
  const vlines = [
    { x: cp, c: C.ink, t: "Spot " + fmt.rp(cp), dash: "solid" },
    { x: bs.p05, c: C.red, t: "5% VaR " + fmt.rp(bs.p05), dash: "dash" },
    { x: bs.median_price, c: C.teal, t: "Median " + fmt.rp(bs.median_price), dash: "dot" },
  ];
  const layout = {
    margin: { l: 56, r: 16, t: 14, b: 44 }, bargap: .02,
    xaxis: { title: { text: `MEDC price in ${mc.horizon} trading days (${mc.n_sims.toLocaleString()} sims)`, font: { size: 11 } } },
    yaxis: { title: { text: "probability density", font: { size: 11 } }, showticklabels: false },
    shapes: vlines.map(v => ({ type: "line", x0: v.x, x1: v.x, y0: 0, y1: ymax,
      line: { color: v.c, width: 1.6, dash: v.dash } })),
    annotations: vlines.map((v, i) => ({ x: v.x, y: ymax * (1 - i * 0.09), text: v.t, showarrow: false,
      font: { family: MONO, size: 10.5, color: v.c }, xanchor: v.x < cp ? "left" : "right", bgcolor: "rgba(255,255,255,.92)" })),
  };
  draw(div, traces, layout);
}

/* ---------- 6. Monte Carlo fan (percentile cone) ---------- */
function chartMCFan(div, R) {
  const f = R.monte_carlo.fan, x = f.steps;
  const band = (lo, hi, col) => ([
    { type: "scatter", mode: "lines", x, y: hi, line: { width: 0 }, hoverinfo: "skip", showlegend: false },
    { type: "scatter", mode: "lines", x, y: lo, fill: "tonexty", fillcolor: col,
      line: { width: 0 }, hoverinfo: "skip", showlegend: false },
  ]);
  const traces = [
    ...band(f.p05, f.p95, "rgba(91,140,255,.12)"),
    ...band(f.p25, f.p75, "rgba(40,224,180,.16)"),
    { type: "scatter", mode: "lines", x, y: f.p50, line: { color: C.teal, width: 2.4 },
      name: "median", hovertemplate: "day %{x}<br>median %{y:.0f}<extra></extra>" },
  ];
  const layout = {
    margin: { l: 56, r: 16, t: 14, b: 40 },
    xaxis: { title: { text: "trading days forward", font: { size: 11 } }, range: [0, R.monte_carlo.horizon] },
    yaxis: { title: { text: "MEDC price (IDR)", font: { size: 11 } } },
    annotations: [{ xref: "paper", yref: "paper", x: .02, y: .05, showarrow: false, align: "left",
      text: "shaded: 5–95% (blue) · 25–75% (teal)", font: { size: 10.5, color: C.inkFaint, family: MONO } }],
  };
  draw(div, traces, layout);
}

/* ---------- 7. Multi-factor betas (forest plot w/ 95% CI) ---------- */
function chartFactorBetas(div, R) {
  const coefs = R.multifactor.coefs.filter(c => c.name !== "const");
  const names = { IHSG: "IHSG (market)", Brent: "Brent crude", Copper: "Copper (AMMN)", USDIDR: "USD/IDR", DXY: "US Dollar (DXY)" };
  const y = coefs.map(c => names[c.name] || c.name);
  const x = coefs.map(c => c.beta);
  const errMinus = coefs.map(c => c.beta - c.ci_low);
  const errPlus = coefs.map(c => c.ci_high - c.beta);
  const sig = coefs.map(c => Math.abs(c.t) >= 1.96);
  const traces = [{
    type: "scatter", mode: "markers", x, y,
    error_x: { type: "data", symmetric: false, array: errPlus, arrayminus: errMinus,
               color: C.line2, thickness: 1.6, width: 6 },
    marker: { size: 13, color: sig.map(s => s ? C.teal : C.inkFaint),
              line: { color: "#06121f", width: 1.5 }, symbol: "diamond" },
    customdata: coefs.map(c => [c.t, c.p]),
    hovertemplate: "β = %{x:.3f}<br>t = %{customdata[0]:.2f} · p = %{customdata[1]:.3f}<extra></extra>",
  }];
  const layout = {
    margin: { l: 130, r: 24, t: 14, b: 40 },
    xaxis: { title: { text: "daily-return β (HAC s.e., 95% CI)", font: { size: 11 } }, zeroline: true,
             zerolinecolor: C.line2, zerolinewidth: 1.5 },
    yaxis: { automargin: true },
    shapes: [{ type: "line", x0: 0, x1: 0, yref: "paper", y0: 0, y1: 1, line: { color: C.line2, width: 1.5, dash: "dot" } }],
    annotations: [{ xref: "paper", yref: "paper", x: .98, y: .52, showarrow: false, xanchor: "right",
      text: "teal = significant (|t|≥1.96)", font: { size: 10.5, color: C.inkFaint, family: MONO },
      bgcolor: "rgba(255,255,255,.92)", borderpad: 3 }],
  };
  draw(div, traces, layout);
}

/* ---------- 8. Multi-timeframe betas ---------- */
function chartTimeframeBetas(div, R) {
  const tf = R.timeframe_betas;
  const factors = ["Brent", "Copper", "USDIDR", "IHSG"];
  const fl = { Brent: "Brent", Copper: "Copper", USDIDR: "USD/IDR", IHSG: "IHSG" };
  const order = ["daily", "weekly", "monthly"];
  const colors = { daily: C.inkFaint, weekly: C.blue, monthly: C.teal };
  const traces = order.map(tfn => ({
    type: "bar", name: tfn,
    x: factors.map(f => fl[f]),
    y: factors.map(f => tf[tfn][f] ? tf[tfn][f].beta : null),
    marker: { color: colors[tfn] },
    customdata: factors.map(f => tf[tfn][f] ? [tf[tfn][f].t, tf[tfn][f].r2] : [null, null]),
    hovertemplate: `${tfn} β=%{y:.2f}<br>t=%{customdata[0]:.1f} · R²=%{customdata[1]:.2f}<extra></extra>`,
  }));
  const layout = deepMerge(topLegend(), {
    barmode: "group", bargap: .28, bargroupgap: .08,
    margin: { l: 56, r: 16, t: 32, b: 40 },
    yaxis: { title: { text: "sensitivity β", font: { size: 11 } }, zeroline: true, zerolinecolor: C.line2 },
  });
  draw(div, traces, layout);
}

/* ---------- 9. Correlation heatmap ---------- */
function chartCorrelation(div, R) {
  const lab = R.correlation.labels, m = R.correlation.matrix;
  const traces = [{
    type: "heatmap", z: m, x: lab, y: lab,
    zmin: -1, zmax: 1,
    colorscale: [[0, "#e11d48"], [.5, "#f3f5f8"], [1, "#0e9d78"]],
    xgap: 1.5, ygap: 1.5,
    colorbar: { tickfont: { family: MONO, size: 9, color: C.inkFaint }, thickness: 10, len: .8, outlinewidth: 0 },
    hovertemplate: "%{y} · %{x}<br>ρ = %{z:.2f}<extra></extra>",
  }];
  // text annotations
  const ann = [];
  for (let i = 0; i < lab.length; i++) for (let j = 0; j < lab.length; j++) {
    const v = m[i][j];
    ann.push({ x: lab[j], y: lab[i], text: v.toFixed(2), showarrow: false,
      font: { family: MONO, size: 8.5, color: Math.abs(v) > .5 ? "#ffffff" : "rgba(40,52,72,.9)" } });
  }
  const layout = {
    margin: { l: 78, r: 10, t: 12, b: 78 },
    xaxis: { tickangle: -45, tickfont: { size: 9.5 }, showgrid: false },
    yaxis: { autorange: "reversed", tickfont: { size: 9.5 }, showgrid: false },
    annotations: ann,
  };
  draw(div, traces, layout);
}

/* ---------- 10. Rolling 90-day betas ---------- */
function chartRollingBeta(div, S) {
  const series = [
    { k: "rollbeta_Brent", name: "Brent", color: C.amber },
    { k: "rollbeta_Copper", name: "Copper", color: C.gold },
    { k: "rollbeta_USDIDR", name: "USD/IDR", color: C.red },
  ];
  const traces = series.map(s => ({
    type: "scatter", mode: "lines", name: s.name,
    x: S[s.k].dates, y: S[s.k].values,
    line: { color: s.color, width: 1.6 },
    hovertemplate: `${s.name} β=%{y:.2f}<br>%{x}<extra></extra>`,
  }));
  const layout = deepMerge(topLegend(), {
    margin: { l: 52, r: 16, t: 30, b: 36 },
    xaxis: { type: "date" },
    yaxis: { title: { text: "rolling 90d β", font: { size: 11 } }, zeroline: true, zerolinecolor: C.line2 },
  });
  draw(div, traces, layout);
}

/* ---------- 11. GARCH conditional volatility ---------- */
function chartGarch(div, S, R) {
  const g = S.garch_vol;
  const lr = R.garch.long_run_ann_vol;
  const traces = [{
    type: "scatter", mode: "lines", x: g.dates, y: g.values.map(v => v * 100),
    line: { color: C.teal, width: 1.4 }, fill: "tozeroy", fillcolor: "rgba(40,224,180,.08)",
    hovertemplate: "ann. vol %{y:.0f}%<br>%{x}<extra></extra>", name: "σ",
  }];
  const layout = {
    margin: { l: 52, r: 16, t: 14, b: 36 },
    xaxis: { type: "date" },
    yaxis: { title: { text: "annualised volatility (%)", font: { size: 11 } }, ticksuffix: "%" },
    shapes: [{ type: "line", xref: "paper", x0: 0, x1: 1, y0: lr * 100, y1: lr * 100,
      line: { color: C.amber, width: 1.4, dash: "dash" } }],
    annotations: [{ xref: "paper", x: .01, y: lr * 100, text: `long-run σ ≈ ${(lr*100).toFixed(0)}%`,
      showarrow: false, yanchor: "bottom", font: { family: MONO, size: 10.5, color: C.amber } }],
  };
  draw(div, traces, layout);
}

/* ---------- 12. Drawdown / underwater ---------- */
function chartDrawdown(div, S, R) {
  const d = S.drawdown;
  const traces = [{
    type: "scatter", mode: "lines", x: d.dates, y: d.values.map(v => v * 100),
    line: { color: C.red, width: 1 }, fill: "tozeroy", fillcolor: "rgba(255,93,115,.16)",
    hovertemplate: "drawdown %{y:.1f}%<br>%{x}<extra></extra>", name: "dd",
  }];
  const mdd = R.drawdown.max_drawdown * 100;
  const layout = {
    margin: { l: 52, r: 16, t: 14, b: 36 },
    xaxis: { type: "date" },
    yaxis: { title: { text: "drawdown from peak (%)", font: { size: 11 } }, ticksuffix: "%", rangemode: "tozero" },
    annotations: [{ x: R.drawdown.trough, y: mdd, text: `max DD ${mdd.toFixed(0)}%`, showarrow: true,
      arrowcolor: C.red, ax: 40, ay: -20, font: { family: MONO, size: 11, color: C.redSoft } }],
  };
  draw(div, traces, layout);
}

/* ---------- 13. Return distribution vs Normal ---------- */
function chartDistribution(div, R) {
  const h = R.distribution.hist;
  const mu = h.mu, sd = h.sigma;
  const norm = h.centers.map(x => Math.exp(-0.5 * ((x - mu) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI)));
  const traces = [
    { type: "bar", x: h.centers.map(c => c * 100), y: h.density,
      marker: { color: "rgba(91,140,255,.5)", line: { width: 0 } },
      name: "empirical", hovertemplate: "%{x:.1f}%<extra></extra>" },
    { type: "scatter", mode: "lines", x: h.centers.map(c => c * 100), y: norm,
      line: { color: C.amber, width: 2.4 }, name: "Normal fit",
      hovertemplate: "normal<extra></extra>" },
  ];
  const layout = deepMerge(topLegend(), {
    margin: { l: 52, r: 16, t: 30, b: 40 }, bargap: .02,
    xaxis: { title: { text: "MEDC daily return (%)", font: { size: 11 } }, ticksuffix: "%" },
    yaxis: { showticklabels: false, title: { text: "density", font: { size: 11 } } },
    annotations: [{ xref: "paper", yref: "paper", x: .98, y: .96, xanchor: "right", showarrow: false, align: "right",
      text: `excess kurtosis <b>${R.distribution.excess_kurtosis.toFixed(1)}</b> · skew ${R.distribution.skew.toFixed(2)}<br>Jarque–Bera p ${R.distribution.pvalue < 1e-6 ? "< 1e-6" : R.distribution.pvalue.toFixed(3)} → reject normality`,
      font: { family: MONO, size: 10.5, color: C.ink }, bgcolor: "rgba(255,255,255,.92)", bordercolor: C.amber, borderpad: 5, borderwidth: 1 }],
  });
  draw(div, traces, layout);
}

/* ---------- 14. Macro stress scenarios (tornado) ---------- */
function chartStress(div, R) {
  const s = R.stress.slice().sort((a, b) => a.expected_return - b.expected_return);
  const x = s.map(d => d.expected_return * 100);
  const traces = [{
    type: "bar", orientation: "h", x, y: s.map(d => d.name),
    marker: { color: x.map(v => v < 0 ? C.red : C.teal), line: { width: 0 } },
    hovertemplate: "%{y}<br>implied %{x:.1f}%<extra></extra>",
  }];
  const layout = {
    margin: { l: 196, r: 24, t: 14, b: 40 },
    xaxis: { title: { text: "implied MEDC move (weekly-β stress)", font: { size: 11 } }, ticksuffix: "%",
             range: [Math.min(...x) * 1.5, Math.max(2, Math.max(...x) * 1.5)],
             zeroline: true, zerolinecolor: C.line2, zerolinewidth: 1.5 },
    yaxis: { automargin: true, tickfont: { size: 10.5 } },
    // value labels placed just beyond each bar tip (outside), never colliding with category names
    annotations: s.map(d => {
      const xr = d.expected_return * 100;
      return { x: xr, y: d.name, xanchor: xr < 0 ? "right" : "left", xshift: xr < 0 ? -5 : 5,
        showarrow: false, text: `${fmt.pct(d.expected_return,1)} · ${fmt.rp(d.implied_price)}`,
        font: { family: MONO, size: 10.5, color: xr < 0 ? C.redSoft : C.teal } };
    }),
  };
  draw(div, traces, layout);
}

/* ---------- 15. Normalised price vs risk factors ---------- */
function chartPriceIndex(div, S) {
  const p = S.price_index;
  const series = [
    { k: "MEDC", color: C.teal, w: 2.4 }, { k: "Brent", color: C.amber, w: 1.3 },
    { k: "Copper", color: C.gold, w: 1.3 }, { k: "IHSG", color: C.blue, w: 1.3 },
    { k: "USDIDR", color: C.red, w: 1.3 },
  ];
  const traces = series.map(s => ({
    type: "scatter", mode: "lines", name: s.k === "USDIDR" ? "USD/IDR" : s.k,
    x: p.dates, y: p[s.k], line: { color: s.color, width: s.w },
    opacity: s.k === "MEDC" ? 1 : .8,
    hovertemplate: `${s.k} %{y:.0f}<br>%{x}<extra></extra>`,
  }));
  const layout = deepMerge(topLegend(), {
    margin: { l: 52, r: 16, t: 30, b: 36 },
    xaxis: { type: "date" },
    yaxis: { title: { text: "rebased = 100", font: { size: 11 } } },
  });
  draw(div, traces, layout);
}
