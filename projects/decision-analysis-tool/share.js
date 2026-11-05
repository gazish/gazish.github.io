// Encode and decode the tool's state for shareable links (#s=...).
// Decoding validates everything, so a hand-edited link cannot break the page.

export const LIMITS = { minAlts: 2, maxAlts: 8, minCrit: 2, maxCrit: 7 };
const UNC_LEVELS = [0, 0.05, 0.15, 0.3];

const toB64 = (str) => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = (b) => decodeURIComponent(escape(atob(b.replace(/-/g, '+').replace(/_/g, '/'))));

export function encodeState(S) {
  return toB64(JSON.stringify({ a: S.alternatives, c: S.criteria, x: S.matrix, p: S.points, q: S.pairs, m: S.method }));
}

export function decodeState(str) {
  try {
    const o = JSON.parse(fromB64(str));
    const nA = o.a.length, nC = o.c.length;
    if (nA < LIMITS.minAlts || nA > LIMITS.maxAlts || nC < LIMITS.minCrit || nC > LIMITS.maxCrit) return null;
    if (!Array.isArray(o.x) || o.x.length !== nA || o.x.some((r) => !Array.isArray(r) || r.length !== nC || r.some((v) => !Number.isFinite(v)))) return null;
    const points = Array.from({ length: nC }, (_, j) => Math.max(0, Math.min(100, +(o.p || [])[j] || 0)));
    return {
      alternatives: o.a.map((s) => String(s).slice(0, 80)),
      criteria: o.c.map((c, j) => ({
        id: String(c.id || 'c' + (j + 1)).slice(0, 12),
        name: String(c.name).slice(0, 60),
        unit: String(c.unit || '').slice(0, 20),
        dir: c.dir === 'min' ? 'min' : 'max',
        unc: UNC_LEVELS.includes(c.unc) ? c.unc : 0.15,
      })),
      matrix: o.x,
      points,
      pairs: Object.fromEntries(Object.entries(o.q || {}).map(([k, v]) => [String(k).slice(0, 30), Math.max(-8, Math.min(8, Math.round(+v || 0)))])),
      method: o.m === 'ahp' ? 'ahp' : 'direct',
    };
  } catch {
    return null;
  }
}
