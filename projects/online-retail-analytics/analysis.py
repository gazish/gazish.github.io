"""Online Retail II: end-to-end KPI pipeline.

Runs the SQL files in sql/ against the raw CSV with DuckDB, checks that the
numbers reconcile, adds a few Python-side calculations (revenue bridge,
customer concentration), and writes:

  data/dashboard.json   compact aggregates used by the dashboard on the website
  data/*.csv            every output table, for anyone who wants to check the numbers

Usage (from this folder):
  python analysis.py            # expects raw/online_retail_II.csv (see README)
"""

from __future__ import annotations

import json
import math
import os
from datetime import date, datetime
from pathlib import Path

import duckdb
import pandas as pd

HERE = Path(__file__).resolve().parent
SQL_DIR = HERE / "sql"
OUT_DIR = HERE / "data"
RAW_CSV = HERE / "raw" / "online_retail_II.csv"

MARKETS = ["All", "United Kingdom", "International"]


def run_sql(con: duckdb.DuckDBPyConnection) -> None:
    for path in sorted(SQL_DIR.glob("*.sql")):
        con.execute(path.read_text())
        print(f"ran {path.name}")


def table(con, name: str) -> pd.DataFrame:
    return con.sql(f"SELECT * FROM {name}").df()


def scalar(con, sql: str):
    return con.sql(sql).fetchall()[0][0]


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)
    print(f"  ok  {message}")


def reconcile(con) -> None:
    """Checks that compare numbers computed in different ways."""
    print("checks:")
    m = table(con, "monthly_kpis")
    p = table(con, "period_kpis")
    for col in ["gross_sales", "cancelled_value", "net_sales", "orders"]:
        all_m = m.loc[m.market == "All", col].sum()
        parts_m = m.loc[m.market != "All", col].sum()
        check(math.isclose(all_m, parts_m, rel_tol=1e-9, abs_tol=0.05),
              f"monthly {col}: UK + International = All")
    for col in ["gross_sales", "net_sales"]:
        check(math.isclose(m.loc[m.market == "All", col].sum(), p.loc[p.market == "All", col].sum(),
                           rel_tol=1e-9, abs_tol=0.5),
              f"{col}: sum of 24 months = sum of the two periods")
    nm = m[m.market == "All"]
    check(((nm.new_customers + nm.returning_customers) == nm.active_customers).all(),
          "new + returning customers (counted separately) = active customers in every month")
    first_in_window = scalar(con, "SELECT count(*) FROM customer_first WHERE first_month <= DATE '2011-11-01'")
    check(int(nm.new_customers.sum()) == first_in_window,
          f"sum of monthly new customers = customers whose first purchase is in the window ({first_in_window:,})")
    dq = table(con, "data_quality").set_index("step")
    raw = int(dq.loc["raw_rows", "row_count"])
    deduped = scalar(con, "SELECT count(*) FROM lines")
    check(raw - int(dq.loc["exact_duplicates_removed", "row_count"]) == deduped,
          f"raw rows - duplicates counted in the raw table = rows after deduplication ({deduped:,})")
    check(scalar(con, "SELECT count(*) FROM lines WHERE line_type IS NULL") == 0, "every line has a line type")
    raw_value = float(dq.loc["raw_rows", "line_value"])
    dup_value = float(dq.loc["exact_duplicates_removed", "line_value"])
    typed_value = float(dq.drop(index=["raw_rows", "exact_duplicates_removed"])["line_value"].sum())
    check(math.isclose(raw_value - dup_value, typed_value, abs_tol=0.05),
          f"raw value - duplicate value = sum of the line-type values (GBP {typed_value:,.0f})")
    v_sales = scalar(con, "SELECT count(*) FROM lines WHERE line_type = 'voided' AND invoice NOT LIKE 'C%'")
    v_cancels = scalar(con, "SELECT count(*) FROM lines WHERE line_type = 'voided' AND invoice LIKE 'C%'")
    check(v_sales == v_cancels, f"voided sales and cancellations are matched one to one ({v_sales:,} pairs)")
    outliers = scalar(con, """WITH med AS (SELECT stock_code, median(unit_price) AS m FROM lines
                                           WHERE line_type = 'sale' GROUP BY stock_code)
                              SELECT count(*) FROM lines JOIN med USING (stock_code)
                              WHERE line_type = 'sale' AND unit_price > 20 * m""")
    check(outliers == 0, "no sales line is priced at more than 20 times its product's median")
    rfm_customers = scalar(con, "SELECT count(*) FROM rfm")
    p2_active = int(p[(p.market == "All") & (p.period == "P2")].active_customers.iloc[0])
    check(rfm_customers == p2_active, f"RFM covers every active P2 customer ({rfm_customers:,})")


