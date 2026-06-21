/* Shared Plotly theme + small helpers — LIGHT (white) theme for print/screenshot. */
const C = {
  bg: "#ffffff", panel: "#ffffff", line: "#e6e9ef", line2: "#cbd3df",
  ink: "#0f1722", inkDim: "#475569", inkFaint: "#7b8794",
  teal: "#0e9d78", amber: "#c2700a", gold: "#9a7b1e", red: "#e11d48",
  redSoft: "#d23a5e", blue: "#2563eb", violet: "#7c5cff", green: "#0e9d78",
  box: "rgba(255,255,255,.92)",
};

const FONT = "Inter, system-ui, sans-serif";
const MONO = "JetBrains Mono, ui-monospace, monospace";

/* Base layout applied (merged) to every figure. */
function baseLayout(extra = {}) {
  const l = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: FONT, color: C.inkDim, size: 12 },
    margin: { l: 56, r: 18, t: 16, b: 40 },
    xaxis: {
      gridcolor: "rgba(150,162,184,.28)", zerolinecolor: "rgba(120,132,156,.55)",
      linecolor: C.line2, tickfont: { family: MONO, size: 10.5, color: C.inkFaint },
      automargin: true,
    },
    yaxis: {
      gridcolor: "rgba(150,162,184,.28)", zerolinecolor: "rgba(120,132,156,.55)",
      linecolor: C.line2, tickfont: { family: MONO, size: 10.5, color: C.inkFaint },
      automargin: true,
    },
    hoverlabel: {
      bgcolor: "#ffffff", bordercolor: C.line2,
      font: { family: MONO, size: 12, color: C.ink },
    },
    showlegend: false,
    colorway: [C.teal, C.amber, C.blue, C.red, C.violet, C.gold],
    dragmode: false,
  };
  return deepMerge(l, extra);
}

const PLOT_CONFIG = {
  displayModeBar: false, responsive: true, scrollZoom: false,
  doubleClick: false, staticPlot: false,
};

function deepMerge(a, b) {
  const out = Array.isArray(a) ? a.slice() : Object.assign({}, a);
  for (const k in b) {
    if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && typeof out[k] === "object") {
      out[k] = deepMerge(out[k], b[k]);
    } else out[k] = b[k];
  }
  return out;
}

/* number formatters */
const fmt = {
  pct: (x, d = 1) => (x >= 0 ? "+" : "") + (x * 100).toFixed(d) + "%",
  pctAbs: (x, d = 1) => (x * 100).toFixed(d) + "%",
  rp: (x) => "Rp" + Math.round(x).toLocaleString("en-US"),
  num: (x, d = 2) => Number(x).toFixed(d),
  signed: (x, d = 2) => (x >= 0 ? "+" : "") + Number(x).toFixed(d),
};

/* draw a Plotly chart into a div and register for resize */
function draw(div, data, layout, cfg) {
  Plotly.newPlot(div, data, baseLayout(layout), Object.assign({}, PLOT_CONFIG, cfg));
}
