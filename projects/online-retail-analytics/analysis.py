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
    """Totals must agree across the different tables and market splits."""
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
          "new + returning customers = active customers in every month")
    dq = table(con, "data_quality").set_index("step")
    raw = int(dq.loc["raw_rows", "row_count"])
    accounted = int(dq.drop(index="raw_rows")["row_count"].sum())
    check(raw == accounted, f"every raw row is accounted for ({raw:,} rows)")
    rfm_total = scalar(con, "SELECT sum(net_sales) FROM rfm_segments")
    ident = scalar(con, """SELECT sum(line_value) FROM lines WHERE period='P2' AND customer_id IS NOT NULL
                       AND line_type IN ('sale','cancellation')
                       AND customer_id IN (SELECT customer_id FROM rfm)""")
    check(math.isclose(rfm_total, ident, rel_tol=1e-9, abs_tol=0.5),
          "RFM net sales = identified P2 net sales of the same customers")


NON_MERCH = {"POST", "DOT", "C2", "C3", "M", "m", "D", "S", "BANK CHARGES", "AMAZONFEE",
             "CRUK", "GIFT", "TEST001", "TEST002"}


def pandas_cross_check(con) -> None:
    """Rebuild the P2 headline KPIs with pandas, independently of the SQL,
    and compare. Catches logic slips in either implementation."""
    df = pd.read_csv(RAW_CSV, dtype={"Invoice": str, "StockCode": str, "Customer ID": "float64"},
                     parse_dates=["InvoiceDate"]).drop_duplicates()
    code, inv = df["StockCode"], df["Invoice"]
    adjustment = inv.str.startswith("A") | code.isin(["B", "ADJUST", "ADJUST2"])
    non_merch = code.isin(NON_MERCH) | code.str.startswith("gift_")
    cancel = inv.str.startswith("C") & ~adjustment & ~non_merch
    sale = ~adjustment & ~non_merch & ~cancel & (df["Quantity"] > 0) & (df["Price"] > 0)
    in_p1 = df["InvoiceDate"].between("2009-12-01", "2010-12-01", inclusive="left")
    in_p2 = df["InvoiceDate"].between("2010-12-01", "2011-12-01", inclusive="left")
    value = df["Quantity"] * df["Price"]

    p2_sales = df[sale & in_p2]
    gross = value[sale & in_p2].sum()
    net = gross + value[cancel & in_p2].sum()
    orders = p2_sales["Invoice"].nunique()
    per_cust = p2_sales.dropna(subset=["Customer ID"]).groupby("Customer ID")["Invoice"].nunique()
    p1_cust = set(df.loc[sale & in_p1, "Customer ID"].dropna())
    retained = len(p1_cust & set(per_cust.index)) / len(p1_cust)

    sql = con.sql("SELECT * FROM period_kpis WHERE market = 'All' AND period = 'P2'").df().iloc[0]
    check(math.isclose(net, sql.net_sales, abs_tol=0.5), f"pandas and SQL agree on P2 net sales ({net:,.0f})")
    check(orders == sql.orders, f"pandas and SQL agree on P2 orders ({orders:,})")
    check(len(per_cust) == sql.active_customers, f"pandas and SQL agree on P2 active customers ({len(per_cust):,})")
    check(math.isclose((per_cust >= 2).mean(), sql.repeat_rate, abs_tol=5e-5),
          f"pandas and SQL agree on P2 repeat rate ({(per_cust >= 2).mean():.4f})")
    check(math.isclose(retained, sql.retained_from_p1, abs_tol=5e-5),
          f"pandas and SQL agree on retention from P1 ({retained:.4f})")


def revenue_bridge(con) -> list[dict]:
    """Split the change in identified-customer gross sales between periods into
    customers x orders per customer x average order value. The three ratios
    multiply exactly to the sales ratio, so the bridge always closes."""
    cp = table(con, "customer_period")
    rows = []
    for market in MARKETS:
        d = cp if market == "All" else cp[cp.market == market]
        if market == "All":
            # a customer who bought in both markets counts once
            d = d.groupby(["period", "customer_id"], as_index=False)[["orders", "gross_sales"]].sum()
        out = {"market": market}
        for per in ["P1", "P2"]:
            x = d[d.period == per]
            out[per] = {
                "customers": int(x.customer_id.nunique()),
                "orders": int(x.orders.sum()),
                "gross_sales": round(float(x.gross_sales.sum()), 2),
            }
            out[per]["orders_per_customer"] = out[per]["orders"] / out[per]["customers"]
            out[per]["aov"] = out[per]["gross_sales"] / out[per]["orders"]
        a, b = out["P1"], out["P2"]
        out["change"] = {
            "customers": b["customers"] / a["customers"] - 1,
            "orders_per_customer": b["orders_per_customer"] / a["orders_per_customer"] - 1,
            "aov": b["aov"] / a["aov"] - 1,
            "gross_sales": b["gross_sales"] / a["gross_sales"] - 1,
        }
        prod = (1 + out["change"]["customers"]) * (1 + out["change"]["orders_per_customer"]) * (1 + out["change"]["aov"])
        check(math.isclose(prod, 1 + out["change"]["gross_sales"], rel_tol=1e-9),
              f"revenue bridge closes for {market}")
        for part in ("P1", "P2", "change"):  # round for stable, readable output
            out[part] = {k: (round(v, 6) if isinstance(v, float) else v) for k, v in out[part].items()}
        rows.append(out)
    return rows


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

    names = ["data_quality", "customer_id_coverage", "monthly_kpis", "period_kpis",
             "cohort_retention", "rfm_segments", "country_summary", "top_products_p2"]
    frames = {n: table(con, n) for n in names}
    for n, df in frames.items():
        df.to_csv(OUT_DIR / f"{n}.csv", index=False)

    # Compact cohort matrix per market: one row per cohort, retention for months 0..12.
    cr = frames["cohort_retention"]
    cohorts = {}
    for market in MARKETS:
        x = cr[(cr.market == market) & (cr.months_since_first <= 12)]
        months = sorted(x.cohort_month.unique())
        sizes, rows = [], []
        for m in months:
            c = x[x.cohort_month == m].set_index("months_since_first")
            sizes.append(int(c.loc[0, "cohort_size"]))
            r = c.retention.reindex(range(13))  # months with no activity (or not yet observed) are NaN
            rows.append([None if pd.isna(v) else round(float(v), 4) for v in r])
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
        ch = b["change"]
        print(f"  bridge {b['market']}: customers {ch['customers']:+.1%}, orders/customer {ch['orders_per_customer']:+.1%}, "
              f"AOV {ch['aov']:+.1%}, identified gross {ch['gross_sales']:+.1%}")
    print(f"  concentration P2: top 1% {conc['top1']:.1%}, top 10% {conc['top10']:.1%}, top 20% {conc['top20']:.1%} "
          f"of {conc['customers']:,} customers")


if __name__ == "__main__":
    main()
