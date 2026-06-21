/* =======================================================================
   panels.js — section-grouped masonry + drag + native resize.
   Panels carry a `section` ('paper' | 'appendix'); each section gets a header
   row and its own masonry block, stacked vertically.
   ======================================================================= */
const LM = (() => {
  const GAP = 16, SECTION_GAP = 40;
  const MIN_COL = 430;      // target min column width before adding a column
  const SECTIONS = ["paper", "appendix"];
  let canvas = null;
  let zTop = 50;
  const items = [];         // { el, chart, prefH, section, userMoved }
  const headers = {};       // section -> header element

  function colCount() {
    const w = canvas.clientWidth;
    if (w < 900) return 0;             // -> mobile static stack
    return Math.max(1, Math.min(3, Math.floor((w + GAP) / (MIN_COL + GAP))));
  }

  function registerHeader(section, el) { headers[section] = el; }

  function add(el, chartDiv, prefH, section) {
    const it = { el, chart: chartDiv, prefH, section: section || "paper", userMoved: false };
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
      SECTIONS.forEach(s => { if (headers[s]) headers[s].style.left = headers[s].style.top = headers[s].style.width = ""; });
      return;
    }
    canvas.classList.remove("static");
    const totalGap = GAP * (cols - 1);
    const colW = Math.floor((canvas.clientWidth - totalGap) / cols);
    let cursorY = 0;

    SECTIONS.forEach(sec => {
      const secItems = items.filter(i => i.section === sec);
      if (!secItems.length) return;
      const h = headers[sec];
      if (h) {
        h.style.left = "0px"; h.style.top = cursorY + "px"; h.style.width = canvas.clientWidth + "px";
        cursorY += h.offsetHeight + 10;
      }
      const yC = new Array(cols).fill(cursorY);
      secItems.forEach(it => {
        let c = 0;
        for (let i = 1; i < cols; i++) if (yC[i] < yC[c]) c = i;
        const ph = resetSize ? it.prefH : (it.el.offsetHeight || it.prefH);
        it.el.style.left = (c * (colW + GAP)) + "px";
        it.el.style.top = yC[c] + "px";
        it.el.style.width = colW + "px";
        if (resetSize) it.el.style.height = it.prefH + "px";
        yC[c] += (resetSize ? it.prefH : ph) + GAP;
        it.userMoved = false;
        if (it.chart && it.chart.layout) setTimeout(() => Plotly.Plots.resize(it.chart), 0);
      });
      cursorY = Math.max(...yC) + SECTION_GAP;
    });
    canvas.style.height = cursorY + "px";
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

  return { init, add, registerHeader, tidy, reset: () => tidy(true), front };
})();
