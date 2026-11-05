# Build notes

Decisions, checks and open questions from building this site. Written for
Gazi to read when picking the work up.

## Things you should confirm or add

1. **Add the CV PDF** at `cv/Gazi_Shafayet_Hossain_CV.pdf`. Every "Download CV"
   button points there.
2. **Switch on Pages:** Settings > Pages > Build and deployment > Source:
   **GitHub Actions**. Then merge the pull request to `main`.
3. **Thesis year, citation and software.** I did not have the publication year,
   the author order on DiVA, the findings or the software you used, so the
   thesis page leaves them out (there is no "cite as" line). Add a citation
   in the DiVA author order, two or three sentences of findings from the
   abstract, and the year (also as `datePublished` in the `ScholarlyArticle`
   JSON-LD). I could not open DiVA from the build environment.
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
9. **Eastern Bank 12%.** The site gives "active co-brand users grew 12% over
   the period" as context only, in its own sentence, and does not link it to
   the regional analysis. If you can say more about your part in that
   growth, add it in your own words.
10. **Python and R.** The skills page says "coursework" without naming the
    course or programme. Name them if you like.
11. **Retail dashboard in a BI tool.** Two reviewers suggested rebuilding the
    retail KPIs in Looker Studio or Power BI and linking it, so a BI recruiter
    can see work in the tool itself. The CSVs in
    `projects/online-retail-analytics/data/` are ready to load.
12. **How the two portfolio projects were made.** The retail analytics project
    and the decision tool were built in this session, and the public commits
    show Claude as co-author. The pages now say "made for this site" rather
    than "I built". Decide how you want to describe your part (for example,
    built with an AI coding assistant, with you choosing the questions and
    checking the results) and add one honest line to those two pages. Do not
    rewrite the commit history to hide it. NOTES.md is also public in the
    repository; delete or move it once you have read it if you prefer.
13. **CV first.** Once the PDF is in place, consider making "Download CV" the
    main button in the hero (a recruiter suggestion).
14. **Interview preparation.** The Head of Data reviewer said these are the
    questions they would ask about the retail project: why orders voided
    within a day are left out of cancellations (GBP 123k of voided sales in
    P2 against GBP 179k of remaining cancellations); why the price-outlier
    cut-off is 10 times the median, and that it also catches about GBP 15k of
    pack prices; what the log-mean (LMDI) split in the revenue bridge does;
    and why the manual-line range runs from 1.4% to 3.5%. For the decision
    tool, expect questions on AHP consistency, why weights depend on ranges,
    and how the exact rank intervals differ from the simulated ones.

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
- **Voided orders and price outliers** (added after review round 1): a sale
  cancelled by the same customer within a day is excluded from both sales and
  cancellations, and a unit price above 10 times the product's median is
  treated as a pricing error. Both rules and their totals are documented.
- **Checks:** each check compares two independent computations (markets
  against the total, months against years, duplicates counted from the raw
  table, a pandas re-implementation of the cleaning rules and headline KPIs).
  The script stops if any check fails.

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
- 15 unit tests (`node --test projects/decision-analysis-tool/mcda.test.mjs`),
  including a 3 x 3 AHP example worked by hand (weights 0.637, 0.258, 0.105;
  CR 0.033) and brute-force checks of the stability and rank intervals.

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

Five reviewers, each a separate subagent that saw only the owner's brief and
the site (not my build reasoning). Each scored the site out of 10 and listed
fixes.

### Round 1

| Reviewer | Score | Main points |
|---|---|---|
| Stockholm tech recruiter | 7 | No work permit or availability; the only outcome number (12%) and the course-trained tools were missing from the home page; the "3 municipality cases" stat was filler; "worth GBP 555k a year" overstated; RFM and concentration shares were of identified customers, not of all net sales; projects page put the retail dashboard last |
| Head of Data | 7 | Would interview. Found real data errors: one voided GBP 77k order created the whole "cancellations rose" finding; a mispriced GBP 39k picnic-basket line counted as a sale; three reconciliation checks could not fail by construction; real 0% cohort cells shown as blank; one inner join that should be a left join; "New" RFM segment misnamed |
| PhD supervisor (decision analysis) | 7 | Maths verified (all numbers reproduced). Bugs: the "most sensitive weight" sentence could state the wrong direction; a shared link with two criteria crashed the sweep chart. Sampled rank extremes are not best/worst cases; the range-dependence of weights applies to direct points too; consistency hint shown when CR was fine; thesis page repeated itself and some wording went past the brief |
| Front-end designer | 7.5 | Chart values not announced to screen readers; heatmap text and some marks below contrast minimums; categorical orange equal to the accent; nav wrapped at 360 px; metric switch clipped; timeline dots off the line; tool table cut names; negative money shown as "GBP-716,463" |
| Skeptical editor | 7 | 12% shown as a result (implied causation); "a year" overstated; thesis wording not in the brief ("survey design", per-score uncertainty); NOTES.md public in the repo; padded case studies; repeated "not only X" pattern; "self-service" not in the brief |

What changed after round 1:

