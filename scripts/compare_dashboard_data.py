"""
Đối chiếu data/dashboard-data.json (repo này tự ráp) với bản dashboard cũ đang chạy.
=====================================================================================
Dùng khi gộp pipeline lấy dữ liệu từ repo facebook-ads-dashboard về đây (2026-08-10):
chạy trước/sau khi bật DATA_PIPELINE_ENABLED để chắc chắn số không đổi.

    python scripts/compare_dashboard_data.py

So các chỉ số cấp TỔNG (không so từng dòng cho khỏi nhiễu):
  · số tài khoản / campaign / ad
  · chi phí QC theo nhân sự (tổng toàn kỳ)
  · doanh thu + số đơn theo từng nhóm nguồn (tổng toàn kỳ)
  · tổng chi Google Ads, số SP có giá vốn, số nhân sự trong lead→đơn

Lệch > NGƯỠNG % thì in ❌ và exit 1 để CI/người chạy thấy ngay.
"""
import json
import os
import sys
import urllib.request

OLD_SRC = os.environ.get(
    "OLD_DASHBOARD_URL",
    "https://raw.githubusercontent.com/hxduy93/facebook-ads-dashboard/main/index.html",
)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NEW_FILE = os.path.join(ROOT, "data", "dashboard-data.json")
THRESHOLD_PCT = 1.0   # lệch dưới mức này coi như do 2 bên chụp lệch giờ

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def extract_data_blob(html: str) -> dict:
    """Bóc `const DATA = {...}` khỏi index.html repo cũ (copy từ scripts/refresh_data.py)."""
    p = html.find("const DATA =")
    if p < 0:
        raise SystemExit("Không thấy marker DATA trong nguồn cũ.")
    b = html.find("{", p)
    depth, i, instr, esc = 0, b, False, False
    while i < len(html):
        c = html[i]
        if instr:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                instr = False
        else:
            if c == '"':
                instr = True
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    break
        i += 1
    return json.loads(html[b:i + 1].replace("<\\/", "</"))


def load_old():
    req = urllib.request.Request(OLD_SRC, headers={"User-Agent": "crm-compare"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return extract_data_blob(r.read().decode("utf-8"))


def spend_by_staff(d):
    out = {}
    for staff, prods in (d.get("ad_spend_by_staff") or {}).items():
        out[staff] = sum(float((p or {}).get("_total") or 0) for p in prods.values())
    return out


def revenue_by_group(d):
    out = {}
    for key, g in ((d.get("revenue") or {}).get("source_groups") or {}).items():
        rev = g.get("order_revenue_by_status_by_date") or {}
        cnt = g.get("order_count_by_status_by_date") or {}
        out[key] = (
            sum(v for st in rev.values() for v in st.values()),
            sum(v for st in cnt.values() for v in st.values()),
        )
    return out


def metrics(d):
    m = {
        "accounts": len(d.get("accounts") or []),
        "campaigns": len(d.get("campaigns") or []),
        "ads": len(d.get("ads") or []),
        "product_costs": len(d.get("product_costs") or {}),
        "l2o_staff": len((d.get("lead_to_order") or {}).get("by_staff_utm") or {}),
    }
    for staff, total in spend_by_staff(d).items():
        m[f"spend:{staff}"] = total
    for key, (rev, cnt) in revenue_by_group(d).items():
        m[f"rev:{key}"] = rev
        m[f"don:{key}"] = cnt
    g = d.get("google_ads") or {}
    m["google_spend"] = sum(
        float((c or {}).get("spend") or 0) for c in (g.get("campaigns_raw") or [])
    )
    m["google_campaign_rows"] = len(g.get("campaigns_raw") or [])
    return m


def main():
    print("[compare] nguồn cũ :", OLD_SRC)
    print("[compare] bản mới  :", NEW_FILE)
    old, new = load_old(), json.load(open(NEW_FILE, encoding="utf-8"))
    print(f"[compare] generated_at cũ={old.get('generated_at')} · mới={new.get('generated_at')}")
    print()

    mo, mn = metrics(old), metrics(new)
    keys = sorted(set(mo) | set(mn))
    worst = 0.0
    print(f"{'chỉ số':22s} {'cũ':>18s} {'mới':>18s} {'lệch':>10s}")
    print("-" * 72)
    for k in keys:
        a, b = mo.get(k, 0), mn.get(k, 0)
        pct = 0.0 if a == b else (100.0 if not a else abs(b - a) / abs(a) * 100)
        worst = max(worst, pct)
        flag = "  " if pct <= THRESHOLD_PCT else " ❌"
        print(f"{k:22s} {a:18,.0f} {b:18,.0f} {pct:9.2f}%{flag}")

    print()
    if worst > THRESHOLD_PCT:
        print(f"❌ Có chỉ số lệch tới {worst:.2f}% (ngưỡng {THRESHOLD_PCT}%) — soát lại trước khi bật công tắc.")
        sys.exit(1)
    print(f"✅ Khớp trong ngưỡng {THRESHOLD_PCT}% (lệch lớn nhất {worst:.2f}%).")


if __name__ == "__main__":
    main()
