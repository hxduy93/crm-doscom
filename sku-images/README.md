Ảnh sản phẩm nền trắng cho bài fanpage Thái.

Đặt tên file theo MÃ SKU: 350.webp, 911.webp, D1.webp…
Rồi khai vào SKU_IMAGES trong functions/api/thai-social/_skus.js,
hoặc cập nhật qua POST /api/thai-social/skus (ghi KV, không cần deploy).

scripts/build-dist.sh copy cả thư mục này sang dist/ — ảnh phải công khai
thì Graph API mới nhận được tham số url.
