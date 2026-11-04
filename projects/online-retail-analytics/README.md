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

I downloaded a zipped CSV copy of the dataset from a public GitHub mirror
(`dsfsi/dsfsi-datasets`, SHA-256 checked in `get_data.py`), because the UCI
site was not reachable from my build environment. The row count matches the
UCI documentation. `get_data.py --xlsx` converts the official UCI workbook to
the same CSV layout if you prefer to start from the source.

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
| `data/dashboard.json` | Aggregates used by the dashboard (38 KB) |
| `data/*.csv` | Every output table |
| `index.html`, `dashboard.js`, `dashboard.css` | The dashboard page on the website |

## Cleaning rules

| Step | Rows | Value (GBP) | Treatment |
|---|---:|---:|---|
| Raw lines | 1,067,371 | | |
| Exact duplicate lines | 34,335 | | Removed. 22,844 come from 1 to 9 Dec 2010, which appears in both yearly sheets of the source workbook. The other 11,491 (GBP 53,007, 0.3% of sales) are identical lines on the same invoice at the same minute; I treat them as duplicates too. |
| Merchandise sales | 1,003,357 | 19,643,862 | Kept. The basis for all sales KPIs |
| Cancellations (invoice starts with C) | 17,915 | -716,463 | Subtracted to get net sales, in the month of the cancellation |
| Postage, fees, manual lines, discounts, samples, vouchers, test items | 5,725 | 68,182 | Excluded. Not merchandise |
| Stock write-offs (quantity of zero or less on a normal invoice) | 3,391 | 0 | Excluded |
| Zero price lines | 2,572 | 0 | Excluded |
| Bad-debt and manual accounting adjustments | 76 | -140,048 | Excluded. Accounting entries, not trade |

Other decisions:

- **Window.** KPIs use 24 complete months, Dec 2009 to Nov 2011, split into two
  12-month periods: P1 (Dec 2009 to Nov 2010) and P2 (Dec 2010 to Nov 2011).
  December 2011 has only nine days of data and is left out.
- **Missing customer ID.** 22.6% of sales lines (13.1% of sales value) have no
  customer ID. They count in sales and order KPIs but not in customer KPIs.
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
| Cancellation rate | Cancelled value / gross sales |
| Sales without customer ID | Share of gross sales on lines with no customer ID |
| Cohort retention | Share of customers first seen in month m who order in month m + k |
| RFM segment | Recency, frequency and monetary scores (1 to 5) on P2, snapshot 1 Dec 2011. Recency and monetary are quintile scores from `cume_dist()`, so customers with equal values always get the same score. Frequency uses fixed bins (1, 2, 3 to 4, 5 to 9, 10+ orders) because 36% of customers have exactly one order and quintiles could not separate them |

## Checks

`analysis.py` stops if any of these fail:

- UK + International = All for every monthly sales, cancellation and order total
- The 24 monthly totals equal the two 12-month totals
- New + returning customers = active customers in every month
- Every raw row ends up in exactly one bucket of the cleaning table
- RFM net sales equal the identified P2 net sales of the same customers
- P2 net sales, orders, active customers, repeat rate and retention computed
  again in pandas, independently of the SQL, match the SQL results
- The revenue bridge (customers x orders per customer x AOV) closes exactly

Prices are read as exact decimals and every output table has a deterministic
sort order, so running the pipeline twice gives byte-identical files.

## Findings (P2 = Dec 2010 to Nov 2011, compared with P1)

1. **Net sales were flat: GBP 9.16M to 9.33M (+1.9%).** The UK did not grow
   (-0.1%). International grew 14.1% and reached 15.5% of net sales.
2. **Fewer, larger orders.** Orders fell 4.0% (19,743 to 18,957) while average
   order value rose 6.8% (GBP 476 to 508).
3. **Sales to identified customers fell 1.3%.** Customers +1.3%, orders per
   customer -4.3%, AOV +1.9%. The overall growth came from sales without a
   customer ID, which rose from 11.3% to 14.6% of gross sales. That is a
   measurement problem as much as a sales one: customer KPIs cover less of
   the business than a year earlier.
4. **63.9% of P1 customers ordered again in P2.** For cohorts acquired in
   2010, about 20% ordered again the month after their first purchase and
   about 18% did so 12 months later.
5. **Sales are concentrated.** The top 10% of customers brought 60.0% of P2
   net sales and the top 1% brought 30.2%. The RFM "Champions" (446 customers,
   10% of the base) brought 43.4%; with "Loyal" customers, 22% of customers
   brought 69.0%.
6. **A clear reactivation list.** 371 "At risk" customers (median four orders,
   median 116 days since the last one) brought GBP 555k (7.0% of P2 net sales).
7. **Strong seasonality.** September to November brought 37.5% of P2 net
   sales; November net sales were 2.9 times February's.
8. **Cancellations rose from 2.6% to 3.1% of gross sales** (UK 2.3% to 3.3%).
   One order of 74,215 storage jars (GBP 77k) in Jan 2011 was cancelled within
   minutes; it raises January gross sales but nets out.

## Limitations

- No cost or margin data, so this is about sales, not profit.
- No product categories; stock codes would need a mapping table.
- Wholesale customers dominate: a few customers in the Netherlands and Ireland
  account for large sales, so country growth rates are volatile.
- Missing customer IDs limit every customer KPI (see finding 3).

## What I would do next

- Find out why a customer ID is missing on almost a quarter of lines, and
  whether those sales can be matched to accounts.
- Add cost data and report gross margin next to sales.
- Map stock codes to categories and add category KPIs.
- Test a reactivation offer on the "At risk" list against a holdout group.
- Schedule the pipeline and move the checks into automated data tests.
