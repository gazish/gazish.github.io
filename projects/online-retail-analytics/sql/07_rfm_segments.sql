-- 07_rfm_segments.sql
-- RFM segmentation of customers active in P2 (Dec 2010 to Nov 2011),
-- as of a snapshot date of 2011-12-01.
--   recency_days  days from the customer's last purchase to the snapshot date
--   frequency     distinct orders in P2
--   monetary      net sales in P2 (sales minus that customer's cancellations), GBP
-- Scores 1 to 5 (5 = best). Recency and monetary use quintiles (NTILE).
-- Frequency uses fixed bins because 1 in 3 customers has exactly one order,
-- and quintiles would split identical customers into different scores.

CREATE OR REPLACE TABLE rfm AS
WITH p2_sales AS (
    SELECT customer_id,
           max(invoice_ts)            AS last_purchase,
           count(DISTINCT invoice)    AS frequency,
           sum(line_value)            AS gross_sales
    FROM lines
    WHERE line_type = 'sale' AND period = 'P2' AND customer_id IS NOT NULL
    GROUP BY customer_id
),
p2_cancels AS (
    SELECT customer_id, -sum(line_value) AS cancelled_value
    FROM lines
    WHERE line_type = 'cancellation' AND period = 'P2' AND customer_id IS NOT NULL
    GROUP BY customer_id
),
base AS (
    SELECT
        s.customer_id,
        date_diff('day', s.last_purchase, TIMESTAMP '2011-12-01')      AS recency_days,
        s.frequency,
        s.gross_sales - coalesce(c.cancelled_value, 0)                AS monetary
    FROM p2_sales AS s
    LEFT JOIN p2_cancels AS c USING (customer_id)
),
scored AS (
    SELECT
        *,
        6 - ntile(5) OVER (ORDER BY recency_days)          AS r_score,   -- most recent = 5
        CASE
            WHEN frequency = 1 THEN 1
            WHEN frequency = 2 THEN 2
            WHEN frequency BETWEEN 3 AND 4 THEN 3
            WHEN frequency BETWEEN 5 AND 9 THEN 4
            ELSE 5
        END                                                AS f_score,
        ntile(5) OVER (ORDER BY monetary)                  AS m_score
    FROM base
)
SELECT
    *,
    -- widely used R x F segment grid
    CASE
        WHEN r_score = 5 AND f_score >= 4                 THEN 'Champions'
        WHEN r_score BETWEEN 3 AND 4 AND f_score >= 4     THEN 'Loyal'
        WHEN r_score >= 4 AND f_score BETWEEN 2 AND 3     THEN 'Potential loyalists'
        WHEN r_score = 5 AND f_score = 1                  THEN 'New'
        WHEN r_score = 4 AND f_score = 1                  THEN 'Promising'
        WHEN r_score = 3 AND f_score = 3                  THEN 'Need attention'
        WHEN r_score = 3 AND f_score <= 2                 THEN 'About to sleep'
        WHEN r_score <= 2 AND f_score = 5                 THEN 'Cannot lose them'
        WHEN r_score <= 2 AND f_score BETWEEN 3 AND 4     THEN 'At risk'
        ELSE 'Hibernating'
    END AS segment
FROM scored;

CREATE OR REPLACE TABLE rfm_segments AS
SELECT
    segment,
    count(*)                                              AS customers,
    round(sum(monetary), 2)                               AS net_sales,
    round(sum(monetary) / sum(sum(monetary)) OVER (), 4)  AS share_of_net_sales,
    round(count(*) / sum(count(*)) OVER (), 4)            AS share_of_customers,
    round(median(recency_days), 0)                        AS median_recency_days,
    round(median(frequency), 1)                           AS median_orders,
    round(median(monetary), 2)                            AS median_net_sales
FROM rfm
GROUP BY segment
ORDER BY net_sales DESC;
