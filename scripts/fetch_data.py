"""
Fetch real daily price history for MEDC and all macro/commodity risk factors
from Yahoo Finance, cache raw series to data/raw_prices.json.

Single source of truth for every number used downstream. No synthetic data.
"""
import urllib.request
import urllib.parse
import json
import os
import datetime as dt

HDR = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36"}

# ticker -> (human name, role)
TICKERS = {
    "MEDC.JK":  ("MEDC", "subject"),
    "BZ=F":     ("Brent", "commodity"),
    "CL=F":     ("WTI", "commodity"),
    "NG=F":     ("HenryHubGas", "commodity"),
    "HG=F":     ("Copper", "commodity"),
    "GC=F":     ("Gold", "commodity"),
    "USDIDR=X": ("USDIDR", "fx"),
    "DX-Y.NYB": ("DXY", "fx"),
    "^JKSE":    ("IHSG", "market"),
    "^VIX":     ("VIX", "risk"),
    "^TNX":     ("US10Y", "rates"),
    "AMMN.JK":  ("Amman", "subsidiary"),
}

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "cache")
os.makedirs(DATA, exist_ok=True)


def fetch_one(ticker: str, rng: str = "10y") -> dict:
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/"
        f"{urllib.parse.quote(ticker)}?range={rng}&interval=1d"
    )
    req = urllib.request.Request(url, headers=HDR)
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.load(r)
    res = d["chart"]["result"][0]
    ts = res["timestamp"]
    closes = res["indicators"]["quote"][0]["close"]
    # adjusted close if available (handles splits/dividends for the equity)
    adj = res.get("indicators", {}).get("adjclose", [{}])[0].get("adjclose")
    out = {}
    for i, t in enumerate(ts):
        c = closes[i]
        if adj is not None and adj[i] is not None:
            c = adj[i]
        if c is None:
            continue
        date = dt.datetime.fromtimestamp(t, dt.UTC).date().isoformat()
        out[date] = round(float(c), 6)
    return {"currency": res["meta"].get("currency"), "series": out}


def main():
    raw = {}
    for ticker, (name, role) in TICKERS.items():
        try:
            payload = fetch_one(ticker)
            raw[name] = {
                "ticker": ticker,
                "role": role,
                "currency": payload["currency"],
                "series": payload["series"],
            }
            dates = sorted(payload["series"])
            print(f"OK  {name:12s} {ticker:10s} {len(dates):5d} pts "
                  f"{dates[0]}..{dates[-1]} last={payload['series'][dates[-1]]}")
        except Exception as e:
            print(f"ERR {name:12s} {ticker:10s} {repr(e)[:90]}")

    out_path = os.path.join(DATA, "raw_prices.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(raw, f, indent=0)
    print(f"\nWrote {out_path}  ({os.path.getsize(out_path)//1024} KB)")


if __name__ == "__main__":
    main()
