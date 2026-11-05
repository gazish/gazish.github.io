// Decision analysis tool: interface. The maths lives in mcda.js.
import * as M from './mcda.js';
import { encodeState, decodeState, LIMITS } from './share.js';
import { h, svg, fmt, mount, tooltip, hBarPath, heatmap, dataTable, figureShell, legend } from '/assets/js/charts.js';

/* ---------- example (illustrative, made-up numbers) ---------- */
const EXAMPLE = {
  alternatives: [
    'Green roofs',
    'Street trees and parks',
    'Retention ponds',
    'Bigger sewer pipes',
    'Early-warning system',
  ],
  criteria: [
    { id: 'c1', name: 'Cost', unit: 'MSEK', dir: 'min', unc: 0.05 },
    { id: 'c2', name: 'Flood protection', unit: '0 to 10', dir: 'max', unc: 0.05 },
    { id: 'c3', name: 'Heat relief', unit: '0 to 10', dir: 'max', unc: 0.05 },
    { id: 'c4', name: 'Co-benefits', unit: '0 to 10', dir: 'max', unc: 0.15 },
    { id: 'c5', name: 'Time to effect', unit: 'years', dir: 'min', unc: 0.05 },
  ],
  matrix: [
    [45, 4, 6, 7, 3],
    [30, 3, 8, 9, 10],
    [60, 8, 3, 7, 4],
    [120, 9, 0, 1, 6],
    [8, 3, 4, 1, 1],
  ],
  points: [25, 30, 20, 15, 10],
  // AHP judgements as slider positions: negative = left criterion more important
  pairs: { 'c1|c2': 1, 'c1|c3': -1, 'c1|c4': -1, 'c1|c5': -2, 'c2|c3': -1, 'c2|c4': -2, 'c2|c5': -3, 'c3|c4': -1, 'c3|c5': -1, 'c4|c5': -1 },
  method: 'direct',
};

const UNC = [
  { v: 0, label: 'None' },
  { v: 0.05, label: 'Low ±5%' },
  { v: 0.15, label: 'Medium ±15%' },
  { v: 0.3, label: 'High ±30%' },
];
const KAPPA = [
  { v: 0, label: 'Fixed at the current weights', hint: 'Only the table values vary.' },
  { v: 200, label: 'Small changes', hint: 'Standard deviation about 3 percentage points for a 30% weight.' },
  { v: 50, label: 'Moderate changes', hint: 'Standard deviation about 6 percentage points for a 30% weight.' },
  { v: 10, label: 'Large changes', hint: 'Standard deviation about 14 percentage points for a 30% weight.' },
  { v: 'uniform', label: 'Any weights at all', hint: 'Weights drawn uniformly from all possible weight vectors (no preference information).' },
];
const VERBAL = { 2: 'slightly', 3: 'moderately', 4: 'moderately to strongly', 5: 'strongly', 6: 'strongly to very strongly', 7: 'very strongly', 8: 'very to extremely', 9: 'extremely' };
const MAX_ALTS = LIMITS.maxAlts, MAX_CRIT = LIMITS.maxCrit;
// categorical slots without orange, which is the site's accent colour (validated for colour blindness)
const SLOTS = [1, 3, 4, 7, 5, 6, 8];
const CLS = (j) => 'c-s' + SLOTS[j];

let S = clone(EXAMPLE);
let sensCrit = 2;
let mc = { kappa: 50, scores: true, samples: 5000 };
let nextId = 6;

function clone(o) { return JSON.parse(JSON.stringify(o)); }
const $ = (id) => document.getElementById(id);

/* ---------- state helpers ---------- */
const pairKey = (i, j) => S.criteria[i].id + '|' + S.criteria[j].id;
const posToRatio = (p) => (p <= 0 ? 1 - p : 1 / (1 + p));
const ratioToPos = (a) => (a >= 1 ? 1 - Math.round(a) : Math.round(1 / a) - 1);

function ahpResult() {
  const n = S.criteria.length;
  const A = M.pairwiseMatrix(n, (i, j) => posToRatio(S.pairs[pairKey(i, j)] ?? 0));
  const r = M.ahp(A);
  return { ...r, A, worst: n > 2 ? M.worstJudgement(A, r.weights) : null };
}
function weights() {
  return S.method === 'ahp' ? ahpResult().weights : M.normalizeWeights(S.points);
}
function model() {
  const w = weights();
  const v = M.valueMatrix(S.matrix, S.criteria);
  const scores = M.weightedSum(v, w);
  const rk = M.ranks(scores);
  const order = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
  return { w, v, scores, rk, order, top: order[0] };
}

