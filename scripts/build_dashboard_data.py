"""
Ráp data/dashboard-data.json — nguồn số liệu duy nhất của CRM Doscom.
=====================================================================
Port từ repo cũ facebook-ads-dashboard (`update_dashboard.py`) khi gộp phần
lấy dữ liệu về đây (2026-08-10). Khác bản cũ đúng 1 chỗ: bản cũ nhét object
DATA vào index.html rồi CRM đi bóc ngược ra; bản này ghi thẳng ra JSON.

Đầu vào (do các workflow fetch-* sinh ra trước đó, đọc trong data/):
  product-revenue.json · google-ads-spend.json · product-costs.json
  lead-to-order.json · competitor_baseline.json · competitor_snapshots.json
Cộng thêm FB Ads insights gọi LIVE qua Graph API (cần FB_ACCESS_TOKEN).

Chạy tay:  python scripts/build_dashboard_data.py
Trong CI :  bước "Ráp dashboard-data.json" của .github/workflows/refresh-data.yml
"""

import os
import sys
import json
import io
import zipfile
from datetime import datetime, timedelta, timezone

import requests

# Script nằm trong scripts/ nhưng mọi đường dẫn dữ liệu bên dưới là tương đối
# GỐC REPO (giữ nguyên như bản repo cũ) → chuyển thư mục làm việc về gốc.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

# -----------------------------------------------------------------------------
# CONFIG
# -----------------------------------------------------------------------------
FB_TOKEN = os.environ["FB_ACCESS_TOKEN"]

FB_API_VERSION = "v20.0"
DAYS_BACK      = 90  # last 90 days — phủ ATTRIBUTION_WINDOW_DAYS=60 của build_lead_to_order.py
                     # + match LOOKBACK_DAYS=90 của scripts/fetch_fb_ads.py để UTM-FB match rate cao

# 6 ad accounts under BM "Yoday Media Retail".
# `staff`  = nhân sự cầm tài khoản (DUY / PHUONG_NAM) — dùng phân bổ ad spend cho tính LN.
ACCOUNTS = [
    {"id": "927390616363424",  "staff": "DUY",        "short": "Doscom - Công nghệ nâng tầm cuộc sống",                         "name": "Doscom - Công nghệ nâng tầm cuộc sống"},
    {"id": "764394829882083",  "staff": "PHUONG_NAM", "short": "Doscom - Noma.vn - Giải Pháp Chăm Sóc Xe Hơi Toàn Diện",        "name": "Doscom - Noma.vn - Giải Pháp Chăm Sóc Xe Hơi Toàn Diện"},
    {"id": "1655506672244826", "staff": "DUY",        "short": "CÔNG TY TNHH DOSCOM HOLDINGS - Noma Việt Nam",                  "name": "CÔNG TY TNHH DOSCOM HOLDINGS - Noma Việt Nam"},
    {"id": "1449385949897024", "staff": "DUY",        "short": "CÔNG TY TNHH DOSCOM HOLDINGS - Công nghệ nâng tầm cuộc sống",   "name": "CÔNG TY TNHH DOSCOM HOLDINGS - Công nghệ nâng tầm cuộc sống"},
    {"id": "906015559004892",  "staff": "PHUONG_NAM", "short": "Doscom Mart",                                                   "name": "Doscom Mart"},
    {"id": "1416634670476226", "staff": "PHUONG_NAM", "short": "CÔNG TY TNHH DOSCOM HOLDINGS - Doscom Mart",                    "name": "CÔNG TY TNHH DOSCOM HOLDINGS - Doscom Mart"},
    {"id": "1254151326914021", "staff": "DUY",        "short": "CÔNG TY CP DOSCOM",                                             "name": "CÔNG TY CP DOSCOM"},
]

# 14 SP gốc + extended SKUs từ data/cost-source/skus-extended.json
# (user 2026-05-27 cung cấp 33 SKU mới + combos để cover OTHER_CAM/OTHER_DI/OTHER_RAZOR/OTHER_SIM)
PROFIT_PRODUCTS_BASE = [
    "D1", "D1 Pro", "D2", "D3", "D4", "D8 Pro",
    "DR1", "DR4 Plus",
    "DV1 Pro",
    "DA8.1", "DA8.1 Pro",
    "Noma 911", "Noma 922", "Noma 250",
]

# Map tên SP (PROFIT_PRODUCTS_BASE) → key Mã tên gọi trong xlsx Kho tổng (đã lowercase)
PRODUCT_TO_COST_KEY_BASE = {
    "D1":         "d1",
    "D1 Pro":     "d1 pro",
    "D2":         "d2",
    "D3":         "d3",
    "D4":         "d4",
    "D8 Pro":     "d8 pro",
    "DR1":        "dr1 new",     # xlsx: "DR1 New" đang KD (bản "DR1" cũ ngừng KD)
    "DR4 Plus":   "dr4 plus",
    "DV1 Pro":    "dv1 pro",
    "DA8.1":      "da8.1",
    "DA8.1 Pro":  "da8.1 pro",   # xlsx viết "DA8.1 PRO", đã lowercase
    "Noma 911":   "noma 911",
    "Noma 922":   "noma 922",
    "Noma 250":   "noma 250",
}

