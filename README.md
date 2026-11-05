# gazish.github.io

Personal portfolio of Gazi Shafayet Hossain, data and BI analyst in Stockholm.
Live at **https://gazish.github.io**.

Plain HTML, CSS and JavaScript. No framework and no build step: every page is
a complete HTML file you can edit directly. Two small Node scripts keep the
shared header, footer and social tags in sync and check the content.

## Before the first deploy: two things to do

1. **Turn on GitHub Pages with Actions.** In this repository go to
   **Settings > Pages > Build and deployment > Source** and choose
   **GitHub Actions**. That is the only setting to change. After that, every
   push to `main` runs `.github/workflows/deploy.yml`, which checks the site
   and publishes it.
2. **Add your CV.** Put the PDF at `cv/Gazi_Shafayet_Hossain_CV.pdf`
   (create the `cv` folder). The "Download CV" buttons already point there;
   until the file exists they lead to the 404 page. The file name must match
   exactly, including capital letters.

## Run it locally

Any static file server works. From the repository root:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. (Opening the HTML files directly from disk
does not work well, because the pages use root-relative links like
`/assets/css/site.css` and the dashboards load data with `fetch`.)

## Edit content

| What | Where |
|---|---|
| Home page text, evidence numbers, project cards | `index.html` |
| A project page | `projects/<name>/index.html` |
| Experience, skills, about, contact | `experience/`, `skills/`, `about/`, `contact/` (each has an `index.html`) |
| Navigation, footer, shared `<head>` tags | `scripts/layout.mjs` (then run it, see below) |
| Colours, fonts, spacing | `assets/css/site.css` (tokens at the top, light and dark mode) |
| Structured data for search engines (JSON-LD) | the `<script type="application/ld+json">` block in each page; the main `Person` is in `index.html` |
| Plain-text summary for AI tools | `llms.txt` |
| Social preview image | `scripts/og-card.html`, then `node scripts/make-images.cjs` (needs Playwright) |

After editing, run:

```bash
node scripts/layout.mjs     # re-applies the shared header, footer and social tags
node scripts/sitemap.mjs    # refreshes sitemap.xml (when you add or remove a page)
node scripts/check.mjs      # checks the rules below; the deploy runs this too
```

`scripts/check.mjs` fails on: em or en dashes, banned cliché phrases (the
list is at the top of the script), broken internal links,
missing titles, descriptions or canonical links, pages without exactly one
`<h1>`, skipped heading levels, images without alt text and invalid JSON-LD.

To add a page: copy an existing page, change the `<title>`, the meta
description, the canonical link and the content, then run the three scripts.

## Projects with code

- `projects/online-retail-analytics/`: SQL (DuckDB) and Python pipeline on the
  public UCI Online Retail II dataset, plus the dashboard page. See its
  [README](projects/online-retail-analytics/README.md) to rerun it.
- `projects/decision-analysis-tool/`: the MCDA tool. The maths is in
  `mcda.js`, tested with `node --test projects/decision-analysis-tool/mcda.test.mjs`.
  See its [README](projects/decision-analysis-tool/README.md).

## Structure

```
index.html                 home
projects/                  project index and one folder per project
experience/ skills/ about/ contact/
404.html
assets/css, assets/js      styles, theme toggle, shared chart helpers
assets/fonts               Schibsted Grotesk (SIL Open Font License)
assets/img                 social card and icons
llms.txt, robots.txt, sitemap.xml
scripts/                   layout, sitemap, checks, image generation (not published)
.github/workflows/         GitHub Pages deployment
```

`NOTES.md` records the decisions made while building the site, the review
rounds, the Lighthouse scores and a list of things to confirm.