/* ---------- inputs: performance table ---------- */
function renderTable() {
  const host = $('perf-table');
  const rmBtn = (c) => (S.criteria.length > 2 ? h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Remove criterion ${c.name}`, title: 'Remove criterion', onclick: () => removeCriterion(S.criteria.indexOf(c)) }, '×') : null);
  const thead = h('thead', {},
    h('tr', {},
      h('th', { scope: 'row', class: 'opt-col row-lab' }, 'Criterion'),
      S.criteria.map((c, j) => h('th', { scope: 'col', class: 'crit-col' },
        h('div', { class: 'crit-head' },
          h('span', { class: 'k-box ' + CLS(j), 'aria-hidden': 'true' }),
          h('input', { type: 'text', value: c.name, title: c.name, 'aria-label': `Criterion ${j + 1} name`, class: 'in-name', oninput: (e) => { c.name = e.target.value; e.target.title = c.name; renderWeights(); update(); } }),
          rmBtn(c))))),
    h('tr', { class: 'meta-row' },
      h('th', { scope: 'row', class: 'opt-col row-lab' }, 'Unit'),
      S.criteria.map((c) => h('td', {}, h('input', { type: 'text', value: c.unit, 'aria-label': `${c.name}: unit`, class: 'in-unit', placeholder: 'unit', oninput: (e) => { c.unit = e.target.value; } })))),
    h('tr', { class: 'meta-row' },
      h('th', { scope: 'row', class: 'opt-col row-lab' }, 'Better when'),
      S.criteria.map((c) => h('td', {}, h('select', { 'aria-label': `${c.name}: direction`, onchange: (e) => { c.dir = e.target.value; update(); } },
        h('option', { value: 'max', selected: c.dir === 'max' }, 'Higher'),
        h('option', { value: 'min', selected: c.dir === 'min' }, 'Lower'))))),
    h('tr', { class: 'meta-row' },
      h('th', { scope: 'row', class: 'opt-col row-lab' }, 'Uncertainty (± share of range)'),
      S.criteria.map((c) => h('td', {}, h('select', { 'aria-label': `${c.name}: uncertainty of the values`, onchange: (e) => { c.unc = +e.target.value; updateMc(); } },
        UNC.map((u) => h('option', { value: u.v, selected: c.unc === u.v }, u.label)))))),
    h('tr', { class: 'opt-row-head' },
      h('th', { scope: 'col', class: 'opt-col row-lab' }, 'Option'),
      S.criteria.map((c) => h('th', { scope: 'col', class: 'unit-hint' }, c.unit ? c.unit : ''))));
  const tbody = h('tbody', {}, S.alternatives.map((a, i) => h('tr', {},
    h('th', { scope: 'row', class: 'opt-col' },
      h('div', { class: 'opt-head' },
        h('input', { type: 'text', value: a, title: a, 'aria-label': `Option ${i + 1} name`, class: 'in-name', oninput: (e) => { S.alternatives[i] = e.target.value; e.target.title = e.target.value; update(); } }),
        S.alternatives.length > 2 ? h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Remove option ${a}`, title: 'Remove option', onclick: () => removeAlternative(i) }, '×') : null)),
    S.criteria.map((c, j) => h('td', {},
      h('input', {
        type: 'number', step: 'any', inputmode: 'decimal', value: S.matrix[i][j], class: 'in-num',
        'aria-label': `${S.alternatives[i]}, ${c.name}`,
        oninput: (e) => {
          const x = parseFloat(e.target.value);
          if (Number.isFinite(x)) { S.matrix[i][j] = x; e.target.removeAttribute('aria-invalid'); update(); }
          else e.target.setAttribute('aria-invalid', 'true');
        },
      }))))));
  host.replaceChildren(h('table', { class: 'perf' }, h('caption', { class: 'visually-hidden', text: 'Performance of each option on each criterion. All cells are editable.' }), thead, tbody));
  updateScrollHint();
  $('add-alt').disabled = S.alternatives.length >= MAX_ALTS;
  $('add-crit').disabled = S.criteria.length >= MAX_CRIT;
}

function updateScrollHint() {
  const wrap = $('perf-table');
  $('scroll-hint').hidden = !(wrap.scrollWidth > wrap.clientWidth + 1);
}
if ('ResizeObserver' in window) new ResizeObserver(() => updateScrollHint()).observe(document.documentElement);

function addAlternative() {
  if (S.alternatives.length >= MAX_ALTS) return;
  S.alternatives.push('New option ' + (S.alternatives.length + 1));
  S.matrix.push(S.criteria.map((_, j) => median(S.matrix.map((r) => r[j]))));
  renderAll();
  const inputs = $('perf-table').querySelectorAll('tbody tr:last-child input');
  if (inputs[0]) inputs[0].focus();
}
function removeAlternative(i) {
  S.alternatives.splice(i, 1); S.matrix.splice(i, 1);
  renderAll();
  $('add-alt').focus();
}
function addCriterion() {
  if (S.criteria.length >= MAX_CRIT) return;
  const id = 'c' + nextId++;
  S.criteria.push({ id, name: 'New criterion', unit: '', dir: 'max', unc: 0.15 });
  S.matrix.forEach((r) => r.push(5));
  S.points.push(10);
  renderAll();
  const inputs = $('perf-table').querySelectorAll('thead .in-name');
  inputs[inputs.length - 1].focus();
}
function removeCriterion(j) {
  S.criteria.splice(j, 1); S.matrix.forEach((r) => r.splice(j, 1)); S.points.splice(j, 1);
  if (sensCrit >= S.criteria.length) sensCrit = 0;
  renderAll();
  $('add-crit').focus();
}
function median(a) { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; }