NON_MERCH = {"POST", "DOT", "C2", "C3", "M", "m", "D", "S", "BANK CHARGES", "AMAZONFEE",
             "CRUK", "GIFT", "TEST001", "TEST002"}


def pandas_cross_check(con) -> None:
    """Rebuild the P2 headline KPIs with pandas, independently of the SQL,
    including the price-outlier and voided-order rules, and compare."""
    df = pd.read_csv(RAW_CSV, dtype={"Invoice": str, "StockCode": str, "Customer ID": "float64"},
                     parse_dates=["InvoiceDate"]).drop_duplicates()
    df = df.sort_values(["Invoice", "StockCode", "InvoiceDate", "Quantity", "Price", "Customer ID",
                         "Description", "Country"], na_position="last", kind="mergesort").reset_index(drop=True)
    df["line_id"] = df.index
    code, inv = df["StockCode"], df["Invoice"]
    adjustment = inv.str.startswith("A") | code.isin(["B", "ADJUST", "ADJUST2"])
    non_merch = code.isin(NON_MERCH) | code.str.startswith("gift_")
    cancel = inv.str.startswith("C") & ~adjustment & ~non_merch
    sale = ~adjustment & ~non_merch & ~cancel & (df["Quantity"] > 0) & (df["Price"] > 0)
    median_price = df[sale].groupby("StockCode")["Price"].median()
    sale &= ~(df["Price"] > 10 * df["StockCode"].map(median_price))

    # voided orders: a cancellation by the same customer within a day, same product, quantity and price
    keys = ["Customer ID", "StockCode", "Price"]
    c = df[cancel & df["Customer ID"].notna()][keys + ["Quantity", "InvoiceDate", "line_id"]]
    s = df[sale & df["Customer ID"].notna()][keys + ["Quantity", "InvoiceDate", "line_id"]]
    pairs = c.merge(s, on=keys, suffixes=("_c", "_s"))
    pairs = pairs[(pairs.Quantity_s == -pairs.Quantity_c) & (pairs.InvoiceDate_s <= pairs.InvoiceDate_c)
                  & (pairs.InvoiceDate_c <= pairs.InvoiceDate_s + pd.Timedelta(days=1))]
    pairs = pairs.sort_values(["InvoiceDate_s", "line_id_s"], ascending=[False, True])
    pairs["rank_c"] = pairs.groupby("line_id_c").cumcount()
    pairs = pairs.sort_values(["InvoiceDate_c", "line_id_c"])
    pairs["rank_s"] = pairs.groupby("line_id_s").cumcount()
    kept = pairs[(pairs.rank_c == 0) & (pairs.rank_s == 0)]
    voided = df["line_id"].isin(set(kept.line_id_c) | set(kept.line_id_s))
    sale &= ~voided
    cancel &= ~voided

    in_p1 = df["InvoiceDate"].between("2009-12-01", "2010-12-01", inclusive="left")
    in_p2 = df["InvoiceDate"].between("2010-12-01", "2011-12-01", inclusive="left")
    value = df["Quantity"] * df["Price"]
    p2_sales = df[sale & in_p2]
    net = value[sale & in_p2].sum() + value[cancel & in_p2].sum()
    orders = p2_sales["Invoice"].nunique()
    per_cust = p2_sales.dropna(subset=["Customer ID"]).groupby("Customer ID")["Invoice"].nunique()
    p1_cust = set(df.loc[sale & in_p1, "Customer ID"].dropna())
    retained = len(p1_cust & set(per_cust.index)) / len(p1_cust)

    sql = con.sql("SELECT * FROM period_kpis WHERE market = 'All' AND period = 'P2'").df().iloc[0]
    check(int(voided.sum()) == scalar(con, "SELECT count(*) FROM lines WHERE line_type = 'voided'"),
          f"pandas and SQL find the same voided lines ({int(voided.sum()):,})")
    check(math.isclose(net, sql.net_sales, abs_tol=0.5), f"pandas and SQL agree on P2 net sales ({net:,.0f})")
    check(orders == sql.orders, f"pandas and SQL agree on P2 orders ({orders:,})")
    check(len(per_cust) == sql.active_customers, f"pandas and SQL agree on P2 active customers ({len(per_cust):,})")
    check(math.isclose((per_cust >= 2).mean(), sql.repeat_rate, abs_tol=5e-5),
          f"pandas and SQL agree on P2 repeat rate ({(per_cust >= 2).mean():.4f})")
    check(math.isclose(retained, sql.retained_from_p1, abs_tol=5e-5),
          f"pandas and SQL agree on retention from P1 ({retained:.4f})")


