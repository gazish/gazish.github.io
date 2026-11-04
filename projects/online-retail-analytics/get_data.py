"""Download the raw data into raw/online_retail_II.csv.

Two options:

  python get_data.py
      Downloads a zipped CSV copy of the dataset from a public GitHub mirror
      (dsfsi/dsfsi-datasets) and checks its SHA-256 hash. This is the file the
      published numbers were built from.

  python get_data.py --xlsx path/to/online_retail_II.xlsx
      Converts the official UCI workbook (both yearly sheets) to the same CSV
      layout. Download it from https://archive.ics.uci.edu/dataset/502/online+retail+ii
      The two sheets overlap on 1 to 9 Dec 2010; the SQL removes those duplicates.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"
CSV = RAW / "online_retail_II.csv"
MIRROR = ("https://media.githubusercontent.com/media/dsfsi/dsfsi-datasets/master/"
          "data/cos781/online_retail_II.csv.zip")
SHA256 = "cd8933885509825c8e78db04d697c58e62909ded854c4084e094bd31f7e417cc"


def from_mirror() -> None:
    print(f"downloading {MIRROR}")
    with urllib.request.urlopen(MIRROR, timeout=120) as r:
        blob = r.read()
    digest = hashlib.sha256(blob).hexdigest()
    if digest != SHA256:
        raise SystemExit(f"SHA-256 mismatch: got {digest}, expected {SHA256}")
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        CSV.write_bytes(z.read("online_retail_II.csv"))
    print(f"wrote {CSV} ({CSV.stat().st_size / 1e6:.1f} MB), hash verified")


def from_xlsx(path: Path) -> None:
    import pandas as pd  # needs openpyxl installed for .xlsx

    sheets = pd.read_excel(path, sheet_name=None, dtype={"Invoice": str, "StockCode": str})
    df = pd.concat(sheets.values(), ignore_index=True)
    df.to_csv(CSV, index=False, date_format="%Y-%m-%d %H:%M:%S")
    print(f"wrote {CSV} from {len(sheets)} sheets, {len(df):,} rows")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--xlsx", type=Path, help="path to the official UCI workbook")
    args = ap.parse_args()
    RAW.mkdir(exist_ok=True)
    if args.xlsx:
        from_xlsx(args.xlsx)
    else:
        from_mirror()
