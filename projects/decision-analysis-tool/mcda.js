// Multi-criteria decision analysis: the maths behind the decision tool.
// Pure functions, no DOM. Tested in mcda.test.mjs (run: node --test).
//
// Model: additive value model (weighted sum). Each criterion gets a linear
// value function on a local scale: the worst value in the table scores 0 and
// the best scores 1. The overall score is sum_j w_j * v_ij with sum_j w_j = 1.

/* ---------- helpers ---------- */
const sum = (a) => a.reduce((s, x) => s + x, 0);

export function normalizeWeights(points) {
  const s = sum(points.map((p) => Math.max(0, p)));
  if (!(s > 0)) return points.map(() => 1 / points.length);
  return points.map((p) => Math.max(0, p) / s);
}

/* ---------- value functions and scores ---------- */
// criteria: [{ dir: 'max' | 'min' }], matrix: rows = alternatives, cols = criteria
export function scales(matrix, criteria) {
  return criteria.map((_, j) => {
    const col = matrix.map((row) => row[j]);
    return { min: Math.min(...col), max: Math.max(...col) };
  });
}

export function valueOf(x, scale, dir) {
  const range = scale.max - scale.min;
  if (!(range > 0)) return 0; // no difference between options: criterion adds nothing
  return dir === 'min' ? (scale.max - x) / range : (x - scale.min) / range;
}

export function valueMatrix(matrix, criteria, sc = scales(matrix, criteria)) {
  return matrix.map((row) => row.map((x, j) => valueOf(x, sc[j], criteria[j].dir)));
}

export function weightedSum(v, w) {
  return v.map((row) => row.reduce((s, x, j) => s + w[j] * x, 0));
}

// Competition ranking: 1 = best. Equal scores (within eps) share a rank.
export function ranks(scores, eps = 1e-12) {
  return scores.map((s) => 1 + scores.filter((t) => t > s + eps).length);
}

/* ---------- AHP ---------- */
// Saaty's random consistency index, indexed by matrix size n.
export const RANDOM_INDEX = [0, 0, 0, 0.58, 0.9, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49];
export const SAATY = [1 / 9, 1 / 8, 1 / 7, 1 / 6, 1 / 5, 1 / 4, 1 / 3, 1 / 2, 1, 2, 3, 4, 5, 6, 7, 8, 9];

// Build the reciprocal matrix from upper-triangle judgements a[i][j], i < j.
export function pairwiseMatrix(n, judgement) {
  const A = Array.from({ length: n }, () => Array(n).fill(1));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = judgement(i, j);
      A[i][j] = a;
      A[j][i] = 1 / a;
    }
  }
  return A;
}

// Principal right eigenvector by power iteration, normalised to sum 1.
export function ahp(A) {
  const n = A.length;
  let w = Array(n).fill(1 / n);
  for (let it = 0; it < 1000; it++) {
    const next = A.map((row) => row.reduce((s, a, j) => s + a * w[j], 0));
    const s = sum(next);
    const nw = next.map((x) => x / s);
    const delta = Math.max(...nw.map((x, i) => Math.abs(x - w[i])));
    w = nw;
    if (delta < 1e-13) break;
  }
  const Aw = A.map((row) => row.reduce((s, a, j) => s + a * w[j], 0));
  const lambdaMax = sum(Aw.map((x, i) => x / w[i])) / n;
  const ci = n > 2 ? (lambdaMax - n) / (n - 1) : 0;
  const ri = RANDOM_INDEX[n] || 1.49;
  const cr = n > 2 ? ci / ri : 0;
  return { weights: w, lambdaMax, ci, cr, ri };
}

// Which judgement disagrees most with the derived weights?
// e_ij = a_ij * w_j / w_i is 1 for a perfectly consistent judgement.
// The suggested replacement is what the other judgements imply for that pair:
// the geometric mean of the indirect comparisons a_ik * a_kj over all k.
export function worstJudgement(A, w) {
  const n = A.length;
  let worst = null;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dev = Math.abs(Math.log(A[i][j] * w[j] / w[i]));
      if (!worst || dev > worst.deviation) worst = { i, j, current: A[i][j], deviation: dev };
    }
  }
  if (!worst) return null;
  const { i, j } = worst;
  let logSum = 0, paths = 0;
  for (let k = 0; k < n; k++) {
    if (k === i || k === j) continue;
    logSum += Math.log(A[i][k] * A[k][j]);
    paths++;
  }
  worst.implied = paths ? Math.exp(logSum / paths) : w[i] / w[j];
  worst.suggested = nearestSaaty(worst.implied);
  return worst;
}

export function nearestSaaty(x) {
  let best = SAATY[0];
  for (const s of SAATY) if (Math.abs(Math.log(s / x)) < Math.abs(Math.log(best / x))) best = s;
  return best;
}

/* ---------- one-at-a-time weight sensitivity ---------- */
// Vary the weight of criterion j from 0 to 1. The other weights keep their
// ratios to each other and are rescaled so the total stays 1. Every score is
// then linear in t:  S_i(t) = t * v_ij + (1 - t) * R_i.
export function restScores(v, w, j) {
  const others = 1 - w[j];
  return v.map((row) => {
    if (others <= 1e-12) {
      const m = row.length - 1;
      return m > 0 ? row.reduce((s, x, k) => (k === j ? s : s + x / m), 0) : 0;
    }
    return row.reduce((s, x, k) => (k === j ? s : s + (w[k] / others) * x), 0);
  });
}

