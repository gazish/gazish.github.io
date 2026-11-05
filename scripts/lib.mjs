// Shared helpers for the site scripts (no dependencies).
import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SITE = 'https://gazish.github.io';

// Folders that are not part of the published site.
export const SKIP_DIRS = new Set(['.git', '.github', 'node_modules', 'scripts', '_site', 'raw']);

export function walk(dir = ROOT, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

export const listHtml = () => walk().filter((f) => f.endsWith('.html'));