def _load_extended_skus():
    """Đọc data/cost-source/skus-extended.json — manual overlay cho SKU ngoài xlsx Kho tổng.
    Trả về (extended_labels, cost_keys, costs_overlay, price_overrides_vnd).
    price_overrides_vnd: label → giá nhập VND (áp dụng AFTER xlsx merge, ưu tiên cao nhất)."""
    # ROOT chứ KHÔNG phải dirname(__file__): bản gốc nằm ở gốc repo cũ nên ghép
    # thẳng "data/..." là đúng; ở đây script nằm trong scripts/ nên ghép kiểu cũ ra
    # scripts/data/... → không thấy file → tụt từ 56 SP có giá vốn xuống còn 14.
    path = os.path.join(ROOT, "data", "cost-source", "skus-extended.json")
    if not os.path.exists(path):
        return [], {}, {}, {}, {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            ext = json.load(f)
    except Exception as e:
        print(f"   ⚠ skus-extended.json load failed: {e}", file=sys.stderr)
        return [], {}, {}, {}, {}
    labels, cost_keys, costs = [], {}, {}
    for sku in ext.get("extended_skus", []):
        label = sku["label"]
        labels.append(label)
        cost_keys[label] = sku["cost_key"]
        costs[label] = {
            "gia_nhap_vnd": sku.get("gia_nhap_vnd"),
            "ma_ten_goi": sku["cost_key"],
            "ten": label,
            "trang_thai": "Đang KD",
            "_source": "skus-extended.json",
        }
    # Price overrides: label → giá nhập VND. Skip _note key.
    raw_overrides = ext.get("price_overrides_vnd", {})
    price_overrides = {k: v for k, v in raw_overrides.items() if not k.startswith("_") and isinstance(v, (int, float))}
    # 2026-07-31: GIÁ BÁN override. xlsx Kho tổng cũ hơn giá bán thực tế
    # (DR1 xlsx ghi 1.200.000đ nhưng 326 đơn đã bán đều ở 1.300.000đ).
    # gia_ban_vnd KHÔNG dùng tính doanh thu (doanh thu lấy từ giá trị đơn thật), nhưng ĐƯỢC
    # dùng ở fbAdsHelpers.js: pOrder = giá bán × 0,9 − giá nhập → ngưỡng CVR hoà vốn cho
    # agent FB Ads. Sai giá bán = khuyến nghị sai.
    raw_sale = ext.get("sale_price_overrides_vnd", {})
    sale_overrides = {k: v for k, v in raw_sale.items() if not k.startswith("_") and isinstance(v, (int, float))}
    return labels, cost_keys, costs, price_overrides, sale_overrides

# Compose PROFIT_PRODUCTS and PRODUCT_TO_COST_KEY at module load
_EXT_LABELS, _EXT_COST_KEYS, EXTENDED_COSTS_OVERLAY, PRICE_OVERRIDES_VND, SALE_PRICE_OVERRIDES_VND = _load_extended_skus()
PROFIT_PRODUCTS = PROFIT_PRODUCTS_BASE + _EXT_LABELS
PRODUCT_TO_COST_KEY = {**PRODUCT_TO_COST_KEY_BASE, **_EXT_COST_KEYS}

# Competitor data files (scraped via Chrome, not API)
COMPETITOR_BASELINE_FILE  = "data/competitor_baseline.json"
COMPETITOR_SNAPSHOTS_FILE = "data/competitor_snapshots.json"
KNOWN_COMPETITORS_FILE    = "known_competitors.json"

# -----------------------------------------------------------------------------
# HELPERS
# -----------------------------------------------------------------------------
def detect_product(name: str):
    """Extract product tag từ campaign/ad — dùng cho 3 bucket legacy (D1/Noma911/DR1)."""
    if not name:
        return None
    n = name.lower()
    if "noma911" in n or "noma 911" in n:
        return "Noma911"
    if "dr1" in n:
        return "DR1"
    if "d1" in n:
        return "D1"
    return None


def _strip_accents(s: str) -> str:
    """Bỏ dấu tiếng Việt để so tên campaign không phụ thuộc người gõ có dấu hay không.
    'Thái Lan' và 'THAI LAN' phải ra cùng một chuỗi."""
    import unicodedata
    s = unicodedata.normalize("NFD", str(s or ""))
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return s.replace("đ", "d").replace("Đ", "D").lower()


# Dấu hiệu campaign chạy THỊ TRƯỜNG THÁI LAN, khớp trên tên đã bỏ dấu + bỏ khoảng trắng.
#
# CHỈ nhận nguyên cụm. TUYỆT ĐỐI KHÔNG bắt mỗi chữ "thai": trong tài khoản đang chạy có
# sẵn 4 campaign Việt Nam tên "Noma911 - Thái Vũ BlackBi" / "...-Phương Nam-Thaivu" —
# Thái Vũ là TÊN NGƯỜI. Bắt "thai" là 4 campaign đó bị loại khỏi chi phí Việt Nam và tiền
# biến mất âm thầm, đúng vết xe đã ngã của bộ lọc nguồn Pancake trước đây.
# Tương tự "Thái Nguyên", "Thái Bình" (tên tỉnh, campaign target theo địa phương).
_TH_MARKERS = ("thailan", "thailand", "thai-lan")


def detect_market(name: str) -> str:
    """'th' nếu tên campaign ghi rõ Thái Lan, ngược lại 'vn'.

    Bỏ hết khoảng trắng trước khi so, để 'Thái Lan', 'Thai  Lan', 'THAILAND' cùng khớp;
    'Thái Vũ' -> 'thaivu' không chứa 'thailan' nên vẫn là 'vn'.
    """
    if not name:
        return "vn"
    flat = _strip_accents(name).replace(" ", "").replace("_", "")
    return "th" if any(m.replace("-", "") in flat for m in _TH_MARKERS) else "vn"


def detect_profit_product(name: str):
    """
    Extract 1 trong 14 PROFIT_PRODUCTS từ tên campaign — để phân bổ ad spend
    per nhân sự × sản phẩm cho tính lợi nhuận.

    Thứ tự check quan trọng (ưu tiên match cụ thể hơn):
      - "DA8.1 Pro" trước "DA8.1"
      - "Noma 922/911/250" trước generic NomaVietNam → Noma 911 default
      - "D1 Pro", "D8 Pro" trước "D1", "D8"
      - "DR4 Plus" trước "DR4"
      - "DV1 Pro" trước "DV1"
    """
    if not name:
        return None
    n = name.lower().replace("_", " ").replace("-", " ")
    n = " ".join(n.split())

    # Camera DA8.1 — ưu tiên Pro
    if "da8.1 pro" in n or "da 8.1 pro" in n or "da8 1 pro" in n:
        return "DA8.1 Pro"
    if "da8.1" in n or "da 8.1" in n or "da8 1" in n:
        return "DA8.1"

    # Noma — model cụ thể trước, fallback NomaVietNam → Noma 911.
    # 19/08/2026: bổ sung 120/130/230/310/350/680. Trước đó chỉ nhận 911/922/250 nên
    # campaign "NOMA 230 · Chai Xit Duong…", "2/8 - Noma 680 - 4 vid" rơi vào nhánh
    # generic bên dưới và bị tính thành Noma 911 — 28,8tr trong 01→19/08.
    # Tên nhắc nhiều model (campaign combo "NOMA 230 + NOMA 911") thì lấy model ĐỨNG
    # TRƯỚC — đó là SP chính đang chạy, model sau chỉ là quà/bán kèm.
    _hits = []
    for code in ("911", "922", "250", "310", "120", "130", "230", "350", "680"):
        for form in (f"noma {code}", f"noma{code}"):
            i = n.find(form)
            if i >= 0:
                _hits.append((i, code))
                break
    if _hits:
        return "Noma " + min(_hits)[1]
    # Generic "NomaVietNam" / "Noma" không kèm model → mặc định Noma 911
    # (account Phương Nam config: NOMA = Noma 911 default SKU)
    if "nomavietnam" in n or "noma vietnam" in n or " noma " in f" {n} ":
        return "Noma 911"

    # DR
    if "dr4 plus" in n or "dr4plus" in n:
        return "DR4 Plus"
    if "dr1" in n:
        return "DR1"

    # DV
    if "dv1 pro" in n or "dv1pro" in n:
        return "DV1 Pro"

    # Máy dò D* — ưu tiên Pro/số lớn trước
    if "d1 pro" in n or "d1pro" in n:
        return "D1 Pro"
    if "d8 pro" in n or "d8pro" in n:
        return "D8 Pro"
    # Dò 2-ký-tự — match boundary để tránh "d10"/"d20" false positive
    import re
    for code in ("d1", "d2", "d3", "d4"):
        if re.search(rf"(?<![a-z0-9]){code}(?![a-z0-9])", n):
            return code.upper()
    return None

def extract_registrations(actions):
    """Pull complete_registration count from actions array."""
    if not actions:
        return 0
    for a in actions:
        if a.get("action_type") == "complete_registration":
            try:
                return int(float(a.get("value", 0)))
            except (TypeError, ValueError):
                return 0
    return 0

def fb_get(url, params=None):
    """GET with retries for Facebook API."""
    for attempt in range(3):
        try:
            r = requests.get(url, params=params, timeout=90)
            if r.status_code == 200:
                return r.json()
            if r.status_code in (429, 500, 502, 503, 504):
                print(f"  retry {attempt+1} after HTTP {r.status_code}")
                continue
            r.raise_for_status()
        except requests.RequestException as e:
            if attempt == 2:
                raise
            print(f"  retry {attempt+1} after error: {e}")
    raise RuntimeError("fb_get failed after retries")

# ── LINK LANDING → SẢN PHẨM ──────────────────────────────────────────────
# Nguồn sự thật: các landing đang chạy trên tài khoản Cloudflare doscom.vietnam.
# Mỗi landing bán ĐÚNG MỘT sản phẩm, nên link đích của quảng cáo là bằng chứng
# chắc chắn nhất về việc tiền đó chạy cho sản phẩm nào — chắc hơn tên campaign,
# vốn do người đặt tay và hay đặt kiểu "Doscom-NomaVietNam-…".
#
# ⚠ MỞ LANDING MỚI THÌ PHẢI THÊM VÀO ĐÂY. Thiếu một dòng là chi phí của landing
# đó rơi về tên campaign, mà tên campaign generic "Noma …" thì dồn hết vào
# Noma 911 (đúng lỗi phát hiện 19/08/2026: 28,8tr của NOMA 230/350/680/120
# bị tính thành Noma 911 trong 01→19/08).
#
# Key = host + path, đã bỏ "www." và bỏ query/fragment.
# Nhãn cho chi tiêu KHÔNG đọc được link landing (ad Messenger/inbox, ad đã xoá creative).
# Cố ý là một "sản phẩm" hiện trong bảng thay vì bị loại: tiền vẫn phải nằm trong chi phí
# của nhân sự, chỉ là chưa biết của SP nào.
NO_LINK_BUCKET = "(không đọc được link)"

LANDING_TO_PRODUCT = {
    # NOMA 911 — noma.io.vn (project noma-landings)
    "noma.io.vn/nm911d":     "Noma 911",
    "noma.io.vn/911tpn":     "Noma 911",
    "noma.io.vn/noma911":    "Noma 911",
    "noma.io.vn/250tpn":     "Noma 250",
    # Máy dò D1 — doscom.click (project doscom-d1-lp)
    "doscom.click/d1cb":     "D1",
    "doscom.click/d1tpn":    "D1",
    "doscom.click/dr1tpn":   "DR1",     # path DR1 cũ nằm nhờ trên domain D1
    # Máy ghi âm DR1 — senso.io.vn (project dr1-lp)
    "senso.io.vn/dr1lad":    "DR1",
    "senso.io.vn/dr1tpn":    "DR1",
    # Camera DA8.1
    "doscom.store/da8.1tpn": "DA8.1",
    # NOMA 120 — chủ dự án chốt 19/08/2026: CHỈ path /d (bản Việt) mới tính là Noma 120.
    # Domain noma120.asia nay phục vụ landing NOMA 911 tiếng Thái ở "/" — phần Thái
    # KHÔNG ghi nhận, nên cố ý chỉ khai đúng path này chứ không khai cả domain.
    "noma120.asia/d":        "Noma 120",
}

# Domain chỉ bán MỘT sản phẩm → mọi path trên domain đó (kể cả biến thể theo nhân
# sự: /nm230d, /230pn, /d, /tpn… và bản *.pages.dev) đều về cùng sản phẩm.
# Tra bảng này SAU LANDING_TO_PRODUCT, nên path đặc biệt ở trên vẫn thắng.
LANDING_HOST_TO_PRODUCT = {
    # Dòng chăm xe NOMA — mỗi domain 1 sản phẩm (xem tiêu đề trang để đối chiếu)
    "noma620.click":              "Noma 230",   # NOMA 230 xịt dưỡng nhựa nhám
    "noma230-landing.pages.dev":  "Noma 230",
    "noma890.click":              "Noma 350",   # NOMA 350 vệ sinh phanh đĩa
    "noma350-landing.pages.dev":  "Noma 350",
    "nomaautocares.cloud":        "Noma 680",   # NOMA 680 bọt tuyết 650ml
    "noma680-landing.pages.dev":  "Noma 680",
    "noma120-landing.pages.dev":  "Noma 120",   # NOMA 120 súc rửa kim phun
    # Bản *.pages.dev của các landing ở trên (ad thường dán link pages.dev lúc test)
    "noma-landings.pages.dev":       "Noma 911",
    "noma911.pages.dev":             "Noma 911",
    "noma911-phuongnam.pages.dev":   "Noma 911",
    "doscom-d1-lp.pages.dev":        "D1",
    "dr1-lp.pages.dev":              "DR1",
    # Thị trường Thái — campaign 'th' được tách rổ riêng từ trước bước này, map ở
    # đây chỉ để rổ Thái hiện đúng tên SP thay vì "(chưa rõ SP)".
    "noma955.click":                 "D1",
    "doscom-d1-th.pages.dev":        "D1",
    "noma911-th.pages.dev":          "Noma 911",
    # ⛔ noma120.asia CỐ Ý KHÔNG map: domain này ĐỔI SẢN PHẨM ngày 18/08/2026 —
    # trước phục vụ landing NOMA 120 (Việt), nay trỏ landing NOMA 911 tiếng Thái.
    # Ad cũ của campaign "NOMA 120 · …" vẫn đang trỏ vào đây, nên đọc link sẽ ra
    # "Noma 911" — SAI với thứ campaign đó thực sự quảng cáo. Để trống cho tên
    # campaign quyết định. (Bài học: domain tái sử dụng thì link hết là bằng chứng.)
}

_AD_CREATIVE_FIELDS = (
    "id,campaign_id,"
    "creative{object_story_spec{link_data{link},video_data{call_to_action{value{link}}}},"
    "asset_feed_spec{link_urls{website_url}},template_url,object_url}"
)


def _norm_url(u):
    try:
        from urllib.parse import urlsplit
        p = urlsplit(u)
        return (p.netloc or "").lower().replace("www.", "") + ((p.path or "/").rstrip("/") or "/")
    except Exception:
        return ""


def _product_from_link(url):
    """Link đích của quảng cáo → tên sản phẩm. Path cụ thể thắng, sau đó tới domain."""
    key = _norm_url(url)
    if not key:
        return None
    if key in LANDING_TO_PRODUCT:
        return LANDING_TO_PRODUCT[key]
    host = key.split("/", 1)[0]
    return LANDING_HOST_TO_PRODUCT.get(host)


def _links_of_creative(cr):
    """Gom mọi chỗ Facebook có thể giấu link đích, tuỳ loại quảng cáo."""
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


def fetch_campaign_products_from_links(account_id: str):
    """{campaign_id: product} suy từ link landing của các ad trong campaign.

    Chỉ nhận khi MỌI link đọc được trong campaign cùng trỏ về 1 sản phẩm. Campaign có
    link mâu thuẫn → không trả gì cho campaign đó.

    Lỗi giữa chừng KHÔNG được xoá sạch phần đã đọc (sửa 19/08/2026): tài khoản
    act_764394829882083 nhiều ad tới mức Facebook trả HTTP 500 ở trang thứ n, bản cũ
    `return {}` nên MẤT TOÀN BỘ link của tài khoản đó — 94,6tr chi tiêu (30,2% của
    01→19/08) phải rơi về tên campaign mà không ai biết. Nay: trang nào hỏng thì dừng,
    GIỮ những trang đã đọc, và in rõ đã đọc được bao nhiêu.
    """
    found = {}
    pages = 0
    url = f"https://graph.facebook.com/{FB_API_VERSION}/act_{account_id}/ads"
    # limit nhỏ hơn (100 thay vì 200): mỗi ad kéo theo cả creative lồng nhiều tầng,
    # trang quá to là Facebook trả 500 thay vì cắt bớt.
    params = {"access_token": FB_TOKEN, "fields": _AD_CREATIVE_FIELDS, "limit": 100}
    while url:
        try:
            data = fb_get(url, params=params)
        except Exception as e:
            print(f"   ⚠ act_{account_id}: đọc link dừng ở trang {pages + 1} ({type(e).__name__}) — "
                  f"giữ {len(found)} campaign đã đọc được", file=sys.stderr)
            break
        pages += 1
        for ad in data.get("data", []):
            cid = ad.get("campaign_id")
            if not cid:
                continue
            for link in _links_of_creative(ad.get("creative")):
                prod = _product_from_link(link)
                if prod:
                    found.setdefault(cid, set()).add(prod)
        url = data.get("paging", {}).get("next")
        params = None
    return {cid: next(iter(s)) for cid, s in found.items() if len(s) == 1}


def fetch_insights(account_id: str, level: str):
    """Fetch daily insights for one account at a given level (account|campaign|ad)."""
    today = datetime.now(timezone(timedelta(hours=7))).strftime("%Y-%m-%d")
    since = (datetime.now(timezone(timedelta(hours=7))) - timedelta(days=DAYS_BACK - 1)).strftime("%Y-%m-%d")

    base_fields = ["spend", "impressions", "clicks", "reach", "actions"]
    if level in ("campaign", "ad"):
        base_fields += ["campaign_id", "campaign_name"]
    if level == "ad":
        base_fields += ["ad_id", "ad_name", "adset_id", "adset_name"]

    url = f"https://graph.facebook.com/{FB_API_VERSION}/act_{account_id}/insights"
    params = {
        "access_token": FB_TOKEN,
        "level": level,
        "time_range": json.dumps({"since": since, "until": today}),
        "time_increment": 1,
        "fields": ",".join(base_fields),
        "limit": 500,
    }

    rows = []
    while url:
        data = fb_get(url, params=params)
        rows.extend(data.get("data", []))
        url = data.get("paging", {}).get("next")
        params = None  # next URL is fully-qualified
    return rows

def num(v, kind=float):
    try:
        return kind(v)
    except (TypeError, ValueError):
        return kind(0)

# -----------------------------------------------------------------------------
# COMPETITOR TRACKING (Chrome-scraped data, no API)
# -----------------------------------------------------------------------------
# Data is collected by manually scraping Facebook fanpages via Claude in Chrome.
# Two JSON files are used:
#   - data/competitor_baseline.json:  first-ever snapshot (fixed reference)
#   - data/competitor_snapshots.json: periodic snapshots for trending
#
# The dashboard shows: baseline vs latest snapshot, with change indicators.

def _load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}
    except Exception as e:
        print(f"   ! failed to parse {path}: {e}")
        return {}

