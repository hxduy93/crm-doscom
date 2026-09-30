#!/usr/bin/env python3
"""
Báo cáo "Chốt đơn nhưng chưa lên đơn": SĐT mà CRM Pancake ghi trạng thái "Chốt đơn"
nhưng trên Pancake POS không có đơn nào (hoặc chỉ có đơn huỷ).

Input  : Pancake CRM (bảng Contact) + Pancake POS (tìm đơn theo từng SĐT)
Output : data/chot-khong-don.json        — danh sách cho menu "Chốt chưa lên đơn"
         data/chot-khong-don-cache.json  — kết quả tra đơn theo SĐT (KHÔNG đẩy lên web)

Ba điều đã đo thật 30/09/2026, đừng "tối ưu" ngược lại:
  · CRM phải quét HẾT bảng Contact bằng cursor. Pancake bỏ qua cả `filter` theo trạng thái,
    tham số `page` lẫn mọi kiểu `sort` — thử rồi, đều trả nguyên trang đầu. ~36k contact,
    ~180 trang × 4–7 giây.
  · SĐT trong đơn POS bị Pancake che (`0****11`), không so khớp được bằng cách tải hết đơn.
    Cách duy nhất: gọi `orders?search=<SĐT>` cho từng số — ô tìm kiếm vẫn khớp số thật.
  · SĐT đã có đơn thật thì không bao giờ mất đơn → lưu cache, lần sau chỉ tra số MỚI và số
    còn "chưa có đơn"/"chỉ đơn huỷ". Lần đầu ~24k lượt tra (~20 phút), sau đó vài trăm.

Env: PANCAKE_CRM_API_KEY, PANCAKE_API_KEY, PANCAKE_SHOP_ID
"""

import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT_FILE = os.path.join(ROOT, "data", "chot-khong-don.json")
CACHE_FILE = os.path.join(ROOT, "data", "chot-khong-don-cache.json")

BASE_URL = "https://pos.pancake.vn/api/v1"
SHOP_ID = os.environ.get("PANCAKE_SHOP_ID", "").strip()
CRM_KEY = os.environ.get("PANCAKE_CRM_API_KEY", "").strip()
POS_KEY = os.environ.get("PANCAKE_API_KEY", "").strip()

# Mã lựa chọn "Chốt đơn" của trường `trang_thai` (đọc từ /crm/tables 30/09/2026).
# Script tự dò lại theo NHÃN mỗi lần chạy; mã này chỉ là dự phòng khi không đọc được bảng.
STATUS_CHOT_FALLBACK = "eeed-dcd7-a039-0ad9-37c1-ee53-6452"
STATUS_LABEL = "Chốt đơn"
ORDER_CANCELED = 6
VN = timezone(timedelta(hours=7))


def http_get_json(url, tries=6, timeout=90):
    last = None
    for a in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "crm-doscom/chot-khong-don"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            last = e
            time.sleep(min(2 ** a, 30))
    raise RuntimeError(f"gọi Pancake thất bại sau {tries} lần: {last}")


def phone9(s):
    d = re.sub(r"\D", "", s or "")
    return d[-9:] if len(d) >= 9 else None