export function sweep(v, w, j, steps = 101) {
  const R = restScores(v, w, j);
  const ts = Array.from({ length: steps }, (_, k) => k / (steps - 1));
  return { ts, scores: v.map((row, i) => ts.map((t) => t * row[j] + (1 - t) * R[i])) };
}

// Range of weight on criterion j for which alternative `top` stays first.
export function stabilityInterval(v, w, j, top) {
  const R = restScores(v, w, j);
  let lo = 0, hi = 1;
  const crossings = [];
  for (let k = 0; k < v.length; k++) {
    if (k === top) continue;
    // f(t) = S_top(t) - S_k(t) = b + a t
    const b = R[top] - R[k];
    const a = (v[top][j] - v[k][j]) - b;
    if (Math.abs(a) < 1e-12) { if (b < -1e-12) { lo = 1; hi = 0; } continue; }
    const t0 = -b / a;
    if (a > 0) { if (t0 > lo) { lo = t0; } } else if (t0 < hi) { hi = t0; }
    if (t0 > 0 && t0 < 1) crossings.push({ k, t: t0 });
  }
  lo = Math.max(0, lo); hi = Math.min(1, hi);
  // who takes over just outside the interval
  const overtaker = (t) => {
    const s = v.map((row, i) => t * row[j] + (1 - t) * R[i]);
    let best = 0; s.forEach((x, i) => { if (x > s[best]) best = i; });
    return best;
  };
  return {
    lo, hi,
    below: lo > 0 ? overtaker(Math.max(0, lo - 1e-6)) : null,
    above: hi < 1 ? overtaker(Math.min(1, hi + 1e-6)) : null,
    crossings: crossings.sort((p, q) => p.t - q.t),
  };
}

/* ---------- Monte Carlo (SMAA-style rank analysis) ---------- */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rng) {
  let u = 0; while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

// Marsaglia and Tsang (2000); shape < 1 uses the boost x * U^(1/shape).
export function gamma(rng, shape) {
  if (shape <= 0) return 0;
  if (shape < 1) return gamma(rng, shape + 1) * Math.pow(rng(), 1 / shape);
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, vv;
    do { x = normal(rng); vv = 1 + c * x; } while (vv <= 0);
    vv = vv * vv * vv;
    const u = rng();
    if (u < 1 - 0.0331 * x ** 4) return d * vv;
    if (Math.log(u) < 0.5 * x * x + d * (1 - vv + Math.log(vv))) return d * vv;
  }
}

export function dirichlet(rng, alpha) {
  const g = alpha.map((a) => gamma(rng, a));
  const s = sum(g);
  return s > 0 ? g.map((x) => x / s) : alpha.map(() => 1 / alpha.length);
}

// opts: { matrix, criteria, weights, kappa (0 = fixed weights, 'uniform' = any weights,
//         number = Dirichlet concentration around the weights), scoreUncertainty: [u_j]
//         (half-width as a share of the criterion's range), samples, seed }
export function simulate(opts) {
  const { matrix, criteria, weights } = opts;
  const n = matrix.length, m = criteria.length;
  const N = opts.samples || 5000;
  const rng = mulberry32(opts.seed ?? 42);
  const sc = scales(matrix, criteria);
  const unc = opts.scoreUncertainty || Array(m).fill(0);
  const anyScoreUnc = unc.some((u) => u > 0);
  const counts = Array.from({ length: n }, () => Array(n).fill(0));
  const rankSamples = Array.from({ length: n }, () => new Uint8Array(N));
  const nominalV = valueMatrix(matrix, criteria, sc);
  const alpha = opts.kappa === 'uniform' ? Array(m).fill(1) : weights.map((x) => x * opts.kappa);

  for (let s = 0; s < N; s++) {
    const w = opts.kappa === 0 ? weights : dirichlet(rng, alpha);
    let v = nominalV;
    if (anyScoreUnc) {
      v = matrix.map((row) => row.map((x, j) => {
        const range = sc[j].max - sc[j].min;
        const xx = unc[j] > 0 ? x + (2 * rng() - 1) * unc[j] * range : x;
        return valueOf(xx, sc[j], criteria[j].dir);
      }));
    }
    const r = ranks(weightedSum(v, w));
    for (let i = 0; i < n; i++) { counts[i][r[i] - 1]++; rankSamples[i][s] = r[i]; }
  }
  const pct = (arr, p) => { const a = Array.from(arr).sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))]; };
  return {
    samples: N,
    acceptability: counts.map((row) => row.map((c) => c / N)),
    best: rankSamples.map((a) => Math.min(...a)),
    worst: rankSamples.map((a) => Math.max(...a)),
    p05: rankSamples.map((a) => pct(a, 0.05)),
    p95: rankSamples.map((a) => pct(a, 0.95)),
    median: rankSamples.map((a) => pct(a, 0.5)),
  };
}
