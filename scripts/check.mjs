#!/usr/bin/env node
// Site checks. Run before committing:  node scripts/check.mjs
// Fails (exit 1) on errors; prints warnings that do not block a deploy.
//
//   - no em dashes or en dashes anywhere in the content
//   - none of the banned cliché phrases
//   - every page: <html lang>, one <h1>, a title, a meta description, a canonical URL,
//     no skipped heading levels, alt text on images, valid JSON-LD
//   - every internal link points to a file that exists

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative, extname } from 'node:path';
import { ROOT, walk, listHtml } from './lib.mjs';

const errors = [];
const warnings = [];
const rel = (f) => relative(ROOT, f);

/* ---------- text rules ---------- */
const BANNED = [
  'passionate', 'results-driven', 'results driven', 'leverage', 'leveraged', 'leveraging', 'spearhead',
  'seamless', 'seamlessly', 'delve', 'cutting-edge', 'cutting edge', 'synergy', 'game-changer',
  'world-class', 'thrilled', 'proven track record', 'fast-paced', 'detail-oriented', 'go-getter',
  'unlock', 'empower', 'holistic', 'tapestry', 'deep dive', 'state-of-the-art', 'best-in-class',
];
const TEXT_EXT = new Set(['.html', '.md', '.txt', '.js', '.mjs', '.css', '.py', '.sql', '.json', '.xml', '.yml']);
const files = walk().filter((f) => TEXT_EXT.has(extname(f)) && !rel(f).startsWith('projects/online-retail-analytics/data/'));
files.push(join(ROOT, '.github/workflows/deploy.yml'));
for (const f of files) {
  if (!existsSync(f)) continue;
  const text = readFileSync(f, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (/[—–]/.test(line)) errors.push(`${rel(f)}:${i + 1}: em or en dash`);
    if (rel(f) === 'scripts/check.mjs') return;
    const lower = line.toLowerCase();
    for (const b of BANNED) {
      const re = new RegExp(`(^|[^a-z])${b.replace(/[-\s]/g, '[-\\s]')}([^a-z]|$)`);
      if (re.test(lower)) errors.push(`${rel(f)}:${i + 1}: banned phrase "${b}"`);
    }
  });
}

/* ---------- page rules ---------- */
const stripTags = (s) => s.replace(/<[^>]+>/g, '').trim();
function resolveLink(fromFile, href) {
  const clean = href.split('#')[0].split('?')[0];
  if (!clean) return null;
  let target = clean.startsWith('/') ? join(ROOT, clean) : join(dirname(fromFile), clean);
  if (clean.endsWith('/')) target = join(target, 'index.html');
  else if (existsSync(target) && statSync(target).isDirectory()) target = join(target, 'index.html');
  return target;
}

for (const f of listHtml()) {
  const html = readFileSync(f, 'utf8');
  const name = rel(f);
  if (name.startsWith('scripts/')) continue;
  if (!/<html lang="[a-z]{2}/.test(html)) errors.push(`${name}: missing <html lang>`);
  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) errors.push(`${name}: ${h1} <h1> elements (want 1)`);
  const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
  if (!title) errors.push(`${name}: missing <title>`);
  else if (title.length > 90) warnings.push(`${name}: title is ${title.length} characters`);
  const desc = (html.match(/<meta name="description" content="([^"]*)">/) || [])[1];
  if (!desc) errors.push(`${name}: missing meta description`);
  else if (desc.length > 200) warnings.push(`${name}: description is ${desc.length} characters`);
  if (!/<link rel="canonical" href="https:\/\/gazish\.github\.io\/[^"]*">/.test(html)) errors.push(`${name}: missing canonical link`);
  if (!/property="og:image"/.test(html)) errors.push(`${name}: missing Open Graph tags (run node scripts/layout.mjs)`);

  // heading order (static markup only)
  const levels = [...html.replace(/<script[\s\S]*?<\/script>/g, '').matchAll(/<h([1-6])[\s>]/g)].map((m) => +m[1]);
  levels.forEach((l, i) => { if (i > 0 && l > levels[i - 1] + 1) errors.push(`${name}: heading jumps from h${levels[i - 1]} to h${l}`); });

  for (const m of html.matchAll(/<img\b[^>]*>/g)) if (!/\balt="/.test(m[0])) errors.push(`${name}: <img> without alt`);

  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch (e) { errors.push(`${name}: invalid JSON-LD (${e.message})`); }
  }

  for (const m of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const href = m[1];
    if (/^(https?:|mailto:|tel:|data:|#)/.test(href)) continue;
    const target = resolveLink(f, href);
    if (!target || existsSync(target)) continue;
    if (href.startsWith('/cv/')) warnings.push(`${href} does not exist yet: add your CV PDF (linked from several pages)`);
    else errors.push(`${name}: broken link ${href}`);
  }
  for (const m of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)) {
    if (!stripTags(m[1]) && !/aria-label=/.test(m[0])) errors.push(`${name}: link without text`);
  }
}

for (const w of [...new Set(warnings)]) console.log('warning:', w);
for (const e of errors) console.log('ERROR:', e);
console.log(`check: ${errors.length} error(s), ${new Set(warnings).size} warning(s)`);
process.exit(errors.length ? 1 : 0);