def vn_date(ts):
    """'2026-09-30 03:29:22.66' (UTC) → '2026-09-30' giờ VN."""
    if not ts:
        return ""
    try:
        dt = datetime.strptime(ts[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        return dt.astimezone(VN).strftime("%Y-%m-%d")
    except ValueError:
        return ts[:10]


def clean_name(s):
    return re.sub(r"\s+", " ", s or "").strip()


def find_status_id():
    url = f"{BASE_URL}/shops/{SHOP_ID}/crm/tables?" + urllib.parse.urlencode({"api_key": CRM_KEY})
    try:
        tables = http_get_json(url, tries=3).get("tables") or []
    except RuntimeError as e:
        print(f"[warn] không đọc được bảng CRM ({e}) — dùng mã dự phòng", file=sys.stderr)
        return STATUS_CHOT_FALLBACK
    for t in tables:
        if t.get("name") != "Contact":
            continue
        for sec in t.get("sections") or []:
            for f in sec.get("fields") or []:
                if f.get("name") != "trang_thai":
                    continue
                for o in f.get("select_options") or []:
                    if clean_name(o.get("value")).lower() == STATUS_LABEL.lower():
                        return o["id"]
    print("[warn] không thấy lựa chọn 'Chốt đơn' trong bảng CRM — dùng mã dự phòng", file=sys.stderr)
    return STATUS_CHOT_FALLBACK


def fetch_all_contacts():
    out, cursor, page, total = [], None, 1, None
    while True:
        params = [("api_key", CRM_KEY), ("page_size", 200)]
        if cursor:
            params.append(("cursor", cursor))
        url = f"{BASE_URL}/shops/{SHOP_ID}/crm/Contact/records?" + urllib.parse.urlencode(params)
        body = http_get_json(url).get("data") or {}
        total = body.get("total_entries", total)
        entries = body.get("entries") or []
        if not entries:
            break
        out.extend(entries)
        nc = body.get("cursor")
        if not nc or nc == cursor:
            break
        cursor, page = nc, page + 1
        if page % 20 == 0:
            print(f"  CRM trang {page}: {len(out):,}/{total or '?'}", file=sys.stderr)
        if page > 1000:
            raise RuntimeError("quá 1000 trang CRM — dừng để không lặp vô hạn")
    # Thiếu contact thì danh sách "chưa có đơn" sẽ hụt âm thầm → thà fail cho job đỏ.
    if total and len(out) < total * 0.98:
        raise RuntimeError(f"chỉ lấy được {len(out):,}/{total:,} contact — bỏ, không ghi dữ liệu thiếu")
    return out


def lookup_orders(p9):
    url = f"{BASE_URL}/shops/{SHOP_ID}/orders?" + urllib.parse.urlencode(
        {"api_key": POS_KEY, "search": "0" + p9, "page_size": 50})
    try:
        r = http_get_json(url, tries=5, timeout=40)
    except RuntimeError:
        return p9, None
    orders = [{"id": str(o.get("id")), "status": o.get("status"),
               "date": vn_date((o.get("inserted_at") or "").replace("T", " "))}
              for o in (r.get("data") or [])]
    return p9, {"n": r.get("total_entries", len(orders)), "orders": orders}


def classify(entry):
    """none = không có đơn nào · cancel_only = mọi đơn đều huỷ · has_order = có đơn thật."""
    if entry["n"] == 0:
        return "none"
    if entry["orders"] and all(o["status"] == ORDER_CANCELED for o in entry["orders"]):
        return "cancel_only"
    return "has_order"


def main():
    if not (SHOP_ID and CRM_KEY and POS_KEY):
        sys.exit("Thiếu PANCAKE_SHOP_ID / PANCAKE_CRM_API_KEY / PANCAKE_API_KEY")

    status_id = find_status_id()
    print("[1/3] Quét toàn bộ contact CRM…", file=sys.stderr)
    contacts = fetch_all_contacts()
    chot = [c for c in contacts if c.get("trang_thai") == status_id and phone9(c.get("Phone"))]
    by_phone = {}
    for c in chot:
        by_phone.setdefault(phone9(c["Phone"]), []).append(c)
    print(f"  {len(contacts):,} contact · {len(chot):,} ở '{STATUS_LABEL}' · {len(by_phone):,} SĐT",
          file=sys.stderr)

    cache = {}
    if os.path.exists(CACHE_FILE):
        cache = json.load(open(CACHE_FILE, encoding="utf-8")).get("phones", {})
    todo = [p for p in by_phone if p not in cache or classify(cache[p]) != "has_order"]
    print(f"[2/3] Tra đơn POS cho {len(todo):,} SĐT (còn lại lấy từ cache)…", file=sys.stderr)
    today = datetime.now(VN).strftime("%Y-%m-%d")
    failed = []
    with ThreadPoolExecutor(8) as ex:
        for i, (p, res) in enumerate(ex.map(lookup_orders, todo), 1):
            if res is None:
                failed.append(p)
            else:
                res["checked"] = today
                cache[p] = res
            if i % 1000 == 0:
                print(f"  {i:,}/{len(todo):,}", file=sys.stderr)
    if todo and len(failed) > len(todo) * 0.2:
        raise RuntimeError(f"tra đơn lỗi {len(failed)}/{len(todo)} SĐT — Pancake POS có vấn đề, không ghi")

    print("[3/3] Ghi kết quả…", file=sys.stderr)
    rows, counts = [], {"none": 0, "cancel_only": 0, "has_order": 0, "unknown": 0}
    for p, cs in by_phone.items():
        if p not in cache:
            counts["unknown"] += 1
            continue
        kind = classify(cache[p])
        counts[kind] += 1
        if kind == "has_order":
            continue
        c = max(cs, key=lambda x: x.get("CreatedOn") or "")
        rows.append({
            "phone": "0" + p,
            "name": clean_name(c.get("Name")),
            "created": vn_date(c.get("CreatedOn")),
            "modified": vn_date(c.get("ModifiedOn")),
            "sale": clean_name((c.get("Owner_obj") or {}).get("name")),
            "runner": clean_name(c.get("nguoi_chay_quang_cao")),
            "note": (c.get("Note") or "").strip(),
            "contacts": len(cs),
            "kind": kind,
            "orders": cache[p]["orders"] if kind == "cancel_only" else [],
        })
    rows.sort(key=lambda r: (r["created"], r["phone"]), reverse=True)

    out = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "status_label": STATUS_LABEL,
        "totals": {"contacts_chot": len(chot), "phones": len(by_phone), **counts},
        "rows": rows,
    }
    json.dump(out, open(OUT_FILE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    # Chỉ giữ SĐT còn đang ở "Chốt đơn" để cache không phình mãi. SĐT đã có đơn thật
    # không bao giờ bị tra lại → bỏ danh sách đơn, chỉ giữ số lượng (file ~2,5MB → ~0,5MB).
    keep = {}
    for p in by_phone:
        if p in cache:
            e = cache[p]
            keep[p] = {"n": e["n"], "orders": []} if classify(e) == "has_order" else e
    json.dump({"phones": keep}, open(CACHE_FILE, "w", encoding="utf-8"), separators=(",", ":"))
    print(f"  chưa có đơn {counts['none']} · chỉ đơn huỷ {counts['cancel_only']} · "
          f"có đơn {counts['has_order']} · chưa tra được {counts['unknown']}", file=sys.stderr)


if __name__ == "__main__":
    main()
