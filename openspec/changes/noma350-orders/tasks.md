## 1. Schema

- [x] `migrations/0014_noma350_orders.sql` — bảng `noma350_orders` cùng khuôn
      `noma680_orders`, 3 index thường + 1 unique index chống ghi trùng
      `(created_date, phone, combo)`.

## 2. Endpoint nhận đơn

- [x] `functions/api/noma350/order.js` — `onRequestPost` + `onRequestOptions`.
- [x] Bảo vệ bằng `X-Noma-Token` khớp `env.NOMA350_INGEST_TOKEN`, trả 401 nếu lệch.
- [x] `COMBO_META` chốt `combo_label` + `amount`, bỏ qua `amount` client gửi.
- [x] `INSERT OR IGNORE`, trả `{ ok, duplicate, stored }`.

## 3. Endpoint thống kê

- [x] `functions/api/noma350/stats.js` — `onRequestGet`, tham số `days` hoặc `from`/`to`.
- [x] Response cùng hình dạng `/api/noma680/stats`:
      `{ range, summary, by_combo, by_staff, by_gift, by_source, by_date, actual }`.

## 4. Test

- [x] `tests/noma350.test.mjs` — 4 test: contract, luật tiền, luật toàn vẹn, chống trộn combo.
- [x] Tự bỏ qua khi endpoint chưa deploy (kiểm `content-type`, không kiểm status).
- [x] `node --test tests/*.mjs` xanh.

## 5. Triển khai

- [x] Push `master` → workflow tự áp migration D1 (`--remote`) rồi deploy Pages.
      Xác nhận trên D1 production: bảng `noma350_orders` + 4 index đã có.
- [x] Sinh token 32 byte ngẫu nhiên, set `NOMA350_INGEST_TOKEN` trên project `crm-doscom`.
- [x] Set `NOMA_INGEST_TOKEN` (cùng giá trị) trên project `noma350-landing`.
- [x] Deploy lại CẢ HAI project — secret của Pages chỉ có hiệu lực từ deployment mới,
      set secret xong mà không deploy lại thì Function vẫn thấy `undefined`.
- [ ] **BỊ CHẶN — Cloudflare Access.** Xem mục 7.
- [ ] Kiểm tra đầu-cuối: gửi một đơn thật qua landing, xác nhận vào D1, rồi xoá đơn thử.

## 7. Việc cần người có quyền Access làm

`crm-doscom.pages.dev` nằm sau Cloudflare Access (team domain
`doscomfacebookads.cloudflareaccess.com`). Bypass đặt theo **từng đường dẫn chính xác** —
không phải theo prefix. Đo bằng `curl` ngày 31/07/2026:

| Đường dẫn | Kết quả | |
|---|---|---|
| `POST /api/noma911/order` | 401 JSON | ✅ có bypass |
| `POST /api/noma680/order` | 401 JSON | ✅ có bypass |
| `GET /api/noma911/stats` | 200 JSON | ✅ có bypass |
| `POST /api/noma350/order` | 302 → login | ❌ |
| `GET /api/noma680/stats` | 302 → login | ❌ |
| `GET /api/noma350/stats` | 302 → login | ❌ |

Cần thêm **Bypass policy** trong Zero Trust → Access → Applications cho ba đường:

1. `/api/noma350/order` — **bắt buộc**, không có thì landing 350 không nhận được đơn nào.
2. `/api/noma350/stats` — để cổng test hoạt động (xem bên dưới).
3. `/api/noma680/stats` — sửa luôn cùng lỗi, không liên quan tới change này nhưng cùng gốc.

Bypass an toàn vì endpoint ghi tự bảo vệ bằng `X-Noma-Token`, còn stats chỉ đọc số liệu
tổng hợp.

### Cổng test đang xanh giả

`tests/noma680.test.mjs` và `tests/noma350.test.mjs` tự bỏ qua khi endpoint stats không
trả JSON — cơ chế chống vòng lặp chết ở lần deploy đầu (Pages trả HTML 200 cho route chưa
tồn tại). Nhưng Access cũng trả HTML, nên **cả 8 test đó đang bỏ qua sạch**: bộ test báo
xanh mà không kiểm gì. Bypass hai đường `stats` là khôi phục cổng chất lượng thật.

Token API đang dùng cho deploy **không có quyền Access** (gọi
`GET /accounts/{id}/access/apps` trả 403) nên không tự làm được bước này.

**Lưu ý khi tự kiểm:** phải dùng `curl`, đừng dùng `Invoke-WebRequest` của PowerShell —
nó tự đi theo redirect nên che mất 302 và cho kết quả sai.

## 6. Để lại sau

- [ ] Gắn panel NOMA 350 vào dashboard `index.html` (`NOMA_LANDING`, `PROD_COLORS`,
      gọi `/api/noma350/stats`) — chờ có đơn thật.
- [ ] Job đối soát Pancake POS ghi các cột `pos_*` cho `noma350_orders`.