/* ---------- inputs: weights ---------- */
function renderWeights() {
  document.querySelectorAll('input[name="wmethod"]').forEach((r) => { r.checked = r.value === S.method; });
  $('panel-direct').hidden = S.method !== 'direct';
  $('panel-ahp').hidden = S.method !== 'ahp';
  // direct
  const w = M.normalizeWeights(S.points);
  $('direct-list').replaceChildren(...S.criteria.map((c, j) => {
    const id = 'pt-' + c.id;
    const out = h('output', { for: id, class: 'w-out', id: id + '-out', text: fmt.pct(w[j], 0) });
    return h('div', { class: 'w-row' },
      h('label', { for: id, class: 'w-label' }, h('span', { class: 'k-box ' + CLS(j), 'aria-hidden': 'true' }),
        h('span', {}, c.name, h('span', { class: 'w-range', text: rangeText(j) }))),
      h('input', { type: 'range', id, min: 0, max: 100, step: 1, value: S.points[j], 'aria-describedby': id + '-out',
        oninput: (e) => { S.points[j] = +e.target.value; refreshDirectOutputs(); update(); } }),
      out);
  }));
  // AHP
  const n = S.criteria.length;
  const rows = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) rows.push(pairRow(i, j));
  $('ahp-list').replaceChildren(...rows);
  renderAhpSummary();
}
function rangeText(j) {
  const col = S.matrix.map((r) => r[j]);
  const c = S.criteria[j];
  const lo = Math.min(...col), hi = Math.max(...col);
  if (!(hi > lo)) return 'same value for every option, so it makes no difference';
  const [worst, best] = c.dir === 'min' ? [hi, lo] : [lo, hi];
  return `from ${fmtNum(worst)} to ${fmtNum(best)}${c.unit && !/to/.test(c.unit) ? ' ' + c.unit : ''}`;
}
const fmtNum = (x) => (Math.abs(x) >= 100 ? Math.round(x) : +x.toFixed(2)).toLocaleString('en-GB');
function refreshDirectOutputs() {
  const w = M.normalizeWeights(S.points);
  S.criteria.forEach((c, j) => { const o = $('pt-' + c.id + '-out'); if (o) o.textContent = fmt.pct(w[j], 0); });
}
function pairText(i, j, p) {
  if (p === 0) return `${S.criteria[i].name} and ${S.criteria[j].name} count the same (1)`;
  const k = Math.abs(p) + 1;
  const [a, b] = p < 0 ? [i, j] : [j, i];
  return `${S.criteria[a].name} counts ${VERBAL[k]} more than ${S.criteria[b].name} (${k})`;
}
function pairRow(i, j) {
  const key = pairKey(i, j);
  const p = S.pairs[key] ?? 0;
  const id = 'pair-' + key.replace('|', '-');
  const out = h('p', { class: 'pair-out', id: id + '-out', text: pairText(i, j, p) });
  const input = h('input', {
    type: 'range', id, min: -8, max: 8, step: 1, value: p, 'aria-valuetext': pairText(i, j, p),
    'aria-label': `${S.criteria[i].name} versus ${S.criteria[j].name}`,
    oninput: (e) => {
      const v = +e.target.value; S.pairs[key] = v;
      out.textContent = pairText(i, j, v);
      e.target.setAttribute('aria-valuetext', pairText(i, j, v));
      renderAhpSummary(); update();
    },
  });
  return h('div', { class: 'pair', 'data-key': key },
    h('div', { class: 'pair-names' }, h('span', { text: S.criteria[i].name }), h('span', { text: S.criteria[j].name })),
    input,
    h('div', { class: 'pair-scale', 'aria-hidden': 'true' }, h('span', { text: '9' }), h('span', { text: '5' }), h('span', { text: '1' }), h('span', { text: '5' }), h('span', { text: '9' })),
    out);
}
function renderAhpSummary() {
  const r = ahpResult();
  const n = S.criteria.length;
  const limit = M.crThreshold(n);
  const ok = r.cr <= limit;
  const host = $('ahp-summary');
  const items = [
    h('div', { class: 'cr ' + (ok ? 'cr-ok' : 'cr-bad') },
      h('span', { class: 'cr-label', text: 'Consistency ratio' }),
      h('strong', { class: 'cr-value', text: n > 2 ? r.cr.toFixed(3) : 'n/a' }),
      h('span', { class: 'cr-verdict' }, h('span', { 'aria-hidden': 'true', text: ok ? '✓ ' : '! ' }),
        n > 2 ? (ok ? `Acceptable (${limit.toFixed(2)} or less for n = ${n})` : `Above ${limit.toFixed(2)}: revisit some judgements`) : 'Needs 3 or more criteria')),
    h('p', { class: 'meta', text: `λmax = ${r.lambdaMax.toFixed(3)}, CI = ${r.ci.toFixed(3)}, RI = ${n > 2 ? r.ri.toFixed(2) : '0'} for n = ${n}.` }),
  ];
  const flagKey = !ok && r.worst ? pairKey(r.worst.i, r.worst.j) : null;
  document.querySelectorAll('#ahp-list .pair').forEach((el) => el.classList.toggle('flag', el.dataset.key === flagKey));
  if (r.worst && n > 2) {
    const { i, j, suggested } = r.worst;
    const key = pairKey(i, j);
    const sp = ratioToPos(suggested);
    const frac = suggested >= 1 ? String(suggested) : '1/' + Math.round(1 / suggested);
    if (!ok) {
      items.push(h('div', { class: 'hint' },
        h('p', {}, h('strong', { text: 'Least consistent judgement: ' }), `${S.criteria[i].name} vs ${S.criteria[j].name}. `,
          `Your other judgements imply about ${frac} here: "${pairText(i, j, sp)}".`),
        sp !== (S.pairs[key] ?? 0) ? h('button', { type: 'button', class: 'btn btn-small', onclick: () => { S.pairs[key] = sp; renderWeights(); update(); } }, 'Use the suggested judgement') : null));
    } else {
      items.push(h('p', { class: 'meta', text: `Least consistent judgement: ${S.criteria[i].name} vs ${S.criteria[j].name}. No change is needed at this consistency ratio.` }));
    }
  }
  items.push(h('div', { class: 'table-wrap' }, h('table', {},
    h('caption', { text: 'Weights derived from the pairwise comparisons (principal eigenvector)' }),
    h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Criterion' }), h('th', { scope: 'col', class: 'n', text: 'AHP weight' }), h('th', { scope: 'col', class: 'n', text: 'Direct weight' }))),
    h('tbody', {}, S.criteria.map((c, k) => h('tr', {}, h('th', { scope: 'row', text: c.name }), h('td', { class: 'n', text: fmt.pct(r.weights[k]) }), h('td', { class: 'n', text: fmt.pct(M.normalizeWeights(S.points)[k]) })))))));
  host.replaceChildren(...items);
}