def revenue_bridge(con) -> list[dict]:
    """Bridge from P1 net sales to P2 net sales, in GBP, per market.

    Sales to identified customers are split into customers x orders per customer x
    average order value. Their change is shared out between the three factors with
    the log-mean (LMDI) method, which adds up exactly. Sales without a customer ID
    and cancellations are added as their own steps, so the bridge ties to net sales."""
    cp = table(con, "customer_period")
    pk = table(con, "period_kpis").set_index(["market", "period"])
    rows = []
    for market in MARKETS:
        d = cp if market == "All" else cp[cp.market == market]
        if market == "All":
            # a customer who bought in both markets counts once
            d = d.groupby(["period", "customer_id"], as_index=False)[["orders", "gross_sales"]].sum()
        per = {}
        for p in ["P1", "P2"]:
            x = d[d.period == p]
            k = pk.loc[(market, p)]
            ident = float(x.gross_sales.sum())
            per[p] = {
                "customers": int(x.customer_id.nunique()),
                "orders": int(x.orders.sum()),
                "identified_sales": round(ident, 2),
                "unidentified_sales": round(float(k.gross_sales) - ident, 2),
                "cancelled_value": float(k.cancelled_value),
                "net_sales": float(k.net_sales),
            }
            per[p]["orders_per_customer"] = per[p]["orders"] / per[p]["customers"]
            per[p]["aov"] = per[p]["identified_sales"] / per[p]["orders"]
        a, b = per["P1"], per["P2"]
        g1, g2 = a["identified_sales"], b["identified_sales"]
        lm = (g2 - g1) / (math.log(g2) - math.log(g1)) if g1 != g2 else g1
        steps = [
            {"key": "customers", "label": "Customers", "value": lm * math.log(b["customers"] / a["customers"]),
             "detail": f"{a['customers']:,} to {b['customers']:,}"},
            {"key": "frequency", "label": "Orders per customer", "value": lm * math.log(b["orders_per_customer"] / a["orders_per_customer"]),
             "detail": f"{a['orders_per_customer']:.2f} to {b['orders_per_customer']:.2f}"},
            {"key": "aov", "label": "Order value", "value": lm * math.log(b["aov"] / a["aov"]),
             "detail": f"GBP {a['aov']:.0f} to {b['aov']:.0f}"},
            {"key": "unidentified", "label": "Sales without ID", "value": b["unidentified_sales"] - a["unidentified_sales"],
             "detail": f"GBP {a['unidentified_sales'] / 1e3:,.0f}k to {b['unidentified_sales'] / 1e3:,.0f}k"},
            {"key": "cancellations", "label": "Cancellations", "value": -(b["cancelled_value"] - a["cancelled_value"]),
             "detail": f"GBP {a['cancelled_value'] / 1e3:,.0f}k to {b['cancelled_value'] / 1e3:,.0f}k"},
        ]
        total = b["net_sales"] - a["net_sales"]
        check(math.isclose(sum(st["value"] for st in steps), total, abs_tol=0.05),
              f"revenue bridge ties P1 net sales to P2 net sales for {market}")
        for st in steps:
            st["value"] = round(st["value"], 2)
        rows.append({
            "market": market,
            "P1": {k: (round(v, 4) if isinstance(v, float) else v) for k, v in a.items()},
            "P2": {k: (round(v, 4) if isinstance(v, float) else v) for k, v in b.items()},
            "steps": steps,
            "net_change": round(total, 2),
        })
    return rows


