/* Shared Plotly theme + small helpers — keeps every chart visually consistent. */
const C = {
  bg: "#0e1421", panel: "#111a2b", line: "#1d2940", line2: "#2a3a59",
  ink: "#eaf0fb", inkDim: "#9fb0cc", inkFaint: "#64748b",
  teal: "#28e0b4", amber: "#ffb454", gold: "#f5d77a", red: "#ff5d73",
  redSoft: "#ff8499", blue: "#5b8cff", violet: "#9b8cff", green: "#39d98a",
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
      gridcolor: "rgba(42,58,89,.4)", zerolinecolor: "rgba(42,58,89,.8)",
      linecolor: C.line2, tickfont: { family: MONO, size: 10.5, color: C.inkFaint },
      automargin: true,
    },
    yaxis: {
      gridcolor: "rgba(42,58,89,.4)", zerolinecolor: "rgba(42,58,89,.8)",
      linecolor: C.line2, tickfont: { family: MONO, size: 10.5, color: C.inkFaint },
      automargin: true,
    },
    hoverlabel: {
      bgcolor: "#0b0f17", bordercolor: C.line2,
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
