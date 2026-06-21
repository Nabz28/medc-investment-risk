/* =======================================================================
   panels.js — windowing system: masonry layout + drag + native resize.
   Robust by design: position via left/top, size via CSS `resize:both`,
   chart refit via ResizeObserver -> Plotly.Plots.resize.
   ======================================================================= */
const LM = (() => {
  const GAP = 16;
  const MIN_COL = 430;      // target min column width before adding a column
  let canvas = null;
  let zTop = 50;
  const items = [];         // { el, chart, prefH, userMoved }

  function colCount() {
    const w = canvas.clientWidth;
    if (w < 900) return 0;             // -> mobile static stack
    return Math.max(1, Math.min(3, Math.floor((w + GAP) / (MIN_COL + GAP))));
  }

  function add(el, chartDiv, prefH) {
    const it = { el, chart: chartDiv, prefH, userMoved: false };
    items.push(it);

    // bring-to-front on any pointer interaction
    el.addEventListener("pointerdown", () => front(el), true);

    // native resize -> refit chart
    const ro = new ResizeObserver(() => {
      if (chartDiv && chartDiv.layout) Plotly.Plots.resize(chartDiv);
      growCanvas();
    });
    ro.observe(el);

    // drag by header
    interact(el).draggable({
      allowFrom: ".panel__head",
      listeners: {
        start() { el.classList.add("is-dragging"); front(el); },
        move(ev) {
          if (canvas.classList.contains("static")) return;
          const x = (parseFloat(el.style.left) || 0) + ev.dx;
          const y = (parseFloat(el.style.top) || 0) + ev.dy;
          el.style.left = Math.max(0, x) + "px";
          el.style.top = Math.max(0, y) + "px";
          it.userMoved = true;
        },
        end() { el.classList.remove("is-dragging"); growCanvas(); },
      },
    });
    return it;
  }

  function front(el) {
    el.style.zIndex = ++zTop;
  }

  function tidy(resetSize = false) {
    const cols = colCount();
    if (cols === 0) { // mobile: static stacking handled by CSS
      canvas.classList.add("static");
      canvas.style.height = "auto";
      items.forEach(it => {
        it.el.style.left = it.el.style.top = it.el.style.width = it.el.style.height = "";
        it.userMoved = false;
        if (it.chart && it.chart.layout) setTimeout(() => Plotly.Plots.resize(it.chart), 0);
      });
      return;
    }
    canvas.classList.remove("static");
    const totalGap = GAP * (cols - 1);
    const colW = Math.floor((canvas.clientWidth - totalGap) / cols);
    const yCursor = new Array(cols).fill(0);

    items.forEach(it => {
      // shortest-column masonry
      let c = 0;
      for (let i = 1; i < cols; i++) if (yCursor[i] < yCursor[c]) c = i;
      const h = resetSize ? it.prefH : (it.el.offsetHeight || it.prefH);
      const x = c * (colW + GAP);
      const y = yCursor[c];
      it.el.style.left = x + "px";
      it.el.style.top = y + "px";
      it.el.style.width = colW + "px";
      if (resetSize) it.el.style.height = it.prefH + "px";
      yCursor[c] += (resetSize ? it.prefH : h) + GAP;
      it.userMoved = false;
      if (it.chart && it.chart.layout) setTimeout(() => Plotly.Plots.resize(it.chart), 0);
    });
    canvas.style.height = Math.max(...yCursor) + 20 + "px";
  }

  function growCanvas() {
    if (canvas.classList.contains("static")) return;
    let maxB = 0;
    items.forEach(it => {
      const b = (parseFloat(it.el.style.top) || 0) + it.el.offsetHeight;
      if (b > maxB) maxB = b;
    });
    canvas.style.height = maxB + 30 + "px";
  }

  function init(canvasEl) {
    canvas = canvasEl;
    let t;
    window.addEventListener("resize", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const anyMoved = items.some(i => i.userMoved);
        if (!anyMoved || canvas.classList.contains("static")) tidy(false);
        else items.forEach(it => it.chart && it.chart.layout && Plotly.Plots.resize(it.chart));
      }, 180);
    });
  }

  return { init, add, tidy, reset: () => tidy(true), front };
})();
