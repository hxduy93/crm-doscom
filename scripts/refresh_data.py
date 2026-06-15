"""Đọc lại dữ liệu cho CRM Doscom.

Kéo khối `const DATA = {...}` mới nhất từ dashboard cũ (repo PUBLIC trên GitHub),
cắt bớt vài field cấp-đơn nhạy cảm, ghi vào data/dashboard-data.json.

Chạy tay:   python scripts/refresh_data.py
Trong CI :   bước này nằm trong .github/workflows/refresh-data.yml

Nguồn mặc định là index.html của repo cũ trên GitHub raw. Khi sau này bỏ dashboard cũ
và tự fetch từ nguồn gốc (FB/Google/Pancake), chỉ cần thay hàm fetch_source() bên dưới.
"""
import json
import os
import sys
import urllib.request

try:  # tránh crash khi console Windows không phải UTF-8 (chạy tay trên máy user)
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

# Có thể override bằng biến môi trường DATA_SOURCE_URL
SRC = os.environ.get(
    "DATA_SOURCE_URL",
    "https://raw.githubusercontent.com/hxduy93/facebook-ads-dashboard/main/index.html",
)
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "dashboard-data.json")
TRIM_FIELDS = ["orders_minimal", "web_items_flat"]  # cấp-đơn, không dùng → bỏ cho gọn/an toàn

# Data cho Agent FB Ads — copy NGUYÊN từ repo cũ (raw GitHub, public), không transform.
FB_DATA_BASE = os.environ.get(
    "FB_DATA_BASE",
    "https://raw.githubusercontent.com/hxduy93/facebook-ads-dashboard/main/data",
)
FB_FILES = ["fb-ads-data.json", "product-revenue.json", "product-costs.json", "fb-config.json"]

# Data cho Agent Google Ads — copy NGUYÊN từ repo cũ (cùng base raw GitHub).
GOOGLE_FILES = [
    "google-ads-context.json",
    "google-ads-spend.json",
    "google-ads-search-terms.json",
    "google-ads-ads.json",
    "google-ads-placement.json",
]
DATA_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "data"))


def fetch_source() -> str:
    req = urllib.request.Request(SRC, headers={"User-Agent": "crm-doscom-refresh"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read().decode("utf-8")


def _fetch_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "crm-doscom-refresh"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read()


def _sync_files(files, tag):
    """Kéo danh sách file data từ FB_DATA_BASE. Lỗi 1 file không làm hỏng cả run."""
    for name in files:
        url = f"{FB_DATA_BASE}/{name}"
        try:
            raw = _fetch_bytes(url)
            json.loads(raw.decode("utf-8"))  # validate JSON trước khi ghi
            with open(os.path.join(DATA_DIR, name), "wb") as fh:
                fh.write(raw)
            print(f"[refresh] {tag} OK -> {name} | {len(raw)} bytes")
        except Exception as e:
            print(f"[refresh] {tag} WARN {name}: {e}", file=sys.stderr)


def sync_fb_data():
    """Kéo data cho Agent FB Ads."""
    _sync_files(FB_FILES, "FB")


def sync_google_data():
    """Kéo data cho Agent Google Ads."""
    _sync_files(GOOGLE_FILES, "GG")


def extract_data_blob(html: str) -> dict:
    p = html.find("const DATA =")
    if p < 0:
        raise SystemExit("DATA marker not found in source.")
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
    raw = html[b:i + 1].replace("<\\/", "</")
    return json.loads(raw)


def main():
    print("[refresh] source:", SRC)
    html = fetch_source()
    D = extract_data_blob(html)
    rev = D.get("revenue", {})
    for f in TRIM_FIELDS:
        rev.pop(f, None)
    gen = D.get("generated_at") or rev.get("generated_at") or "?"
    out_path = os.path.normpath(OUT)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(D, fh, ensure_ascii=False, separators=(",", ":"))
    print("[refresh] OK ->", out_path, "| generated_at=", gen, "|", os.path.getsize(out_path), "bytes")

    print("[refresh] Đồng bộ data Agent FB Ads…")
    sync_fb_data()

    print("[refresh] Đồng bộ data Agent Google Ads…")
    sync_google_data()


if __name__ == "__main__":
    main()
