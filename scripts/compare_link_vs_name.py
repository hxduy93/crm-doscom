#!/usr/bin/env python3
"""
So sánh 2 cách gán sản phẩm cho chi phí quảng cáo: ĐỌC LINK LANDING vs ĐỌC TÊN CAMPAIGN.

Chạy TRƯỚC khi đổi cách tính, để biết chính xác việc đổi sẽ dời bao nhiêu tiền và
sang sản phẩm nào — thay vì đổi mù rồi mới phát hiện lệch.

Bảng slug -> sản phẩm do chủ dự án chốt 2026-07-31 (LANDING_TO_PRODUCT bên dưới).

Env: FB_ACCESS_TOKEN. Đọc data/fb-config.json. Chỉ ĐỌC, không ghi gì.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from update_dashboard import detect_profit_product  # noqa: E402  dùng ĐÚNG hàm production

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(__file__)
CONFIG = os.path.normpath(os.path.join(HERE, "..", "data", "fb-config.json"))
TOKEN = os.environ.get("FB_ACCESS_TOKEN", "").strip()
VER = os.environ.get("FB_API_VERSION", "v21.0")

# CHỦ DỰ ÁN CHỐT 2026-07-31 — slug landing -> (sản phẩm, nhân sự theo landing)
LANDING_TO_PRODUCT = {
    "noma.io.vn/911tpn":    ("Noma 911", "PHUONG_NAM"),
    "noma.io.vn/nm911d":    ("Noma 911", "DUY"),
    "noma.io.vn/noma911":   ("Noma 911", "PHUONG_NAM"),
    "doscom.click/d1cb":    ("D1",       "DUY"),
    "doscom.click/d1tpn":   ("D1",       "PHUONG_NAM"),
    "senso.io.vn/dr1lad":   ("DR1",      "DUY"),
    "senso.io.vn/dr1tpn":   ("DR1",      "PHUONG_NAM"),
    "doscom.click/dr1tpn":  ("DR1",      "PHUONG_NAM"),
    "doscom.store/da8.1tpn": ("DA8.1",   "PHUONG_NAM"),
    "noma.io.vn/250tpn":    ("Noma 250", "PHUONG_NAM"),
}

FIELDS = ("id,name,campaign{id,name},"
          "creative{object_story_spec{link_data{link},video_data{call_to_action{value{link}}}},"
          "asset_feed_spec{link_urls{website_url}},template_url,object_url}")


def http_get(url, retries=3):
    for i in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "crm-cmp/1.0"})
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if (e.code >= 500 or e.code == 429) and i < retries:
                time.sleep(6 * i); continue
            print(f"  [WARN] HTTP {e.code}: {e.read().decode('utf-8','replace')[:160]}", file=sys.stderr)
            return None
        except Exception:
            if i < retries:
                time.sleep(4 * i); continue
            return None
    return None


def links_of(cr):
    out = []
    if not cr:
        return out
    oss = cr.get("object_story_spec") or {}
    if (oss.get("link_data") or {}).get("link"):
        out.append(oss["link_data"]["link"])
    vd = ((oss.get("video_data") or {}).get("call_to_action") or {}).get("value") or {}
    if vd.get("link"):
        out.append(vd["link"])
    for u in ((cr.get("asset_feed_spec") or {}).get("link_urls") or []):
        if u.get("website_url"):
            out.append(u["website_url"])
    for k in ("template_url", "object_url"):
        if cr.get(k):
            out.append(cr[k])
    return out


def norm(u):
    try:
        p = urllib.parse.urlsplit(u)
        return (p.netloc or "").lower().replace("www.", "") + ((p.path or "/").rstrip("/") or "/")
    except Exception:
        return u


def main():
    if not TOKEN:
        sys.exit("ERROR: thiếu FB_ACCESS_TOKEN")
    cfg = json.load(open(CONFIG, encoding="utf-8")).get("account_to_groups", {})

    camp = defaultdict(lambda: {"name": "", "staff": "", "spend": 0.0, "prods": set(), "ads": 0, "nolink": 0})
    for acct_id, meta in cfg.items():
        if not meta.get("active", True):
            continue
        staff = meta.get("staff", "?")
        spend = {}
        u = (f"https://graph.facebook.com/{VER}/act_{acct_id}/insights"
             f"?level=ad&fields=ad_id,spend&date_preset=last_90d&limit=500&access_token={TOKEN}")
        while u:
            d = http_get(u)
            if not d:
                break
            for r in d.get("data", []):
                try:
                    spend[r["ad_id"]] = spend.get(r["ad_id"], 0.0) + float(r.get("spend") or 0)
                except (KeyError, ValueError):
                    pass
            u = (d.get("paging") or {}).get("next"); time.sleep(0.2)

        u = (f"https://graph.facebook.com/{VER}/act_{acct_id}/ads"
             f"?fields={urllib.parse.quote(FIELDS)}&limit=200&access_token={TOKEN}")
        while u:
            d = http_get(u)
            if not d:
                break
            for ad in d.get("data", []):
                c = ad.get("campaign") or {}
                cid = c.get("id") or "?"
                e = camp[cid]
                e["name"] = c.get("name") or ""
                e["staff"] = staff
                e["spend"] += spend.get(ad.get("id"), 0.0)
                e["ads"] += 1
                found = False
                for L in links_of(ad.get("creative")):
                    hit = LANDING_TO_PRODUCT.get(norm(L))
                    if hit:
                        e["prods"].add(hit[0]); found = True
                if not found:
                    e["nolink"] += 1
            u = (d.get("paging") or {}).get("next"); time.sleep(0.25)

    buckets = defaultdict(lambda: {"n": 0, "spend": 0.0, "rows": []})
    for cid, e in camp.items():
        by_name = detect_profit_product(e["name"])
        by_link = list(e["prods"])[0] if len(e["prods"]) == 1 else (None if not e["prods"] else "NHIỀU SP")
        if by_link and by_name and by_link == by_name:
            k = "1. Khớp nhau (đổi cũng không đổi số)"
        elif by_link and by_name and by_link != by_name:
            k = "2. KHÁC NHAU — đổi sẽ DỜI tiền"
        elif by_link and not by_name:
            k = "3. Chỉ LINK gán được — đổi sẽ VỚT thêm"
        elif by_name and not by_link:
            k = "4. Chỉ TÊN gán được — đổi sẽ MẤT nếu bỏ tên"
        else:
            k = "5. Cả hai chịu — vẫn chưa gán"
        b = buckets[k]
        b["n"] += 1; b["spend"] += e["spend"]
        b["rows"].append((e["spend"], e["staff"], e["name"][:46], by_name, by_link))

    print("\n" + "=" * 112)
    print("SO SÁNH: gán sản phẩm bằng LINK LANDING vs bằng TÊN CAMPAIGN (90 ngày)")
    print("=" * 112)
    total = sum(b["spend"] for b in buckets.values())
    for k in sorted(buckets):
        b = buckets[k]
        print(f"\n### {k} — {b['n']} campaign | {b['spend']:,.0f}đ ({b['spend']/total*100:.1f}%)")
        for sp, staff, name, bn, bl in sorted(b["rows"], key=lambda x: -x[0])[:12]:
            if sp <= 0 and k.startswith("1"):
                continue
            print(f"   {sp:>15,.0f} | {staff:<11} | {name:<46} | tên={bn or '—':<10} | link={bl or '—'}")
    print("\n" + "-" * 112)
    print(f"TỔNG: {total:,.0f}đ")


if __name__ == "__main__":
    main()
