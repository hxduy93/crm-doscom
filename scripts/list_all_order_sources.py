#!/usr/bin/env python3
"""
Liệt kê TOÀN BỘ order source của shop Pancake kèm ID.

Khác với list_pancake_sources.py (soi đúng 1 ngày, dễ sót nguồn ít đơn), script này
lấy danh sách nguồn đầy đủ để đối chiếu với SOURCE_GROUPS trong fetch_pancake_revenue.py
— nguồn nào có trên Pancake mà thiếu trong config thì đơn của nó bị rơi sang nhóm khác.

Cách chạy: workflow `list-pancake-sources.yml` (đã có sẵn secret).
Env tuỳ chọn:
  SCAN_DAYS  — số ngày quét ngược khi phải fallback sang đọc đơn (mặc định 45)

Ưu tiên endpoint danh mục nguồn; nếu shop không mở endpoint đó thì fallback
quét đơn trong SCAN_DAYS ngày và bóc source name/ID từ chính các đơn.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

API_KEY = os.environ.get("PANCAKE_API_KEY", "").strip()
SHOP_ID = os.environ.get("PANCAKE_SHOP_ID", "").strip()
SCAN_DAYS = int(os.environ.get("SCAN_DAYS", "45") or 45)
BASE = "https://pos.pancake.vn/api/v1"

if not API_KEY or not SHOP_ID:
    sys.exit("ERROR: thiếu PANCAKE_API_KEY hoặc PANCAKE_SHOP_ID")


def call(method, path, params):
    url = f"{BASE}/{path}?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, method=method, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return {"_error": f"HTTP {e.code}: " + e.read().decode("utf-8", "ignore")[:200]}
    except Exception as e:
        return {"_error": f"{type(e).__name__}: {e}"}


def try_catalog():
    """Thử endpoint danh mục nguồn — nhanh và đầy đủ nhất nếu shop có mở."""
    for path in ("shops/%s/order_sources" % SHOP_ID, "shops/%s/orders/sources" % SHOP_ID):
        resp = call("GET", path, {"api_key": API_KEY})
        if "_error" in resp:
            print(f"[INFO] {path} -> {resp['_error'][:90]}", file=sys.stderr)
            continue
        rows = resp.get("data") or resp.get("order_sources") or resp
        if isinstance(rows, list) and rows:
            print(f"[OK] Lấy được danh mục nguồn từ {path}: {len(rows)} nguồn", file=sys.stderr)
            return rows
    return None


def scan_orders():
    """Fallback: bóc nguồn từ chính các đơn trong SCAN_DAYS ngày gần nhất."""
    end_dt = datetime.now(timezone.utc)
    start_ts = int((end_dt - timedelta(days=SCAN_DAYS)).timestamp())
    end_ts = int(end_dt.timestamp())
    print(f"[INFO] Fallback: quét đơn {SCAN_DAYS} ngày gần nhất", file=sys.stderr)
    seen = {}
    for page in range(1, 500):
        resp = call("POST", f"shops/{SHOP_ID}/orders/get_orders", {
            "api_key": API_KEY, "page": page, "page_size": 100, "status": -1,
            "updateStatus": "inserted_at", "option_sort": "inserted_at_desc",
            "es_only": "true", "startDateTime": start_ts, "endDateTime": end_ts,
        })
        if "_error" in resp:
            print(f"[WARN] page {page}: {resp['_error'][:120]}", file=sys.stderr)
            break
        batch = resp.get("data") or resp.get("orders") or []
        if not batch:
            break
        for o in batch:
            name = (o.get("order_sources_name") or "(không tên)").strip()
            sid = str(o.get("order_sources") or "?").strip()
            key = (name, sid)
            e = seen.setdefault(key, {"orders": 0, "revenue": 0.0, "first": None, "last": None})
            e["orders"] += 1
            try:
                e["revenue"] += float(o.get("total_price_after_sub_discount") or o.get("cod") or 0)
            except (TypeError, ValueError):
                pass
            d = (o.get("inserted_at") or "")[:10]
            if d:
                e["first"] = d if not e["first"] else min(e["first"], d)
                e["last"] = d if not e["last"] else max(e["last"], d)
        if page % 25 == 0:
            print(f"  … {page} trang, {len(seen)} nguồn", file=sys.stderr)
        if len(batch) < 100:
            break
        time.sleep(0.15)
    return seen


# Các source ID đang khai trong fetch_pancake_revenue.py (để đánh dấu nguồn còn THIẾU)
IN_CONFIG = {
    "DUY": {"308004272", "1536003777", "615005571", "308003603", "922003735", "1843001674",
            "922002510", "1843000628", "307500561", "921500725", "921041344", "307040304",
            "39739", "614046174", "1842044041", "307039298", "1842043463", "1228044436",
            "614044869", "921041902", "1535037303", "1228042142", "1535038664", "-1",
            "842243695641184"},
    "PHUONG_NAM": {"1008799", "1536008673", "1229011407"},
    "WEBSITE/ZALO/HOTLINE/FB_PAGE": {"614042808", "-1"},
}
ALL_IN_CONFIG = set().union(*IN_CONFIG.values())


def main():
    rows = try_catalog()
    if rows:
        print("\n=== DANH MỤC NGUỒN (từ endpoint) ===")
        print(f"{'ID':<20} | {'Tên nguồn':<45} | trong config?")
        print("-" * 90)
        for r in rows:
            sid = str(r.get("id") or r.get("source_id") or "?")
            name = str(r.get("name") or r.get("source_name") or "?")
            mark = "CÓ" if sid in ALL_IN_CONFIG else ">>> THIẾU <<<"
            print(f"{sid:<20} | {name:<45} | {mark}")
        return

    seen = scan_orders()
    print(f"\n=== NGUỒN ĐƠN {SCAN_DAYS} NGÀY GẦN NHẤT ({len(seen)} nguồn) ===")
    print(f"{'Source ID':<20} | {'Tên nguồn':<42} | {'Đơn':>5} | {'Doanh thu':>15} | {'Từ':<10} {'Đến':<10} | config")
    print("-" * 130)
    for (name, sid), e in sorted(seen.items(), key=lambda x: -x[1]["orders"]):
        mark = "CÓ" if sid in ALL_IN_CONFIG else ">>> THIẾU <<<"
        print(f"{sid:<20} | {name:<42} | {e['orders']:>5} | {e['revenue']:>15,.0f} | "
              f"{e['first'] or '':<10} {e['last'] or '':<10} | {mark}")

    print("\n=== RIÊNG NHÓM PHƯƠNG NAM ===")
    for (name, sid), e in sorted(seen.items(), key=lambda x: -x[1]["orders"]):
        up = name.upper()
        if up.startswith("PHƯƠNG NAM") or up.startswith("PHUONG NAM"):
            mark = "đã khai" if sid in IN_CONFIG["PHUONG_NAM"] else ">>> CHƯA KHAI — đơn đang rơi sang nhóm khác <<<"
            print(f"  {sid:<16} | {name:<42} | {e['orders']:>5} đơn | {e['revenue']:>15,.0f} | {mark}")


if __name__ == "__main__":
    main()
