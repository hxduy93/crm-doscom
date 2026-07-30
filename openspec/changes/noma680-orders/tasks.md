## 1. Schema D1

- [x] 1.1 `migrations/0013_noma680_orders.sql`: tạo bảng `noma680_orders` theo khuôn `noma911_orders` + hai cột `name`, `note`; index `created_date` / `phone` / `staff`.
- [x] 1.2 Thêm unique index `(created_date, phone, combo)` chống ghi trùng khi khách bấm gửi hai lần.

## 2. Endpoint nhận đơn

- [x] 2.1 `functions/api/noma680/order.js`: `onRequestOptions` cho CORS (`Content-Type, X-Noma-Token`).
- [x] 2.2 Kiểm token `X-Noma-Token` == `env.NOMA680_INGEST_TOKEN` → sai/thiếu trả 401 `unauthorized`, KHÔNG ghi DB.
- [x] 2.3 Validate: thiếu `staff` → 400 `missing_staff`; `combo` không có trong `COMBO_META` → 400 `missing_combo`.
- [x] 2.4 Chốt `combo_label` + `amount` từ `COMBO_META` phía server, bỏ qua giá client gửi lên. Chuẩn hoá `phone`, cắt độ dài các trường text.
- [x] 2.5 `created_at` epoch giây + `created_date` theo giờ VN (+7h). `INSERT OR IGNORE`, đọc `meta.changes` để phân biệt đơn mới và đơn trùng.

## 3. Endpoint thống kê

- [x] 3.1 `functions/api/noma680/stats.js`: nhận `days` (1-365, mặc định 90) hoặc `from`/`to`.
- [x] 3.2 Trả đúng hình dạng của stats 911: `range`, `summary`, `by_combo`, `by_staff`, `by_gift`, `by_source`, `by_date`, `actual` — để dashboard tái dùng component.
- [x] 3.3 Nhãn `STAFF_LABEL = {duy, pn}` và `GIFT_LABEL = {noma250, noma692}` khớp landing.

## 4. Test

- [x] 4.1 `tests/noma680.test.mjs`: contract (`summary`, `by_combo`, `range` đúng kiểu).
- [x] 4.2 Luật tiền: `revenue` mỗi combo = `orders` × đúng giá trong bảng.
- [x] 4.3 Luật toàn vẹn: `summary.revenue` = tổng `revenue` các combo.
- [x] 4.4 Bỏ qua có thông báo khi endpoint trả 404 (lần deploy đầu tiên sinh ra chính nó).

## 5. Triển khai

- [x] 5.1 Set secret `NOMA680_INGEST_TOKEN` cho project `crm-doscom`.
- [x] 5.2 Set `NOMA_INGEST_TOKEN` cùng giá trị cho project `noma680-landing`.
- [ ] 5.3 Merge nhánh `feat/noma680-orders` vào `master` → workflow tự áp migration rồi deploy.
- [ ] 5.4 Sau khi deploy: gửi một đơn thử từ landing, kiểm tra `GET /api/noma680/stats?days=1` đếm được.

## 6. Việc để lại (change sau)

- [ ] 6.1 Gắn panel NOMA 680 vào dashboard `index.html` (thêm vào `NOMA_LANDING`, `PROD_COLORS`, gọi `/api/noma680/stats`) — làm khi đã có đơn thật để nhìn.
- [ ] 6.2 Nối đối soát POS Pancake cho `noma680_orders` (các cột `pos_*` đã có sẵn, chưa có job ghi).
- [ ] 6.3 `/opsx:sync` đưa spec `noma680-orders` vào `openspec/specs/`.
