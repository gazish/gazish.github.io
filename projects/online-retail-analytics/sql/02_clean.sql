-- 02_clean.sql
-- Remove exact duplicate lines and label every line with what it is.
-- Only line_type = 'sale' counts as merchandise sales; 'cancellation' lines
-- are subtracted to get net sales. Everything else stays in the table but is
-- excluded from the KPIs, so the data quality summary can account for it.

CREATE OR REPLACE TABLE lines AS
WITH deduped AS (
    SELECT DISTINCT * FROM raw_lines
),
keyed AS (
    -- a stable id per line (the deduplicated rows are unique, so this order is deterministic)
    SELECT
        row_number() OVER (ORDER BY invoice, stock_code, invoice_ts, quantity, unit_price,
                                    customer_id, description, country) AS line_id,
        *
    FROM deduped
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
        END AS base_type
    FROM keyed
),
typical_price AS (
    SELECT stock_code, median(unit_price) AS median_price
    FROM classified
    WHERE base_type = 'sale'
    GROUP BY stock_code
),
priced AS (
    -- a unit price more than 10 times the product's median is treated as a pricing error
    -- (example: invoice 556444, 60 picnic baskets at 649.50 instead of about 5, credited back
    -- with a manual line). Some flagged lines are probably pack prices (for example 37370
    -- coffee mugs at about 16 against a median of 1.25); together they are about 15k, under
    -- 0.2% of sales, and do not change any KPI.
    SELECT
        c.*,
        CASE WHEN c.base_type = 'sale' AND c.unit_price > 10 * t.median_price
             THEN 'price_outlier' ELSE c.base_type END AS type2
    FROM classified AS c
    LEFT JOIN typical_price AS t USING (stock_code)
),
candidate_pairs AS (
    -- a cancellation that reverses a sale line by the same customer within one day
    -- (same product, quantity and price) is an order that was voided, not a return
    SELECT
        c.line_id AS cancel_id,
        s.line_id AS sale_id,
        row_number() OVER (PARTITION BY c.line_id ORDER BY s.invoice_ts DESC, s.line_id) AS rank_for_cancel,
        row_number() OVER (PARTITION BY s.line_id ORDER BY c.invoice_ts, c.line_id)       AS rank_for_sale
    FROM priced AS c
    JOIN priced AS s
      ON  s.customer_id = c.customer_id
      AND s.stock_code  = c.stock_code
      AND s.quantity    = -c.quantity
      AND s.unit_price  = c.unit_price
      AND s.invoice_ts <= c.invoice_ts
      AND c.invoice_ts <= s.invoice_ts + INTERVAL 1 DAY
    WHERE c.type2 = 'cancellation' AND s.type2 = 'sale'
),
voided AS (
    -- keep only one-to-one matches
    SELECT cancel_id AS line_id FROM candidate_pairs WHERE rank_for_cancel = 1 AND rank_for_sale = 1
    UNION ALL
    SELECT sale_id   AS line_id FROM candidate_pairs WHERE rank_for_cancel = 1 AND rank_for_sale = 1
)
SELECT
    p.line_id, p.invoice, p.stock_code, p.description, p.quantity, p.invoice_ts,
    p.unit_price, p.customer_id, p.country, p.line_value,
    CASE WHEN v.line_id IS NOT NULL THEN 'voided' ELSE p.type2 END AS line_type,
    CAST(date_trunc('month', p.invoice_ts) AS DATE) AS month,
    CASE WHEN p.country = 'United Kingdom' THEN 'United Kingdom' ELSE 'International' END AS market,
    -- two complete 12-month periods; December 2011 has only 9 days and is left out of KPIs
    CASE
        WHEN p.invoice_ts >= TIMESTAMP '2009-12-01' AND p.invoice_ts < TIMESTAMP '2010-12-01' THEN 'P1'
        WHEN p.invoice_ts >= TIMESTAMP '2010-12-01' AND p.invoice_ts < TIMESTAMP '2011-12-01' THEN 'P2'
    END AS period
FROM priced AS p
LEFT JOIN voided AS v USING (line_id);

-- First merchandise purchase per customer, used for new vs returning splits and cohorts.
CREATE OR REPLACE TABLE customer_first AS
SELECT
    customer_id,
    min(month)                         AS first_month,
    arg_min(market, invoice_ts)        AS first_market
FROM lines
WHERE line_type = 'sale' AND customer_id IS NOT NULL
GROUP BY customer_id;