/* ---------- outputs ---------- */
let raf = 0;
function update() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => { renderResults(); renderSensitivity(); scheduleMc(); });
}
let mcTimer = 0;
function scheduleMc() { clearTimeout(mcTimer); $('mc-out').classList.add('is-updating'); mcTimer = setTimeout(renderMc, 220); }
function updateMc() { scheduleMc(); }

function renderResults() {
  const m = model();
  const host = $('fig-rank');
  const sh = figureShell(host, { id: 'rank', title: 'Ranking', subtitle: `Overall score from 0 to 100, with weights from ${S.method === 'ahp' ? 'the AHP comparisons' : 'the sliders'}. Segments show what each criterion contributes.` });
  sh.legend.hidden = true; // the weights list above the chart is the legend
  const tip = tooltip(sh.chart);
  const plot = h('div', { class: 'chart-plot', role: 'img', 'aria-label': 'Ranking of options with contributions from each criterion. A table is available.' });
  sh.chart.appendChild(plot);
  mount(sh.chart, (W) => {
    plot.replaceChildren();
    const rowH = 46, labelH = 18, barH = 16;
    const H = m.order.length * rowH + 4;
    const valW = 44;
    const x = (t) => (t / 1) * (W - valW - 4);
    const s = svg('svg', { width: W, height: H, class: 'chart-svg', 'aria-hidden': 'true' }, plot);
    m.order.forEach((i, r) => {
      const y0 = r * rowH;
      svg('text', { x: 0, y: y0 + 13, class: 'bar-label' + (r === 0 ? ' strong' : '') }, s).textContent = `${m.rk[i]}. ${S.alternatives[i]}`;
      let acc = 0;
      const segs = [];
      S.criteria.forEach((c, j) => {
        const val = m.w[j] * m.v[i][j];
        if (val <= 1e-9) return;
        const x0 = x(acc) + (acc > 0 ? 1 : 0), x1 = x(acc + val) - 1;
        acc += val;
        segs.push({ j, x0, x1, val });
      });
      segs.forEach((g, k) => {
        const last = k === segs.length - 1;
        const d = last ? hBarPath(g.x0, Math.max(g.x0 + 1, g.x1 + 1), y0 + labelH + 4, barH) : `M${g.x0},${y0 + labelH + 4}H${Math.max(g.x0 + 0.5, g.x1)}V${y0 + labelH + 4 + barH}H${g.x0}Z`;
        const p = svg('path', { d, class: 'bar ' + CLS(g.j) }, s);
        p.addEventListener('pointermove', (e) => {
          const b = s.getBoundingClientRect();
          tip.show(e.clientX - b.left, y0 + labelH, S.alternatives[i], [
            { key: true, keyClass: 'k-box ' + CLS(g.j), value: (g.val * 100).toFixed(1) + ' pts', label: S.criteria[g.j].name },
            { value: `weight ${fmt.pct(m.w[g.j])} × value ${(m.v[i][g.j] * 100).toFixed(0)}/100` }]);
        });
        p.addEventListener('pointerleave', () => tip.hide());
      });
      svg('text', { x: x(m.scores[i]) + 6, y: y0 + labelH + 4 + barH - 3, class: 'bar-value' + (r === 0 ? ' strong' : '') }, s).textContent = (m.scores[i] * 100).toFixed(1);
    });
  });
  sh.table.replaceChildren(dataTable('Scores and contributions (points out of 100)', [
    { label: 'Rank', get: (i) => String(m.rk[i]) },
    { label: 'Option', get: (i) => S.alternatives[i] },
    { label: 'Score', num: true, get: (i) => (m.scores[i] * 100).toFixed(1) },
    ...S.criteria.map((c, j) => ({ label: c.name, num: true, get: (i) => (m.w[j] * m.v[i][j] * 100).toFixed(1) })),
  ], m.order));

  // plain-language summary + live region
  const a = m.order[0], b = m.order[1];
  const gap = (m.scores[a] - m.scores[b]) * 100;
  const text = `${S.alternatives[a]} ranks first with ${(m.scores[a] * 100).toFixed(1)} points, ${gap.toFixed(1)} points ahead of ${S.alternatives[b]}.`;
  $('rank-summary').textContent = text;
  clearTimeout(renderResults.t);
  renderResults.t = setTimeout(() => { $('live').textContent = text; }, 800);
  $('weights-used').replaceChildren(...S.criteria.map((c, j) => h('li', {}, h('span', { class: 'k-box ' + CLS(j), 'aria-hidden': 'true' }), `${c.name} `, h('strong', { text: fmt.pct(m.w[j], 0) }))));
}

