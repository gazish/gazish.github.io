-- 05_period_kpis.sql
-- Headline KPIs for the two complete 12-month periods, by market.
--   P1 = Dec 2009 to Nov 2010, P2 = Dec 2010 to Nov 2011
-- Distinct counts are computed over the whole period (not summed from months).
--
--   repeat_rate        share of active customers with 2 or more orders in the period
--   retained_from_p1   P2 only: share of P1 customers who bought again in P2

CREATE OR REPLACE TABLE customer_period AS
SELECT
    customer_id,
    period,
    market,
    count(DISTINCT invoice)   AS orders,
    sum(line_value)           AS gross_sales
FROM lines
WHERE line_type = 'sale' AND period IS NOT NULL AND customer_id IS NOT NULL
GROUP BY ALL;

CREATE OR REPLACE TABLE period_kpis AS
WITH sales AS (
    SELECT
        coalesce(market, 'All')                              AS market,
        period,
        sum(line_value)                                      AS gross_sales,
        count(DISTINCT invoice)                              AS orders,
        count(DISTINCT customer_id)                          AS active_customers,
        sum(line_value) FILTER (WHERE customer_id IS NULL)   AS unidentified_sales
    FROM lines
    WHERE line_type = 'sale' AND period IS NOT NULL
    GROUP BY GROUPING SETS ((market, period), (period))
),
cancels AS (
    SELECT coalesce(market, 'All') AS market, period, -sum(line_value) AS cancelled_value
    FROM lines
    WHERE line_type = 'cancellation' AND period IS NOT NULL
    GROUP BY GROUPING SETS ((market, period), (period))
),
-- a customer can (rarely) buy in both markets; per-market counts treat each market separately
cust AS (
    SELECT coalesce(market, 'All') AS market, period, customer_id, sum(orders) AS orders
    FROM customer_period
    GROUP BY GROUPING SETS ((market, period, customer_id), (period, customer_id))
),
repeat_rates AS (
    SELECT market, period, avg(CASE WHEN orders >= 2 THEN 1.0 ELSE 0.0 END) AS repeat_rate
    FROM cust
    GROUP BY market, period
),
retention AS (
    SELECT
        p1.market,
        'P2'                                                     AS period,
        count(*)                                                 AS p1_customers,
        count(p2.customer_id)                                    AS retained_customers
    FROM (SELECT * FROM cust WHERE period = 'P1') AS p1
    LEFT JOIN (SELECT * FROM cust WHERE period = 'P2') AS p2
        ON p1.market = p2.market AND p1.customer_id = p2.customer_id
    GROUP BY p1.market
)
SELECT
    s.market,
    s.period,
    CASE s.period WHEN 'P1' THEN 'Dec 2009 to Nov 2010' ELSE 'Dec 2010 to Nov 2011' END AS period_label,
    round(s.gross_sales, 2)                                              AS gross_sales,
    round(c.cancelled_value, 2)                                          AS cancelled_value,
    round(s.gross_sales - c.cancelled_value, 2)                          AS net_sales,
    round(c.cancelled_value / s.gross_sales, 4)                          AS cancellation_rate,
    s.orders,
    round(s.gross_sales / s.orders, 2)                                   AS aov,
    s.active_customers,
    round(r.repeat_rate, 4)                                              AS repeat_rate,
    round(t.retained_customers / t.p1_customers, 4)                      AS retained_from_p1,
    round(s.unidentified_sales / s.gross_sales, 4)                       AS unidentified_share
FROM sales AS s
JOIN cancels AS c USING (market, period)
JOIN repeat_rates AS r USING (market, period)
LEFT JOIN retention AS t USING (market, period)
ORDER BY market, period;
