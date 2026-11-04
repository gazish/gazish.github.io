-- 08_country_summary.sql
-- Net sales, orders and customers by country for both periods, with growth.

CREATE OR REPLACE TABLE country_summary AS
WITH s AS (
    SELECT country, period,
           sum(line_value)               AS gross_sales,
           count(DISTINCT invoice)       AS orders,
           count(DISTINCT customer_id)   AS customers
    FROM lines
    WHERE line_type = 'sale' AND period IS NOT NULL
    GROUP BY ALL
),
c AS (
    SELECT country, period, -sum(line_value) AS cancelled_value
    FROM lines
    WHERE line_type = 'cancellation' AND period IS NOT NULL
    GROUP BY ALL
),
n AS (
    SELECT s.country, s.period, s.gross_sales - coalesce(c.cancelled_value, 0) AS net_sales,
           s.orders, s.customers
    FROM s LEFT JOIN c USING (country, period)
)
SELECT
    country,
    round(sum(net_sales) FILTER (WHERE period = 'P1'), 2)   AS net_sales_p1,
    round(sum(net_sales) FILTER (WHERE period = 'P2'), 2)   AS net_sales_p2,
    sum(orders) FILTER (WHERE period = 'P2')                AS orders_p2,
    sum(customers) FILTER (WHERE period = 'P2')             AS customers_p2,
    round(sum(net_sales) FILTER (WHERE period = 'P2')
          / nullif(sum(net_sales) FILTER (WHERE period = 'P1'), 0) - 1, 4) AS growth
FROM n
GROUP BY country
ORDER BY net_sales_p2 DESC NULLS LAST;