def load_competitor_data():
    """Load baseline + snapshots and build the known_competitors data object."""
    print("→ loading competitor data (Chrome-scraped)")

    baseline = _load_json(COMPETITOR_BASELINE_FILE)
    snapshots = _load_json(COMPETITOR_SNAPSHOTS_FILE)
    known_list = _load_json(KNOWN_COMPETITORS_FILE).get("competitors", [])

    result = {
        "competitors": [],
        "baseline_date": baseline.get("scraped_date", ""),
        "fetched_at": datetime.now(timezone(timedelta(hours=7))).strftime("%Y-%m-%d %H:%M"),
        "snapshots": snapshots.get("snapshots", []),
        "errors": [],
    }

    baseline_comps = {c["page_id"]: c for c in baseline.get("competitors", [])}

    for comp in baseline.get("competitors", []):
        page_id = comp.get("page_id", "")
        label = comp.get("label", "")

        # Find latest snapshot data for this competitor
        latest_snap = None
        all_snaps = snapshots.get("snapshots", [])
        if all_snaps:
            latest = all_snaps[-1]
            for s in latest.get("data", []):
                if s.get("page_id") == page_id:
                    latest_snap = s
                    break

        # Find matching known_competitors entry for page_url
        kc_entry = next((k for k in known_list if k.get("page_id") == page_id), {})

        result["competitors"].append({
            "page_id": page_id,
            "label": label,
            "page_url": kc_entry.get("page_url") or comp.get("page_url", ""),
            "category": comp.get("category", ""),
            "website": comp.get("website", ""),
            "bio": comp.get("bio", ""),
            "products": kc_entry.get("products", []),
            "notes": kc_entry.get("notes", ""),
            # Baseline metrics (fixed reference)
            "baseline_followers": comp.get("followers", 0),
            "baseline_likes": comp.get("likes"),
            "baseline_date": baseline.get("scraped_date", ""),
            # Latest metrics
            "current_followers": latest_snap.get("followers", comp.get("followers", 0)) if latest_snap else comp.get("followers", 0),
            "current_likes": latest_snap.get("likes") if latest_snap else comp.get("likes"),
            "current_top_post_likes": latest_snap.get("top_post_likes", 0) if latest_snap else 0,
            "current_top_post_comments": latest_snap.get("top_post_comments", 0) if latest_snap else 0,
            "current_top_post_shares": latest_snap.get("top_post_shares", 0) if latest_snap else 0,
            # Content analysis
            "recent_posts": comp.get("recent_posts", []),
            "analysis": comp.get("analysis", ""),
        })
        print(f"   ✓ {label}: followers={comp.get('followers', 0)}")

    print(f"   ✓ loaded {len(result['competitors'])} competitors from baseline")
    return result

