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
`doscomfacebookads.cloudflareaccess.com`). Chính sách hiện tại có **bypass theo từng
đường dẫn**, và `/api/noma350/*` chưa nằm trong đó:

| Đường dẫn | Kết quả thật (đo 31/07/2026) |
|---|---|
| `POST /api/noma680/order` | `401 unauthorized` — JSON, tức là **vào tới function** |
| `POST /api/noma350/order` | `302` → trang đăng nhập Access, **không vào tới function** |

Hệ quả: landing 350 gọi sang chỉ nhận HTML đăng nhập, proxy đúng luật nên trả
`502 crm_rejected` — khách không gửi được đơn.

Cần thêm **Bypass policy** cho `/api/noma350/*` trong Zero Trust → Access → Applications,
giống cách `/api/noma680/*` đang được cấu hình. Bypass ở đây an toàn vì endpoint đã tự
bảo vệ bằng `X-Noma-Token`.

Token API đang dùng cho deploy **không có quyền Access** (gọi
`GET /accounts/{id}/access/apps` trả 403) nên không tự làm được bước này.

## 6. Để lại sau

- [ ] Gắn panel NOMA 350 vào dashboard `index.html` (`NOMA_LANDING`, `PROD_COLORS`,
      gọi `/api/noma350/stats`) — chờ có đơn thật.
- [ ] Job đối soát Pancake POS ghi các cột `pos_*` cho `noma350_orders`.