/* ---------- sensitivity: stability intervals + sweep ---------- */
function renderSensitivity() {
  const m = model();
  const ivs = S.criteria.map((_, j) => M.stabilityInterval(m.v, m.w, j, m.top));
  // tolerance: smallest weight change (percentage points) that changes the winner
  const tolerance = M.weightTolerance(m.v, m.w, m.top);
  const crit = tolerance ? tolerance.j : -1;
  const host = $('fig-stability');
  const sh = figureShell(host, { id: 'stability', title: 'How far can each weight move?', subtitle: `Range of each criterion's weight in which ${S.alternatives[m.top]} stays first. The other weights keep their proportions.` });
  sh.legend.replaceChildren(
    h('span', { class: 'lg-item' }, h('span', { class: 'k-box band-key', 'aria-hidden': 'true' }), 'Stays first'),
    h('span', { class: 'lg-item' }, h('span', { class: 'k-dot', 'aria-hidden': 'true' }), 'Current weight'));
  const tip = tooltip(sh.chart);
  const plot = h('div', { class: 'chart-plot', role: 'img', 'aria-label': 'Stability interval for each criterion weight. A table is available.' });
  sh.chart.appendChild(plot);
  mount(sh.chart, (W) => {
    plot.replaceChildren();
    const labelW = Math.min(150, W * 0.38), rowH = 34, top = 20;
    const H = top + S.criteria.length * rowH + 4;
    const x = (t) => labelW + 10 + t * (W - labelW - 22);
    const s = svg('svg', { width: W, height: H, class: 'chart-svg', 'aria-hidden': 'true' }, plot);
    [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
      svg('line', { x1: x(t), x2: x(t), y1: top - 4, y2: H - 4, class: 'grid-line' }, s);
      svg('text', { x: x(t), y: 12, 'text-anchor': 'middle', class: 'tick' }, s).textContent = Math.round(t * 100) + '%';
    });
    S.criteria.forEach((c, j) => {
      const y = top + j * rowH + rowH / 2;
      const iv = ivs[j];
      svg('text', { x: labelW, y: y + 4, 'text-anchor': 'end', class: 'bar-label' + (j === crit ? ' strong' : '') }, s).textContent = truncate(c.name, Math.floor(labelW / 6.8));
      svg('line', { x1: x(0), x2: x(1), y1: y, y2: y, class: 'track' }, s);
      if (iv.hi >= iv.lo) svg('rect', { x: x(iv.lo), y: y - 7, width: Math.max(2, x(iv.hi) - x(iv.lo)), height: 14, rx: 4, class: 'band-fill' }, s);
      svg('circle', { cx: x(m.w[j]), cy: y, r: 5, class: 'cur-dot' }, s);
      const hit = svg('rect', { x: 0, y: y - rowH / 2, width: W, height: rowH, fill: 'transparent' }, s);
      hit.addEventListener('pointermove', () => tip.show(x(m.w[j]), y - 10, c.name, [
        { value: fmt.pct(m.w[j]), label: 'current weight' },
        { value: `${fmt.pct(iv.lo)} to ${fmt.pct(iv.hi)}`, label: 'stays first' },
        ...(iv.below != null ? [{ value: S.alternatives[iv.below], label: 'takes over below' }] : []),
        ...(iv.above != null ? [{ value: S.alternatives[iv.above], label: 'takes over above' }] : [])]));
      hit.addEventListener('pointerleave', () => tip.hide());
    });
  });
  sh.table.replaceChildren(dataTable(`Weight range in which ${S.alternatives[m.top]} stays first`, [
    { label: 'Criterion', get: (j) => S.criteria[j].name },
    { label: 'Current', num: true, get: (j) => fmt.pct(m.w[j]) },
    { label: 'Stays first from', num: true, get: (j) => fmt.pct(ivs[j].lo) },
    { label: 'to', num: true, get: (j) => fmt.pct(ivs[j].hi) },
    { label: 'Takes over below', get: (j) => (ivs[j].below != null ? S.alternatives[ivs[j].below] : 'none') },
    { label: 'Takes over above', get: (j) => (ivs[j].above != null ? S.alternatives[ivs[j].above] : 'none') },
  ], S.criteria.map((_, j) => j)));
  const t = tolerance;
  $('stability-summary').textContent = t
    ? `Most sensitive weight: ${S.criteria[t.j].name}. Moving it ${t.dir} by ${(t.by * 100).toFixed(1)} percentage points (from ${fmt.pct(t.from)} to ${fmt.pct(t.to)}) makes ${S.alternatives[t.newTop]} the top option.`
    : `${S.alternatives[m.top]} stays first whatever single weight you change.`;

  // sweep chart
  const sel = $('sweep-crit');
  if (sel.options.length !== S.criteria.length || [...sel.options].some((o, j) => o.textContent !== S.criteria[j].name)) {
    sel.replaceChildren(...S.criteria.map((c, j) => h('option', { value: j, text: c.name })));
  }
  sel.value = String(sensCrit);
  renderSweep(m, ivs[sensCrit]);
}

