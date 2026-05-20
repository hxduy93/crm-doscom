#!/usr/bin/env python3
"""
Join Pancake CRM contacts với POS orders bằng phone_last9.

Input:
  data/pancake-crm-contacts.json   (có contacts_minimal)
  data/product-revenue.json        (có orders_minimal)

Output:
  data/lead-to-order.json
    by_ad_id: {ad_id: {
       leads, leads_with_order, leads_conversion_rate,
       orders_total, orders_delivered, orders_canceled, orders_other,
       revenue_total, revenue_delivered,
       utm_campaign  (lấy từ lead nào cũng được)
    }}
    unmatched_orders   — đơn không tìm thấy lead nào
    unmatched_leads    — lead chưa lên đơn
    summary            — tổng số liệu

Attribution: last-touch trong cửa sổ 60 ngày.
Với mỗi đơn (vn_date, phone9): tìm lead cùng phone9 có created_on <= vn_date và
chênh ≤ 60 ngày, lấy lead có created_on lớn nhất → đơn đó thuộc về ad_id của lead.
"""

import os
import sys
import json
from datetime import datetime, timezone, timedelta
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CRM_FILE = os.path.join(ROOT, "data", "pancake-crm-contacts.json")
POS_FILE = os.path.join(ROOT, "data", "product-revenue.json")
OUT_FILE = os.path.join(ROOT, "data", "lead-to-order.json")

ATTRIBUTION_WINDOW_DAYS = 60
PANCAKE_STATUS = {
    0: "moi", 1: "da_duyet", 2: "da_shipped", 3: "delivered",
    4: "returning", 5: "returned", 6: "canceled", 8: "dong_goi", 9: "pending",
}


# Whitelist staff thực tế trong CRM Doscom (xác nhận 2026-05-12 với user).
# Field nguoi_chay_qc trong Pancake không nhất quán — đôi khi "STAFF - PRODUCT",
# đôi khi "PRODUCT - STAFF". Map keys = upper-case canonical, values = display name.
# "NAM" là viết tắt của "PHƯƠNG NAM" → cùng 1 staff.
# "WEBSITE" là entry standalone gom các nguồn Zalo OA / Hotline / Website (không phải ad FB).
STAFF_WHITELIST = {
    "DUY": "DUY",
    "PHƯƠNG NAM": "PHƯƠNG NAM",
    "PHUONG NAM": "PHƯƠNG NAM",
    "NAM": "PHƯƠNG NAM",
    "WEBSITE": "WEBSITE",
}


def staff_from_qc(qc):
    """Bóc tên staff từ field nguoi_chay_qc. Check cả left/right vì format không
    nhất quán ('STAFF - PRODUCT' hoặc 'PRODUCT - STAFF'). Return canonical name."""
    if not qc or not isinstance(qc, str):
        return None
    qc = qc.strip()
    if not qc:
        return None
    canon = STAFF_WHITELIST.get(qc.upper())
    if canon:
        return canon
    if " - " in qc:
        for p in qc.split(" - ", 1):
            canon = STAFF_WHITELIST.get(p.strip().upper())
            if canon:
                return canon
    return None


def product_from_qc(qc):
    """Bóc tên product = phần KHÔNG match staff whitelist."""
    if not qc or not isinstance(qc, str) or " - " not in qc:
        return None
    parts = [p.strip() for p in qc.split(" - ", 1)]
    for p in parts:
        if p and p.upper() not in STAFF_WHITELIST:
            return p
    return None


