// Online Retail II KPI dashboard. Reads data/dashboard.json (built by analysis.py).
import { h, svg, fmt, lineChart, hBarChart, stackedColumns, heatmap, dataTable, figureShell, legend } from '/assets/js/charts.js';

const root = document.getElementById('dashboard');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const mLabel = (ym) => MONTHS[+ym.slice(5, 7) - 1] + ' ' + ym.slice(2, 4);
const mLong = (ym) => MONTHS_LONG[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4);

let D, market = 'All', metric = 'net_sales';

const METRICS = {
  net_sales: { label: 'Net sales', fmt: fmt.gbpCompact, tick: fmt.gbpCompact, tip: fmt.gbp },
  orders: { label: 'Orders', fmt: fmt.int, tick: fmt.compact, tip: fmt.int },
  active_customers: { label: 'Active customers', fmt: fmt.int, tick: fmt.compact, tip: fmt.int },
  aov: { label: 'Average order value', fmt: fmt.gbp, tick: fmt.gbp, tip: (v) => '£' + v.toFixed(2) },
};

async function init() {
  try {
    const res = await fetch('data/dashboard.json');
    if (!res.ok) throw new Error(res.status);
    D = await res.json();
  } catch (e) {
    root.replaceChildren(h('p', { class: 'callout', text: 'The dashboard data could not be loaded. The numbers are also in the CSV files in the data folder of the repository.' }));
    return;
  }
  document.querySelectorAll('input[name="market"]').forEach((r) => r.addEventListener('change', (e) => { market = e.target.value; render(); }));
  document.querySelectorAll('input[name="metric"]').forEach((r) => r.addEventListener('change', (e) => { metric = e.target.value; renderTrend(); }));
  render();
  renderStatic();
}

function monthly(m = market) { return D.monthly.filter((r) => r.market === m); }
function period(p, m = market) { return D.periods.find((r) => r.market === m && r.period === p); }

function render() {
  const scope = document.getElementById('scope-market');
  if (scope) scope.textContent = market === 'All' ? 'all markets' : market === 'International' ? 'International (non-UK)' : 'the United Kingdom';
  renderKpis();
  renderTrend();
  renderBridge();
  renderCustomerTypes();
  renderCohorts();
}

/* ---------- KPI tiles ---------- */
function renderKpis() {
  const p1 = period('P1'), p2 = period('P2');
  const rows = monthly();
  const series = (f) => rows.map(f);
  const tiles = [
    { label: 'Net sales', v: fmt.gbpCompact(p2.net_sales), d: p2.net_sales / p1.net_sales - 1, kind: 'pct', good: 'up', spark: series((r) => r.net_sales) },
    { label: 'Orders', v: fmt.int(p2.orders), d: p2.orders / p1.orders - 1, kind: 'pct', good: 'up', spark: series((r) => r.orders) },
    { label: 'Average order value (gross)', v: fmt.gbp(p2.aov), d: p2.aov / p1.aov - 1, kind: 'pct', good: 'up', spark: series((r) => r.aov) },
    { label: 'Active customers', v: fmt.int(p2.active_customers), d: p2.active_customers / p1.active_customers - 1, kind: 'pct', good: 'up', spark: series((r) => r.active_customers) },
    { label: 'Repeat purchase rate', v: fmt.pct(p2.repeat_rate), d: p2.repeat_rate - p1.repeat_rate, kind: 'pts', good: 'up', note: 'customers with 2+ orders in the year' },
    { label: 'Retained from previous year', v: fmt.pct(p2.retained_from_p1), note: 'of P1 customers ordered again in P2' },
    { label: 'Cancellation rate', v: fmt.pct(p2.cancellation_rate), d: p2.cancellation_rate - p1.cancellation_rate, kind: 'pts', good: 'down', spark: series((r) => r.cancelled_value / r.gross_sales) },
    { label: 'Sales without customer ID', v: fmt.pct(p2.unidentified_share), d: p2.unidentified_share - p1.unidentified_share, kind: 'pts', good: 'down', spark: series((r) => r.unidentified_sales / r.gross_sales) },
  ];
  const ul = document.getElementById('kpis');
  ul.replaceChildren(...tiles.map((t) => {
    const li = h('li', {}, h('p', { class: 'kpi-label', text: t.label }), h('p', { class: 'kpi-value', text: t.v }));
    if (t.d !== undefined) {
      const up = t.d > 0;
      const tone = Math.abs(t.d) < 0.0005 ? 'neutral' : (up === (t.good === 'up') ? 'good' : 'bad');
      const txt = t.kind === 'pts' ? fmt.signedPts(t.d) : fmt.signedPct(t.d);
      const arrow = Math.abs(t.d) < 0.0005 ? '' : up ? '▲' : '▼';
      li.appendChild(h('p', { class: 'kpi-delta' },
        h('span', { class: (up ? 'up ' : 'down ') + tone }, h('span', { 'aria-hidden': 'true', text: arrow }), txt),
        h('span', { text: 'vs P1' + (tone === 'neutral' ? '' : tone === 'good' ? ' (better)' : ' (worse)') })));
    } else if (t.note) {
      li.appendChild(h('p', { class: 'kpi-delta', text: t.note }));
    }
    if (t.d !== undefined && t.note) li.appendChild(h('p', { class: 'kpi-delta', text: t.note }));
    if (t.spark) li.appendChild(spark(t.spark));
    return li;
  }));
}