function renderSweep(m, iv) {
  const j = sensCrit;
  const host = $('fig-sweep');
  const sh = figureShell(host, { id: 'sweep', title: `Scores as the weight of ${S.criteria[j].name} changes`, subtitle: 'Each line is one option. The shaded band is where the current top option stays first.' });
  const narrowSweep = sh.chart.clientWidth > 0 && sh.chart.clientWidth < 480;
  legend(sh.legend, [{ name: 'Currently first: ' + S.alternatives[m.top], cls: 'c-accent', line: true }, { name: narrowSweep ? 'Other options (see the tooltip or table)' : 'Other options (labelled at the right)', cls: 'c-context', line: true }]);
  const sw = M.sweep(m.v, m.w, j, 101);
  const tip = tooltip(sh.chart);
  const plot = h('div', { class: 'chart-plot', tabindex: '0', role: 'img', 'aria-label': `Line chart of each option's score as the weight of ${S.criteria[j].name} goes from 0 to 100%. Use arrow keys to read values. A table is available.` });
  sh.chart.appendChild(plot);
  let cur = Math.round(m.w[j] * 100);
  mount(sh.chart, (W) => {
    plot.replaceChildren();
    const narrow = W < 480;
    const labW = narrow ? 0 : Math.min(190, W * 0.3);
    const mg = { t: 12, r: labW + 12, b: 30, l: 40 };
    const H = 280;
    const x = (t) => mg.l + t * (W - mg.l - mg.r);
    const y = (v) => H - mg.b - v * (H - mg.t - mg.b);
    const s = svg('svg', { width: W, height: H, class: 'chart-svg', 'aria-hidden': 'true' }, plot);
    if (iv.hi >= iv.lo) svg('rect', { x: x(iv.lo), y: mg.t, width: Math.max(1, x(iv.hi) - x(iv.lo)), height: H - mg.t - mg.b, class: 'band' }, s);
    [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
      svg('line', { x1: mg.l, x2: W - mg.r, y1: y(t), y2: y(t), class: t === 0 ? 'axis-line' : 'grid-line' }, s);
      svg('text', { x: mg.l - 8, y: y(t) + 4, 'text-anchor': 'end', class: 'tick' }, s).textContent = Math.round(t * 100);
      svg('text', { x: x(t), y: H - 10, 'text-anchor': 'middle', class: 'tick' }, s).textContent = Math.round(t * 100) + '%';
    });
    svg('line', { x1: x(m.w[j]), x2: x(m.w[j]), y1: mg.t, y2: H - mg.b, class: 'ref-line' }, s);
    svg('text', { x: x(m.w[j]) + 4, y: mg.t + 10, class: 'ann' }, s).textContent = 'now ' + fmt.pct(m.w[j], 0);
    const order = m.scores.map((_, i) => i).sort((a, b) => (a === m.top) - (b === m.top));
    order.forEach((i) => {
      const d = sw.scores[i].map((v, k) => (k ? 'L' : 'M') + x(sw.ts[k]).toFixed(1) + ',' + y(v).toFixed(1)).join('');
      svg('path', { d, class: 'line ' + (i === m.top ? 'c-accent' : 'c-context') }, s);
    });
    // direct labels at the right end, spread apart with leader lines
    if (!narrow) {
      const ends = sw.scores.map((row, i) => ({ i, y: y(row[row.length - 1]) })).sort((a, b) => a.y - b.y);
      const gap = 15;
      let prev = -Infinity;
      ends.forEach((e) => { e.ly = Math.max(e.y, prev + gap); prev = e.ly; });
      const overflow = ends.length ? ends[ends.length - 1].ly - (H - mg.b) : 0;
      if (overflow > 0) ends.forEach((e) => { e.ly = Math.max(mg.t, e.ly - overflow); });
      ends.forEach((e) => {
        svg('path', { d: `M${x(1) + 3},${e.y}L${x(1) + 10},${e.ly}L${x(1) + 14},${e.ly}`, class: 'leader' }, s);
        const t = svg('text', { x: x(1) + 17, y: e.ly + 4, class: 'ann' + (e.i === m.top ? ' ann-strong' : '') }, s);
        t.textContent = truncate(S.alternatives[e.i], Math.floor((labW - 20) / 6.2));
      });
    }
    const cross = svg('line', { y1: mg.t, y2: H - mg.b, class: 'crosshair' }, s);
    const hit = svg('rect', { x: mg.l, y: 0, width: W - mg.l - mg.r, height: H, fill: 'transparent' }, s);
    const show = (k) => {
      cur = Math.max(0, Math.min(100, k));
      cross.setAttribute('x1', x(cur / 100)); cross.setAttribute('x2', x(cur / 100)); cross.classList.add('on');
      const rows = m.scores.map((_, i) => i).sort((a, b) => sw.scores[b][cur] - sw.scores[a][cur]).map((i) => ({
        key: true, keyClass: 'k-line ' + (i === m.top ? 'c-accent' : 'c-context'), value: (sw.scores[i][cur] * 100).toFixed(1), label: S.alternatives[i] }));
      tip.show(x(cur / 100), mg.t + 20, `${S.criteria[j].name} weight ${cur}%`, rows);
    };
    const hide = () => { cross.classList.remove('on'); tip.hide(); };
    hit.addEventListener('pointermove', (e) => { const b = s.getBoundingClientRect(); show(Math.round(((e.clientX - b.left) - mg.l) / (W - mg.l - mg.r) * 100)); });
    hit.addEventListener('pointerleave', hide);
    plot.onkeydown = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); show(cur + (e.key === 'ArrowRight' ? 5 : -5)); }
      else if (e.key === 'Escape') hide();
    };
    plot.onfocus = () => show(cur);
    plot.onblur = hide;
  });
  const stepsT = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  sh.table.replaceChildren(dataTable(`Scores by weight of ${S.criteria[j].name}`, [
    { label: 'Weight', get: (k) => k + '%' },
    ...S.alternatives.map((a, i) => ({ label: a, num: true, get: (k) => (sw.scores[i][k] * 100).toFixed(1) })),
  ], stepsT));
  $('sweep-summary').textContent = iv.hi >= iv.lo
    ? `${S.alternatives[m.top]} stays first while ${S.criteria[j].name} has a weight between ${fmt.pct(iv.lo)} and ${fmt.pct(iv.hi)}.` +
      (iv.below != null ? ` Below that, ${S.alternatives[iv.below]} takes over.` : '') +
      (iv.above != null ? ` Above it, ${S.alternatives[iv.above]} takes over.` : '')
    : '';
}
const truncate = (t, n) => (t.length > n ? t.slice(0, Math.max(4, n - 1)) + '…' : t);

