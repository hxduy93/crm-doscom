#!/usr/bin/env python3
"""
Ma trận CHI PHÍ và DOANH THU theo BRAND (Noma / Doscom) × NHÂN SỰ.

Nguồn (đều đã có sẵn, không gọi thêm API):
  data/fb-config.json         — account -> staff + groups (brand). Có xử lý account cho mượn (906->AI_AGENT).
  data/fb-ads-data.json       — spend theo account, có campaigns[].by_date (spend theo ngày) → tách mượn theo mốc.
  data/google-ads-spend.json  — spend Google theo category (→ brand) → gán nhân sự "Website".
  data/product-revenue.json   — source_groups[staff].products (booked) + products_by_status[staff].delivered.

Brand: sản phẩm/nhóm NOMA → NOMA; còn lại → DOSCOM.
  - CHI PHÍ tách brand×nhân sự RẤT SẠCH: mỗi tkqc gắn sẵn staff + brand.
  - DOANH THU tách theo nhân sự (source_groups) × brand (phân loại sản phẩm) — phủ ~100% đơn POS.
  - Đơn vị nhân sự KHÁC nhau giữa 2 vế: chi phí = chủ tài khoản QC (Duy/Phương Nam/AI/Website);
    doanh thu = nguồn chốt đơn (Duy/Phương Nam/Website/Zalo/Hotline/Page). ROAS chỉ có ý nghĩa
    ở hàng có cả 2 (Duy, Phương Nam, Website).

Output: data/brand-staff-matrix.json
"""
import json
import os
import sys
import importlib.util
from collections import defaultdict
from datetime import datetime, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(__file__)
DATA = os.path.normpath(os.path.join(HERE, "..", "data"))
OUT = os.path.join(DATA, "brand-staff-matrix.json")


def load(name):
    p = os.path.join(DATA, name)
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else None


# classify_sku dùng chung để phân sản phẩm → category (rồi → brand)
_spec = importlib.util.spec_from_file_location("fpr", os.path.join(HERE, "fetch_pancake_revenue.py"))
_fpr = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_fpr)
classify_sku = _fpr.classify_sku

STAFF_LABEL = {
    "DUY": "Duy", "PHUONG_NAM": "Phương Nam", "AI_AGENT": "AI Agent",
    "WEBSITE": "Website", "ZALO_OA": "Zalo OA", "HOTLINE": "Hotline", "FB_PAGE": "Page FB",
}
STAFF_ORDER = ["Duy", "Phương Nam", "AI Agent", "Website", "Zalo OA", "Hotline", "Page FB"]


def brand_of_category(cat):
    return "NOMA" if (cat or "").upper().startswith("NOMA") or (cat or "").upper() == "NOMA" else "DOSCOM"


def brand_of_groups(groups):
    if not groups:
        return None
    return "NOMA" if "NOMA" in groups else "DOSCOM"


def cell():
    return {"cost": 0.0, "rev_booked": 0.0, "rev_delivered": 0.0}