- **Retail data:** new `voided` and `price_outlier` line types (with a pandas
  re-implementation that finds the same 2,634 voided lines). Net sales growth
  is now 1.6%, not 1.9%, and cancellations fell slightly (2.0% to 1.9%)
  instead of rising. Reconciliation checks rewritten so each compares two
  independent computations. Cohort heatmap shows real zeros. Inner join fixed.
  The revenue bridge is now in GBP and ties P1 net sales to P2 net sales
  (log-mean split of the identified-customer effects). Findings rewritten,
  including the mix effects (order value only rose for orders without a
  customer ID; Australia and Ireland drive the international change). Manual
  credit lines and their effect on growth are documented (the round-1 figure
  of 3.1% was superseded in rounds 2 and 3; see below).
- **Decision tool:** fixed the direction bug (new tested `weightTolerance`)
  and the two-criteria crash; added exact best- and worst-case rank intervals
  (closed form, tested against brute force); Saaty's size-dependent CR limits;
  the "use the suggested judgement" button only appears above the limit;
  ranges shown next to the weight sliders; method notes now cover range
  dependence (Keeney 2002), the Dirichlet spread, extrapolation, Monte Carlo
  error and more references; share links moved to `share.js` with tests.
  15 tests now.
- **Design and accessibility:** live region for chart values, heatmap cell
  opacity capped per theme so text keeps contrast, stronger grey for context
  marks and form-control borders, criterion colours without orange (validated
  for colour blindness), nav fits one row at 360 px, metric switch and tool
  table fixed, timeline dots aligned, case-page facts box readable, proper
  minus signs, theme-color follows the toggle, neutral two-sided AHP sliders.
- **Copy:** 12% moved to "context" with an explicit note that it is not
  claimed as a result; "spent GBP 491k in P2" instead of "worth GBP 555k a
  year"; identified-customer labels; thesis wording kept to the brief, plus a
  "Methods" section that maps each problem to a component; case studies
  trimmed; "From work and volunteering"; "What I would change"; repeated
  phrases cut; home stats now 150k+, 519 and 120+.
- **Not changed, and why:** work permit and availability (not in the brief;
  listed above for you to add); thesis year, abstract findings and
  software (DiVA is not reachable from the build environment and a web search
  found nothing; listed above); NOTES.md stays in the repository because you
  asked for it, but see item 12 above; a Looker Studio or Power BI version of
  the retail dashboard needs your own accounts.

### Round 2

| Reviewer | Score | Main points |
|---|---|---|
| Stockholm tech recruiter | 8 | "null" printed in the cohort legend; public commits show AI co-authorship next to "projects I built"; home timeline out of order; tool table too wide on desktop; thesis Methods credited the thesis with a framework |
| Head of Data | 8 | Would interview; every number reproduced. Same "null"; manual-line sensitivity shown from one side only; cancellation-rate definition did not say it excludes voided orders; two checks still true by construction; some price outliers are pack prices |
| PhD supervisor | 8 | Exact rank intervals wrong when a criterion is constant, and the test for them was circular; exact and simulated intervals mixed on one chart; "cite as" line with an author order not in the brief |
| Front-end designer | 8 | Tool table regression (remove buttons pushed out of cells, axe target-size), "null", stability labels overflowing at 360 px, nav spread out at 768 px |
| Skeptical editor | 8 | "null"; 12% still joined to the regional work on Experience and llms.txt and "not ... alone" still implied partial cause; unsupported "cite as" line and framework attribution on the thesis page; small wording and repetition items |

What changed after round 2:

- **Bug fixes:** the "null" text; exact rank intervals now skip criteria with
  no range, and a new test enumerates all 4,096 corners of two 4 x 3 tables;
  the tool table uses fixed-width name inputs (full name in a tooltip), fits
  at desktop widths, and shows a scroll hint only when it overflows;
  stability-chart labels truncate; the nav only spreads out on small phones.
- **Retail:** manual lines reported from both sides (growth about 1.4% with
  all manual charges and credits, about 3.5% with credits only, 1.6%
  headline; 1.4% corrected from 1.0% in round 3); cancellation rate defined as excluding voided orders, finding 8
  says the UK rose; the two circular checks replaced with a value
  reconciliation and a one-to-one pairing check; pack prices noted; "gross
  sales to identified customers"; tile deltas computed from the rounded
  shares; data cleaning table moved into a collapsible section.
- **Tool:** exact intervals drawn only when the table values vary, labelled
  "table values only (weights fixed)", with the size of the score range in
  the subtitle; smaller default uncertainty ratings so the example intervals
  say something (ponds 1st to 3rd); clearer Monte Carlo error wording; AHP
  pairs say "counts more than" (range-based) instead of "more important";
  constant criteria are flagged under their slider; criterion colours
  reordered to avoid two greens side by side.
- **Copy:** "made for this site" instead of "I built"; 12% as a separate
  context line everywhere; thesis page without the "cite as" line or the
  framework attribution, with the problem-to-component mapping folded into
  Approach; home timeline in date order; ESN and Eastern Bank pages trimmed.

