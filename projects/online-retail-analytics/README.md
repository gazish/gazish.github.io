# Online retail sales: SQL, Python and a KPI dashboard

End-to-end analysis of two years of transactions from a UK online retailer:
raw invoice lines in, cleaned in SQL, KPIs and customer metrics defined and
checked, and an interactive dashboard on the website.

- **Dashboard and write-up:** https://gazish.github.io/projects/online-retail-analytics/
- **Data:** real, public data. Not synthetic.

## Data

UCI Machine Learning Repository, *Online Retail II* (Chen, 2019), licensed
CC BY 4.0: https://archive.ics.uci.edu/dataset/502/online+retail+ii

All transactions of a UK-based online retailer that sells giftware, mostly to
wholesale customers, from 1 Dec 2009 to 9 Dec 2011. 1,067,371 invoice lines,
43 countries, about 5,900 customer IDs. Prices are in GBP.

The CSV comes from a public GitHub mirror of the dataset
(`dsfsi/dsfsi-datasets`). `get_data.py` checks its SHA-256, and the row count
matches the UCI documentation. `get_data.py --xlsx` converts the official UCI
workbook to the same CSV layout if you prefer to start from the source.

## Run it

```bash
pip install -r requirements.txt
python get_data.py          # downloads raw/online_retail_II.csv (95 MB, not committed)
python analysis.py          # runs sql/*.sql, checks, writes data/
```

`analysis.py` takes a few seconds. It prints every check and a short summary.
You can also run the SQL files one by one in the DuckDB CLI from this folder.

## What is in this folder

| File | What it does |
|---|---|
| `sql/01_load_raw.sql` | Loads the CSV with explicit column types |
| `sql/02_clean.sql` | Removes exact duplicates, labels every line (sale, cancellation, fee, adjustment...), adds month, market and period |
| `sql/03_data_quality.sql` | Accounts for every raw row, and customer ID coverage |
| `sql/04_monthly_kpis.sql` | Monthly KPIs for All, United Kingdom and International |
| `sql/05_period_kpis.sql` | 12-month KPIs, repeat rate and retention from the previous year |
| `sql/06_cohort_retention.sql` | Monthly acquisition cohorts and retention by month |
| `sql/07_rfm_segments.sql` | RFM scores and segments |
| `sql/08_country_summary.sql` | Net sales by country, both periods |
| `sql/09_products_and_customers.sql` | Top products and customer-level net sales |
| `analysis.py` | Runs the SQL, reconciles totals, re-computes the headline KPIs in pandas as a cross-check, builds the revenue bridge and concentration curve, exports `data/` |
| `get_data.py` | Downloads the raw data (or converts the UCI workbook) |
| `data/dashboard.json` | Aggregates used by the dashboard (about 40 KB) |
| `data/*.csv` | Every output table |
| `index.html`, `dashboard.js` | The dashboard page on the website (shared chart code in `/assets/js/charts.js`) |

## Cleaning rules

| Step | Rows | Value (GBP) | Treatment |
|---|---:|---:|---|
| Raw lines | 1,067,371 | | |
| Exact duplicate lines | 34,335 | 431,717 | Removed. 22,844 come from 1 to 9 Dec 2010, which appears in both yearly sheets of the source workbook. The other 11,491 (GBP 53,007) are identical lines on the same invoice at the same minute; I treat them as duplicates too. |
| Merchandise sales | 1,001,296 | 19,239,196 | Kept. The basis for all sales KPIs |
| Cancellations (invoice starts with C) | 16,598 | -366,746 | Subtracted to get net sales, in the month of the cancellation |
| Voided orders | 2,634 | 0 | 1,317 sales lines and the cancellations that reversed them: same customer, product, quantity and price, within one day. Excluded from both sales and cancellations, because they were never really sold |
| Price outliers | 744 | 54,949 | Excluded. Unit price more than 10 times the product's median, for example 60 picnic baskets at GBP 649.50 each (invoice 556444), which was credited back with a manual line |
| Postage, fees, manual lines, discounts, samples, vouchers, test items | 5,725 | 68,182 | Excluded. Not merchandise (see "Manual lines" below) |
| Stock write-offs (quantity of zero or less on a normal invoice) | 3,391 | 0 | Excluded |
| Zero price lines | 2,572 | 0 | Excluded |
| Bad-debt and manual accounting adjustments | 76 | -140,048 | Excluded. Accounting entries, not trade |

Other decisions:

- **Window.** KPIs use 24 complete months, Dec 2009 to Nov 2011, split into two
  12-month periods: P1 (Dec 2009 to Nov 2010) and P2 (Dec 2010 to Nov 2011).
  December 2011 has only nine days of data and is left out.
- **Missing customer ID.** 22.6% of sales lines (13.3% of sales value) have no
  customer ID. They count in sales and order KPIs but not in customer KPIs.
- **Manual lines.** Lines with the stock code M (manual) cannot be tied to a
  product, so they are excluded with the other non-merchandise lines: charges
  of GBP 261k in P1 and 77k in P2, and credits of GBP -276k and -146k (-107k
  without the credit that reverses the excluded picnic-basket line). Leaving
  that one credit out in both cases, counting all manual lines would put growth
  at about 1.4%, and counting only the credits at about 3.5%. The headline
  1.6% excludes both.
- **Price outliers.** Some of the flagged lines are probably pack prices (for
  example 145 lines of 37370 coffee mugs at about GBP 16 against a median of
  GBP 1.25). Together they are about GBP 15k, under 0.2% of sales, and do not
  change any KPI.