def main():
    cfg = load("fb-config.json") or {}
    fb = load("fb-ads-data.json") or {}
    gg = load("google-ads-spend.json") or {}
    rev = load("product-revenue.json") or {}

    accounts_cfg = cfg.get("account_to_groups", {})
    # matrix[staff_label][brand] = cell
    M = defaultdict(lambda: defaultdict(cell))

    # ---- CHI PHÍ Facebook (theo account → staff + brand; tách mượn theo ngày) ----
    for acc in fb.get("accounts", []):
        aid = acc.get("account_id")
        meta = accounts_cfg.get(aid, {})
        brand = brand_of_groups(meta.get("groups"))
        if not brand:
            continue  # account không gắn nhóm SP → bỏ khỏi tách brand
        base = STAFF_LABEL.get(meta.get("staff"), meta.get("staff") or "?")
        loaned_to = STAFF_LABEL.get(meta.get("loaned_to_staff")) if meta.get("loaned_to_staff") else None
        loaned_from = meta.get("loaned_from_date")
        for camp in acc.get("campaigns", []):
            bd = camp.get("by_date") or {}
            if bd:
                for date, row in bd.items():
                    sp = float((row or {}).get("spend") or 0)
                    staff = loaned_to if (loaned_to and loaned_from and date >= loaned_from) else base
                    M[staff][brand]["cost"] += sp
            else:
                M[base][brand]["cost"] += float(camp.get("spend") or 0)

    # ---- CHI PHÍ Google (theo category → brand; gán Website) ----
    for cat, node in (gg.get("by_category") or {}).items():
        sp = float((node or {}).get("_total") or 0)
        M["Website"][brand_of_category(cat)]["cost"] += sp

    # ---- DOANH THU (source_groups[staff].products → brand) ----
    for staff_key, node in (rev.get("source_groups") or {}).items():
        staff = STAFF_LABEL.get(staff_key, staff_key)
        for pname, pv in (node.get("products") or {}).items():
            b = "NOMA" if classify_sku(pname) == "NOMA" else "DOSCOM"
            M[staff][b]["rev_booked"] += float((pv or {}).get("total") or 0)
        deliv = (node.get("products_by_status") or {}).get("delivered", {})
        for pname, pv in deliv.items():
            b = "NOMA" if classify_sku(pname) == "NOMA" else "DOSCOM"
            M[staff][b]["rev_delivered"] += float((pv or {}).get("total") or 0)

    brands = ["NOMA", "DOSCOM"]
    staff_rows = [s for s in STAFF_ORDER if s in M] + [s for s in M if s not in STAFF_ORDER]

    def roas(c):
        return round(c["rev_delivered"] / c["cost"], 2) if c["cost"] > 0 else None

    matrix = {}
    tot_brand = {b: cell() for b in brands}
    tot_staff = {}
    for s in staff_rows:
        matrix[s] = {}
        row_tot = cell()
        for b in brands:
            c = M[s].get(b, cell())
            c = {**c, "roas": roas(c)}
            matrix[s][b] = c
            for k in ("cost", "rev_booked", "rev_delivered"):
                tot_brand[b][k] += c[k]
                row_tot[k] += c[k]
        row_tot["roas"] = roas(row_tot)
        tot_staff[s] = row_tot
    for b in brands:
        tot_brand[b]["roas"] = roas(tot_brand[b])
    grand = cell()
    for b in brands:
        for k in ("cost", "rev_booked", "rev_delivered"):
            grand[k] += tot_brand[b][k]
    grand["roas"] = roas(grand)

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "note_staff": "Chi phí = chủ tkqc (Duy/Phương Nam/AI/Website). Doanh thu = nguồn chốt đơn. "
                      "ROAS chỉ ý nghĩa ở hàng có cả chi phí lẫn doanh thu.",
        "brands": brands,
        "staff_rows": staff_rows,
        "matrix": matrix,
        "totals_by_brand": tot_brand,
        "totals_by_staff": tot_staff,
        "grand": grand,
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))

    def m(x):
        return f"{x/1e6:.1f}tr" if x else "0"
    print(f"{'':12} | {'NOMA chi phí':>13} {'NOMA DS giao':>13} | {'DOSCOM chi phí':>14} {'DOSCOM DS giao':>14}")
    for s in staff_rows:
        n, d = matrix[s]["NOMA"], matrix[s]["DOSCOM"]
        print(f"{s:12} | {m(n['cost']):>13} {m(n['rev_delivered']):>13} | {m(d['cost']):>14} {m(d['rev_delivered']):>14}")
    tb = tot_brand
    print(f"{'TỔNG':12} | {m(tb['NOMA']['cost']):>13} {m(tb['NOMA']['rev_delivered']):>13} | {m(tb['DOSCOM']['cost']):>14} {m(tb['DOSCOM']['rev_delivered']):>14}")
    print(f"[matrix] -> {OUT} ({os.path.getsize(OUT):,} bytes)")


if __name__ == "__main__":
    main()
