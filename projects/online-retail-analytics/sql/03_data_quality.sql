-- 03_data_quality.sql
-- What happened to every raw row: duplicates removed, then one bucket per line type.

CREATE OR REPLACE TABLE data_quality AS
WITH dup AS (
    -- counted directly from the raw table, independently of the deduplicated one
    SELECT sum(n - 1) AS duplicate_rows, sum((n - 1) * quantity * unit_price) AS duplicate_value
    FROM (
        SELECT invoice, stock_code, description, quantity, invoice_ts, unit_price, customer_id, country,
               count(*) AS n
        FROM raw_lines
        GROUP BY ALL
    )
    WHERE n > 1
)
SELECT 'raw_rows' AS step, (SELECT count(*) FROM raw_lines) AS row_count,
       (SELECT round(sum(quantity * unit_price), 2) FROM raw_lines) AS line_value
UNION ALL
SELECT 'exact_duplicates_removed', duplicate_rows, round(duplicate_value, 2) FROM dup
UNION ALL
SELECT line_type, count(*), round(sum(line_value), 2)
FROM lines
GROUP BY line_type
ORDER BY
    CASE step WHEN 'raw_rows' THEN 0 WHEN 'exact_duplicates_removed' THEN 1 ELSE 2 END,
    row_count DESC;

-- Customer ID coverage on merchandise sales lines.
CREATE OR REPLACE TABLE customer_id_coverage AS
SELECT
    count(*)                                                  AS sale_lines,
    count(*) FILTER (WHERE customer_id IS NULL)               AS sale_lines_without_customer,
    sum(line_value)                                           AS sales_value,
    sum(line_value) FILTER (WHERE customer_id IS NULL)        AS sales_value_without_customer
FROM lines
WHERE line_type = 'sale';
