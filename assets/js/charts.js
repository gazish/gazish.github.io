// Small SVG chart helpers shared by the dashboard and the decision tool.
// No dependencies. Charts render at the container's pixel width (so text
// stays readable on phones) and re-render when the width changes.
// Colours come from CSS custom properties, so light and dark mode just work.

const SVGNS = 'http://www.w3.org/2000/svg';

export function svg(tag, attrs = {}, parent) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}

export function h(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
}

/* ---------- number formatting ---------- */
const nf0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
export const fmt = {
  int: (v) => nf0.format(v),
  gbp: (v) => (v < 0 ? '−' : '') + '£' + nf0.format(Math.abs(v)),
  gbpCompact(v) {
    const a = Math.abs(v), sign = v < 0 ? '−' : '';
    if (a >= 1e6) return sign + '£' + (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M';
    if (a >= 1e3) return sign + '£' + (a / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'k';
    return sign + '£' + a.toFixed(0);
  },
  compact(v) {
    const a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (a >= 1e4) return Math.round(v / 1e3) + 'k';
    return nf0.format(v);
  },
  pct: (v, d = 1) => (v * 100).toFixed(d) + '%',
  signedPct: (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v * 100).toFixed(d) + '%',
  signedPts: (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v * 100).toFixed(d) + ' pts',
  one: (v) => nf1.format(v),
};

/* ---------- scales ---------- */
export function linear(d0, d1, r0, r1) {
  const k = (r1 - r0) / ((d1 - d0) || 1);
  const f = (v) => r0 + (v - d0) * k;
  f.invert = (p) => d0 + (p - r0) / k;
  return f;
}

export function niceTicks(min, max, count = 5) {
  if (max === min) { max = min + 1; }
  const span = max - min;
  const step0 = span / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const err = step0 / mag;
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
  return ticks;
}

/* ---------- responsive mount ---------- */
// Calls draw(width) now and whenever the container width changes.
export function mount(container, draw) {
  let last = 0;
  const run = () => {
    const w = Math.round(container.clientWidth);
    if (w && w !== last) { last = w; draw(w); }
  };
  if (container._ro) container._ro.disconnect(); // one observer per container, even after re-renders
  if ('ResizeObserver' in window) { container._ro = new ResizeObserver(run); container._ro.observe(container); }
  run();
  return { redraw() { last = 0; run(); } };
}

/* ---------- tooltip ---------- */
export function tooltip(host) {
  host.classList.add('chart-host');
  const tip = h('div', { class: 'chart-tip', 'aria-hidden': 'true' });
  // the visual tooltip is hidden from screen readers; this live region reads the same values out
  const live = h('div', { class: 'visually-hidden', 'aria-live': 'polite' });
  host.append(tip, live);
  return {
    show(x, y, title, rows) {
      live.textContent = [title, ...rows.map((r) => (r.label ? r.label + ': ' : '') + r.value)].filter(Boolean).join('. ');
      tip.replaceChildren();
      if (title) tip.appendChild(h('div', { class: 'tip-title', text: title }));
      for (const r of rows) {
        const row = h('div', { class: 'tip-row' });
        if (r.key) row.appendChild(h('span', { class: 'tip-key ' + (r.keyClass || ''), style: r.keyStyle || '' }));
        row.appendChild(h('span', { class: 'tip-val', text: r.value }));
        if (r.label) row.appendChild(h('span', { class: 'tip-lab', text: r.label }));
        tip.appendChild(row);
      }
      tip.classList.add('on');
      const hw = host.clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
      let left = x + 14;
      if (left + tw > hw - 4) left = Math.max(4, x - tw - 14);
      let top = Math.max(4, y - th - 10);
      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
    },
    hide() { tip.classList.remove('on'); },
  };
}

/* ---------- bar path with a rounded data end ---------- */
export function hBarPath(x0, x1, y, hgt, r = 4) {
  const w = Math.abs(x1 - x0);
  r = Math.min(r, w / 2, hgt / 2);
  if (w < 0.5) return '';
  if (x1 >= x0) return `M${x0},${y}H${x1 - r}Q${x1},${y} ${x1},${y + r}V${y + hgt - r}Q${x1},${y + hgt} ${x1 - r},${y + hgt}H${x0}Z`;
  return `M${x0},${y}H${x1 + r}Q${x1},${y} ${x1},${y + r}V${y + hgt - r}Q${x1},${y + hgt} ${x1 + r},${y + hgt}H${x0}Z`;
}
export function vBarPath(x, w, y0, y1, r = 4) {
  // y0 = baseline (bottom), y1 = top (data end)
  const hgt = y0 - y1;
  r = Math.min(r, w / 2, Math.abs(hgt) / 2);
  if (Math.abs(hgt) < 0.5) return '';
  return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
}

/* ---------- line chart with crosshair ---------- */
// opts: { labels: [...x labels], series: [{name, values, cls, emphasis, keyClass}],
//         yFormat, tipTitle(i), height, yMin, ariaLabel, xTickEvery }
export function lineChart(container, opts) {
  container.replaceChildren();
  const tip = tooltip(container);
  let state = { i: null };
  const plot = h('div', { class: 'chart-plot', tabindex: '0', role: 'img', 'aria-label': opts.ariaLabel || '' });
  container.appendChild(plot);

  const draw = (W) => {
    plot.replaceChildren();
    const H = opts.height || 260;
    const m = { t: 12, r: opts.rightPad ?? 16, b: 28, l: opts.leftPad ?? 52 };
    const n = opts.labels.length;
    const all = opts.series.flatMap((s) => s.values.filter((v) => v != null));
    let yMin = opts.yMin ?? Math.min(0, ...all);
    const ticks = niceTicks(yMin, Math.max(...all), 4);
    const x = linear(0, n - 1, m.l, W - m.r);
    const y = linear(ticks[0], ticks[ticks.length - 1], H - m.b, m.t);
    const s = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', 'aria-hidden': 'true' }, plot);
    for (const t of ticks) {
      svg('line', { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), class: t === 0 ? 'axis-line' : 'grid-line' }, s);
      svg('text', { x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end', class: 'tick' }, s).textContent = (opts.yTick || opts.yFormat)(t);
    }
    const every = opts.xTickEvery || Math.ceil(n / Math.max(2, Math.floor((W - m.l - m.r) / 56)));
    opts.labels.forEach((lab, i) => {
      if (i % every === 0 || i === n - 1 && n - 1 - (Math.floor((n - 1) / every) * every) >= every / 2) {
        svg('text', { x: x(i), y: H - 8, 'text-anchor': 'middle', class: 'tick' }, s).textContent = lab;
      }
    });
    // context series first, emphasis last so it sits on top
    const ordered = [...opts.series].sort((a, b) => (a.emphasis ? 1 : 0) - (b.emphasis ? 1 : 0));
    for (const se of ordered) {
      let d = '';
      se.values.forEach((v, i) => { if (v == null) return; d += (d && se.values[i - 1] != null ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1); });
      if (se.area) {
        const idx = se.values.map((v, i) => (v == null ? null : i)).filter((i) => i != null);
        const ad = d + `L${x(idx[idx.length - 1])},${y(Math.max(0, ticks[0]))}L${x(idx[0])},${y(Math.max(0, ticks[0]))}Z`;
        svg('path', { d: ad, class: 'area ' + (se.cls || '') }, s);
      }
      svg('path', { d, class: 'line ' + (se.cls || '') }, s);
      if (se.endLabel) {
        let li = se.values.length - 1; while (li > 0 && se.values[li] == null) li--;
        svg('circle', { cx: x(li), cy: y(se.values[li]), r: 4, class: 'dot ' + (se.cls || '') }, s);
      }
    }
    const cross = svg('line', { y1: m.t, y2: H - m.b, class: 'crosshair' }, s);
    const dots = opts.series.map((se) => svg('circle', { r: 4, class: 'dot hover-dot ' + (se.cls || ''), style: 'display:none' }, s));
    const hit = svg('rect', { x: m.l, y: 0, width: W - m.l - m.r, height: H, fill: 'transparent' }, s);

    const showAt = (i) => {
      i = Math.max(0, Math.min(n - 1, i));
      state.i = i;
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.classList.add('on');
      opts.series.forEach((se, k) => {
        const v = se.values[i];
        if (v == null) { dots[k].style.display = 'none'; return; }
        dots[k].style.display = ''; dots[k].setAttribute('cx', x(i)); dots[k].setAttribute('cy', y(v));
      });
      const rows = opts.series.filter((se) => se.values[i] != null).map((se) => ({ key: true, keyClass: 'k-line ' + (se.cls || ''), value: opts.yFormat(se.values[i]), label: se.name }));
      tip.show(x(i), Math.min(...opts.series.map((se) => (se.values[i] == null ? H : y(se.values[i])))), opts.tipTitle ? opts.tipTitle(i) : opts.labels[i], rows);
    };
    const hide = () => { cross.classList.remove('on'); dots.forEach((d) => (d.style.display = 'none')); tip.hide(); };
    hit.addEventListener('pointermove', (e) => {
      const r = s.getBoundingClientRect();
      showAt(Math.round(x.invert(e.clientX - r.left)));
    });
    hit.addEventListener('pointerleave', hide);
    plot.onkeydown = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        showAt((state.i ?? (e.key === 'ArrowRight' ? -1 : n)) + (e.key === 'ArrowRight' ? 1 : -1));
      } else if (e.key === 'Escape') hide();
    };
    plot.onfocus = () => showAt(state.i ?? n - 1);
    plot.onblur = hide;
  };
  return mount(container, draw);
}

/* ---------- horizontal bar chart (ranked) ---------- */
// opts: { rows: [{label, value, cls, note}], format, height per bar, ariaLabel, max }
export function hBarChart(container, opts) {
  container.replaceChildren();
  const tip = tooltip(container);
  const plot = h('div', { class: 'chart-plot', role: 'img', 'aria-label': opts.ariaLabel || '' });
  container.appendChild(plot);
  const draw = (W) => {
    plot.replaceChildren();
    const rowH = opts.rowHeight || 30, bar = Math.min(18, rowH - 10);
    const labelW = Math.min(opts.labelWidth || 150, W * 0.42);
    const valueW = opts.valueWidth || 64;
    const H = opts.rows.length * rowH + 8;
    const vals = opts.rows.map((r) => r.value);
    const lo = opts.min ?? Math.min(0, ...vals), hi = opts.max ?? Math.max(0, ...vals);
    const x = linear(lo, hi, labelW + 8, W - valueW);
    const s = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', 'aria-hidden': 'true' }, plot);
    svg('line', { x1: x(0), x2: x(0), y1: 2, y2: H - 4, class: 'axis-line' }, s);
    opts.rows.forEach((r, i) => {
      const yy = i * rowH + 4;
      const lab = svg('text', { x: labelW, y: yy + rowH / 2 + 2, 'text-anchor': 'end', class: 'bar-label' }, s);
      lab.textContent = r.label;
      const p = svg('path', { d: hBarPath(x(0), x(r.value), yy + (rowH - bar) / 2, bar), class: 'bar ' + (r.cls || 'fill-accent') }, s);
      // with negative values, all value labels sit in a column on the right so they never hit the row labels
      const right = lo < 0;
      const vx = right ? W - valueW + 8 : r.value >= 0 ? x(r.value) + 6 : x(r.value) - 6;
      const vt = svg('text', { x: vx, y: yy + rowH / 2 + 2, 'text-anchor': right || r.value >= 0 ? 'start' : 'end', class: 'bar-value' }, s);
      vt.textContent = opts.format(r.value);
      const hit = svg('rect', { x: 0, y: yy, width: W, height: rowH, fill: 'transparent' }, s);
      hit.addEventListener('pointermove', (e) => {
        const b = s.getBoundingClientRect();
        p.classList.add('hover');
        tip.show(e.clientX - b.left, yy, r.label, [{ value: opts.format(r.value), label: opts.valueName || '' }, ...(r.note ? [{ value: r.note }] : [])]);
      });
      hit.addEventListener('pointerleave', () => { p.classList.remove('hover'); tip.hide(); });
    });
  };
  return mount(container, draw);
}

/* ---------- stacked columns ---------- */
// opts: { labels, series: [{name, values, cls}], format, height, ariaLabel, tipTitle(i) }
export function stackedColumns(container, opts) {
  container.replaceChildren();
  const tip = tooltip(container);
  const plot = h('div', { class: 'chart-plot', tabindex: '0', role: 'img', 'aria-label': opts.ariaLabel || '' });
  container.appendChild(plot);
  let cur = null;
  const draw = (W) => {
    plot.replaceChildren();
    const H = opts.height || 240;
    const m = { t: 10, r: 8, b: 28, l: 52 };
    const n = opts.labels.length;
    const totals = opts.labels.map((_, i) => opts.series.reduce((a, se) => a + (se.values[i] || 0), 0));
    const ticks = niceTicks(0, Math.max(...totals), 4);
    const band = (W - m.l - m.r) / n;
    const bw = Math.min(24, band * 0.68);
    const y = linear(0, ticks[ticks.length - 1], H - m.b, m.t);
    const s = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', 'aria-hidden': 'true' }, plot);
    for (const t of ticks) {
      svg('line', { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), class: t === 0 ? 'axis-line' : 'grid-line' }, s);
      svg('text', { x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end', class: 'tick' }, s).textContent = (opts.yTick || opts.format)(t);
    }
    const every = Math.ceil(n / Math.max(2, Math.floor((W - m.l - m.r) / 48)));
    const groups = [];
    opts.labels.forEach((lab, i) => {
      const cx = m.l + band * i + band / 2;
      if (i % every === 0) svg('text', { x: cx, y: H - 8, 'text-anchor': 'middle', class: 'tick' }, s).textContent = lab;
      const g = svg('g', { class: 'col' }, s);
      let acc = 0;
      const top = opts.series.reduce((k, se, j) => (se.values[i] > 0 ? j : k), -1);
      opts.series.forEach((se, j) => {
        const v = se.values[i] || 0;
        if (v <= 0) return;
        const y0 = y(acc), y1 = y(acc + v);
        acc += v;
        const gap = j > 0 ? 1 : 0; // 2px surface gap shared between neighbours
        const d = j === top ? vBarPath(cx - bw / 2, bw, y0 - gap, y1) : `M${cx - bw / 2},${y0 - gap}V${y1 + 1}H${cx + bw / 2}V${y0 - gap}Z`;
        svg('path', { d, class: 'bar ' + se.cls }, g);
      });
      groups.push(g);
      const hit = svg('rect', { x: m.l + band * i, y: 0, width: band, height: H, fill: 'transparent' }, s);
      hit.addEventListener('pointermove', () => show(i));
      hit.addEventListener('pointerleave', hide);
    });
    function show(i) {
      cur = i;
      groups.forEach((g, k) => g.classList.toggle('dim', k !== i));
      const cx = m.l + band * i + band / 2;
      const rows = opts.series.map((se) => ({ key: true, keyClass: 'k-box ' + se.cls, value: opts.format(se.values[i] || 0), label: se.name }));
      rows.push({ value: opts.format(totals[i]), label: 'Total' });
      tip.show(cx, y(totals[i]), opts.tipTitle ? opts.tipTitle(i) : opts.labels[i], rows);
    }
    function hide() { groups.forEach((g) => g.classList.remove('dim')); tip.hide(); }
    plot.onkeydown = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        show(Math.max(0, Math.min(n - 1, (cur ?? (e.key === 'ArrowRight' ? -1 : n)) + (e.key === 'ArrowRight' ? 1 : -1))));
      } else if (e.key === 'Escape') hide();
    };
    plot.onfocus = () => show(cur ?? n - 1);
    plot.onblur = hide;
  };
  return mount(container, draw);
}