# -----------------------------------------------------------------------------
# BUILD DATA OBJECT (same shape the HTML template expects)
# -----------------------------------------------------------------------------
def build_data():
    now_vn = datetime.now(timezone(timedelta(hours=7)))
    data = {
        "generated_at": now_vn.strftime("%Y-%m-%d %H:%M"),
        "accounts": [],
        "products": {"D1": [], "Noma911": [], "DR1": []},
        "campaigns": [],
        "ads": [],
    }

    skipped_accounts = []
    for acc in ACCOUNTS:
        print(f"→ account {acc['short']} ({acc['id']})")

        # Wrap fetch 3 level (account/campaign/ad) trong try/except.
        # Nếu 1 account bị 403 Forbidden (token expire / permission rút) → skip
        # account đó, không kéo chết cả build. Dashboard vẫn deploy với 5 account
        # còn lại; agent Google không bị ảnh hưởng (agent đọc file data/ khác).
        try:
            acc_rows = fetch_insights(acc["id"], "account")
        except Exception as e:
            print(f"  ⚠ SKIP account {acc['id']}: {type(e).__name__}: {str(e)[:120]}")
            skipped_accounts.append({"id": acc["id"], "name": acc["short"], "error": str(e)[:200]})
            continue
        daily = []
        for r in acc_rows:
            daily.append({
                "date": r.get("date_start"),
                "spend": round(num(r.get("spend"))),
                "impressions": num(r.get("impressions"), int),
                "clicks": num(r.get("clicks"), int),
                "reach": num(r.get("reach"), int),
                "registrations": extract_registrations(r.get("actions")),
            })
        daily.sort(key=lambda x: x["date"])
        data["accounts"].append({
            "id": f"act_{acc['id']}",
            "short": acc["short"],
            "name": acc["name"],
            "daily": daily,
        })

        # --- CAMPAIGN LEVEL ---
        try:
            camp_rows = fetch_insights(acc["id"], "campaign")
        except Exception as e:
            print(f"  ⚠ SKIP campaign-level account {acc['id']}: {type(e).__name__}: {str(e)[:120]}")
            camp_rows = []
        camps = {}
        for r in camp_rows:
            cid = r.get("campaign_id")
            if not cid:
                continue
            if cid not in camps:
                camps[cid] = {
                    "id": cid,
                    "name": r.get("campaign_name", ""),
                    "account_id": f"act_{acc['id']}",
                    "product": detect_product(r.get("campaign_name", "")),
                    # 'vn' | 'th' — chi tiêu campaign Thái KHÔNG được cộng vào chi phí
                    # Doscom Việt Nam; xem khối ad_spend_thailand phía dưới.
                    "market": detect_market(r.get("campaign_name", "")),
                    "daily": [],
                }
            camps[cid]["daily"].append({
                "date": r.get("date_start"),
                "spend": round(num(r.get("spend"))),
                "impressions": num(r.get("impressions"), int),
                "clicks": num(r.get("clicks"), int),
                "registrations": extract_registrations(r.get("actions")),
            })
        for c in camps.values():
            c["daily"].sort(key=lambda x: x["date"])
            data["campaigns"].append(c)

        # --- AD LEVEL ---
        try:
            ad_rows = fetch_insights(acc["id"], "ad")
        except Exception as e:
            print(f"  ⚠ SKIP ad-level account {acc['id']}: {type(e).__name__}: {str(e)[:120]}")
            ad_rows = []
        ads = {}
        for r in ad_rows:
            aid = r.get("ad_id")
            if not aid:
                continue
            if aid not in ads:
                ads[aid] = {
                    "id": aid,
                    "name": r.get("ad_name", ""),
                    "account_id": f"act_{acc['id']}",
                    "campaign": r.get("campaign_name", ""),
                    "product": detect_product(r.get("campaign_name", "")),
                    "market": detect_market(r.get("campaign_name", "")),
                    "daily": [],
                }
            ads[aid]["daily"].append({
                "date": r.get("date_start"),
                "spend": round(num(r.get("spend"))),
                "impressions": num(r.get("impressions"), int),
                "clicks": num(r.get("clicks"), int),
                "registrations": extract_registrations(r.get("actions")),
            })
        for a in ads.values():
            a["daily"].sort(key=lambda x: x["date"])
            data["ads"].append(a)

    # --- PRODUCT AGGREGATES (from campaigns) ---
    for p in ("D1", "Noma911", "DR1"):
        bucket = {}
        for c in data["campaigns"]:
            if c["product"] != p:
                continue
            # Bỏ campaign Thái: ba rổ này là số Việt Nam. Cùng mã "D1" nhưng khác thị
            # trường, gộp vào là biểu đồ sản phẩm D1 phồng lên bằng tiền chạy ở Thái.
            if c.get("market") == "th":
                continue
            for d in c["daily"]:
                dt = d["date"]
                if dt not in bucket:
                    bucket[dt] = {"date": dt, "spend": 0, "registrations": 0, "impressions": 0, "clicks": 0}
                bucket[dt]["spend"]         += d["spend"]
                bucket[dt]["registrations"] += d["registrations"]
                bucket[dt]["impressions"]   += d["impressions"]
                bucket[dt]["clicks"]        += d["clicks"]
        data["products"][p] = sorted(bucket.values(), key=lambda x: x["date"])

    # --- AD SPEND PER STAFF × PROFIT PRODUCT -----------------------
    # THỨ TỰ GÁN SẢN PHẨM (chủ dự án ĐỔI 2026-08-19 — trước đó tên campaign đi trước):
    #   1. Link landing  — landing trên Cloudflare doscom.vietnam mỗi cái bán đúng 1 SP,
    #      nên link đích là bằng chứng chắc nhất tiền chạy cho SP nào. Chỉ nhận khi MỌI
    #      link đọc được trong campaign cùng trỏ 1 SP.
    #   2. Tên campaign  — vẫn cần: ad Messenger không có link nào (đo 90 ngày: 12,2% chi
    #      tiêu CHỈ tên gán được), và campaign trỏ nhiều landing khác nhau thì link bỏ cuộc.
    #   3. Cả hai chịu   → campaign TƯƠNG TÁC chạy hộ team content → KHÔNG TÍNH vào chi phí
    #      (chủ dự án chốt 31/07). Ghi riêng vào ad_spend_excluded để số bị loại vẫn tra được.
    #
    # VÌ SAO ĐỔI: tên campaign generic ("Doscom-NomaVietNam-…", "NOMA 230 · …") bị nhánh
    # fallback dồn hết về Noma 911 — 01→19/08 có 28,8tr của NOMA 230/350/680/120 nằm trong
    # bucket Noma 911. Link landing không nói dối chuyện đó.
    # Ghi chú giữ lại từ QUYẾT 31/07: đã từng gặp campaign "Thiet Bi Ghi Am DR1" trỏ nhầm về
    # nm911d. Nay link thắng nên trường hợp đó sẽ tính vào Noma 911 — mọi vênh tên↔link đều
    # được in ra cuối bước này để còn soát, KHÔNG im lặng.
    account_to_staff = {f"act_{a['id']}": a["staff"] for a in ACCOUNTS}

    link_products = {}
    for a in ACCOUNTS:
        if f"act_{a['id']}" in {f"act_{x['id']}" for x in ACCOUNTS}:
            link_products.update(fetch_campaign_products_from_links(a["id"]))
    print(f"   ✓ đọc link landing: {len(link_products)} campaign suy được SP từ link")

    ad_spend_by_staff = {"DUY": {}, "PHUONG_NAM": {}}
    excluded = {"DUY": {"_total": 0.0, "by_date": {}}, "PHUONG_NAM": {"_total": 0.0, "by_date": {}}}

    # Chi tiêu THỊ TRƯỜNG THÁI LAN — rổ RIÊNG, không đụng gì tới hai nhân sự Việt Nam.
    # Nhánh 'th' được kiểm TRƯỚC cả bước gán sản phẩm: campaign Thái không gán được SP
    # vẫn phải nằm ở đây, tuyệt đối không rơi vào rổ "campaign tương tác chạy hộ" của
    # nhân sự Việt — rơi vào đó là tiền Thái đội lốt tiền Việt bị loại.
    thailand = {"_total": 0.0, "by_date": {}, "by_product": {}, "campaigns": []}
    th_names = []

    def _add(bucket, date, amount):
        bucket["_total"] += amount
        bucket["by_date"][date] = bucket["by_date"].get(date, 0.0) + amount

    from_link, excluded_names, conflicts, no_link = [], [], [], []
    for c in data["campaigns"]:
        staff = account_to_staff.get(c.get("account_id"))
        if not staff:
            continue

        by_name = detect_profit_product(c.get("name", ""))
        by_link = link_products.get(str(c.get("id") or ""))

        if c.get("market") == "th":
            # Rổ Thái vẫn dùng tên: landing Thái dùng chung domain với landing Việt cũ
            # (noma120.asia) nên link ở đây không phân biệt được thị trường.
            prod = by_link or by_name
        else:
            # CHỈ LINK quyết định sản phẩm (chủ dự án chốt 19/08/2026). Tên campaign
            # KHÔNG còn được gán sản phẩm — người đặt tên tay, sai lúc nào không biết.
            prod = by_link
            if not prod:
                # Không đọc được link. Tên campaign chỉ dùng để trả lời MỘT câu hỏi:
                # đây là quảng cáo bán hàng hay bài tương tác chạy hộ team content?
                #   có tên SP  → vẫn là tiền bán hàng, giữ lại dưới nhãn rõ ràng để
                #                KHÔNG mất tiền khỏi bảng (26tr/8,3% của 01→19/08).
                #   không có   → bài tương tác → loại như QUYẾT 31/07/2026.
                if by_name:
                    prod = NO_LINK_BUCKET
                    no_link.append((c.get("name", "")[:46], by_name))
            elif by_name and by_name != by_link:
                conflicts.append((c.get("name", "")[:46], by_name, by_link))
            elif not by_name:
                from_link.append(c.get("name", "")[:40])

        if c.get("market") == "th":
            # SP không nhận ra thì vẫn giữ tiền lại dưới nhãn rõ ràng, KHÔNG bỏ im lặng.
            key = prod or "(chưa rõ SP)"
            pb = thailand["by_product"].setdefault(key, {"_total": 0.0, "by_date": {}})
            spent = 0.0
            for d in c["daily"]:
                sp = float(d.get("spend") or 0)
                if sp <= 0:
                    continue
                _add(pb, d["date"], sp)
                _add(thailand, d["date"], sp)
                spent += sp
            thailand["campaigns"].append({
                "id": c.get("id"), "name": c.get("name", ""),
                "product": key, "spend": round(spent), "source": "facebook",
            })
            th_names.append(c.get("name", "")[:40])
            continue

        if not prod:
            bucket = excluded[staff]
            excluded_names.append(c.get("name", "")[:40])
        else:
            bucket = ad_spend_by_staff[staff].setdefault(prod, {"_total": 0.0, "by_date": {}})
        for d in c["daily"]:
            sp = float(d.get("spend") or 0)
            if sp <= 0:
                continue
            _add(bucket, d["date"], sp)
    data["ad_spend_by_staff"] = ad_spend_by_staff
    data["ad_spend_excluded"] = excluded
    if from_link:
        print(f"   ↪ {len(from_link)} campaign gán SP nhờ LINK landing (tên campaign chịu): {', '.join(from_link[:6])}")
    if no_link:
        print(f"   ↪ {len(no_link)} campaign KHÔNG đọc được link → gom vào '{NO_LINK_BUCKET}' "
              f"(vẫn tính là chi phí, chỉ không biết của SP nào):")
        for nm, bn in no_link[:8]:
            print(f"       tên gợi ý '{bn}' ←  {nm}")
    if conflicts:
        # Tên nói một đằng, link trỏ một nẻo. Link thắng (QUYẾT 19/08/2026) nhưng phải
        # in ra: hoặc campaign đặt tên sai, hoặc ad gắn nhầm link — cả hai đều cần sửa tay.
        print(f"   ⚠ {len(conflicts)} campaign VÊNH tên↔link (lấy theo LINK):")
        for nm, bn, bl in conflicts[:12]:
            print(f"       tên nói '{bn}' · link nói '{bl}'  ←  {nm}")
    if excluded_names:
        tot_ex = sum(v['_total'] for v in excluded.values())
        print(f"   ↪ LOẠI {len(excluded_names)} campaign tương tác (chạy hộ team content) = {tot_ex:,.0f}đ: "
              f"{', '.join(excluded_names[:6])}")
    print(f"   ✓ ad spend by staff: DUY={sum(v['_total'] for v in ad_spend_by_staff['DUY'].values()):,.0f}đ · "
          f"PHUONG_NAM={sum(v['_total'] for v in ad_spend_by_staff['PHUONG_NAM'].values()):,.0f}đ · "
          f"đã loại: DUY={excluded['DUY']['_total']:,.0f}đ / PN={excluded['PHUONG_NAM']['_total']:,.0f}đ")

    # --- PANCAKE REVENUE (injected from data/product-revenue.json) ---
    try:
        data["revenue"] = _load_json("data/product-revenue.json")
        rev_total = sum(
            (p.get("total", 0) if isinstance(p, dict) else 0)
            for p in (data["revenue"].get("products") or {}).values()
        )
        print(f"   ✓ loaded revenue snapshot: {rev_total:,.0f}₫ (delivered, {data['revenue'].get('window_days', '?')}d)")
    except Exception as e:
        print(f"   ✗ revenue load failed: {e}")
        data["revenue"] = {}

    # --- GOOGLE ADS (loaded from data/google-ads-spend.json) ------
    # File này được pull từ Windsor.ai (manually hoặc auto qua workflow riêng).
    # Cấu trúc: by_category[cat] = {_total, by_date: {YYYY-MM-DD: spend}, campaigns: [...]}
    # Category keys: MAYDO/DINHVI/GHIAM/CAMCALL (map vào 13 PROFIT_PRODUCTS) +
    # OTHER_CAM/OTHER_DI/OTHER_SIM/OTHER_RAZOR (ngoài danh sách).
    try:
        g_ads = _load_json("data/google-ads-spend.json") or {}
        data["google_ads"] = {
            "generated_at": g_ads.get("generated_at"),
            "account_id": g_ads.get("account_id"),
            "account_name": g_ads.get("account_name"),
            "date_range": g_ads.get("date_range"),
            "by_category": g_ads.get("by_category", {}),
            "campaigns_raw": g_ads.get("campaigns_raw", []),
        }
        # --- Trừ campaign Google chạy Thái khỏi by_category ---
        # by_category do fetch_google_ads_spend.py gộp sẵn, KHÔNG biết thị trường. Ở đây
        # dò lại từ campaigns_raw (có tên + ngày + tiền) rồi trừ ngược ra, để chi phí
        # Google của Việt Nam không cõng tiền chạy Thái. Hiện chưa có campaign Google nào
        # gắn Thái Lan — khối này là để lúc có thì không phải nhớ sửa thêm chỗ nữa.
        g_th = 0.0
        for row in (data["google_ads"].get("campaigns_raw") or []):
            if detect_market(row.get("campaign", "")) != "th":
                continue
            cat, dt = row.get("category"), row.get("date")
            sp = float(row.get("spend") or 0)
            if sp <= 0:
                continue
            g_th += sp
            key = detect_profit_product(row.get("campaign", "")) or "(chưa rõ SP)"
            pb = thailand["by_product"].setdefault(key, {"_total": 0.0, "by_date": {}})
            _add(pb, dt, sp)
            _add(thailand, dt, sp)
            thailand["campaigns"].append({
                "id": None, "name": row.get("campaign", ""),
                "product": key, "spend": round(sp), "source": "google",
            })
            bc = data["google_ads"]["by_category"].get(cat)
            if bc:
                bc["_total"] = max(0.0, float(bc.get("_total") or 0) - sp)
                if dt in (bc.get("by_date") or {}):
                    bc["by_date"][dt] = max(0.0, float(bc["by_date"][dt]) - sp)
        if g_th:
            print(f"   ↪ Google: trừ {g_th:,.0f}đ campaign chạy Thái khỏi by_category")

        total_gads = sum(v.get("_total", 0) for v in g_ads.get("by_category", {}).values())
        print(f"   ✓ loaded Google Ads spend: {total_gads:,.0f}đ · "
              f"{len(g_ads.get('by_category', {}))} categories · "
              f"range {g_ads.get('date_range', {}).get('start')} → {g_ads.get('date_range', {}).get('end')}")
    except Exception as e:
        print(f"   ✗ Google Ads load failed: {e}")
        data["google_ads"] = {"by_category": {}, "campaigns_raw": []}

    # --- CHI TIÊU THỊ TRƯỜNG THÁI LAN -------------------------------
    # Ghi SAU khối Google để gộp được cả FB lẫn Google vào một rổ.
    # Số này KHÔNG nằm trong ad_spend_by_staff, KHÔNG nằm trong products[], và đã bị trừ
    # khỏi google_ads.by_category. Riêng accounts[].daily vẫn là số THÔ khớp Ads Manager —
    # giao diện tự trừ ở chỗ dùng (xem thSpendRange trong index.html), CỐ Ý không sửa số
    # thô ở đây để agent Facebook còn đối chiếu được với Trình quản lý quảng cáo.
    thailand["campaigns"].sort(key=lambda x: -x["spend"])
    data["ad_spend_thailand"] = thailand
    if thailand["_total"]:
        print(f"   ✓ THÁI LAN: {thailand['_total']:,.0f}đ / {len(thailand['campaigns'])} campaign "
              f"({', '.join(th_names[:5])}) — đã tách khỏi chi phí Việt Nam")
    else:
        print("   · THÁI LAN: chưa có campaign nào gắn 'Thái Lan' trong tên")

    # --- PRODUCT COSTS (xlsx Kho tổng → product-costs.json) ------
    # Merge thứ tự (ưu tiên cao → thấp):
    #   1. PRICE_OVERRIDES_VND (user markdown 2026-05-27 trong skus-extended.json) — WIN giá nhập
    #   2. xlsx Kho tổng (product-costs.json) — primary cho các field khác (gia_ban, mã_tên_gọi)
    #   3. EXTENDED_COSTS_OVERLAY — fallback nếu xlsx miss entry
    try:
        costs_raw = _load_json("data/product-costs.json") or {}
        products_cost = costs_raw.get("products") or {}
        profit_costs = {}
        missing = []
        from_overlay = []
        from_override = []
        from_sale_override = []
        for label in PROFIT_PRODUCTS:
            key = PRODUCT_TO_COST_KEY.get(label)
            entry = products_cost.get(key) if key else None
            if entry and entry.get("gia_nhap_vnd"):
                profit_costs[label] = {
                    "gia_nhap_vnd": entry.get("gia_nhap_vnd"),
                    "gia_ban_vnd": entry.get("gia_ban_vnd"),
                    "ma_ten_goi": entry.get("ma_ten_goi"),
                    "ten": entry.get("ten"),
                    "trang_thai": entry.get("trang_thai"),
                }
            elif label in EXTENDED_COSTS_OVERLAY and EXTENDED_COSTS_OVERLAY[label].get("gia_nhap_vnd"):
                # Fallback: dùng giá user cung cấp qua skus-extended.json overlay
                profit_costs[label] = dict(EXTENDED_COSTS_OVERLAY[label])
                from_overlay.append(label)
            else:
                profit_costs[label] = {"gia_nhap_vnd": None, "ma_ten_goi": None}
                missing.append(f"{label} (key={key!r})")
            # APPLY PRICE OVERRIDE — user markdown wins over both xlsx & overlay
            if label in PRICE_OVERRIDES_VND:
                old_price = profit_costs[label].get("gia_nhap_vnd")
                new_price = PRICE_OVERRIDES_VND[label]
                if old_price != new_price:
                    profit_costs[label]["gia_nhap_vnd"] = new_price
                    profit_costs[label]["_price_source"] = "markdown_override_2026-05-27"
                    profit_costs[label]["_price_xlsx_was"] = old_price
                    from_override.append(label)
                # Loại label khỏi missing nếu override cung cấp giá
                if new_price and any(label in m for m in missing):
                    missing = [m for m in missing if label not in m]
            # APPLY GIÁ BÁN OVERRIDE — xlsx Kho tổng cập nhật chậm hơn giá bán thực tế
            if label in SALE_PRICE_OVERRIDES_VND:
                old_sale = profit_costs[label].get("gia_ban_vnd")
                new_sale = SALE_PRICE_OVERRIDES_VND[label]
                if old_sale != new_sale:
                    profit_costs[label]["gia_ban_vnd"] = new_sale
                    profit_costs[label]["_sale_price_source"] = "sale_price_overrides_vnd"
                    profit_costs[label]["_sale_price_xlsx_was"] = old_sale
                    from_sale_override.append(label)
        data["product_costs"] = profit_costs
        data["profit_products"] = PROFIT_PRODUCTS
        ok_count = sum(1 for v in profit_costs.values() if v.get("gia_nhap_vnd"))
        print(f"   ✓ loaded product costs: {ok_count}/{len(PROFIT_PRODUCTS)} SP có giá nhập")
        if from_override:
            print(f"   ↪ {len(from_override)} SP áp dụng price_overrides_vnd từ markdown: {', '.join(from_override[:8])}{'...' if len(from_override)>8 else ''}")
        if from_sale_override:
            print(f"   ↪ {len(from_sale_override)} SP áp dụng sale_price_overrides_vnd (giá bán): {', '.join(from_sale_override)}")
        if from_overlay:
            print(f"   ↪ {len(from_overlay)} SP lấy giá từ skus-extended.json overlay (xlsx miss): {', '.join(from_overlay[:8])}{'...' if len(from_overlay)>8 else ''}")
        if missing:
            print(f"   ⚠ missing: {', '.join(missing)}")
    except Exception as e:
        print(f"   ✗ cost catalog load failed: {e}")
        data["product_costs"] = {}
        data["profit_products"] = PROFIT_PRODUCTS

    # --- LEAD → ORDER (injected from data/lead-to-order.json) ---
    # Build bởi scripts/build_lead_to_order.py (cron 30p/lần). Có 3 aggregation:
    #   by_ad_id           — leads/orders/revenue per ad
    #   by_nguoi_chay_qc   — leads/orders/revenue per staff
    #   by_staff_utm       — leads/orders/revenue per (staff, utm_campaign) — feed UTM table
    try:
        l2o = _load_json("data/lead-to-order.json") or {}
        data["lead_to_order"] = {
            "generated_at": l2o.get("generated_at"),
            "attribution_window_days": l2o.get("attribution_window_days"),
            "summary": l2o.get("summary") or {},
            "by_staff_utm": l2o.get("by_staff_utm") or {},
        }
        utm_rows = sum(len(v) for v in data["lead_to_order"]["by_staff_utm"].values())
        print(f"   ✓ loaded lead-to-order: {utm_rows} UTM rows across "
              f"{len(data['lead_to_order']['by_staff_utm'])} staff")
    except Exception as e:
        print(f"   ✗ lead-to-order load failed: {e}")
        data["lead_to_order"] = {"by_staff_utm": {}, "summary": {}}

    # --- AD SPEND PER UTM CAMPAIGN ---------------------------------
    # Match utm_campaign trong by_staff_utm với FB campaign để inject
    # spend_by_date vào từng row → frontend tính chi phí/CPL/CPO/ROAS
    # react theo dateRange. Match 2 chiều:
    #   1) UTM toàn số → lookup theo campaign_id
    #   2) UTM dạng tên → normalize (lowercase, bỏ dấu, bỏ space) rồi
    #      lookup theo normalize(campaign_name)
    # Pattern UTM: "23/4-noma911-cudoanhxetrang" ↔ FB camp "23/4 - Noma911 - Cụ Đoành Xe Trắng"
    try:
        import unicodedata, re as _re

        def _norm_utm(s):
            if not s:
                return ""
            s = unicodedata.normalize("NFD", s)
            s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
            s = s.lower()
            # Đ/đ là single letter Latin với stroke embedded — NFD KHÔNG decompose
            # thành d + combining, nên phải replace thủ công sau lowercase.
            # Bug từng làm "Cụ Đoành" → "cuoanh" (mất chữ d) → không match utm "cudoanh"
            s = s.replace("đ", "d")
            # bỏ tất cả ký tự không phải [a-z0-9/] — bao gồm space, dash, dot
            s = _re.sub(r"[^a-z0-9/]+", "", s)
            return s

        # === Build maps ở 2 cấp ===
        # 1) AD-level: mỗi ad là 1 entity (UTM video vs UTM ảnh → 2 ad riêng → spend chính xác)
        # 2) CAMPAIGN-level: fallback nếu UTM không khớp tên ad nhưng khớp tên campaign
        by_ad_norm_name = {}   # norm(ad_name) → bucket (spend cụ thể của ad đó)
        by_camp_norm_name = {} # norm(campaign_name) → bucket (spend tổng campaign)
        by_camp_id = {}        # campaign_id (numeric) → bucket
        for c in data.get("campaigns", []):
            cid = c.get("id")
            cname = c.get("name") or ""
            pp = detect_profit_product(cname)
            spend_total = 0.0
            spend_by_date = {}
            reg_by_date = {}
            imp_total = 0
            click_total = 0
            for d in c.get("daily", []):
                sp = float(d.get("spend") or 0)
                reg = int(d.get("registrations") or 0)
                imp = int(d.get("impressions") or 0)
                clk = int(d.get("clicks") or 0)
                imp_total += imp
                click_total += clk
                if sp > 0:
                    spend_total += sp
                    spend_by_date[d["date"]] = spend_by_date.get(d["date"], 0.0) + sp
                if reg > 0:
                    reg_by_date[d["date"]] = reg_by_date.get(d["date"], 0) + reg
            ctr_total = (click_total / imp_total * 100) if imp_total > 0 else 0
            base_bucket = {
                "total": 0.0, "by_date": {}, "reg_by_date": {},
                "ctr": ctr_total, "impressions": imp_total, "clicks": click_total,
                "name": cname, "id": cid, "product": pp, "level": "campaign",
            }
            if cid:
                bucket = by_camp_id.setdefault(cid, dict(base_bucket))
                bucket["total"] += spend_total
                for d, v in spend_by_date.items():
                    bucket["by_date"][d] = bucket["by_date"].get(d, 0.0) + v
                for d, v in reg_by_date.items():
                    bucket["reg_by_date"][d] = bucket["reg_by_date"].get(d, 0) + v
            nk = _norm_utm(cname)
            if nk:
                bucket = by_camp_norm_name.setdefault(nk, dict(base_bucket))
                bucket["total"] += spend_total
                for d, v in spend_by_date.items():
                    bucket["by_date"][d] = bucket["by_date"].get(d, 0.0) + v
                for d, v in reg_by_date.items():
                    bucket["reg_by_date"][d] = bucket["reg_by_date"].get(d, 0) + v

        # Build by_ad_norm_name từ data["ads"] — match per-ad precise spend
        for a in data.get("ads", []):
            aname = a.get("name") or ""
            cname = a.get("campaign") or ""
            pp = detect_profit_product(cname)
            spend_total = 0.0
            spend_by_date = {}
            reg_by_date = {}
            imp_total = 0
            click_total = 0
            for d in a.get("daily", []):
                sp = float(d.get("spend") or 0)
                reg = int(d.get("registrations") or 0)
                imp = int(d.get("impressions") or 0)
                clk = int(d.get("clicks") or 0)
                imp_total += imp
                click_total += clk
                if sp > 0:
                    spend_total += sp
                    spend_by_date[d["date"]] = spend_by_date.get(d["date"], 0.0) + sp
                if reg > 0:
                    reg_by_date[d["date"]] = reg_by_date.get(d["date"], 0) + reg
            ctr_total = (click_total / imp_total * 100) if imp_total > 0 else 0
            nk = _norm_utm(aname)
            if not nk:
                continue
            base_bucket = {
                "total": 0.0, "by_date": {}, "reg_by_date": {},
                "ctr": ctr_total, "impressions": imp_total, "clicks": click_total,
                "name": cname,  # hiển thị tên CAMPAIGN cho group header, không phải tên ad
                "ad_name": aname,
                "id": a.get("id"), "product": pp, "level": "ad",
            }
            bucket = by_ad_norm_name.setdefault(nk, dict(base_bucket))
            bucket["total"] += spend_total
            for d, v in spend_by_date.items():
                bucket["by_date"][d] = bucket["by_date"].get(d, 0.0) + v
            for d, v in reg_by_date.items():
                bucket["reg_by_date"][d] = bucket["reg_by_date"].get(d, 0) + v

        # Inject vào lead_to_order.by_staff_utm rows
        bsu = data["lead_to_order"].get("by_staff_utm") or {}
        matched = 0
        unmatched = 0
        unmatched_samples = []
        # Track key dùng để gom các UTM share cùng 1 FB campaign (tránh double-count)
        from collections import defaultdict as _defaultdict
        camp_group = _defaultdict(list)  # match_key -> list of rows cùng campaign
        # Convention: 1 FB campaign thường chứa video + ảnh, UTM ảnh = UTM video + 'baianh'.
        # Strip các suffix này khi exact match miss → vẫn map về cùng FB campaign.
        SUFFIX_STRIP = ["baianh", "banh", "bansao", "bansao2"]
        for staff_key, rows in bsu.items():
            for r in rows:
                utm = r.get("utm_campaign") or ""
                found = None
                match_key = None
                match_via = None
                # Priority order (cụ thể → fallback):
                #   1) AD exact name              ← spend chính xác per-UTM
                #   2) AD strip suffix (baianh)   ← spend chính xác per-UTM
                #   3) campaign_id (UTM toàn số)  ← spend tổng campaign
                #   4) Campaign exact name        ← spend tổng campaign
                #   5) Campaign strip suffix      ← spend tổng campaign
                nk = _norm_utm(utm)
                # 1) AD exact name match → spend của 1 ad cụ thể (chính xác nhất)
                if nk and nk in by_ad_norm_name:
                    found = by_ad_norm_name[nk]
                    match_key = "ad:" + nk
                    match_via = "ad_name_exact"
                # 2) AD strip suffix (baianh/bansao/...)
                if not found and nk:
                    for suf in SUFFIX_STRIP:
                        if nk.endswith(suf):
                            base = nk[:-len(suf)]
                            if base in by_ad_norm_name:
                                found = by_ad_norm_name[base]
                                match_key = "ad:" + base
                                match_via = "ad_name_strip_" + suf
                                break
                # 3) Pure-digit UTM → campaign_id
                if not found and utm.isdigit() and utm in by_camp_id:
                    found = by_camp_id[utm]
                    match_key = "cmp_id:" + utm
                    match_via = "campaign_id"
                # 4) Campaign name exact
                if not found and nk and nk in by_camp_norm_name:
                    found = by_camp_norm_name[nk]
                    match_key = "cmp:" + nk
                    match_via = "camp_name_exact"
                # 5) Campaign name strip suffix
                if not found and nk:
                    for suf in SUFFIX_STRIP:
                        if nk.endswith(suf):
                            base = nk[:-len(suf)]
                            if base in by_camp_norm_name:
                                found = by_camp_norm_name[base]
                                match_key = "cmp:" + base
                                match_via = "camp_name_strip_" + suf
                                break
                if found:
                    matched += 1
                    raw_total = round(found["total"])
                    raw_by_date = {d: round(v) for d, v in found["by_date"].items()}
                    raw_reg_by_date = dict(found.get("reg_by_date") or {})
                    r["spend_campaign_total"] = raw_total       # raw spend của FB campaign (debug)
                    r["spend_total"] = raw_total                # sẽ override nếu shared
                    r["spend_by_date"] = raw_by_date            # sẽ override nếu shared
                    r["fb_registrations_by_date"] = raw_reg_by_date  # FB leads — sẽ override nếu shared
                    r["fb_ctr"] = round(found.get("ctr") or 0, 3)
                    r["fb_impressions"] = int(found.get("impressions") or 0)
                    r["fb_clicks"] = int(found.get("clicks") or 0)
                    r["spend_matched"] = True
                    r["spend_match_via"] = match_via            # campaign_id/name_exact/name_strip_*
                    r["matched_campaign_name"] = found.get("name")
                    r["matched_campaign_id"] = found.get("id")
                    r["product_from_utm"] = found.get("product")
                    r["match_group_size"] = 1                   # default, update bên dưới nếu group >1
                    camp_group[match_key].append(r)
                else:
                    unmatched += 1
                    r["spend_campaign_total"] = 0
                    r["spend_total"] = 0
                    r["spend_by_date"] = {}
                    r["fb_registrations_by_date"] = {}
                    r["fb_ctr"] = None
                    r["fb_impressions"] = 0
                    r["fb_clicks"] = 0
                    r["spend_matched"] = False
                    r["spend_match_via"] = None
                    r["matched_campaign_name"] = None
                    r["matched_campaign_id"] = None
                    r["product_from_utm"] = None
                    r["match_group_size"] = 0
                    if len(unmatched_samples) < 10:
                        unmatched_samples.append(utm)

        # Re-distribute spend + FB registrations theo tỉ lệ leads Pancake per-date
        # trong các group có >1 UTM tránh double-count khi nhiều UTM share cùng 1 FB campaign.
        shared_groups = 0
        for key, group in camp_group.items():
            n = len(group)
            if n <= 1:
                continue
            shared_groups += 1
            all_dates = set()
            for r in group:
                all_dates.update(r["spend_by_date"].keys())
                all_dates.update(r.get("fb_registrations_by_date", {}).keys())
            spend_ref = dict(group[0]["spend_by_date"])  # raw, tất cả row cùng campaign nên giống nhau
            reg_ref = dict(group[0].get("fb_registrations_by_date") or {})
            new_spend = [dict() for _ in group]
            new_reg = [dict() for _ in group]
            for d in all_dates:
                spend_d = spend_ref.get(d, 0)
                reg_d = reg_ref.get(d, 0)
                leads_d = [int((r.get("leads_by_date") or {}).get(d, 0)) for r in group]
                total_leads_d = sum(leads_d)
                if total_leads_d > 0:
                    for i, r in enumerate(group):
                        ratio = leads_d[i] / total_leads_d
                        if spend_d > 0:
                            share = round(spend_d * ratio)
                            if share > 0:
                                new_spend[i][d] = share
                        if reg_d > 0:
                            share = round(reg_d * ratio)
                            if share > 0:
                                new_reg[i][d] = share
                else:
                    # Ngày có spend/reg nhưng 0 leads Pancake → chia đều
                    if spend_d > 0:
                        share = round(spend_d / n)
                        for i in range(n):
                            new_spend[i][d] = share
                    if reg_d > 0:
                        share = round(reg_d / n)
                        for i in range(n):
                            if share > 0:
                                new_reg[i][d] = share
            for i, r in enumerate(group):
                r["spend_by_date"] = new_spend[i]
                r["spend_total"] = sum(new_spend[i].values())
                r["fb_registrations_by_date"] = new_reg[i]
                r["match_group_size"] = n

        print(f"   ✓ ad spend per UTM: matched {matched} rows, unmatched {unmatched}, "
              f"shared groups (>1 UTM/campaign): {shared_groups}")
        if unmatched_samples:
            print(f"     unmatched samples: {unmatched_samples[:5]}")
    except Exception as e:
        print(f"   ✗ ad spend per UTM injection failed: {e}")

    # --- COMPETITOR TRACKING (Chrome-scraped data) ---
    try:
        data["known_competitors"] = load_competitor_data()
    except Exception as e:
        print(f"   ✗ competitor data load failed: {e}")
        data["known_competitors"] = {
            "competitors": [],
            "baseline_date": "",
            "fetched_at": datetime.now(timezone(timedelta(hours=7))).strftime("%Y-%m-%d %H:%M"),
            "snapshots": [],
            "errors": [{"label": "*", "message": str(e)[:300]}],
        }

    return data

