#!/usr/bin/env node
// Writes sitemap.xml from the HTML pages. Run: node scripts/sitemap.mjs
// lastmod is the date of the last git commit that touched each page (today if uncommitted).
import { writeFileSync, readFileSync } from 'node:fs';
import { relative, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, SITE, listHtml } from './lib.mjs';

const today = new Date().toISOString().slice(0, 10);
const pages = listHtml()
  .filter((f) => !/404\.html$/.test(f) && !relative(ROOT, f).startsWith('scripts'))
  .filter((f) => !/<meta name="robots" content="noindex">/.test(readFileSync(f, 'utf8')))
  .map((f) => {
    const r = relative(ROOT, f).split('\\').join('/');
    let lastmod = today;
    try {
      const d = execFileSync('git', ['log', '-1', '--format=%cs', '--', r], { cwd: ROOT }).toString().trim();
      if (d) lastmod = d;
    } catch { /* not a git checkout */ }
    const path = '/' + r.replace(/index\.html$/, '');
    const priority = path === '/' ? '1.0' : path.split('/').length > 3 ? '0.8' : '0.7';
    return { loc: SITE + path, lastmod, priority };
  })
  .sort((a, b) => a.loc.localeCompare(b.loc));

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url><loc>${p.loc}</loc><lastmod>${p.lastmod}</lastmod><priority>${p.priority}</priority></url>`).join('\n')}
</urlset>
`;
writeFileSync(join(ROOT, 'sitemap.xml'), xml);
console.log(`sitemap.xml: ${pages.length} pages`);