function spark(values) {
  const W = 120, H = 28, n = values.length;
  const lo = Math.min(...values), hi = Math.max(...values);
  const x = (i) => 1 + (i / (n - 1)) * (W - 2);
  const y = (v) => H - 3 - ((v - lo) / ((hi - lo) || 1)) * (H - 6);
  const s = svg('svg', { class: 'kpi-spark chart-svg', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  const path = (a, b) => values.slice(a, b).map((v, k) => (k ? 'L' : 'M') + x(a + k).toFixed(1) + ',' + y(v).toFixed(1)).join('');
  svg('path', { d: path(0, 13), class: 'line c-context', 'vector-effect': 'non-scaling-stroke' }, s);
  svg('path', { d: path(12, n), class: 'line c-accent', 'vector-effect': 'non-scaling-stroke' }, s);
  return s;
}

/* ---------- monthly trend, P2 vs P1 ---------- */
let trendShell;
function renderTrend() {
  const host = document.getElementById('fig-trend');
  const M = METRICS[metric];
  const first = !trendShell;
  trendShell = figureShell(host, { id: 'trend', title: M.label + ' by month', subtitle: 'Dec 2010 to Nov 2011 against the same months a year earlier' });
  if (first) {
    const sw = document.querySelector('.metric-switch');
    if (sw) host.querySelector('.fig-head').after(sw); // title first, then the metric switch
  }
  const rows = monthly();
  const p1 = rows.slice(0, 12), p2 = rows.slice(12, 24);
  const labels = p2.map((r) => MONTHS[+r.month.slice(5, 7) - 1]);
  legend(trendShell.legend, [
    { name: 'Dec 2010 to Nov 2011', cls: 'c-accent', line: true },
    { name: 'Dec 2009 to Nov 2010', cls: 'c-context', line: true },
  ]);
  lineChart(trendShell.chart, {
    labels,
    series: [
      { name: 'Dec 2009 to Nov 2010', values: p1.map((r) => r[metric]), cls: 'c-context' },
      { name: 'Dec 2010 to Nov 2011', values: p2.map((r) => r[metric]), cls: 'c-accent', emphasis: true, endLabel: true },
    ],
    yFormat: M.tip, yTick: M.tick, height: 260,
    yMin: metric === 'aov' ? undefined : 0,
    tipTitle: (i) => MONTHS_LONG[+p2[i].month.slice(5, 7) - 1],
    ariaLabel: `${M.label} by month, two 12-month periods. Use left and right arrow keys to read values. A table is available.`,
  });
  trendShell.table.replaceChildren(dataTable(`${M.label} by month`, [
    { label: 'Month', get: (r) => MONTHS_LONG[+r.month.slice(5, 7) - 1] },
    { label: 'Dec 2009 to Nov 2010', num: true, get: (r) => M.tip(rows.find((q) => q.month === shiftYear(r.month, -1))[metric]) },
    { label: 'Dec 2010 to Nov 2011', num: true, get: (r) => M.tip(r[metric]) },
  ], p2));
}
const shiftYear = (ym, k) => (+ym.slice(0, 4) + k) + ym.slice(4);

/* ---------- revenue bridge ---------- */
function renderBridge() {
  const host = document.getElementById('fig-bridge');
  const b = D.bridge.find((r) => r.market === market);
  const sh = figureShell(host, { id: 'bridge', title: 'Where the change came from', subtitle: `From ${fmt.gbpCompact(b.P1.net_sales)} to ${fmt.gbpCompact(b.P2.net_sales)} net sales, P1 to P2. The steps add up to the total.` });
  const rows = [
    ...b.steps.map((st) => ({ label: st.label, value: st.value, note: st.detail.replace(/GBP /g, '£'), cls: 'c-accent' })),
    { label: 'Net sales change', value: b.net_change, note: `${fmt.gbp(b.P1.net_sales)} to ${fmt.gbp(b.P2.net_sales)}`, cls: 'c-ink' },
  ];
  const lim = Math.max(...rows.map((r) => Math.abs(r.value))) * 1.05;
  sh.legend.hidden = true;
  hBarChart(sh.chart, {
    rows, format: (v) => (v > 0 ? '+' : '') + fmt.gbpCompact(v), min: -lim, max: lim, labelWidth: 170, valueWidth: 64, rowHeight: 32,
    ariaLabel: 'Revenue bridge from P1 to P2 net sales: change from active customers, orders per customer, order value, sales without customer ID and cancellations. A table is available.',
  });
  sh.table.replaceChildren(dataTable('Revenue bridge, P1 to P2 net sales', [
    { label: 'Step', key: 'label' },
    { label: 'P1 to P2', get: (r) => r.note },
    { label: 'Effect', num: true, get: (r) => (r.value > 0 ? '+' : '') + fmt.gbp(r.value) },
  ], rows));
  let note = host.querySelector('.fig-note');
  if (!note) { note = h('p', { class: 'fig-note' }); host.appendChild(note); }
  note.textContent = 'Customers, orders per customer and order value cover identified customers. Their sales are split between the three with the log-mean (LMDI) method, so the effects add up exactly.';
}

/* ---------- sales by customer type (P2) ---------- */
function renderCustomerTypes() {
  const host = document.getElementById('fig-types');
  const sh = figureShell(host, { id: 'types', title: 'Sales by customer type', subtitle: 'Gross sales per month, Dec 2010 to Nov 2011. New = first purchase in the data.' });
  const rows = monthly().slice(12, 24);
  const series = [
    { name: 'Returning customers', cls: 'c-context', values: rows.map((r) => r.returning_customer_sales) },
    { name: 'New customers', cls: 'c-ink', values: rows.map((r) => r.new_customer_sales) },
    { name: 'No customer ID', cls: 'c-accent', values: rows.map((r) => r.unidentified_sales) },
  ];
  legend(sh.legend, series);
  stackedColumns(sh.chart, {
    labels: rows.map((r) => MONTHS[+r.month.slice(5, 7) - 1]),
    series, format: fmt.gbpCompact, yTick: fmt.gbpCompact, height: 240,
    tipTitle: (i) => mLong(rows[i].month),
    ariaLabel: 'Monthly gross sales split into returning customers, new customers and sales without a customer ID. Use arrow keys to read values. A table is available.',
  });
  sh.table.replaceChildren(dataTable('Gross sales by customer type', [
    { label: 'Month', get: (r) => mLong(r.month) },
    { label: 'Returning', num: true, get: (r) => fmt.gbp(r.returning_customer_sales) },
    { label: 'New', num: true, get: (r) => fmt.gbp(r.new_customer_sales) },
    { label: 'No customer ID', num: true, get: (r) => fmt.gbp(r.unidentified_sales) },
    { label: 'New customers', num: true, get: (r) => fmt.int(r.new_customers) },
  ], rows));
}

/* ---------- cohort retention heatmap ---------- */
function renderCohorts() {
  const host = document.getElementById('fig-cohorts');
  const sh = figureShell(host, { id: 'cohorts', title: 'Cohort retention', subtitle: 'Share of each monthly cohort (first purchase in that month) that ordered again 1 to 12 months later.' });
  const c = D.cohorts[market];
  const rowLabels = c.cohorts.map((m, i) => mLabel(m) + (i === 0 ? '*' : ''));
  const values = c.retention.map((r) => r.slice(1));
  sh.legend.replaceChildren(
    h('span', { class: 'lg-item' }, h('span', { class: 'heat-scale', 'aria-hidden': 'true' }), '0% to 50%+ of the cohort'),
    h('span', { class: 'lg-item', text: '* Dec 2009 includes customers who bought before the data starts' }),
    market === 'International' ? h('span', { class: 'lg-item', text: 'International cohorts are small (often under 30 customers), so single cells move a lot' }) : null);
  heatmap(sh.chart, {
    rowLabels, colLabels: Array.from({ length: 12 }, (_, i) => '+' + (i + 1)),
    values, max: 0.5, format: (v) => fmt.pct(v), cellLabel: (v) => Math.round(v * 100) + '', labelWidth: 62, cellHeight: 21,
    rowTitle: (i) => `Cohort ${mLong(c.cohorts[i])}${i === 0 ? ' (includes earlier customers)' : ''}, ${fmt.int(c.size[i])} customers`,
    colTitle: (j) => `ordered ${j + 1} month${j ? 's' : ''} after the first purchase`,
    ariaLabel: 'Heatmap of cohort retention by months since first purchase. Use arrow keys to read values. A table is available.',
  });
  sh.table.replaceChildren(dataTable('Cohort retention, % of cohort ordering again', [
    { label: 'Cohort', get: (r) => r.label },
    { label: 'Size', num: true, get: (r) => fmt.int(r.size) },
    ...Array.from({ length: 12 }, (_, k) => ({ label: '+' + (k + 1), num: true, get: (r) => (r.ret[k + 1] == null ? '' : Math.round(r.ret[k + 1] * 100) + '%') })),
  ], c.cohorts.map((m, i) => ({ label: mLong(m), size: c.size[i], ret: c.retention[i] }))));
}

/* ---------- all-markets section (not filtered) ---------- */
function renderStatic() {
  renderRfm();
  renderConcentration();
  renderCountries();
  renderProducts();
  renderQuality();
}

function renderRfm() {
  const host = document.getElementById('fig-rfm');
  const rows = D.rfm;
  const maxShare = Math.max(...rows.flatMap((r) => [r.share_of_customers, r.share_of_net_sales]));
  const bar = (v, cls) => h('span', { class: 'ibar' },
    h('span', { class: 'ibar-track', 'aria-hidden': 'true' }, h('span', { class: 'ibar-fill ' + cls, style: `width:${(v / maxShare * 100).toFixed(1)}%` })),
    h('span', { class: 'ibar-val', text: fmt.pct(v) }));
  const t = h('table', { class: 'rfm-table' },
    h('caption', { text: 'RFM segments, identified customers active Dec 2010 to Nov 2011, sorted by net sales' }),
    h('thead', {}, h('tr', {},
      h('th', { scope: 'col', text: 'Segment' }),
      h('th', { scope: 'col', text: 'Share of net sales' }),
      h('th', { scope: 'col', text: 'Share of customers' }),
      h('th', { scope: 'col', class: 'n', text: 'Customers' }),
      h('th', { scope: 'col', class: 'n', text: 'Median days since last order' }),
      h('th', { scope: 'col', class: 'n', text: 'Median orders' }))),
    h('tbody', {}, rows.map((r) => h('tr', {},
      h('th', { scope: 'row', text: r.segment }),
      h('td', {}, bar(r.share_of_net_sales, 'c-accent')),
      h('td', {}, bar(r.share_of_customers, 'c-context')),
      h('td', { class: 'n', text: fmt.int(r.customers) }),
      h('td', { class: 'n', text: fmt.int(r.median_recency_days) }),
      h('td', { class: 'n', text: String(r.median_orders) })))));
  host.querySelector('.fig-body').replaceChildren(h('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'RFM segments table' }, t));
}

function renderConcentration() {
  const host = document.getElementById('fig-conc');
  const sh = figureShell(host, { id: 'conc', title: 'Customer concentration', level: 4, subtitle: `Cumulative share of net sales from the largest identified customers, Dec 2010 to Nov 2011 (${fmt.int(D.concentration.customers)} customers).` });
  const curve = D.concentration.curve;
  legend(sh.legend, [{ name: 'Actual', cls: 'c-accent', line: true }, { name: 'If every customer bought the same', cls: 'c-context', line: true }]);
  lineChart(sh.chart, {
    labels: curve.map((_, i) => i + '%'),
    series: [
      { name: 'If every customer bought the same', values: curve.map((_, i) => i / 100), cls: 'c-context' },
      { name: 'Actual', values: curve, cls: 'c-accent', emphasis: true, area: true },
    ],
    yFormat: (v) => fmt.pct(v), yTick: (v) => Math.round(v * 100) + '%', yMin: 0, height: 240, xTickEvery: 20,
    tipTitle: (i) => `Top ${i}% of customers`,
    ariaLabel: `Concentration curve. The top 10% of identified customers brought ${fmt.pct(D.concentration.top10)} of their net sales and the top 1% brought ${fmt.pct(D.concentration.top1)}. A table is available.`,
  });
  sh.table.replaceChildren(dataTable('Share of identified net sales from the top customers', [
    { label: 'Top share of customers', get: (r) => r + '%' },
    { label: 'Share of net sales', num: true, get: (r) => fmt.pct(curve[r]) },
  ], [1, 5, 10, 20, 30, 50, 80]));
}

function renderCountries() {
  const host = document.getElementById('fig-countries');
  const sh = figureShell(host, { id: 'countries', title: 'International markets', level: 4, subtitle: 'Net sales by country outside the UK, Dec 2010 to Nov 2011, with the number of customers. Growth vs the year before is in the table.' });
  const rows = D.countries.filter((r) => r.country !== 'United Kingdom').slice(0, 10);
  const name = (c) => (c === 'EIRE' ? 'Ireland (EIRE)' : c);
  sh.legend.hidden = true;
  hBarChart(sh.chart, {
    rows: rows.map((r) => ({ label: `${name(r.country)} (${fmt.int(r.customers_p2)})`, value: r.net_sales_p2, cls: 'c-accent', note: `${fmt.signedPct(r.growth)} vs P1, ${fmt.int(r.customers_p2)} customers` })),
    format: fmt.gbpCompact, labelWidth: 150, valueWidth: 56, rowHeight: 28, valueName: 'net sales',
    ariaLabel: 'Net sales by international country. A table is available.',
  });
  sh.table.replaceChildren(dataTable('Net sales by country (outside the UK)', [
    { label: 'Country', get: (r) => name(r.country) },
    { label: 'Net sales P1', num: true, get: (r) => fmt.gbp(r.net_sales_p1) },
    { label: 'Net sales P2', num: true, get: (r) => fmt.gbp(r.net_sales_p2) },
    { label: 'Growth', num: true, get: (r) => fmt.signedPct(r.growth) },
    { label: 'Customers P2', num: true, get: (r) => fmt.int(r.customers_p2) },
  ], rows));
}

function renderProducts() {
  const host = document.getElementById('tbl-products');
  host.replaceChildren(dataTable('Top 10 products by net sales, Dec 2010 to Nov 2011', [
    { label: 'Product', get: (r) => titleCase(r.description) },
    { label: 'Net sales', num: true, get: (r) => fmt.gbp(r.net_sales) },
    { label: 'Units', num: true, get: (r) => fmt.int(r.units) },
    { label: 'Orders', num: true, get: (r) => fmt.int(r.orders) },
    { label: 'Cancelled', num: true, get: (r) => fmt.pct(r.cancellation_rate) },
  ], D.top_products));
}
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (m, a, b) => a + b.toUpperCase());

function renderQuality() {
  const host = document.getElementById('tbl-quality');
  const q = Object.fromEntries(D.data_quality.map((r) => [r.step, r]));
  const rows = [
    ['Raw invoice lines', q.raw_rows, 'Loaded'],
    ['Exact duplicate lines', q.exact_duplicates_removed, 'Removed (mostly a 9-day overlap between the two source sheets)'],
    ['Merchandise sales', q.sale, 'Kept: basis of sales KPIs'],
    ['Cancellations', q.cancellation, 'Subtracted to get net sales'],
    ['Voided orders (sale and cancellation)', q.voided, 'Excluded from both'],
    ['Price outliers', q.price_outlier, 'Excluded'],
    ['Postage, fees, discounts, vouchers, tests', q.non_merchandise, 'Excluded'],
    ['Stock write-offs', q.stock_adjustment, 'Excluded'],
    ['Zero price lines', q.zero_price, 'Excluded'],
    ['Bad-debt and manual adjustments', q.accounting_adjustment, 'Excluded'],
  ];
  host.replaceChildren(dataTable('What happened to every raw row (whole file, Dec 2009 to Dec 2011)', [
    { label: 'Line type', get: (r) => r[0] },
    { label: 'Rows', num: true, get: (r) => fmt.int(r[1].row_count) },
    { label: 'Value', num: true, get: (r) => (r[1].line_value == null ? '' : fmt.gbp(r[1].line_value)) },
    { label: 'Treatment', get: (r) => r[2] },
  ], rows));
}

init();