# -----------------------------------------------------------------------------
# GHI RA data/dashboard-data.json
# -----------------------------------------------------------------------------
OUT_FILE = os.path.join("data", "dashboard-data.json")

# Field cấp-đơn, CRM không dùng — bỏ cho file gọn và không mang dữ liệu khách ra web.
# Giữ đúng danh sách của scripts/refresh_data.py bản cũ để file không đổi hình dạng.
TRIM_FIELDS = ["orders_minimal", "web_items_flat"]


def write_dashboard_data(data_obj):
    rev = data_obj.get("revenue") or {}
    for f in TRIM_FIELDS:
        rev.pop(f, None)
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data_obj, f, ensure_ascii=False, separators=(",", ":"))
    return os.path.getsize(OUT_FILE)


# -----------------------------------------------------------------------------
# MAIN
# -----------------------------------------------------------------------------
def main():
    print("=" * 60)
    print("Ráp dashboard-data.json — " + datetime.now().isoformat())
    print("=" * 60)

    print("")
    print("[1/2] Fetching Facebook Ads data...")
    data = build_data()
    print(f"      ✓ {len(data['accounts'])} accounts, "
          f"{len(data['campaigns'])} campaigns, "
          f"{len(data['ads'])} ads")
    total_reg = sum(sum(d['registrations'] for d in a['daily']) for a in data['accounts'])
    total_spend = sum(sum(d['spend'] for d in a['daily']) for a in data['accounts'])
    print(f"      ✓ last {DAYS_BACK} days: {total_reg} đăng ký, {total_spend:,.0f}₫ spend")

    # ── Guard: KHÔNG ghi đè dashboard-data.json bằng spend=0 khi FB fetch thất bại ──
    # Workflow chạy 3 lần/ngày và fetch FB live. Token hết hạn → fetch rỗng →
    # total_spend=0 → ad_spend_by_staff=0 → "cpqc Facebook = 0đ" trên CRM. Giữ file
    # cũ (last-known-good) + exit lỗi để Actions báo đỏ, thay vì ghi đè bằng 0.
    # Advertiser đang chạy 90 ngày không bao giờ spend=0 thật → sentinel an toàn.
    # 2026-08-10 — SỬA LỖ HỔNG CỦA GUARD (đã gây sự cố thật): điều kiện cũ là
    # `total_spend <= 0 AND data["accounts"]`. Khi token sai, MỌI tài khoản đều bị
    # SKIP vì 403 → data["accounts"] RỖNG → vế thứ hai sai → guard không nổ → ghi
    # đè dashboard-data.json bằng file rỗng rồi deploy lên web. Nay rỗng cũng chặn.
    if not data["accounts"] or total_spend <= 0:
        raise SystemExit(
            "[FATAL] Không lấy được insights FB (0 tài khoản đọc được, hoặc tổng spend = 0) — "
            "token FB hết hạn / sai / thiếu quyền. GIỮ NGUYÊN dashboard-data.json cũ, "
            "KHÔNG ghi đè bằng số rỗng. Hãy làm mới FB_ACCESS_TOKEN (System User token, "
            "quyền ads_read + ads_management), kiểm bằng scripts/fb-token-check.mjs."
        )

    print("")
    print("[2/2] Ghi data/dashboard-data.json...")
    size = write_dashboard_data(data)
    print(f"      ✓ {size:,} bytes → {OUT_FILE}")
    print(f"      → generated_at = {data.get('generated_at')}")

    print("")
    print("✅ Done.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("")
        print(f"❌ ERROR: {e}", file=sys.stderr)
        sys.exit(1)
