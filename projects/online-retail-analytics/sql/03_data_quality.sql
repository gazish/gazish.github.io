-- 03_data_quality.sql
-- What happened to every raw row: duplicates removed, then one bucket per line type.

CREATE OR REPLACE TABLE data_quality AS
WITH totals AS (
    SELECT
        (SELECT count(*) FROM raw_lines) AS raw_rows,
        (SELECT count(*) FROM lines)     AS deduped_rows
)
SELECT 'raw_rows' AS step, raw_rows AS row_count, NULL::DOUBLE AS line_value FROM totals
UNION ALL
SELECT 'exact_duplicates_removed', raw_rows - deduped_rows, NULL FROM totals
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