/* ---------- Monte Carlo ---------- */
function renderMc() {
  const m = model();
  const r = M.simulate({
    matrix: S.matrix, criteria: S.criteria, weights: m.w, kappa: mc.kappa,
    scoreUncertainty: mc.scores ? S.criteria.map((c) => c.unc) : null, samples: mc.samples, seed: 42,
  });
  $('mc-out').classList.remove('is-updating');
  const n = S.alternatives.length;
  const order = m.order;
  const ordinal = (k) => k + (k === 1 ? 'st' : k === 2 ? 'nd' : k === 3 ? 'rd' : 'th');
  // acceptability heatmap
  const host = $('fig-accept');
  const sh = figureShell(host, { id: 'accept', title: 'How often each option gets each rank', subtitle: `Share of ${fmt.int(r.samples)} simulated scenarios. Rows in the current ranking order.` });
  sh.legend.replaceChildren(h('span', { class: 'lg-item' }, h('span', { class: 'heat-scale', 'aria-hidden': 'true' }), '0% to 100% of scenarios'));
  heatmap(sh.chart, {
    rowLabels: order.map((i) => truncate(S.alternatives[i], 26)),
    colLabels: Array.from({ length: n }, (_, k) => ordinal(k + 1)),
    values: order.map((i) => r.acceptability[i]),
    max: 1, format: (v) => fmt.pct(v), cellLabel: (v) => (v < 0.005 ? '' : Math.round(v * 100) + '%'), labelWidth: 190, cellHeight: 30,
    rowTitle: (k) => S.alternatives[order[k]], colTitle: (c) => 'of scenarios ranked ' + ordinal(c + 1),
    ariaLabel: 'Rank acceptability: how often each option gets each rank across simulated scenarios. Use arrow keys to read values. A table is available.',
  });
  sh.table.replaceChildren(dataTable('Rank acceptability (% of scenarios)', [
    { label: 'Option', get: (i) => S.alternatives[i] },
    ...Array.from({ length: n }, (_, k) => ({ label: ordinal(k + 1), num: true, get: (i) => fmt.pct(r.acceptability[i][k]) })),
  ], order));

  // rank intervals: exact best/worst case for the value uncertainty at the current weights,
  // and the simulated 5th to 95th percentile range
  const showExact = mc.scores && S.criteria.some((c) => c.unc > 0);
  const exact = M.exactRankIntervals(m.scores, m.w, S.criteria.map((c) => c.unc), M.scales(S.matrix, S.criteria));
  const halfWidth = exact.length ? exact[0].halfWidth * 100 : 0;
  const host2 = $('fig-intervals');
  const sh2 = figureShell(host2, { id: 'intervals', title: 'Rank intervals', subtitle: (showExact
    ? `Thin line: exact best- and worst-case rank from the table values alone, with the weights fixed (every score can move by up to ±${halfWidth.toFixed(1)} points). `
    : '') + 'Thick bar: middle 90% of the simulated ranks' + (showExact && mc.kappa !== 0 ? ', which can go past the line because it also varies the weights' : '') + '. Dot: current rank.' });
  sh2.legend.replaceChildren(
    ...(showExact ? [h('span', { class: 'lg-item' }, h('span', { class: 'k-line c-ink', 'aria-hidden': 'true' }), 'Exact range, table values only (weights fixed)')] : []),
    h('span', { class: 'lg-item' }, h('span', { class: 'k-box c-accent', 'aria-hidden': 'true' }), 'Simulated, 5th to 95th percentile'),
    h('span', { class: 'lg-item' }, h('span', { class: 'k-dot', 'aria-hidden': 'true' }), 'Current rank'));
  const plot = h('div', { class: 'chart-plot', role: 'img', 'aria-label': 'Rank interval for each option. A table is available.' });
  sh2.chart.appendChild(plot);
  mount(sh2.chart, (W) => {
    plot.replaceChildren();
    const labelW = Math.min(190, W * 0.42), rowH = 38, top = 20;
    const H = top + n * rowH + 2;
    const x = (k) => labelW + 18 + ((k - 1) / Math.max(1, n - 1)) * (W - labelW - 32);
    const s = svg('svg', { width: W, height: H, class: 'chart-svg', 'aria-hidden': 'true' }, plot);
    for (let k = 1; k <= n; k++) {
      svg('line', { x1: x(k), x2: x(k), y1: top - 4, y2: H - 2, class: 'grid-line' }, s);
      svg('text', { x: x(k), y: 12, 'text-anchor': 'middle', class: 'tick' }, s).textContent = ordinal(k);
    }
    order.forEach((i, row) => {
      const y = top + row * rowH + rowH / 2;
      svg('text', { x: labelW, y: y + 4, 'text-anchor': 'end', class: 'bar-label' }, s).textContent = truncate(S.alternatives[i], Math.floor(labelW / 6.6));
      if (showExact) {
        // drawn just below the simulated bar so a bar never hides it
        const ey = y + 10;
        svg('line', { x1: x(exact[i].best), x2: x(exact[i].worst), y1: ey, y2: ey, class: 'range-line' }, s);
        [exact[i].best, exact[i].worst].forEach((k) => svg('line', { x1: x(k), x2: x(k), y1: ey - 4, y2: ey + 4, class: 'range-line' }, s));
      }
      svg('rect', { x: x(r.p05[i]) - 6, y: y - 6, width: x(r.p95[i]) - x(r.p05[i]) + 12, height: 12, rx: 6, class: 'iv-bar' }, s);
      svg('circle', { cx: x(m.rk[i]), cy: y, r: 5, class: 'cur-dot' }, s);
    });
  });
  sh2.table.replaceChildren(dataTable('Rank intervals', [
    { label: 'Option', get: (i) => S.alternatives[i] },
    { label: 'Current rank', num: true, get: (i) => String(m.rk[i]) },
    ...(showExact ? [
      { label: 'Best case (exact, values only)', num: true, get: (i) => String(exact[i].best) },
      { label: 'Worst case (exact, values only)', num: true, get: (i) => String(exact[i].worst) }] : []),
    { label: 'Simulated 5th pct', num: true, get: (i) => String(r.p05[i]) },
    { label: 'Median', num: true, get: (i) => String(r.median[i]) },
    { label: 'Simulated 95th pct', num: true, get: (i) => String(r.p95[i]) },
  ], order));

  const top = m.top;
  const p1 = r.acceptability[top][0];
  const firstMost = r.acceptability.map((a) => a[0]).indexOf(Math.max(...r.acceptability.map((a) => a[0])));
  const moe = 1.96 * Math.sqrt(p1 * (1 - p1) / r.samples); // Monte Carlo error, 95%
  let txt = `${S.alternatives[top]} is first in ${fmt.pct(p1, 0)} of scenarios` + (moe >= 0.0005 ? ` (±${(moe * 100).toFixed(1)} percentage points, 95% Monte Carlo error)` : '');
  if (firstMost !== top) txt += `, but ${S.alternatives[firstMost]} is first more often (${fmt.pct(r.acceptability[firstMost][0], 0)})`;
  if (p1 >= 0.9995) txt += '.';
  else txt += r.p05[top] === r.p95[top]
    ? `. It is ${ordinal(r.p05[top])} in at least 90% of them.`
    : `. Its rank stays between ${ordinal(r.p05[top])} and ${ordinal(r.p95[top])} in 90% of them.`;
  $('mc-summary').textContent = txt;
  lastMc = r;
}
let lastMc = null;

