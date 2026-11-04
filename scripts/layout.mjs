#!/usr/bin/env node
// Keeps the shared parts of every page in sync: common <head> tags, social
// card tags, the site header and the footer.
//
// Every page is a complete, hand-editable HTML file. The shared blocks sit
// between marker comments, for example:
//   <!-- layout:header -->  ...  <!-- /layout:header -->
// Edit the templates below, then run:  node scripts/layout.mjs
// The script rewrites only what is between the markers.

import { readFileSync, writeFileSync } from 'node:fs';
import { listHtml, ROOT, SITE } from './lib.mjs';
import { relative } from 'node:path';

const NAV = [
  ['/projects/', 'Projects'],
  ['/experience/', 'Experience'],
  ['/skills/', 'Skills'],
  ['/about/', 'About'],
  ['/contact/', 'Contact'],
];

const LINKS = {
  email: 'hossaingazishafayet@gmail.com',
  linkedin: 'https://www.linkedin.com/in/gazishafayet',
  github: 'https://github.com/gazish',
  cv: '/cv/Gazi_Shafayet_Hossain_CV.pdf',
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function pagePath(file) {
  let p = '/' + relative(ROOT, file).split('\\').join('/');
  if (p.endsWith('/index.html')) p = p.slice(0, -'index.html'.length);
  return p;
}

function head(page) {
  const { title, description, canonical, ogType, ogImageAlt } = page;
  const img = `${SITE}/assets/img/og-card.png`;
  return `
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>
<link rel="preload" href="/assets/fonts/schibsted-grotesk-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/site.css">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/assets/img/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<meta name="theme-color" content="#f6f4ef" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#131210" media="(prefers-color-scheme: dark)">
<meta name="author" content="Gazi Shafayet Hossain">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="Gazi Shafayet Hossain">
<meta property="og:locale" content="en_GB">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(ogImageAlt)}">${ogType === 'profile' ? `
<meta property="profile:first_name" content="Gazi Shafayet">
<meta property="profile:last_name" content="Hossain">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${img}">
`;
}

const ICON_MOON = '<svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z"/></svg>';
const ICON_SUN = '<svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/></svg>';
const MARK = '<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><rect width="32" height="32" rx="7" fill="var(--ink)"/><rect x="7" y="8" width="18" height="4.2" rx="1.6" fill="var(--accent-mark)"/><rect x="7" y="14" width="13" height="4.2" rx="1.6" fill="var(--bg)"/><rect x="7" y="20" width="8" height="4.2" rx="1.6" fill="var(--bg)"/></svg>';

function header(path) {
  const items = NAV.map(([href, label]) => {
    let cur = '';
    if (path === href) cur = ' aria-current="page"';
    else if (path.startsWith(href)) cur = ' aria-current="true"';
    return `        <li><a href="${href}"${cur}>${label}</a></li>`;
  }).join('\n');
  return `
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="container">
    <a class="brand" href="/"${path === '/' ? ' aria-current="page"' : ''}>
      ${MARK}
      <span class="brand-name">Gazi Shafayet Hossain<span>Data and BI Analyst, Stockholm</span></span>
    </a>
    <nav class="site-nav" aria-label="Main">
      <ul>
${items}
      </ul>
    </nav>
    <button class="theme-toggle" type="button" aria-label="Dark theme" aria-pressed="false">
      ${ICON_MOON}
      ${ICON_SUN}
    </button>
  </div>
</header>
`;
}

function footer() {
  return `
<footer class="site-footer">
  <div class="container">
    <div>
      <h2>Gazi Shafayet Hossain</h2>
      <p>Data and BI analyst in Stockholm. Open to Data Analyst and BI Analyst roles in Sweden and the EU.</p>
    </div>
    <div>
      <h2 class="visually-hidden">Links</h2>
      <ul>
        <li><a href="mailto:${LINKS.email}">Email</a></li>
        <li><a href="${LINKS.linkedin}" rel="me">LinkedIn</a></li>
        <li><a href="${LINKS.github}" rel="me">GitHub</a></li>
        <li><a href="${LINKS.cv}">CV (PDF)</a></li>
        <li><a href="/llms.txt">llms.txt</a></li>
      </ul>
      <p class="meta">Plain HTML, CSS and JavaScript. <a href="https://github.com/gazish/gazish.github.io">Source on GitHub</a>.</p>
    </div>
  </div>
</footer>
<script src="/assets/js/site.js" defer></script>
`;
}

function readPage(html, file) {
  const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
  const description = (html.match(/<meta name="description" content="([^"]*)">/) || [])[1];
  const canonical = (html.match(/<link rel="canonical" href="([^"]*)">/) || [])[1];
  const imgAlt = (html.match(/<meta name="x-og-image-alt" content="([^"]*)">/) || [])[1];
  if (!title || !description || !canonical) throw new Error(`${file}: needs <title>, meta description and canonical link`);
  const path = pagePath(file);
  let ogType = 'website';
  if (path === '/') ogType = 'profile';
  else if (/^\/projects\/[^/]+\/$/.test(path)) ogType = 'article';
  return {
    path,
    title: unesc(title.trim()),
    description: unesc(description),
    canonical,
    ogType,
    ogImageAlt: imgAlt ? unesc(imgAlt) : 'Gazi Shafayet Hossain, Data and BI Analyst in Stockholm',
  };
}

function replaceBlock(html, name, content, file) {
  const re = new RegExp(`(<!-- layout:${name} -->)[\\s\\S]*?(<!-- /layout:${name} -->)`);
  if (!re.test(html)) {
    if (name === 'head') throw new Error(`${file}: missing layout:${name} markers`);
    return html;
  }
  return html.replace(re, `$1${content}$2`);
}

let changed = 0;
for (const file of listHtml()) {
  const before = readFileSync(file, 'utf8');
  if (!before.includes('<!-- layout:head -->')) continue;
  const page = readPage(before, file);
  let html = replaceBlock(before, 'head', head(page), file);
  html = replaceBlock(html, 'header', header(page.path), file);
  html = replaceBlock(html, 'footer', footer(), file);
  if (html !== before) { writeFileSync(file, html); changed++; console.log('updated', relative(ROOT, file)); }
}
console.log(`layout: ${changed} file(s) updated`);