def synthesize_organic_utm(c):
    """For leads without utm_campaign (organic traffic: video tự nhiên, page nhắn tin,
    landing page không gắn UTM…) — tạo UTM ảo dạng '(organic) <product/source>'
    để vào by_staff_utm như UTM thường, giúp dashboard hiển thị đủ 100% doanh thu.

    Priority:
      1. product từ nguoi_chay_qc  →  '(organic) NOMA 911'
      2. source_of_leads có 'website'  →  '(organic) Website'
      3. source_of_leads khác  →  '(organic) <source rút gọn>'
      4. fallback  →  '(organic) unknown'
    """
    qc = c.get("nguoi_chay_qc") or ""
    sol = (c.get("source_of_leads") or "").strip()
    prod = product_from_qc(qc)
    if prod:
        return f"(organic) {prod}"
    if "website" in sol.lower():
        return "(organic) Website"
    if sol:
        # Strip về <= 30 ký tự cho dễ đọc trên UI
        return f"(organic) {sol[:30]}"
    return "(organic) unknown"


def detect_canonical_product(text):
    """Detect 1 trong 13 PROFIT_PRODUCTS label từ text (vd source_name của order Pancake).
    Trả về canonical label (vd 'Noma 911') để frontend product_costs lookup hoạt động.
    Copy logic từ update_dashboard.py:detect_profit_product."""
    if not text:
        return None
    import re
    n = (text or "").lower().replace("_", " ").replace("-", " ")
    n = " ".join(n.split())
    if "da8.1 pro" in n or "da 8.1 pro" in n or "da8 1 pro" in n:
        return "DA8.1 Pro"
    if "da8.1" in n or "da 8.1" in n or "da8 1" in n:
        return "DA8.1"
    if "noma 922" in n or "noma922" in n:
        return "Noma 922"
    if "noma 911" in n or "noma911" in n:
        return "Noma 911"
    if "dr4 plus" in n or "dr4plus" in n:
        return "DR4 Plus"
    if "dr1" in n:
        return "DR1"
    if "dv1 pro" in n or "dv1pro" in n:
        return "DV1 Pro"
    if "d1 pro" in n or "d1pro" in n:
        return "D1 Pro"
    if "d8 pro" in n or "d8pro" in n:
        return "D8 Pro"
    for code in ("d1", "d2", "d3", "d4"):
        if re.search(rf"(?<![a-z0-9]){code}(?![a-z0-9])", n):
            return code.upper()
    return None


def classify_no_crm_order(o):
    """For order POS KHÔNG match được lead nào trong CRM, gán staff + UTM ảo
    dựa vào source_name. Returns (staff, virtual_utm, product_label).

    Rules (user 2026-05-20):
      - "DUY - <product>"          → DUY,         UTM='(no-CRM) DUY - <product>'
      - "PHƯƠNG NAM - <product>"   → PHƯƠNG NAM,  UTM='(no-CRM) PN - <product>'
      - "Zalo OA" / "Hotline" / "Website"  → WEBSITE staff (user gộp vào website)
      - "Facebook" generic page    → WEBSITE staff (organic FB direct chat)
      - Khác                        → WEBSITE staff (fallback)
    """
    sn = (o.get("source_name") or "").strip()
    if not sn:
        return ("WEBSITE", "(no-CRM) Không có nguồn", None)

    sn_upper = sn.upper()
    prod_canonical = detect_canonical_product(sn)

    if sn_upper.startswith("DUY -") or sn_upper.startswith("DUY-"):
        rest = sn.split("-", 1)[1].strip() if "-" in sn else ""
        utm = f"(no-CRM) DUY - {rest}" if rest else "(no-CRM) DUY"
        return ("DUY", utm, prod_canonical)

    if sn_upper.startswith("PHƯƠNG NAM") or sn_upper.startswith("PHUONG NAM"):
        rest = sn.split("-", 1)[1].strip() if "-" in sn else ""
        utm = f"(no-CRM) PN - {rest}" if rest else "(no-CRM) Phương Nam"
        return ("PHƯƠNG NAM", utm, prod_canonical)

    if "ZALO" in sn_upper:
        return ("WEBSITE", "(no-CRM) Zalo OA", prod_canonical)
    if "HOTLINE" in sn_upper:
        return ("WEBSITE", "(no-CRM) Hotline", prod_canonical)
    if "WEBSITE" in sn_upper or sn_upper.startswith("WEB"):
        return ("WEBSITE", "(no-CRM) Website", prod_canonical)
    if sn_upper.startswith("FACEBOOK") or sn_upper == "FACEBOOK":
        return ("WEBSITE", "(no-CRM) FB direct", prod_canonical)

    return ("WEBSITE", f"(no-CRM) {sn[:30]}", prod_canonical)


