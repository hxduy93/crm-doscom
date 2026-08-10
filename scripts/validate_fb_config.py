#!/usr/bin/env python3
"""
Validate data/fb-config.json — sổ đăng ký tài khoản QC Facebook.

Chạy TRƯỚC khi commit/push sau khi sửa account (đổi agency / thêm / bớt tkqc).
Bắt các lỗi thường gặp: sai định dạng ID, sai tên nhân sự/nhóm SP, thiếu name,
cặp loan không hợp lệ, trùng ID, account thiếu group.

Usage (PowerShell, đứng ở root repo):
    python scripts\\validate_fb_config.py

Exit code: 0 = PASS (có thể push), 1 = FAIL (sửa lỗi rồi chạy lại).
"""

import os
import re
import sys
import json

# Cho phép in tiếng Việt trên console Windows (cp1252) không lỗi.
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

VALID_STAFF = {"DUY", "PHUONG_NAM", "AI_AGENT"}
VALID_GROUPS = {"MAY_DO", "CAMERA_VIDEO_CALL", "GHI_AM", "NOMA"}
ID_RE = re.compile(r"^\d{15,16}$")          # FB ad account ID: 15-16 chữ số
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")  # YYYY-MM-DD


def config_path():
    return os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "data", "fb-config.json")
    )


def find_duplicate_keys(raw_text):
    """Bắt account_id bị khai báo trùng trong account_to_groups (JSON parse sẽ
    âm thầm dedup → khó phát hiện). Đếm key dạng "<digits>": trong raw text."""
    keys = re.findall(r'"(\d{6,})"\s*:\s*\{', raw_text)
    seen, dups = set(), set()
    for k in keys:
        if k in seen:
            dups.add(k)
        seen.add(k)
    return dups


def main():
    path = config_path()
    errors = []
    warnings = []

    if not os.path.exists(path):
        print(f"FAIL: Không thấy file {path}")
        return 1

    raw = open(path, encoding="utf-8").read()
    try:
        cfg = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"FAIL: JSON không hợp lệ — {e}")
        print("  → Thường do thiếu/thừa dấu phẩy. Mở file kiểm tra dòng báo lỗi.")
        return 1

    # KPI sanity
    kpi = cfg.get("kpi_revenue_monthly_vnd")
    if kpi is None:
        warnings.append("Thiếu kpi_revenue_monthly_vnd")
    elif not isinstance(kpi, (int, float)) or kpi < 0:
        errors.append("kpi_revenue_monthly_vnd phải là số ≥ 0")

    mapping = cfg.get("account_to_groups")
    if not isinstance(mapping, dict) or not mapping:
        print("FAIL: account_to_groups rỗng hoặc sai kiểu (phải là object có ít nhất 1 account)")
        return 1

    for dup in sorted(find_duplicate_keys(raw)):
        errors.append(f"Account ID bị khai báo TRÙNG: {dup} (JSON sẽ dedup âm thầm)")

    active_count = 0
    for acc_id, info in mapping.items():
        tag = f"[{acc_id}]"
        if not ID_RE.match(str(acc_id)):
            errors.append(f"{tag} ID sai định dạng — phải là 15-16 chữ số (không có 'act_', không khoảng trắng)")
        if not isinstance(info, dict):
            errors.append(f"{tag} value phải là object {{name, staff, groups, ...}}")
            continue

        # staff
        staff = info.get("staff")
        if staff not in VALID_STAFF:
            errors.append(f"{tag} staff='{staff}' không hợp lệ — phải thuộc {sorted(VALID_STAFF)}")

        # groups
        groups = info.get("groups")
        if not isinstance(groups, list):
            errors.append(f"{tag} groups phải là list (vd [\"NOMA\"]; nhiều SP thì [\"NOMA\",\"MAY_DO\"])")
        else:
            for g in groups:
                if g not in VALID_GROUPS:
                    errors.append(f"{tag} group '{g}' không hợp lệ — phải thuộc {sorted(VALID_GROUPS)}")
            if not groups:
                warnings.append(f"{tag} groups rỗng — account này sẽ không được tính lợi nhuận theo nhóm")

        # name
        if not info.get("name"):
            warnings.append(f"{tag} thiếu 'name' (tên hiển thị) — nên thêm cho dễ đọc dashboard")

        # active
        active = info.get("active", True)
        if not isinstance(active, bool):
            errors.append(f"{tag} 'active' phải là true/false")
        elif active:
            active_count += 1

        # loan pair
        lto = info.get("loaned_to_staff")
        lfrom = info.get("loaned_from_date")
        if bool(lto) != bool(lfrom):
            errors.append(f"{tag} loan không hợp lệ — phải CÓ CẢ HAI loaned_to_staff + loaned_from_date, hoặc bỏ cả hai")
        if lto and lto not in VALID_STAFF:
            errors.append(f"{tag} loaned_to_staff='{lto}' không hợp lệ — phải thuộc {sorted(VALID_STAFF)}")
        if lfrom and not DATE_RE.match(str(lfrom)):
            errors.append(f"{tag} loaned_from_date='{lfrom}' sai định dạng — phải YYYY-MM-DD")

    # ── Report ──
    total = len(mapping)
    print(f"File: {path}")
    print(f"Tổng account: {total} | active (sẽ fetch): {active_count}")
    print("-" * 60)

    if warnings:
        print(f"⚠ {len(warnings)} cảnh báo (không chặn push):")
        for w in warnings:
            print(f"   - {w}")
    if errors:
        print(f"\n✗ {len(errors)} LỖI (phải sửa trước khi push):")
        for e in errors:
            print(f"   - {e}")
        print("\nFAIL — sửa các lỗi trên rồi chạy lại: python scripts\\validate_fb_config.py")
        return 1

    print("\n✓ PASS — config hợp lệ, có thể commit + push.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