def mix(con) -> dict:
    """Order value for invoices with and without a customer ID, by period."""
    df = con.sql("""
        SELECT period, customer_id IS NULL AS no_id,
               count(DISTINCT invoice) AS orders, sum(line_value) AS sales
        FROM lines WHERE line_type = 'sale' AND period IS NOT NULL
        GROUP BY ALL ORDER BY ALL""").df()
    out = {}
    for _, r in df.iterrows():
        out[f"{r.period}_{'no_id' if r.no_id else 'identified'}"] = {
            "orders": int(r.orders), "sales": round(float(r.sales), 2), "aov": round(float(r.sales) / int(r.orders), 2)}
    return out


def concentration(con) -> dict:
    """Cumulative share of P2 net sales by customer percentile (largest first)."""
    c = table(con, "customer_net_p2").sort_values("net_sales", ascending=False).reset_index(drop=True)
    pos = c.net_sales.clip(lower=0)  # a few customers have net returns; they add nothing to the curve
    cum = pos.cumsum() / pos.sum()
    n = len(c)
    curve = []
    for pct in range(0, 101):
        k = round(n * pct / 100)
        curve.append(round(float(cum.iloc[k - 1]) if k > 0 else 0.0, 4))
    return {
        "customers": n,
        "negative_net_customers": int((c.net_sales < 0).sum()),
        "curve": curve,  # curve[p] = share of sales from the top p% of customers
        "top10": curve[10],
        "top20": curve[20],
        "top1": curve[1],
    }


def to_records(df: pd.DataFrame) -> list[dict]:
    def conv(v):
        if isinstance(v, (pd.Timestamp, datetime, date)):
            return v.strftime("%Y-%m")
        if isinstance(v, float) and math.isnan(v):
            return None
        if hasattr(v, "item"):
            return v.item()
        return v
    return [{k: conv(v) for k, v in row.items()} for row in df.to_dict(orient="records")]


