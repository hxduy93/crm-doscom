#!/usr/bin/env bash
# Dựng thư mục dist/ để deploy lên Cloudflare Pages.
#
# NGUỒN DUY NHẤT cho danh sách file — dùng chung bởi:
#   .github/workflows/deploy.yml       (push code lên master)
#   .github/workflows/refresh-data.yml (cron kéo dữ liệu mới)
#
# Trước đây hai workflow chép tay hai bản danh sách giống nhau. Rủi ro: thêm trang mới
# vào deploy.yml mà quên refresh-data.yml thì lần cron kế tiếp deploy đè và XOÁ MẤT trang đó
# khỏi web. Gộp về đây để không thể lệch nữa.
#
# Functions (functions/) được wrangler tự bundle từ gốc repo → không cần copy.
set -euo pipefail

cd "$(dirname "$0")/.."

rm -rf dist && mkdir dist
cp index.html dist/
[ -f _headers ] && cp _headers dist/
cp -r data dist/data

# Thư viện dùng chung giữa trình duyệt và bộ test: trang Đăng sản phẩm nạp
# js/price-discount.js dạng module thay vì chép lại công thức giá vào HTML.
mkdir -p dist/js
cp functions/lib/price-discount.js dist/js/
[ -d demos ] && cp -r demos dist/demos

# File TRUNG GIAN của pipeline lấy dữ liệu (gộp từ repo cũ 2026-08-10): chỉ dùng
# lúc build dashboard-data.json, không trang nào gọi → KHÔNG đẩy lên web.
# pancake-crm-contacts.json ~4MB và chứa SĐT khách; cost-source là file gốc giá nhập.
rm -f dist/data/pancake-crm-contacts.json
rm -rf dist/data/cost-source

# Trang standalone (nhúng iframe trong CRM) — phải copy thủ công.
PAGES="agent-geo-doscom.html ads-creator.html product-publisher.html brandcore-fix.html fix-images.html sync-us.html"
for page in $PAGES; do
  [ -f "$page" ] && cp "$page" dist/
done

echo "[build-dist] dist/ sẵn sàng: $(find dist -type f | wc -l) file"
