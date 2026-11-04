-- 02_clean.sql
-- Remove exact duplicate lines and label every line with what it is.
-- Only line_type = 'sale' counts as merchandise sales; 'cancellation' lines
-- are subtracted to get net sales. Everything else is kept in the table but
-- excluded from the KPIs, so the data quality summary can account for it.

CREATE OR REPLACE TABLE lines AS
WITH deduped AS (
    SELECT DISTINCT * FROM raw_lines
),
classified AS (
    SELECT
        *,
        quantity * unit_price AS line_value,
        CASE
            -- bad-debt write-offs and manual adjustments: accounting entries, not trade
            WHEN invoice LIKE 'A%' OR stock_code IN ('B', 'ADJUST', 'ADJUST2')
                THEN 'accounting_adjustment'
            -- postage, carriage, fees, manual lines, discounts, samples, vouchers, tests
            WHEN stock_code IN ('POST', 'DOT', 'C2', 'C3', 'M', 'm', 'D', 'S',
                                'BANK CHARGES', 'AMAZONFEE', 'CRUK', 'GIFT',
                                'TEST001', 'TEST002')
                 OR stock_code LIKE 'gift\_%' ESCAPE '\'
                THEN 'non_merchandise'
            WHEN invoice LIKE 'C%'
                THEN 'cancellation'
            -- negative or zero quantity on a normal invoice: stock write-offs
            WHEN quantity <= 0
                THEN 'stock_adjustment'
            WHEN unit_price <= 0
                THEN 'zero_price'
            ELSE 'sale'
        END AS line_type
    FROM deduped
)
SELECT
    *,
    CAST(date_trunc('month', invoice_ts) AS DATE) AS month,
    CASE WHEN country = 'United Kingdom' THEN 'United Kingdom' ELSE 'International' END AS market,
    -- two complete 12-month periods; December 2011 has only 9 days and is left out of KPIs
    CASE
        WHEN invoice_ts >= TIMESTAMP '2009-12-01' AND invoice_ts < TIMESTAMP '2010-12-01' THEN 'P1'
        WHEN invoice_ts >= TIMESTAMP '2010-12-01' AND invoice_ts < TIMESTAMP '2011-12-01' THEN 'P2'
    END AS period
FROM classified;

-- First merchandise purchase per customer, used for new vs returning splits and cohorts.
CREATE OR REPLACE TABLE customer_first AS
SELECT
    customer_id,
    min(month)                         AS first_month,
    arg_min(market, invoice_ts)        AS first_market
FROM lines
WHERE line_type = 'sale' AND customer_id IS NOT NULL
GROUP BY customer_id;
