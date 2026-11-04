-- 04_monthly_kpis.sql
-- Monthly KPIs for All markets, the United Kingdom and International (non-UK).
-- Window: Dec 2009 to Nov 2011 (24 complete months).
--
-- Definitions
--   gross_sales      sum(quantity * unit_price) on merchandise sale lines, GBP
--   cancelled_value  value of cancelled merchandise lines, booked in the month of the cancellation
--   net_sales        gross_sales - cancelled_value
--   orders           distinct sale invoices
--   aov              gross_sales / orders
--   active_customers distinct customer IDs with at least one sale invoice in the month
--   new_customers    active customers whose first purchase in the data is this month

CREATE OR REPLACE TABLE monthly_kpis AS
WITH sales AS (
    SELECT l.*, f.first_month
    FROM lines AS l
    LEFT JOIN customer_first AS f USING (customer_id)
    WHERE l.line_type = 'sale' AND l.period IS NOT NULL
),
sales_by_month AS (
    SELECT
        coalesce(market, 'All')                                                AS market,
        month,
        sum(line_value)                                                        AS gross_sales,
        count(DISTINCT invoice)                                                AS orders,
        count(DISTINCT customer_id)                                            AS active_customers,
        count(DISTINCT customer_id) FILTER (WHERE first_month = month)         AS new_customers,
        sum(line_value) FILTER (WHERE first_month = month)                     AS new_customer_sales,
        sum(line_value) FILTER (WHERE first_month < month)                     AS returning_customer_sales,
        sum(line_value) FILTER (WHERE customer_id IS NULL)                     AS unidentified_sales
    FROM sales
    GROUP BY GROUPING SETS ((market, month), (month))
),
cancels_by_month AS (
    SELECT
        coalesce(market, 'All')   AS market,
        month,
        -sum(line_value)          AS cancelled_value
    FROM lines
    WHERE line_type = 'cancellation' AND period IS NOT NULL
    GROUP BY GROUPING SETS ((market, month), (month))
)
SELECT
    s.market,
    s.month,
    round(s.gross_sales, 2)                                    AS gross_sales,
    round(coalesce(c.cancelled_value, 0), 2)                   AS cancelled_value,
    round(s.gross_sales - coalesce(c.cancelled_value, 0), 2)   AS net_sales,
    s.orders,
    round(s.gross_sales / s.orders, 2)                         AS aov,
    s.active_customers,
    s.new_customers,
    s.active_customers - s.new_customers                       AS returning_customers,
    round(coalesce(s.new_customer_sales, 0), 2)                AS new_customer_sales,
    round(coalesce(s.returning_customer_sales, 0), 2)          AS returning_customer_sales,
    round(coalesce(s.unidentified_sales, 0), 2)                AS unidentified_sales
FROM sales_by_month AS s
LEFT JOIN cancels_by_month AS c USING (market, month)
ORDER BY market, month;
