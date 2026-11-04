-- 01_load_raw.sql
-- Load the UCI Online Retail II export as-is. One row per invoice line.
-- Source: https://archive.ics.uci.edu/dataset/502/online+retail+ii (CC BY 4.0)
-- Run from the project folder so the relative path resolves.

CREATE OR REPLACE TABLE raw_lines AS
SELECT
    "Invoice"                        AS invoice,
    "StockCode"                      AS stock_code,
    "Description"                    AS description,
    "Quantity"                       AS quantity,
    "InvoiceDate"                    AS invoice_ts,
    "Price"                          AS unit_price,      -- GBP per unit
    CAST("Customer ID" AS INTEGER)   AS customer_id,     -- NULL for about 23% of lines
    "Country"                        AS country
FROM read_csv(
    'raw/online_retail_II.csv',
    header = true,
    columns = {
        'Invoice': 'VARCHAR', 'StockCode': 'VARCHAR', 'Description': 'VARCHAR',
        'Quantity': 'INTEGER', 'InvoiceDate': 'TIMESTAMP', 'Price': 'DOUBLE',
        'Customer ID': 'DOUBLE', 'Country': 'VARCHAR'
    }
);
