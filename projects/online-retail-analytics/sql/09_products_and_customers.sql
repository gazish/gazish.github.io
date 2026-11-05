-- 09_products_and_customers.sql
-- Customer-level net sales in P2 (input for the concentration curve in analysis.py)
-- and the top products by net sales in P2.

CREATE OR REPLACE TABLE customer_net_p2 AS
SELECT customer_id, monetary AS net_sales
FROM rfm;

CREATE OR REPLACE TABLE top_products_p2 AS
WITH p AS (
    SELECT
        stock_code,
        sum(line_value) FILTER (WHERE line_type = 'sale')            AS gross_sales,
        -sum(line_value) FILTER (WHERE line_type = 'cancellation')   AS cancelled_value,
        sum(quantity) FILTER (WHERE line_type = 'sale')              AS units,
        count(DISTINCT invoice) FILTER (WHERE line_type = 'sale')    AS orders
    FROM lines
    WHERE period = 'P2' AND line_type IN ('sale', 'cancellation')
    GROUP BY stock_code
),
names AS (
    -- most common description per stock code (descriptions vary slightly between lines)
    SELECT stock_code, mode(trim(description)) AS description
    FROM lines
    WHERE line_type = 'sale' AND description IS NOT NULL
    GROUP BY stock_code
)
SELECT
    p.stock_code,
    n.description,
    round(p.gross_sales - coalesce(p.cancelled_value, 0), 2)   AS net_sales,
    p.units,
    p.orders,
    round(coalesce(p.cancelled_value, 0) / p.gross_sales, 4)   AS cancellation_rate
FROM p
JOIN names AS n USING (stock_code)
WHERE p.gross_sales > 0
ORDER BY net_sales DESC
LIMIT 15;
