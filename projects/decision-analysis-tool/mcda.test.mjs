// Tests for mcda.js. Run from the repository root:  node --test projects/decision-analysis-tool/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeWeights, scales, valueMatrix, weightedSum, ranks, pairwiseMatrix, ahp, worstJudgement,
  nearestSaaty, sweep, stabilityInterval, mulberry32, dirichlet, simulate,
} from './mcda.js';

const close = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);

test('weights are normalised and negative points are ignored', () => {
  assert.deepEqual(normalizeWeights([1, 1, 2]), [0.25, 0.25, 0.5]);
  assert.deepEqual(normalizeWeights([0, 0]), [0.5, 0.5]);
  assert.deepEqual(normalizeWeights([-3, 1]), [0, 1]);
});

test('linear value functions on a local scale, for benefit and cost criteria', () => {
  const m = [[10, 1], [20, 3], [30, 5]];
  const c = [{ dir: 'max' }, { dir: 'min' }];
  const v = valueMatrix(m, c);
  assert.deepEqual(v, [[0, 1], [0.5, 0.5], [1, 0]]);
  assert.deepEqual(scales(m, c), [{ min: 10, max: 30 }, { min: 1, max: 5 }]);
});

test('weighted sum and competition ranks', () => {
  const s = weightedSum([[1, 0], [0, 1], [0.5, 0.5]], [0.7, 0.3]);
  assert.deepEqual(s.map((x) => +x.toFixed(10)), [0.7, 0.3, 0.5]);
  assert.deepEqual(ranks(s), [1, 3, 2]);
  assert.deepEqual(ranks([0.5, 0.5, 0.2]), [1, 1, 3]);
});

test('AHP reproduces the textbook 3 x 3 example', () => {
  const A = [[1, 3, 5], [1 / 3, 1, 3], [1 / 5, 1 / 3, 1]];
  const r = ahp(A);
  close(r.weights[0], 0.637); close(r.weights[1], 0.258); close(r.weights[2], 0.105);
  close(r.lambdaMax, 3.0385);
  close(r.cr, 0.033);
});

test('a perfectly consistent matrix has CR = 0 and exact weights', () => {
  const w = [0.4, 0.3, 0.2, 0.1];
  const A = pairwiseMatrix(4, (i, j) => w[i] / w[j]);
  const r = ahp(A);
  r.weights.forEach((x, i) => close(x, w[i], 1e-9));
  close(r.cr, 0, 1e-9);
});

test('the worst judgement is the one that was disturbed', () => {
  const w = [0.4, 0.3, 0.2, 0.1];
  const A = pairwiseMatrix(4, (i, j) => (i === 1 && j === 3 ? 1 / 3 : w[i] / w[j]));
  const r = ahp(A);
  const bad = worstJudgement(A, r.weights);
  assert.equal(bad.i, 1); assert.equal(bad.j, 3);
  assert.equal(bad.suggested, 3); // both indirect paths imply 3
});

test('nearest Saaty value', () => {
  assert.equal(nearestSaaty(2.9), 3);
  assert.equal(nearestSaaty(0.26), 1 / 4);
  assert.equal(nearestSaaty(40), 9);
});

test('stability interval agrees with a brute-force sweep', () => {
  const v = [[1, 0.2, 0.6], [0.3, 1, 0.4], [0.6, 0.6, 0]];
  const w = [0.5, 0.3, 0.2];
  for (let j = 0; j < 3; j++) {
    const s = weightedSum(v, w); const top = s.indexOf(Math.max(...s));
    const iv = stabilityInterval(v, w, j, top);
    const sw = sweep(v, w, j, 2001);
    const okTs = sw.ts.filter((t, k) => sw.scores.every((row, i) => i === top || sw.scores[top][k] >= row[k] - 1e-12));
    close(iv.lo, Math.min(...okTs), 1e-3);
    close(iv.hi, Math.max(...okTs), 1e-3);
    assert.ok(iv.lo <= w[j] && w[j] <= iv.hi);
  }
});

test('Dirichlet samples have the expected mean', () => {
  const rng = mulberry32(7);
  const alpha = [8, 4, 2, 0.5];
  const N = 20000; const acc = [0, 0, 0, 0];
  for (let k = 0; k < N; k++) dirichlet(rng, alpha).forEach((x, i) => (acc[i] += x / N));
  const a0 = alpha.reduce((s, x) => s + x, 0);
  acc.forEach((x, i) => close(x, alpha[i] / a0, 0.01));
});

test('simulation with fixed weights and no score uncertainty gives the nominal ranking', () => {
  const matrix = [[10, 1], [20, 3], [30, 5]];
  const criteria = [{ dir: 'max' }, { dir: 'max' }];
  const r = simulate({ matrix, criteria, weights: [0.5, 0.5], kappa: 0, samples: 200, seed: 1 });
  assert.deepEqual(r.acceptability.map((row) => row.indexOf(1)), [2, 1, 0]);
  assert.deepEqual(r.best, [3, 2, 1]);
});

test('simulation is reproducible for a given seed', () => {
  const matrix = [[10, 1, 4], [20, 3, 2], [30, 2, 1]];
  const criteria = [{ dir: 'max' }, { dir: 'min' }, { dir: 'max' }];
  const o = { matrix, criteria, weights: [0.4, 0.4, 0.2], kappa: 20, scoreUncertainty: [0.1, 0.1, 0.1], samples: 500, seed: 3 };
  assert.deepEqual(simulate(o).acceptability, simulate(o).acceptability);
});
