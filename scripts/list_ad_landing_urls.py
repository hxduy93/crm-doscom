#!/usr/bin/env python3
"""
Liệt kê LINK LANDING mà từng quảng cáo Facebook dẫn tới, kèm chi tiêu.

Mục đích: hiện đang gán chi phí QC về sản phẩm bằng cách ĐỌC TÊN CAMPAIGN
(detect_profit_product). Tên do người đặt tay nên đặt kiểu "New folder #1",
"Toản mán shop" là không gán được → tiền rơi vào rổ "(chưa gán SP)" (28,5tr).
Link landing do hệ thống sinh, cố định, và slug đã mã hoá sẵn cả SP lẫn nhân sự
(vd noma.io.vn/nm911d = NOMA 911 - Duy, /911tpn = NOMA 911 - Phương Nam).

Script này CHỈ ĐỌC và in ra để chốt bảng slug → sản phẩm. Không sửa gì.

Env: FB_ACCESS_TOKEN (scope ads_management) — cùng token fetch_fb_ads.py dùng.
Đọc data/fb-config.json (account_to_groups). Chạy qua workflow list-ad-landing-urls.yml.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(__file__)
CONFIG = os.path.normpath(os.path.join(HERE, "..", "data", "fb-config.json"))
TOKEN = os.environ.get("FB_ACCESS_TOKEN", "").strip()
VER = os.environ.get("FB_API_VERSION", "v21.0")
# Cửa sổ chi tiêu: khớp DAYS_BACK=90 của update_dashboard.py để số so được với dashboard.
DATE_PRESET = "last_90d"

# Mọi chỗ Facebook có thể giấu link đích, tuỳ loại quảng cáo:
#   link_data.link                     — ad ảnh/carousel dẫn web
#   video_data.call_to_action...link   — ad video có nút CTA
#   asset_feed_spec.link_urls          — ad Advantage+ / dynamic
#   template_url / object_url          — ad dạng template
FIELDS = (
    "id,name,effective_status,"
    "creative{object_story_spec{link_data{link},video_data{call_to_action{value{link}}}},"
    "asset_feed_spec{link_urls{website_url}},template_url,object_url,object_type}"
)


def http_get(url, retries=3):
    for i in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "crm-landing-lister/1.0"})
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")[:200]
            if (e.code >= 500 or e.code == 429) and i < retries:
                time.sleep(6 * i)
                continue
            print(f"  [WARN] HTTP {e.code}: {body}", file=sys.stderr)
            return None
        except Exception as e:
            if i < retries:
                time.sleep(4 * i)
                continue
            print(f"  [WARN] {type(e).__name__}: {e}", file=sys.stderr)
            return None
    return None


def extract_links(creative):
    """Gom mọi link tìm được trong 1 creative — có ad khai ở nhiều chỗ cùng lúc."""
    out = []
    if not creative:
        return out
    oss = creative.get("object_story_spec") or {}
    ld = (oss.get("link_data") or {}).get("link")
    if ld:
        out.append(ld)
    vd = ((oss.get("video_data") or {}).get("call_to_action") or {}).get("value") or {}
    if vd.get("link"):
        out.append(vd["link"])
    for u in ((creative.get("asset_feed_spec") or {}).get("link_urls") or []):
        if u.get("website_url"):
            out.append(u["website_url"])
    for k in ("template_url", "object_url"):
        if creative.get(k):
            out.append(creative[k])
    return out


def norm(u):
    """Bỏ query/fragment để gom cùng landing; giữ path vì path chính là slug SP."""
    try:
        p = urllib.parse.urlsplit(u)
        host = (p.netloc or "").lower().replace("www.", "")
        path = (p.path or "/").rstrip("/") or "/"
        return host + path
    except Exception:
        return u


def spend_by_ad(acct_id):
    """Chi tiêu {ad_id: spend} trong cửa sổ DATE_PRESET."""
    out = {}
    url = (f"https://graph.facebook.com/{VER}/act_{acct_id}/insights"
           f"?level=ad&fields=ad_id,spend&date_preset={DATE_PRESET}&limit=500&access_token={TOKEN}")
    while url:
        d = http_get(url)
        if not d:
            break
        for r in d.get("data", []):
            try:
                out[r["ad_id"]] = out.get(r["ad_id"], 0.0) + float(r.get("spend") or 0)
            except (KeyError, ValueError):
                pass
        url = (d.get("paging") or {}).get("next")
        time.sleep(0.2)
    return out


def main():
    if not TOKEN:
        sys.exit("ERROR: thiếu FB_ACCESS_TOKEN")
    cfg = json.load(open(CONFIG, encoding="utf-8")).get("account_to_groups", {})

    rows = defaultdict(lambda: {"ads": 0, "spend": 0.0, "accs": set(), "samples": []})
    no_link = defaultdict(lambda: {"ads": 0, "spend": 0.0})
    for acct_id, meta in cfg.items():
        if not meta.get("active", True):
            continue
        name = (meta.get("name") or "")[:45]
        print(f"[INFO] act_{acct_id} — {name}", file=sys.stderr)
        spend = spend_by_ad(acct_id)
        url = (f"https://graph.facebook.com/{VER}/act_{acct_id}/ads"
               f"?fields={urllib.parse.quote(FIELDS)}&limit=200&access_token={TOKEN}")
        n = 0
        while url:
            d = http_get(url)
            if not d:
                break
            for ad in d.get("data", []):
                n += 1
                links = extract_links(ad.get("creative"))
                sp = spend.get(ad.get("id"), 0.0)
                if not links:
                    key = meta.get("staff", "?")
                    no_link[key]["ads"] += 1
                    no_link[key]["spend"] += sp
                    continue
                # 1 ad có thể khai link ở nhiều chỗ (link_data + asset_feed_spec…).
                # Nếu ra NHIỀU link khác nhau thì chia đều chi tiêu, để cột "chi tiêu"
                # cộng lại không vượt quá tiền thật đã tiêu.
                uniq = []
                for L in links:
                    k = norm(L)
                    if k not in uniq:
                        uniq.append(k)
                for k in uniq:
                    e = rows[k]
                    e["ads"] += 1
                    e["spend"] += sp / len(uniq)
                    e["accs"].add(meta.get("staff", "?"))
                    if len(e["samples"]) < 2:
                        e["samples"].append((ad.get("name") or "")[:52])
            url = (d.get("paging") or {}).get("next")
            time.sleep(0.25)
        print(f"       {n} ad", file=sys.stderr)

    print("\n" + "=" * 108)
    print("LINK LANDING ĐỌC ĐƯỢC TỪ QUẢNG CÁO (90 ngày) — chốt bảng slug → sản phẩm")
    print("=" * 108)
    print(f"{'link (đã bỏ query)':<52} | {'ad':>4} | {'chi tiêu':>16} | {'nhân sự':<12} | campaign mẫu")
    print("-" * 108)
    for k, e in sorted(rows.items(), key=lambda x: -x[1]["spend"]):
        print(f"{k[:52]:<52} | {e['ads']:>4} | {e['spend']:>16,.0f} | "
              f"{','.join(sorted(e['accs'])):<12} | {e['samples'][0] if e['samples'] else ''}")
    tot = sum(e["spend"] for e in rows.values())
    print("-" * 108)
    print(f"{'TỔNG có link':<52} | {sum(e['ads'] for e in rows.values()):>4} | {tot:>16,.0f}")
    for staff, e in no_link.items():
        print(f"{'KHÔNG có link (Messenger/tương tác) — ' + staff:<52} | {e['ads']:>4} | {e['spend']:>16,.0f}")


if __name__ == "__main__":
    main()
