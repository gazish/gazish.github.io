-- 06_cohort_retention.sql
-- Monthly acquisition cohorts: customers grouped by the month of their first purchase,
-- then the share of each cohort that bought again 1, 2, ... months later.
-- Market = the market of the customer's first purchase.
-- Note: the data starts in Dec 2009, so the Dec 2009 cohort also contains customers
-- who bought before that date (left-censored). The page flags this.

CREATE OR REPLACE TABLE cohort_retention AS
WITH activity AS (
    SELECT DISTINCT l.customer_id, l.month
    FROM lines AS l
    WHERE l.line_type = 'sale' AND l.customer_id IS NOT NULL AND l.period IS NOT NULL
),
cohort_activity AS (
    SELECT
        f.first_market                                   AS market,
        f.first_month                                    AS cohort_month,
        date_diff('month', f.first_month, a.month)       AS months_since_first,
        a.customer_id
    FROM activity AS a
    JOIN customer_first AS f USING (customer_id)
    WHERE f.first_month <= DATE '2011-11-01'
),
counts AS (
    SELECT
        coalesce(market, 'All')        AS market,
        cohort_month,
        months_since_first,
        count(DISTINCT customer_id)    AS customers
    FROM cohort_activity
    GROUP BY GROUPING SETS ((market, cohort_month, months_since_first), (cohort_month, months_since_first))
)
SELECT
    c.market,
    c.cohort_month,
    c.months_since_first,
    c.customers,
    s.customers                                AS cohort_size,
    round(c.customers / s.customers, 4)        AS retention
FROM counts AS c
JOIN counts AS s
    ON s.market = c.market AND s.cohort_month = c.cohort_month AND s.months_since_first = 0
ORDER BY c.market, c.cohort_month, c.months_since_first;
