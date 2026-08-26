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

# Snapshot KHÔNG được mang theo trường rác. `orders_minimal` là dump đơn thô ~1,5MB chỉ dùng
# lúc dựng dashboard-data.json; write_dashboard_data() trong build_dashboard_data.py vốn đã bóc
# nó ra. Nhưng 19/08/2026 có lần ghép file bằng script tay, bỏ qua hàm đó → snapshot phình từ
# 1,6MB lên 3,3MB, trang Tổng quan tải lâu gấp đôi mà nhìn bên ngoài không có dấu hiệu gì.
# Kiểm ở đây vì mọi đường deploy đều đi qua bước build này.
node -e '
  const d = JSON.parse(require("fs").readFileSync("data/dashboard-data.json", "utf8"));
  const junk = ["orders_minimal", "web_items_flat"].filter((f) => (d.revenue || {})[f]);
  if (junk.length) {
    console.error("[build-dist] data/dashboard-data.json còn trường rác: " + junk.join(", ") +
      " — bóc ra trước khi deploy (xem write_dashboard_data trong scripts/build_dashboard_data.py)");
    process.exit(1);
  }
'

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
PAGES="agent-geo-doscom.html ads-creator.html product-publisher.html brandcore-fix.html fix-images.html sync-us.html thai-social.html thai-repost.html"
for page in $PAGES; do
  [ -f "$page" ] && cp "$page" dist/
done

# Ảnh sản phẩm nền trắng cho bài fanpage Thái. Graph API nhận tham số `url` nên ảnh
# phải công khai cùng origin — thiếu bước copy này là ảnh 404 và bài đăng lên không có ảnh.
[ -d sku-images ] && cp -r sku-images dist/sku-images

echo "[build-dist] dist/ sẵn sàng: $(find dist -type f | wc -l) file"
