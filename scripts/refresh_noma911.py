"""Kéo thống kê đơn đăng ký Noma911 (theo combo + landing) về CRM.

Gọi API /api/noma911/stats của dashboard cũ bằng header X-Test-Token
(đúng kiểu workflow noma911-sync.yml của repo cũ) -> lưu data/noma911.json.

YÊU CẦU:
  1) Repo cũ phải cho phép token đọc route này: thêm "/api/noma911/stats"
     vào BYPASS_PATHS trong functions/_middleware.js (1 dòng).
  2) Biến môi trường TEST_BYPASS_TOKEN (giá trị token bypass của repo cũ).

Chạy tay:   set TEST_BYPASS_TOKEN=xxx & python scripts/refresh_noma911.py
Trong CI :   nằm trong .github/workflows/refresh-data.yml (secret TEST_BYPASS_TOKEN)
"""
import json
import os
import sys
import urllib.request

TOKEN = os.environ.get("TEST_BYPASS_TOKEN") or os.environ.get("NOMA_TOKEN")
DAYS = os.environ.get("NOMA_DAYS", "90")
BASE = os.environ.get("NOMA_BASE", "https://facebookadsallinone.pages.dev")
URL = f"{BASE}/api/noma911/stats?days={DAYS}"
OUT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "data", "noma911.json"))


def main():
    if not TOKEN:
        sys.exit("[noma911] thieu TEST_BYPASS_TOKEN -> bo qua (chua noi du lieu).")
    print("[noma911] GET", URL)
    req = urllib.request.Request(URL, headers={
        "X-Test-Token": TOKEN,
        "User-Agent": "crm-doscom-noma911",
    })
    with urllib.request.urlopen(req, timeout=60) as r:
        body = r.read().decode("utf-8")
    data = json.loads(body)
    if "error" in data or "summary" not in data:
        sys.exit(f"[noma911] phan hoi khong hop le: {body[:200]}")
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
    s = data.get("summary", {})
    print("[noma911] OK ->", OUT, "| orders=", s.get("orders"), "| combos=", len(data.get("by_combo", [])))


if __name__ == "__main__":
    main()