/* ---------- export and share ---------- */
function csvCell(v) { const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function exportCsv() {
  const m = model();
  const lines = [];
  lines.push(['Weights from', S.method === 'ahp' ? 'AHP pairwise comparisons' : 'direct points'].map(csvCell).join(','));
  if (S.method === 'ahp') lines.push(['Consistency ratio', ahpResult().cr.toFixed(4)].join(','));
  lines.push('');
  lines.push(['Criterion', 'Unit', 'Direction', 'Weight', 'Value uncertainty (share of range)'].map(csvCell).join(','));
  S.criteria.forEach((c, j) => lines.push([c.name, c.unit, c.dir === 'max' ? 'higher is better' : 'lower is better', m.w[j].toFixed(4), c.unc].map(csvCell).join(',')));
  lines.push('');
  const mcHead = lastMc ? ['P(first)', 'Rank 5th pct (simulated)', 'Rank 95th pct (simulated)'] : [];
  lines.push(['Rank', 'Option', 'Score (0-100)', ...S.criteria.map((c) => c.name + ' (raw)'), ...mcHead].map(csvCell).join(','));
  m.order.forEach((i) => lines.push([m.rk[i], S.alternatives[i], (m.scores[i] * 100).toFixed(2), ...S.matrix[i],
    ...(lastMc ? [lastMc.acceptability[i][0].toFixed(4), lastMc.p05[i], lastMc.p95[i]] : [])].map(csvCell).join(',')));
  const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv' });
  const a = h('a', { href: URL.createObjectURL(blob), download: 'decision-analysis-results.csv' });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function shareLink() {
  const url = location.origin + location.pathname + '#s=' + encodeState(S);
  history.replaceState(null, '', url);
  const status = $('share-status');
  try { await navigator.clipboard.writeText(url); status.textContent = 'Link copied. It contains the whole table and your weights.'; }
  catch { status.textContent = 'The link is now in the address bar. Copy it from there.'; }
}

/* ---------- init ---------- */
function renderAll() { renderTable(); renderWeights(); update(); }

function init() {
  const m = location.hash.match(/#s=([A-Za-z0-9_-]+)/);
  if (m) {
    const st = decodeState(m[1]);
    if (st) {
      S = st;
      nextId = 1 + Math.max(0, ...S.criteria.map((c) => parseInt(c.id.slice(1), 10) || 0));
      sensCrit = Math.min(sensCrit, S.criteria.length - 1);
    }
  }
  $('add-alt').addEventListener('click', addAlternative);
  $('add-crit').addEventListener('click', addCriterion);
  $('reset').addEventListener('click', () => {
    S = clone(EXAMPLE); nextId = 6; sensCrit = 2;
    history.replaceState(null, '', location.pathname);
    renderAll();
    $('share-status').textContent = 'Example restored.';
  });
  document.querySelectorAll('input[name="wmethod"]').forEach((r) => r.addEventListener('change', (e) => { S.method = e.target.value; renderWeights(); update(); }));
  $('sweep-crit').addEventListener('change', (e) => { sensCrit = +e.target.value; renderSensitivity(); });
  $('mc-kappa').replaceChildren(...KAPPA.map((k) => h('option', { value: String(k.v), selected: k.v === mc.kappa, text: k.label })));
  const kappaHint = () => { $('mc-kappa-hint').textContent = KAPPA.find((k) => String(k.v) === String(mc.kappa)).hint; };
  $('mc-kappa').addEventListener('change', (e) => { const v = e.target.value; mc.kappa = v === 'uniform' ? 'uniform' : +v; kappaHint(); scheduleMc(); });
  kappaHint();
  $('mc-scores').checked = mc.scores;
  $('mc-scores').addEventListener('change', (e) => { mc.scores = e.target.checked; scheduleMc(); });
  $('export').addEventListener('click', exportCsv);
  $('share').addEventListener('click', shareLink);
  $('tool').classList.remove('loading');
  renderAll();
}

init();