def parse_iso_date(s):
    """Parse 'YYYY-MM-DDTHH:MM:SS...Z' hoặc 'YYYY-MM-DD' → date object."""
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).date()
    except Exception:
        try:
            return datetime.strptime(s[:10], "%Y-%m-%d").date()
        except Exception:
            return None


def main():
    if not os.path.exists(CRM_FILE):
        print(f"[FATAL] Missing {CRM_FILE}", file=sys.stderr)
        sys.exit(1)
    if not os.path.exists(POS_FILE):
        print(f"[FATAL] Missing {POS_FILE}", file=sys.stderr)
        sys.exit(1)

    with open(CRM_FILE, encoding="utf-8") as f:
        crm = json.load(f)
    with open(POS_FILE, encoding="utf-8") as f:
        pos = json.load(f)

    contacts = crm.get("contacts_minimal") or []
    orders = pos.get("orders_minimal") or []
    print(f"[INFO] Loaded {len(contacts)} contacts, {len(orders)} orders")

    if not contacts:
        print("[FATAL] CRM file không có contacts_minimal — cần re-run fetch-pancake-crm "
              "với version mới (đã có phone9)", file=sys.stderr)
        sys.exit(2)
    if not orders:
        print("[FATAL] POS file không có orders_minimal — cần re-run fetch-pancake "
              "với version mới (đã có phone9)", file=sys.stderr)
        sys.exit(2)

    # ── Index leads by phone9 ──
    # 2026-05-12: bao gồm CẢ lead không có ad_id (vd: nguoi_chay_qc='WEBSITE' từ
    # Zalo OA / Hotline / Website — không qua UTM Facebook). Lead vẫn có phone9
    # nên vẫn join được với order, và staff='WEBSITE' vẫn được aggregate.
    leads_by_phone = defaultdict(list)
    for c in contacts:
        p9 = c.get("phone9")
        if not p9:
            continue
        created = parse_iso_date(c.get("created_on"))
        if not created:
            continue
        leads_by_phone[p9].append({
            "ad_id": c.get("ad_id"),
            "utm_campaign": c.get("utm_campaign"),
            "created": created,
            "trang_thai": c.get("trang_thai"),
            "owner_name": c.get("owner_name"),
            "nguoi_chay_qc": c.get("nguoi_chay_qc"),
            # 2026-05-20: thêm source_of_leads để synthesize_organic_utm hoạt động
            # khi attribute order tới lead organic (không có utm_campaign).
            "source_of_leads": c.get("source_of_leads"),
        })
    for p9 in leads_by_phone:
        leads_by_phone[p9].sort(key=lambda x: x["created"], reverse=True)
    print(f"[INFO] {len(leads_by_phone):,} unique phone9 trong CRM")

    # ── Attribute mỗi order ──
    by_ad = defaultdict(lambda: {
        "leads": 0,
        "leads_phone9_set": set(),
        "leads_with_order_phone9_set": set(),
        "orders_total": 0,
        "orders_delivered": 0,
        "orders_canceled": 0,
        "orders_other": 0,
        "revenue_total": 0.0,
        "revenue_delivered": 0.0,
        "utm_campaign": None,
        "owner_name_counter": defaultdict(int),
        "nguoi_chay_qc_counter": defaultdict(int),
    })
    by_qc = defaultdict(lambda: {
        "leads": 0,
        "leads_phone9_set": set(),
        "leads_with_order_phone9_set": set(),
        "orders_total": 0,
        "orders_delivered": 0,
        "orders_canceled": 0,
        "orders_other": 0,
        "revenue_total": 0.0,
        "revenue_delivered": 0.0,
        "ad_ids_set": set(),
        "ad_id_revenue": defaultdict(float),
        "products_counter": defaultdict(int),
    })
    # 2026-05-13: Cross-aggregation by (staff, utm_campaign) — feed cho bảng UTM
    # trên dashboard. Key = (staff_canonical, utm_campaign_str). Mỗi bucket dùng
    # cho 1 row trong UI: leads + orders + revenue + product chính (từ nguoi_chay_qc).
    # by_date dicts cho phép frontend filter theo dateRange:
    #   leads_by_date     keyed by lead.created (YYYY-MM-DD)
    #   orders_*_by_date  keyed by order.vn_date (YYYY-MM-DD)
    #   revenue_*_by_date keyed by order.vn_date (YYYY-MM-DD)
    by_staff_utm = defaultdict(lambda: {
        "leads": 0,
        "leads_phone9_set": set(),
        "leads_with_order_phone9_set": set(),
        "orders_total": 0,
        "orders_delivered": 0,
        "orders_canceled": 0,
        "orders_returning": 0,  # status=4, đang hoàn
        "orders_returned": 0,   # status=5, đã hoàn
        "orders_other": 0,      # đang xử lý: 0/1/2/8/9
        "revenue_total": 0.0,
        "revenue_delivered": 0.0,
        "products_counter": defaultdict(int),
        "ad_ids_set": set(),
        "leads_by_date": defaultdict(int),
        "orders_total_by_date": defaultdict(int),
        "orders_delivered_by_date": defaultdict(int),
        "orders_canceled_by_date": defaultdict(int),
        "orders_returning_by_date": defaultdict(int),
        "orders_returned_by_date": defaultdict(int),
        "revenue_total_by_date": defaultdict(float),
        "revenue_delivered_by_date": defaultdict(float),
    })
    # Count leads per ad_id + per qc-staff
    for c in contacts:
        ad_id = c.get("ad_id")
        p9 = c.get("phone9")

        # by_ad chỉ count contact có ad_id (= từ UTM Facebook ad)
        if ad_id:
            bucket = by_ad[ad_id]
            bucket["leads"] += 1
            if p9:
                bucket["leads_phone9_set"].add(p9)
            if not bucket["utm_campaign"]:
                bucket["utm_campaign"] = c.get("utm_campaign")
            if c.get("owner_name"):
                bucket["owner_name_counter"][c["owner_name"]] += 1
            if c.get("nguoi_chay_qc"):
                bucket["nguoi_chay_qc_counter"][c["nguoi_chay_qc"]] += 1

        # by_qc count tất cả contact match staff whitelist (bao gồm WEBSITE không có ad_id)
        staff = staff_from_qc(c.get("nguoi_chay_qc"))
        prod_raw = product_from_qc(c.get("nguoi_chay_qc"))
        # 2026-05-20: normalize sang canonical label ('NOMA 911' -> 'Noma 911') để frontend
        # product_costs lookup khớp (cost dict keyed canonical). Fallback raw nếu không match
        # 13 PROFIT_PRODUCTS để tránh mất data.
        prod = (detect_canonical_product(prod_raw) or prod_raw) if prod_raw else None
        if staff:
            qb = by_qc[staff]
            qb["leads"] += 1
            if p9:
                qb["leads_phone9_set"].add(p9)
            if ad_id:
                qb["ad_ids_set"].add(ad_id)
            if prod:
                qb["products_counter"][prod] += 1

        # by_staff_utm — count lead nếu có staff
        # Case 1: lead từ FB Ads chuẩn (có utm + ad_id) → row UTM thường
        # Case 2: lead ORGANIC (không utm hoặc không ad_id) → row UTM ảo (organic)
        #         Sinh key bằng synthesize_organic_utm() để gom đúng nhóm sản phẩm/nguồn
        utm = c.get("utm_campaign")
        if staff:
            is_organic = not (utm and ad_id)
            utm_key = utm if not is_organic else synthesize_organic_utm(c)
            sb = by_staff_utm[(staff, utm_key)]
            sb["leads"] += 1
            sb["is_organic"] = is_organic  # row-level flag, lần cuối ghi đè (đồng nhất trong nhóm)
            if p9:
                sb["leads_phone9_set"].add(p9)
            if ad_id:
                sb["ad_ids_set"].add(ad_id)
            if prod:
                sb["products_counter"][prod] += 1
            lead_created = parse_iso_date(c.get("created_on"))
            if lead_created:
                sb["leads_by_date"][lead_created.isoformat()] += 1

    unmatched_orders_sample = []
    matched_orders = 0
    skipped_no_phone = 0
    # 2026-05-20: track order_ids đã attribute để vòng sau bucket-hóa đơn no-CRM
    matched_order_ids = set()
    unmatched_orders_for_no_crm = []

    for o in orders:
        p9 = o.get("phone9")
        if not p9:
            skipped_no_phone += 1
            continue
        candidates = leads_by_phone.get(p9, [])
        if not candidates:
            if len(unmatched_orders_sample) < 20:
                unmatched_orders_sample.append({
                    "order_id": o.get("order_id"),
                    "phone9": p9,
                    "vn_date": o.get("vn_date"),
                    "source_name": o.get("source_name"),
                    "cod": o.get("cod"),
                })
            unmatched_orders_for_no_crm.append(o)
            continue

        # Last-touch attribution: lead gần nhất TRƯỚC order trong cửa sổ 60 ngày
        order_date = parse_iso_date(o.get("vn_date"))
        attr_lead = None
        if order_date:
            for lead in candidates:  # đã sort DESC
                delta = (order_date - lead["created"]).days
                if -1 <= delta <= ATTRIBUTION_WINDOW_DAYS:
                    # Cho phép order sớm hơn lead 1 ngày (timezone slack)
                    attr_lead = lead
                    break
        if not attr_lead:
            # Order ngoài window — vẫn match phone nhưng không attribute. Coi như "pre-lead order".
            if len(unmatched_orders_sample) < 20:
                unmatched_orders_sample.append({
                    "order_id": o.get("order_id"),
                    "phone9": p9,
                    "vn_date": o.get("vn_date"),
                    "source_name": o.get("source_name"),
                    "cod": o.get("cod"),
                    "note": "phone match nhưng ngoài window 60d",
                    "nearest_lead_created": candidates[0]["created"].isoformat() if candidates else None,
                })
            unmatched_orders_for_no_crm.append(o)
            continue

        matched_orders += 1
        matched_order_ids.add(o.get("order_id"))
        cod = float(o.get("cod") or 0)
        status = o.get("status")
        ad_id = attr_lead.get("ad_id")

        # by_ad chỉ count đơn có ad_id (= từ UTM Facebook ad)
        if ad_id:
            bucket = by_ad[ad_id]
            bucket["orders_total"] += 1
            bucket["leads_with_order_phone9_set"].add(p9)
            bucket["revenue_total"] += cod
            if status == 3:
                bucket["orders_delivered"] += 1
                bucket["revenue_delivered"] += cod
            elif status == 6:
                bucket["orders_canceled"] += 1
            else:
                bucket["orders_other"] += 1

        # by_qc count đơn theo staff — kể cả lead không có ad_id (WEBSITE)
        staff = staff_from_qc(attr_lead.get("nguoi_chay_qc"))
        if staff:
            qb = by_qc[staff]
            qb["orders_total"] += 1
            qb["leads_with_order_phone9_set"].add(p9)
            qb["revenue_total"] += cod
            if ad_id:
                qb["ad_id_revenue"][ad_id] += cod
            if status == 3:
                qb["orders_delivered"] += 1
                qb["revenue_delivered"] += cod
            elif status == 6:
                qb["orders_canceled"] += 1
            else:
                qb["orders_other"] += 1

        # by_staff_utm — count đơn cho cả lead FB Ads chuẩn (utm+ad_id) và organic.
        # Organic lead: sinh UTM ảo bằng cùng hàm synthesize_organic_utm() để khớp key
        # với row đã tạo ở giai đoạn aggregate leads phía trên.
        utm = attr_lead.get("utm_campaign")
        if staff:
            is_organic = not (utm and ad_id)
            utm_key = utm if not is_organic else synthesize_organic_utm(attr_lead)
            sb = by_staff_utm[(staff, utm_key)]
            sb["orders_total"] += 1
            sb["leads_with_order_phone9_set"].add(p9)
            sb["revenue_total"] += cod
            order_date_iso = order_date.isoformat() if order_date else None
            if order_date_iso:
                sb["orders_total_by_date"][order_date_iso] += 1
                sb["revenue_total_by_date"][order_date_iso] += cod
            if status == 3:
                sb["orders_delivered"] += 1
                sb["revenue_delivered"] += cod
                if order_date_iso:
                    sb["orders_delivered_by_date"][order_date_iso] += 1
                    sb["revenue_delivered_by_date"][order_date_iso] += cod
            elif status == 4:
                sb["orders_returning"] += 1
                if order_date_iso:
                    sb["orders_returning_by_date"][order_date_iso] += 1
            elif status == 5:
                sb["orders_returned"] += 1
                if order_date_iso:
                    sb["orders_returned_by_date"][order_date_iso] += 1
            elif status == 6:
                sb["orders_canceled"] += 1
                if order_date_iso:
                    sb["orders_canceled_by_date"][order_date_iso] += 1
            else:
                sb["orders_other"] += 1

    # ── 2026-05-20: Second pass — xử lý đơn KHÔNG match được lead CRM nào.
    # Bucket-hóa theo source_name để vào by_staff_utm như "no-CRM" group.
    # User yêu cầu: Zalo OA / Hotline / Website / FB direct → gộp vào nhân sự WEBSITE.
    print(f"[INFO] {len(unmatched_orders_for_no_crm):,} đơn POS không match CRM → bucket no-CRM")
    no_crm_revenue = 0.0
    for o in unmatched_orders_for_no_crm:
        cod = float(o.get("cod") or 0)
        status = o.get("status")
        order_date = parse_iso_date(o.get("vn_date"))
        order_date_iso = order_date.isoformat() if order_date else None
        staff, utm_key, prod_canonical = classify_no_crm_order(o)

        sb = by_staff_utm[(staff, utm_key)]
        sb["leads"] += 0  # no-CRM = không có lead
        sb["is_organic"] = False
        sb["is_no_crm"] = True
        if prod_canonical:
            sb["products_counter"][prod_canonical] += 1
        sb["orders_total"] += 1
        sb["revenue_total"] += cod
        no_crm_revenue += cod
        if order_date_iso:
            sb["orders_total_by_date"][order_date_iso] += 1
            sb["revenue_total_by_date"][order_date_iso] += cod
        if status == 3:
            sb["orders_delivered"] += 1
            sb["revenue_delivered"] += cod
            if order_date_iso:
                sb["orders_delivered_by_date"][order_date_iso] += 1
                sb["revenue_delivered_by_date"][order_date_iso] += cod
        elif status == 4:
            sb["orders_returning"] += 1
            if order_date_iso:
                sb["orders_returning_by_date"][order_date_iso] += 1
        elif status == 5:
            sb["orders_returned"] += 1
            if order_date_iso:
                sb["orders_returned_by_date"][order_date_iso] += 1
        elif status == 6:
            sb["orders_canceled"] += 1
            if order_date_iso:
                sb["orders_canceled_by_date"][order_date_iso] += 1
        else:
            sb["orders_other"] += 1
    print(f"       no-CRM revenue total: {no_crm_revenue:,.0f}đ")

    # ── Finalize ──
    out_by_ad = {}
    total_leads = 0
    total_leads_with_order = 0
    total_orders = 0
    total_revenue = 0.0
    total_revenue_delivered = 0.0
    for ad_id, b in by_ad.items():
        leads = b["leads"]
        leads_with_order = len(b["leads_with_order_phone9_set"])
        top_owner = max(b["owner_name_counter"].items(), key=lambda x: x[1])[0] \
            if b["owner_name_counter"] else None
        top_runner = max(b["nguoi_chay_qc_counter"].items(), key=lambda x: x[1])[0] \
            if b["nguoi_chay_qc_counter"] else None
        out_by_ad[ad_id] = {
            "ad_id": ad_id,
            "utm_campaign": b["utm_campaign"],
            "leads": leads,
            "leads_with_phone9": len(b["leads_phone9_set"]),
            "leads_with_order": leads_with_order,
            "leads_conversion_rate": round(leads_with_order / leads * 100, 2) if leads else 0.0,
            "orders_total": b["orders_total"],
            "orders_delivered": b["orders_delivered"],
            "orders_canceled": b["orders_canceled"],
            "orders_other": b["orders_other"],
            "revenue_total": round(b["revenue_total"]),
            "revenue_delivered": round(b["revenue_delivered"]),
            "top_owner": top_owner,
            "top_nguoi_chay_qc": top_runner,
        }
        total_leads += leads
        total_leads_with_order += leads_with_order
        total_orders += b["orders_total"]
        total_revenue += b["revenue_total"]
        total_revenue_delivered += b["revenue_delivered"]

    # ── Finalize by_qc (staff-level từ nguoi_chay_qc) ──
    out_by_qc = {}
    for staff, q in by_qc.items():
        leads = q["leads"]
        leads_with_order = len(q["leads_with_order_phone9_set"])
        top_ads = sorted(q["ad_id_revenue"].items(), key=lambda x: -x[1])[:5]
        top_products = sorted(q["products_counter"].items(), key=lambda x: -x[1])[:5]
        out_by_qc[staff] = {
            "staff": staff,
            "leads": leads,
            "leads_with_phone9": len(q["leads_phone9_set"]),
            "leads_with_order": leads_with_order,
            "leads_conversion_rate": round(leads_with_order / leads * 100, 2) if leads else 0.0,
            "orders_total": q["orders_total"],
            "orders_delivered": q["orders_delivered"],
            "orders_canceled": q["orders_canceled"],
            "orders_other": q["orders_other"],
            "revenue_total": round(q["revenue_total"]),
            "revenue_delivered": round(q["revenue_delivered"]),
            "unique_ad_ids": len(q["ad_ids_set"]),
            "top_ad_ids_by_revenue": [{"ad_id": a, "revenue": round(r)} for a, r in top_ads],
            "top_products_by_leads": [{"product": p, "leads": n} for p, n in top_products],
        }
    # Sort theo revenue_total DESC để dashboard render từ cao xuống thấp
    out_by_qc = dict(sorted(out_by_qc.items(), key=lambda kv: -kv[1]["revenue_total"]))

    # ── Finalize by_staff_utm (cross: staff × utm_campaign) ──
    # Output shape: {staff_canonical: [rows]} — frontend render 1 bảng per staff.
    # Mỗi row: utm_campaign, product (top từ nguoi_chay_qc), leads, orders, conv%, revenue.
    out_by_staff_utm = defaultdict(list)
    for (staff, utm), s in by_staff_utm.items():
        leads = s["leads"]
        leads_with_order = len(s["leads_with_order_phone9_set"])
        top_product = max(s["products_counter"].items(), key=lambda x: x[1])[0] \
            if s["products_counter"] else None
        out_by_staff_utm[staff].append({
            "utm_campaign": utm,
            "product": top_product,
            # 2026-05-20: flag row organic (UTM ảo từ synthesize_organic_utm).
            # Frontend dùng để tô màu khác, ẩn cột chi phí FB, hiện badge "ORGANIC".
            "is_organic": s.get("is_organic", False),
            # 2026-05-20: flag row no-CRM (đơn POS không match lead CRM nào — bucket theo source_name).
            "is_no_crm": s.get("is_no_crm", False),
            "leads": leads,
            "leads_with_phone9": len(s["leads_phone9_set"]),
            "leads_with_order": leads_with_order,
            "leads_conversion_rate": round(leads_with_order / leads * 100, 2) if leads else 0.0,
            "orders_total": s["orders_total"],
            "orders_delivered": s["orders_delivered"],
            "orders_canceled": s["orders_canceled"],
            "orders_returning": s["orders_returning"],
            "orders_returned": s["orders_returned"],
            "orders_other": s["orders_other"],
            "revenue_total": round(s["revenue_total"]),
            "revenue_delivered": round(s["revenue_delivered"]),
            "unique_ad_ids": len(s["ad_ids_set"]),
            # by_date dicts cho frontend filter theo dateRange
            "leads_by_date": dict(s["leads_by_date"]),
            "orders_total_by_date": dict(s["orders_total_by_date"]),
            "orders_delivered_by_date": dict(s["orders_delivered_by_date"]),
            "orders_canceled_by_date": dict(s["orders_canceled_by_date"]),
            "orders_returning_by_date": dict(s["orders_returning_by_date"]),
            "orders_returned_by_date": dict(s["orders_returned_by_date"]),
            "revenue_total_by_date": {d: round(v) for d, v in s["revenue_total_by_date"].items()},
            "revenue_delivered_by_date": {d: round(v) for d, v in s["revenue_delivered_by_date"].items()},
        })
    # Sort rows trong mỗi staff theo revenue_total DESC
    for staff in out_by_staff_utm:
        out_by_staff_utm[staff].sort(key=lambda r: -r["revenue_total"])
    out_by_staff_utm = dict(out_by_staff_utm)

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "crm_generated_at": crm.get("generated_at"),
        "pos_generated_at": pos.get("generated_at"),
        "attribution_window_days": ATTRIBUTION_WINDOW_DAYS,
        "summary": {
            "total_leads_with_ad_id": total_leads,
            "total_leads_with_order": total_leads_with_order,
            "leads_conversion_rate": round(total_leads_with_order / total_leads * 100, 2)
                if total_leads else 0.0,
            "total_orders_attributed": total_orders,
            "total_orders_in_pos": len(orders),
            "orders_skipped_no_phone": skipped_no_phone,
            "orders_unmatched": len(orders) - matched_orders - skipped_no_phone,
            "revenue_attributed_total": round(total_revenue),
            "revenue_attributed_delivered": round(total_revenue_delivered),
            "unique_ad_ids_with_orders": sum(1 for v in out_by_ad.values() if v["orders_total"] > 0),
            "unique_qc_staff": len(out_by_qc),
        },
        "by_ad_id": out_by_ad,
        "by_nguoi_chay_qc": out_by_qc,
        "by_staff_utm": out_by_staff_utm,
        "unmatched_orders_sample": unmatched_orders_sample,
    }

    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"[OK] Wrote {OUT_FILE}")
    print(f"     {total_leads:,} leads → {total_leads_with_order:,} có đơn "
          f"({out['summary']['leads_conversion_rate']}%)")
    print(f"     {total_orders:,} đơn attributed / {len(orders):,} tổng đơn "
          f"({skipped_no_phone:,} skip do thiếu phone, "
          f"{len(orders) - matched_orders - skipped_no_phone:,} unmatched)")
    print(f"     Revenue attributed: {total_revenue:,.0f}đ "
          f"(delivered: {total_revenue_delivered:,.0f}đ)")
    print(f"     {len(out_by_qc)} staff QC — top 5 by revenue:")
    for i, (staff, v) in enumerate(list(out_by_qc.items())[:5], 1):
        print(f"       {i}. {staff:<15s} leads={v['leads']:>4} orders={v['orders_total']:>4} "
              f"conv={v['leads_conversion_rate']:>5.1f}% rev={v['revenue_total']:,}đ")


if __name__ == "__main__":
    main()
