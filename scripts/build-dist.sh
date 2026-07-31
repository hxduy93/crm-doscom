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
[ -d demos ] && cp -r demos dist/demos

# Trang standalone (nhúng iframe trong CRM) — phải copy thủ công.
PAGES="agent-geo-doscom.html ads-creator.html product-publisher.html brandcore-fix.html fix-images.html sync-us.html"
for page in $PAGES; do
  [ -f "$page" ] && cp "$page" dist/
done

echo "[build-dist] dist/ sẵn sàng: $(find dist -type f | wc -l) file"