/* ---------- heatmap ---------- */
// opts: { rowLabels, colLabels, values (rows x cols, null = empty), format, max, ariaLabel,
//         rowTitle(r), colTitle(c), cellLabel(v) }
export function heatmap(container, opts) {
  container.replaceChildren();
  const tip = tooltip(container);
  const plot = h('div', { class: 'chart-plot heat-plot', tabindex: '0', role: 'img', 'aria-label': opts.ariaLabel || '' });
  container.appendChild(plot);
  let cur = null;
  const draw = (W) => {
    plot.replaceChildren();
    const R = opts.rowLabels.length, C = opts.colLabels.length;
    const labelW = Math.min(opts.labelWidth || 64, W * 0.38);
    const cw = Math.max(18, (W - labelW - 4) / C);
    const ch = opts.cellHeight || 22;
    const top = 22;
    const H = top + R * ch + 4;
    const s = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', 'aria-hidden': 'true' }, plot);
    const showText = cw >= 34;
    opts.colLabels.forEach((c, j) => {
      svg('text', { x: labelW + cw * j + cw / 2, y: 14, 'text-anchor': 'middle', class: 'tick' }, s).textContent = c;
    });
    const cells = [];
    opts.rowLabels.forEach((rl, i) => {
      const maxChars = Math.max(4, Math.floor((labelW - 8) / 6));
      svg('text', { x: labelW - 8, y: top + ch * i + ch / 2 + 4, 'text-anchor': 'end', class: 'tick' }, s).textContent = rl.length > maxChars ? rl.slice(0, maxChars - 1) + '…' : rl;
      cells[i] = [];
      opts.values[i].forEach((v, j) => {
        if (v == null) return;
        const a = Math.max(0.06, Math.min(1, v / opts.max));
        // --heat-max caps the darkest cell per theme so the text on it keeps enough contrast
        const r = svg('rect', { x: labelW + cw * j + 1, y: top + ch * i + 1, width: cw - 2, height: ch - 2, rx: 3, class: 'heat-cell', style: `fill-opacity:calc(var(--heat-max) * ${a.toFixed(3)})` }, s);
        cells[i][j] = r;
        if (showText && (opts.textFor ? opts.textFor(i, j) : true)) {
          const t = svg('text', { x: labelW + cw * j + cw / 2, y: top + ch * i + ch / 2 + 4, 'text-anchor': 'middle', class: 'heat-text' }, s);
          t.textContent = opts.cellLabel ? opts.cellLabel(v) : opts.format(v);
        }
        r.addEventListener('pointermove', () => show(i, j));
        r.addEventListener('pointerleave', hide);
      });
    });
    function show(i, j) {
      const v = opts.values[i][j];
      if (v == null) return;
      cur = [i, j];
      cells.flat().forEach((c) => c && c.classList.remove('hover'));
      cells[i][j].classList.add('hover');
      tip.show(labelW + cw * j + cw / 2, top + ch * i, opts.rowTitle ? opts.rowTitle(i) : opts.rowLabels[i],
        [{ value: opts.format(v), label: opts.colTitle ? opts.colTitle(j) : opts.colLabels[j] }, ...(opts.extra ? opts.extra(i, j) : [])]);
    }
    function hide() { cells.flat().forEach((c) => c && c.classList.remove('hover')); tip.hide(); }
    plot.onkeydown = (e) => {
      const map = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
      if (map[e.key]) {
        e.preventDefault();
        let [i, j] = cur || [0, 0];
        const [di, dj] = map[e.key];
        let ni = Math.max(0, Math.min(R - 1, i + di)), nj = Math.max(0, Math.min(C - 1, j + dj));
        if (opts.values[ni][nj] == null) { ni = i; nj = j; }
        show(ni, nj);
      } else if (e.key === 'Escape') hide();
    };
    plot.onfocus = () => { const [i, j] = cur || [0, 0]; show(i, j); };
    plot.onblur = hide;
  };
  return mount(container, draw);
}

