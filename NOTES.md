# Build notes

Decisions, checks and open questions from building this site. Written for
Gazi to read when picking the work up.

## Things you should confirm or add

1. **Add the CV PDF** at `cv/Gazi_Shafayet_Hossain_CV.pdf`. Every "Download CV"
   button points there.
2. **Switch on Pages:** Settings > Pages > Build and deployment > Source:
   **GitHub Actions**. Then merge the pull request to `main`.
3. **Thesis year and software.** I did not have the publication year or the
   software you used for the thesis (Excel, R, Python?), so the thesis page
   leaves both out. Add them to the page and to the `ScholarlyArticle`
   JSON-LD (`datePublished`) if you want. I could not open DiVA from the build
   environment, so the page uses only the facts you gave me.
4. **Thesis language.** The JSON-LD does not state a language. If the thesis
   is in English, you can add `"inLanguage": "en"`.
5. **Tech Valley Networks and Shimanto Bank** have no bullet points because I
   had no details. One line each on what you did would help.
6. **Work authorisation.** Swedish recruiters often ask whether you can work in
   Sweden without sponsorship. If that applies to you, a short line on the
   About and Contact pages would answer it up front.
7. **Swedish level.** The site says "learning at SFI". If you know your
   course level (for example SFI D), adding it is more concrete.
8. **The two projects built in this session.** The decision analysis tool
   is written in JavaScript and the retail project in SQL and Python. Read
   through the code before interviews so you can explain any part of it. I did
   **not** add JavaScript to your skills list, because you did not list it.
9. **Eastern Bank result wording.** The site says regions were flagged for
   acquisition and that "over the same period, active co-brand users grew
   12%". It does not claim the analysis caused the growth. Change it if you
   can say more.
10. **Python and R.** The skills page says "coursework" without naming the
    course or programme. Name them if you like.
11. **Retail README wording.** It says the UCI site "was not reachable from my
    build environment", which is true of this build. Rephrase if you prefer.

## Decisions

### Structure and stack
- **Plain HTML, CSS and JavaScript, no generator.** Every page is a complete
  file that can be edited on GitHub directly. A static generator would not have
  saved much for 12 pages. To avoid copy-paste drift, `scripts/layout.mjs`
  rewrites the shared `<head>` tags, header and footer between marker comments,
  and builds the Open Graph and Twitter tags from each page's own title,
  description and canonical URL.
- **Clean URLs** with one folder per page (`/projects/<name>/`). For the
  retail project the same folder holds the page and the code, so
  `projects/online-retail-analytics/` is both the URL and the code location.
- **Deployment:** GitHub Actions (`.github/workflows/deploy.yml`) runs the
  checks and the unit tests, then publishes only tracked files, excluding
  `scripts/`, `.github/`, `README.md`, `NOTES.md` and `links.txt`. Pull
  requests run the checks without deploying. Actions versions:
  checkout v5, configure-pages v6, upload-pages-artifact v5, deploy-pages v5
  (all on Node 24).

### Design
- **One accent colour:** vermilion (`#b93d12` for text and buttons, 5.1:1 on
  the background; `#e2581f` for chart marks). Warm off-white paper and near
  black ink; dark mode uses the same tokens.
- **Typography:** Schibsted Grotesk (a grotesk designed for the Nordic media
  group Schibsted), self-hosted, one 47 KB variable file, latin subset.
- **Charts follow one rule:** the accent marks what matters, grey is context.
  Where categories need colours (criteria in the decision tool, customer
  types), I used a categorical palette that passed a colour-blindness
  validator in both modes. Every chart has a "Show table" view, keyboard
  navigation (arrow keys) and tooltips.
- **Motion:** only a 2 px lift on cards, switched off with
  `prefers-reduced-motion`.
- **Brand mark:** three ranked bars, the top one in the accent colour, as a
  nod to ranking and reporting.

### Content
- Wrote only from the facts you gave. Where a page needed a "Problem" section
  and the facts did not give one, I described the task ("my job was to...")
  rather than inventing a business problem.
- Power BI and Tableau appear only as "course certificate, not yet used at
  work". The skills page labels every skill with its evidence level and links
  to the proof.