def main() -> None:
    if not RAW_CSV.exists():
        raise SystemExit(f"Missing {RAW_CSV}. See README.md for the download step.")
    OUT_DIR.mkdir(exist_ok=True)
    con = duckdb.connect()
    os.chdir(HERE)  # SQL files use paths relative to the project folder
    run_sql(con)
    reconcile(con)
    pandas_cross_check(con)
    bridge = revenue_bridge(con)
    conc = concentration(con)
    order_mix = mix(con)

    names = ["data_quality", "customer_id_coverage", "monthly_kpis", "period_kpis",
             "cohort_retention", "rfm_segments", "country_summary", "top_products_p2"]
    frames = {n: table(con, n) for n in names}
    for n, df in frames.items():
        df.to_csv(OUT_DIR / f"{n}.csv", index=False)

    # Compact cohort matrix per market: one row per cohort, retention for months 0..12.
    # A month that has been observed but had no returning customers is 0, not missing;
    # only months after Nov 2011 are missing. The Nov 2011 cohort has no later month, so it is left out.
    cr = frames["cohort_retention"]
    last = pd.Timestamp("2011-11-01")
    cohorts = {}
    for market in MARKETS:
        x = cr[(cr.market == market) & (cr.months_since_first <= 12)]
        months = [m for m in sorted(x.cohort_month.unique()) if pd.Timestamp(m) < last]
        sizes, rows = [], []
        for m in months:
            c = x[x.cohort_month == m].set_index("months_since_first")
            sizes.append(int(c.loc[0, "cohort_size"]))
            observed = (last.year - pd.Timestamp(m).year) * 12 + last.month - pd.Timestamp(m).month
            r = c.retention.reindex(range(13))
            rows.append([round(float(v), 4) if pd.notna(v) else (0.0 if k <= observed else None)
                         for k, v in enumerate(r)])
        cohorts[market] = {
            "cohorts": [pd.Timestamp(m).strftime("%Y-%m") for m in months],
            "size": sizes,
            "retention": rows,
        }

    payload = {
        "meta": {
            "source": "UCI Machine Learning Repository: Online Retail II (Chen, 2019), CC BY 4.0",
            "source_url": "https://archive.ics.uci.edu/dataset/502/online+retail+ii",
            "window": "Dec 2009 to Nov 2011",
            "periods": {"P1": "Dec 2009 to Nov 2010", "P2": "Dec 2010 to Nov 2011"},
            "currency": "GBP",
            "generated": date.today().isoformat(),
        },
        "data_quality": to_records(frames["data_quality"]),
        "customer_id_coverage": to_records(frames["customer_id_coverage"])[0],
        "monthly": to_records(frames["monthly_kpis"]),
        "periods": to_records(frames["period_kpis"]),
        "cohorts": cohorts,
        "rfm": to_records(frames["rfm_segments"]),
        "countries": to_records(frames["country_summary"].head(12)),
        "top_products": to_records(frames["top_products_p2"].head(10)),
        "bridge": bridge,
        "concentration": conc,
        "mix": order_mix,
    }
    (OUT_DIR / "dashboard.json").write_text(json.dumps(payload, separators=(",", ":")))
    print(f"wrote data/dashboard.json ({(OUT_DIR / 'dashboard.json').stat().st_size / 1024:.1f} KB)")

    # Short printed summary, used to write the findings on the project page.
    p = frames["period_kpis"].set_index(["market", "period"])
    a1, a2 = p.loc[("All", "P1")], p.loc[("All", "P2")]
    print("\nsummary (All markets):")
    print(f"  net sales P1 {a1.net_sales:,.0f}  P2 {a2.net_sales:,.0f}  change {a2.net_sales / a1.net_sales - 1:+.1%}")
    print(f"  orders P1 {a1.orders:,}  P2 {a2.orders:,}   AOV P1 {a1.aov:,.2f}  P2 {a2.aov:,.2f}")
    print(f"  active customers P1 {a1.active_customers:,}  P2 {a2.active_customers:,}")
    print(f"  repeat rate P1 {a1.repeat_rate:.1%}  P2 {a2.repeat_rate:.1%}   retained from P1 {a2.retained_from_p1:.1%}")
    print(f"  cancellation rate P1 {a1.cancellation_rate:.1%}  P2 {a2.cancellation_rate:.1%}")
    print(f"  unidentified share P1 {a1.unidentified_share:.1%}  P2 {a2.unidentified_share:.1%}")
    for b in bridge:
        print(f"  bridge {b['market']}: " + ", ".join(f"{st['label']} {st['value'] / 1e3:+,.0f}k" for st in b["steps"])
              + f" = net change {b['net_change'] / 1e3:+,.0f}k")
    for k, v in order_mix.items():
        print(f"  mix {k}: orders {v['orders']:,}, AOV {v['aov']:,.2f}")
    print(f"  concentration P2: top 1% {conc['top1']:.1%}, top 10% {conc['top10']:.1%}, top 20% {conc['top20']:.1%} "
          f"of {conc['customers']:,} customers")


if __name__ == "__main__":
    main()