/* ---------- table view (accessible twin of a chart) ---------- */
export function dataTable(caption, columns, rows) {
  const t = h('table');
  if (caption) t.appendChild(h('caption', { text: caption }));
  const thead = h('thead'); const tr = h('tr');
  columns.forEach((c) => tr.appendChild(h('th', { scope: 'col', class: c.num ? 'n' : '', text: c.label })));
  thead.appendChild(tr); t.appendChild(thead);
  const tb = h('tbody');
  rows.forEach((r) => {
    const row = h('tr');
    columns.forEach((c, k) => {
      const v = typeof c.get === 'function' ? c.get(r) : r[c.key];
      row.appendChild(h(k === 0 ? 'th' : 'td', { scope: k === 0 ? 'row' : null, class: c.num ? 'n' : '', text: v }));
    });
    tb.appendChild(row);
  });
  t.appendChild(tb);
  // scrollable regions must be reachable by keyboard
  return h('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': caption || 'Data table' }, t);
}

// A figure with a title, the chart, a legend slot and a "Show table" toggle.
// Re-rendering into the same host reuses the shell, so an open table stays open.
export function figureShell(host, { title, subtitle, id, level = 3 }) {
  let sh = host._shell;
  if (!sh) {
    host.replaceChildren();
    const tableId = id + '-table';
    const btn = h('button', { type: 'button', class: 'btn btn-small table-toggle', 'aria-expanded': 'false', 'aria-controls': tableId, text: 'Show table' });
    const titleEl = h('h' + level, { class: 'fig-title', id: id + '-title' });
    const subEl = h('p', { class: 'fig-sub' });
    const head = h('div', { class: 'fig-head' }, h('div', {}, titleEl, subEl), btn);
    const legendEl = h('div', { class: 'fig-legend' });
    const chart = h('div', { class: 'fig-chart' });
    const table = h('div', { class: 'fig-table', id: tableId, hidden: true });
    btn.addEventListener('click', () => {
      const open = table.hidden;
      table.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? 'Hide table' : 'Show table';
    });
    host.append(head, legendEl, chart, table);
    sh = host._shell = { chart, legend: legendEl, table, titleEl, subEl };
  }
  sh.titleEl.textContent = title;
  sh.subEl.textContent = subtitle || '';
  sh.subEl.hidden = !subtitle;
  sh.chart.replaceChildren();
  sh.legend.replaceChildren();
  return sh;
}

export function legend(host, items) {
  host.replaceChildren(...items.map((it) => h('span', { class: 'lg-item' }, h('span', { class: 'lg-key ' + (it.line ? 'k-line ' : 'k-box ') + it.cls, 'aria-hidden': 'true' }), it.name)));
}