- The employer case studies say plainly that the data is confidential and is
  not shown. Nothing about the Eastern Bank E-KYC project is on the site.
- No phone number, address or date of birth. The location is "Stockholm".
- Dates use "to" instead of dashes. `scripts/check.mjs` fails the build on
  any em or en dash and on a list of cliché phrases.

### Retail analytics project
- **Real public data, not synthetic:** UCI Online Retail II (CC BY 4.0),
  1,067,371 invoice lines, Dec 2009 to Dec 2011. The UCI site was blocked
  from the build environment, so I downloaded a zipped CSV mirror from GitHub
  (`dsfsi/dsfsi-datasets`), checked its SHA-256 and confirmed the row count
  against the UCI documentation. `get_data.py --xlsx` can rebuild the CSV
  from the official workbook.
- **DuckDB** for the SQL (fast, runs from Python, Postgres-like syntax).
- **Duplicates:** 34,335 exact duplicate lines. 22,844 come from 1 to 9 Dec
  2010, which appears in both yearly sheets of the source workbook; the other
  11,491 (0.3% of sales value) are identical lines on the same invoice. All
  removed, and documented.
- **Two complete 12-month periods** (Dec 2009 to Nov 2010, Dec 2010 to Nov
  2011); the nine days of December 2011 are left out of KPIs.
- **RFM scoring** uses `cume_dist()` quintiles rather than `NTILE`. I found
  that `NTILE` split tied customers differently on each run (the number of
  "Champions" moved between 442 and 446). Prices are read as exact decimals
  and every output has a fixed sort order, so two runs give byte-identical
  files.
- **Checks:** totals reconcile across tables and markets, every raw row is
  accounted for, and the headline KPIs are recomputed in pandas independently
  of the SQL. The script stops if any check fails.

### Decision analysis tool
- Example data is **illustrative and labelled as such** on the page and in
  the README. The page also says it does not reproduce the thesis.
- AHP is used to elicit criterion weights only; options are scored with
  linear value functions on a local scale. The method notes on the page
  explain the assumptions and the main criticism (importance vs range-based
  weights).
- Stability intervals are solved exactly (scores are linear in the weight)
  instead of by trial and error; a unit test checks them against brute force.
- Monte Carlo uses Dirichlet weights around the current weights (or uniform,
  as in SMAA-2) and a fixed seed, so results do not jump around.
- 11 unit tests (`node --test projects/decision-analysis-tool/mcda.test.mjs`),
  including the standard 3 x 3 AHP textbook example (weights 0.637, 0.258,
  0.105; CR 0.033).

### Machine readability
- JSON-LD: `Person` (with `jobTitle`, `alumniOf`, `knowsAbout`, `sameAs` for
  LinkedIn and GitHub), `WebSite` and `ProfilePage` on the home page;
  `ScholarlyArticle` for the thesis; `Article`, `SoftwareApplication`,
  `CollectionPage`, `AboutPage`, `ContactPage` and `BreadcrumbList` elsewhere.
  The retail article links the source `Dataset` with its licence.
- `llms.txt` gives a plain summary, including the evidence level of each
  skill, so AI tools do not overstate Power BI or Tableau.
- `sitemap.xml` (generated from git dates), `robots.txt` (allows all
  crawlers), canonical URLs, Open Graph and Twitter card tags with a
  1200 x 630 social image on every page.

## Lighthouse

Lighthouse 12.8.2, headless Chromium, local static server (no compression,
so GitHub Pages should be at least as fast). Scores are Performance /
Accessibility / Best practices / SEO.

| Page | Mobile | Desktop |
|---|---|---|
| Home | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| Projects | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| Online retail analytics (dashboard) | 99 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| Decision analysis tool | 98 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| Thesis | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| Eastern Bank | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| ESN | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| Experience | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| Skills | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| About | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| Contact | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |

Also ran axe-core (WCAG 2.1 AA and best practices) on all 12 pages in light
and dark mode at 390 px and 1280 px, with every chart's table view open:
no violations after making the scrollable tables keyboard-focusable.

## Review rounds

(Filled in below as the reviews run.)
