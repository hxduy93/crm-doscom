#!/usr/bin/env python3
"""
Lấy map ad_id -> {tên ad, link bài/video gốc trên Facebook, brand} cho TẤT CẢ ad.

Mục đích: với UTM toàn số (utm_content = ad_id), click ra xem được quảng cáo đang chạy,
và gắn brand chính xác theo TÀI KHOẢN (account -> groups trong fb-config.json) thay vì đoán
theo tên campaign.

Input env:
  FB_ACCESS_TOKEN  — long-lived user token (scope ads_management). Cùng token fetch_fb_ads.py dùng.
Đọc: data/fb-config.json (account_to_groups). Output: data/fb-ad-creatives.json

Link bài gốc dựng từ creative.effective_object_story_id = "{page_id}_{post_id}"
  -> https://www.facebook.com/{page_id}_{post_id}   (advertiser đăng nhập là xem được, kể cả dark post)
Fallback: instagram_permalink_url; cuối cùng Ads Library theo ad_id.
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(__file__)
DATA = os.path.normpath(os.path.join(HERE, "..", "data"))
CONFIG = os.path.join(DATA, "fb-config.json")
OUT = os.path.join(DATA, "fb-ad-creatives.json")

TOKEN = os.environ.get("FB_ACCESS_TOKEN", "").strip()
VER = os.environ.get("FB_API_VERSION", "v21.0")
FIELDS = "id,name,creative{effective_object_story_id,video_id,thumbnail_url,instagram_permalink_url}"


def brand_of(groups):
    if not groups:
        return "UNKNOWN"
    return "NOMA" if "NOMA" in groups else "DOSCOM"


def ads_library_link(ad_id):
    return (f"https://www.facebook.com/ads/library/?active_status=all&ad_type=all"
            f"&country=VN&media_type=all&id={ad_id}")


def post_link(creative):
    if not creative:
        return None
    sid = creative.get("effective_object_story_id")
    if sid:
        return f"https://www.facebook.com/{sid}"
    ig = creative.get("instagram_permalink_url")
    return ig or None


def http_get(url, retries=3):
    last = None
    for i in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "fb-ads-dashboard/1.0"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            last = e
            body = e.read().decode("utf-8", "replace")[:300]
            if e.code >= 500 or e.code == 429:
                wait = 8 * i
                print(f"  [retry {i}/{retries}] HTTP {e.code} chờ {wait}s | {body}", file=sys.stderr)
                time.sleep(wait)
            else:
                raise RuntimeError(f"HTTP {e.code}: {body}")
        except (urllib.error.URLError, TimeoutError) as e:
            last = e
            time.sleep(5 * i)
    raise RuntimeError(f"Failed after {retries}: {last}")


def fetch_account_ads(acct_id, brand, acct_name):
    out = {}
    url = (f"https://graph.facebook.com/{VER}/act_{acct_id}/ads"
           f"?fields={urllib.parse.quote(FIELDS)}&limit=200&access_token={TOKEN}")
    pages = 0
    while url and pages < 200:
        data = http_get(url)
        for ad in data.get("data", []):
            ad_id = ad.get("id")
            if not ad_id:
                continue
            cr = ad.get("creative") or {}
            out[ad_id] = {
                "name": ad.get("name"),
                "link": post_link(cr) or ads_library_link(ad_id),
                "link_is_post": bool(post_link(cr)),
                # Mở thẳng ad trong Trình quản lý QC (cần đăng nhập tài khoản business)
                "manager_link": (f"https://adsmanager.facebook.com/adsmanager/manage/ads"
                                 f"?act={acct_id}&selected_ad_ids={ad_id}"),
                "thumb": cr.get("thumbnail_url"),
                "account_id": acct_id,
                "account_name": acct_name,
                "brand": brand,
            }
        url = (data.get("paging") or {}).get("next")
        pages += 1
        time.sleep(0.3)
    print(f"  [{brand:7}] act_{acct_id} -> {len(out)} ad | {acct_name[:40]}")
    return out


import urllib.parse  # noqa: E402 (đặt sau để giữ nhóm import gọn)


def main():
    if not TOKEN:
        print("[creatives] THIẾU FB_ACCESS_TOKEN — bỏ qua (CI sẽ chạy với secret).", file=sys.stderr)
        sys.exit(0)
    cfg = json.load(open(CONFIG, encoding="utf-8"))
    accounts = cfg.get("account_to_groups", {})
    ads = {}
    for acct_id, meta in accounts.items():
        if not meta.get("active", True):
            continue
        brand = brand_of(meta.get("groups"))
        try:
            ads.update(fetch_account_ads(acct_id, brand, meta.get("name", "")))
        except Exception as e:
            print(f"  WARN act_{acct_id}: {e}", file=sys.stderr)
    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "api_version": VER,
        "total_ads": len(ads),
        "ads": ads,
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"[creatives] {len(ads)} ad -> {OUT} ({os.path.getsize(OUT):,} bytes)")


if __name__ == "__main__":
    main()