- **Markets.** United Kingdom vs International (all other countries). Thirteen
  customer IDs bought from more than one country; per-market customer counts
  treat each market separately.
- **New customers.** "New" means first purchase in the data. Because the data
  starts in Dec 2009, every customer in P1 is new by definition, so new vs
  returning comparisons are only meaningful from P2 on.

## KPI definitions

| KPI | Definition |
|---|---|
| Gross sales | Sum of quantity x unit price on merchandise sales lines |
| Net sales | Gross sales minus the value of cancelled merchandise lines |
| Orders | Distinct sales invoices |
| Average order value (AOV) | Gross sales / orders |
| Active customers | Distinct customer IDs with at least one order in the period |
| Repeat purchase rate | Share of active customers with two or more orders in the period |
| Retained from previous year | Share of P1 customers who ordered again in P2 |
| Cancellation rate | Cancelled value / gross sales, both excluding orders voided by the customer within a day |
| Sales without customer ID | Share of gross sales on lines with no customer ID |
| Cohort retention | Share of customers first seen in month m who order in month m + k |
| RFM segment | Recency, frequency and monetary scores (1 to 5) on P2, snapshot 1 Dec 2011. Recency and monetary are quintile scores from `cume_dist()`, so customers with equal values always get the same score. Frequency uses fixed bins (1, 2, 3 to 4, 5 to 9, 10+ orders) because 36% of customers have exactly one order and quintiles could not separate them |

## Checks

`analysis.py` stops if any of these fail:

- UK + International = All for every monthly sales, cancellation and order total
- The 24 monthly totals equal the two 12-month totals
- New and returning customers, counted separately, add up to active customers in every month
- The sum of monthly new customers equals the number of customers whose first purchase falls in the window
- Raw rows minus duplicates (counted from the raw table) equal the deduplicated rows, and raw value minus duplicate value equals the sum of the line-type values
- Every line has a line type, and voided sales and cancellations are matched one to one
- No remaining sales line is priced above 20 times its product's median
- The RFM table covers every active P2 customer
- The voided lines, P2 net sales, orders, active customers, repeat rate and
  retention are computed again in pandas, independently of the SQL, and must match
- The revenue bridge ties P1 net sales to P2 net sales exactly, for each market

Prices are read as exact decimals and every output table has a deterministic
sort order, so running the pipeline twice gives byte-identical files.

## Findings (P2 = Dec 2010 to Nov 2011, compared with P1)

1. **Net sales grew 1.6%: GBP 9.14M to 9.29M.** The UK fell 0.4%.
   International grew 14.1% and now makes up 15.6% of net sales. Country
   figures swing on a few wholesale accounts: Australia (9 customers) added
   GBP 108k, 60% of the international increase, and Ireland (3) lost GBP 91k.
2. **Fewer, larger orders, but only without a customer ID.** Orders fell 3.9%
   and average order value rose 5.7% (GBP 474 to 501). For identified
   customers, order value barely moved (GBP 456 to 459). The average order
   without a customer ID went from GBP 685 to 1,055.
3. **Gross sales to identified customers fell 2.6%.** The revenue bridge (in GBP,
   P1 to P2 net sales): more active customers +105k, fewer orders per
   customer -366k, order value +49k, sales without a customer ID +351k,
   cancellations +5k, total +144k. Sales without a customer ID went from
   11.3% to 14.8% of gross sales, so customer KPIs cover less of the business
   than a year earlier.
4. **63.9% of P1 customers ordered again in P2.** For cohorts acquired in
   2010, about 20% ordered again the month after their first purchase and
   about 18% did so 12 months later.
5. **Sales are concentrated.** Among identified customers, the top 10% brought
   59.9% of their P2 net sales and the top 1% brought 30.0%. The RFM
   "Champions" (446 customers, 10% of identified customers) brought 43.6%;
   with "Loyal" customers, 22% of customers brought 69.4%.
6. **An obvious group for a reactivation test.** 360 "At risk" customers
   (median four orders, median 118 days since the last one) spent GBP 491k in
   P2, 6.2% of net sales to identified customers.
7. **Strong seasonality.** September to November brought 37.7% of P2 net
   sales; November net sales were 2.9 times February's.
8. **Cancellations were flat overall, but rose in the UK.** They were 2.0% of
   gross sales in P1 and 1.9% in P2: the UK went from 1.7% to 1.9% and
   International fell from 3.5% to 1.7%. The rate excludes voided orders
   (GBP 57k in P1, 123k in P2). Before I separated those, one order of 74,215
   storage jars (GBP 77k) in Jan 2011, cancelled 16 minutes later, made it look
   as if cancellations had gone up overall.

## Limitations

- No cost or margin data, so this is about sales, not profit.
- No product categories; stock codes would need a mapping table.
- Wholesale customers dominate: a few customers in the Netherlands and Ireland
  account for large sales, so country growth rates are volatile.
- Missing customer IDs limit every customer KPI (see finding 3).
- The voided-order and price-outlier rules are judgement calls; both are
  documented in `sql/02_clean.sql` and their totals are in the cleaning table.

## What I would do next

- Find out why a customer ID is missing on almost a quarter of lines, and
  whether those sales can be matched to accounts.
- Add cost data and report gross margin next to sales.
- Map stock codes to categories and add category KPIs.
- Test a reactivation offer on the "At risk" list against a holdout group.
- Schedule the pipeline and move the checks into automated data tests.
