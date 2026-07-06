#!/usr/bin/env python3
"""
Nối đơn POS ↔ campaign quảng cáo qua số điện thoại, tính doanh số theo campaign.

Input (đã có sẵn, sinh bởi 2 script fetch hiện tại):
  data/pancake-crm-contacts.json  — contacts_minimal[]: phone9, ad_id, utm_campaign, created_on
  data/product-revenue.json       — orders_minimal[]:   phone9, status, cod, vn_date, order_id

Output:
  data/campaign-revenue.json      — tổng hợp theo campaign + theo brand

Mô hình attribution (mặc định LAST-TOUCH):
  Mỗi phone -> campaign của contact MỚI NHẤT (created_on lớn nhất) — gần thời điểm mua nhất.
  Khi landing chuyển sang Cloudflare và bắt utm theo từng lần đăng ký, có thể đổi sang
  "campaign của lần đăng ký tạo đơn" mà không phá cấu trúc output này.

Status POS (theo fetch_pancake_revenue.py): 3=đã giao, 4=đang hoàn, 5=đã hoàn, 6=hủy, 0/2/9=khác.
  - "Doanh số đã giao" (realized) = COD của status 3.
  - "Doanh số lên đơn"  (booked)   = COD của đơn KHÔNG hủy/hoàn (loại 4,5,6).

KHÔNG bịa số: spend/ROAS để trống ở bước này — chi phí campaign sẽ ghép từ Pipeboard sau.
"""
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(__file__)
DATA = os.path.normpath(os.path.join(HERE, "..", "data"))
CONTACTS = os.path.join(DATA, "pancake-crm-contacts.json")
REVENUE = os.path.join(DATA, "product-revenue.json")
CREATIVES = os.path.join(DATA, "fb-ad-creatives.json")  # optional: ad_id -> tên ad + link FB + brand
OUT = os.path.join(DATA, "campaign-revenue.json")

DELIVERED = 3
NOT_BOOKED = {4, 5, 6}  # hoàn/hủy → không tính là doanh số lên đơn


def detect_brand(campaign, ad_id):
    """Suy brand từ tên campaign. NOMA vs DOSCOM (máy dò/camera/ghi âm...)."""
    s = (campaign or "").lower()
    if "noma" in s or "911" in s or "922" in s:
        return "NOMA"
    # Doscom: D1-D9 máy dò, DA camera, DR ghi âm, DI, DV/DT định vị, DE...
    import re
    if re.search(r"\b(d[1-9]|da\d|dr\d|di\d|dv\d|dt\d|de\d|d1)\b", s):
        return "DOSCOM"
    if any(k in s for k in ("camera", "may do", "máy dò", "ghi am", "ghi âm", "dinh vi", "định vị")):
        return "DOSCOM"
    return "UNKNOWN"


def load(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def main():
    c = load(CONTACTS)
    r = load(REVENUE)
    contacts = c.get("contacts_minimal", [])
    orders = r.get("orders_minimal", [])

    # phone9 -> campaign mới nhất (last-touch)
    ph2camp = {}
    for ct in contacts:
        p = ct.get("phone9")
        ad = ct.get("ad_id")
        if not p or not ad:
            continue
        ts = ct.get("created_on") or ""
        cur = ph2camp.get(p)
        if cur is None or ts > cur["ts"]:
            ph2camp[p] = {"ts": ts, "ad_id": ad, "camp": ct.get("utm_campaign") or ad}

    # Đếm đăng ký (regs) theo campaign — mỗi phone tính 1 lần, gán campaign last-touch
    agg = defaultdict(lambda: {
        "campaign": None, "ad_id": None, "brand": None,
        "regs": 0, "orders": 0, "delivered": 0, "returned_canceled": 0,
        "revenue_booked": 0.0, "revenue_delivered": 0.0,
    })

    def slot(info):
        key = info["camp"]
        a = agg[key]
        if a["campaign"] is None:
            a["campaign"] = info["camp"]
            a["ad_id"] = info["ad_id"]
            a["brand"] = detect_brand(info["camp"], info["ad_id"])
        return a

    for p, info in ph2camp.items():
        slot(info)["regs"] += 1

    # Gán đơn POS về campaign theo phone
    tot_orders = len(orders)
    matched_orders = 0
    tot_cod = 0.0
    matched_cod = 0.0
    for o in orders:
        cod = float(o.get("cod") or 0)
        st = o.get("status")
        tot_cod += cod
        p = o.get("phone9")
        info = ph2camp.get(p)
        if not info:
            continue
        matched_orders += 1
        matched_cod += cod
        a = slot(info)
        a["orders"] += 1
        if st == DELIVERED:
            a["delivered"] += 1
            a["revenue_delivered"] += cod
        if st in NOT_BOOKED:
            a["returned_canceled"] += 1
        else:
            a["revenue_booked"] += cod

    # Map ad_id -> tên ad + link FB + brand (nếu đã chạy fetch_fb_ad_creatives.py)
    cre = {}
    if os.path.exists(CREATIVES):
        cre = (load(CREATIVES) or {}).get("ads", {})

    rows = []
    for a in agg.values():
        regs = a["regs"] or 0
        a["close_rate"] = round(a["delivered"] / regs, 4) if regs else None
        info = cre.get(a["ad_id"])
        if info:
            a["ad_name"] = info.get("name")
            a["ad_link"] = info.get("link")
            a["link_is_post"] = info.get("link_is_post")
            a["manager_link"] = info.get("manager_link")
            a["thumb"] = info.get("thumb")
            if info.get("brand") and info["brand"] != "UNKNOWN":
                a["brand"] = info["brand"]  # brand theo tài khoản: tin cậy hơn đoán theo tên
        else:
            a["ad_name"] = None
            a["ad_link"] = None
        rows.append(a)
    rows.sort(key=lambda x: -x["revenue_delivered"])

    by_brand = defaultdict(lambda: {
        "regs": 0, "orders": 0, "delivered": 0,
        "revenue_booked": 0.0, "revenue_delivered": 0.0, "campaigns": 0,
    })
    for a in rows:
        b = by_brand[a["brand"]]
        b["campaigns"] += 1
        for k in ("regs", "orders", "delivered", "revenue_booked", "revenue_delivered"):
            b[k] += a[k]

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model": "last_touch",
        "lookback_days": c.get("lookback_days"),
        "source_generated": {
            "contacts": c.get("generated_at"),
            "revenue": r.get("generated_at"),
        },
        "totals": {
            "campaigns": len(rows),
            "orders_total": tot_orders,
            "orders_matched": matched_orders,
            "coverage_orders": round(matched_orders / tot_orders, 4) if tot_orders else 0,
            "cod_total": round(tot_cod),
            "cod_matched": round(matched_cod),
            "coverage_cod": round(matched_cod / tot_cod, 4) if tot_cod else 0,
        },
        "by_brand": by_brand,
        "campaigns": rows,
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))

    t = out["totals"]
    print(f"[attribution] {t['campaigns']} campaign | orders match {t['orders_matched']}/{t['orders_total']} "
          f"({t['coverage_orders']*100:.1f}%) | COD match {t['cod_matched']:,}/{t['cod_total']:,} "
          f"({t['coverage_cod']*100:.1f}%)")
    for b, v in by_brand.items():
        print(f"  brand {b:8} | {v['campaigns']:3} camp | regs {v['regs']:5} | giao {v['delivered']:5} | "
              f"DS giao {round(v['revenue_delivered']):>14,}")
    print(f"[attribution] -> {OUT} ({os.path.getsize(OUT):,} bytes)")


if __name__ == "__main__":
    main()
