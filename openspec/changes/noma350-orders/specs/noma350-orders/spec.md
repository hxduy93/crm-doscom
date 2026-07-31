# noma350-orders Specification

## Purpose

Module thu và thống kê đơn đăng ký từ landing NOMA 350 (dung dịch vệ sinh phanh đĩa).
Nhận đơn qua webhook bảo vệ bằng token, lưu vào D1 riêng của CRM (`crm-doscom-db`, binding
`DB`, bảng `noma350_orders`), và cung cấp thống kê tổng hợp theo combo/nhân sự/quà/nguồn/ngày.

Tách hẳn khỏi `noma911-orders` và `noma680-orders`: bảng riêng, token riêng, bảng giá
riêng. Lý do ở `design.md` — trộn các dòng sản phẩm vào một bảng làm hỏng thống kê combo
của tất cả.

## Requirements

### Requirement: Thu đơn đăng ký NOMA 350

Endpoint `POST /api/noma350/order` SHALL nhận đơn từ landing và lưu vào D1. Request PHẢI có
header `X-Noma-Token` khớp `env.NOMA350_INGEST_TOKEN`. Body SHALL có tối thiểu `staff` và
`combo`. Agent SHALL map `combo` sang `combo_label` + `amount` theo bảng `COMBO_META` phía
server và SHALL bỏ qua giá trị `amount` do client gửi lên. Agent SHALL chuẩn hoá `phone`,
cắt độ dài các trường text, tính `created_at` (epoch giây) và `created_date` theo giờ VN
(+7h). Agent SHALL hỗ trợ `onRequestOptions` cho CORS cross-origin.

#### Scenario: Đơn hợp lệ

- **WHEN** landing POST đơn có token đúng, đủ `staff` + `combo` hợp lệ
- **THEN** agent INSERT 1 dòng vào `noma350_orders` và trả `{ ok: true, stored: { combo, combo_label, amount, staff } }`

#### Scenario: Sai hoặc thiếu token

- **WHEN** request thiếu `X-Noma-Token` hoặc token không khớp `env.NOMA350_INGEST_TOKEN`
- **THEN** agent trả `{ ok: false, error: "unauthorized" }` với HTTP 401, KHÔNG ghi DB

#### Scenario: Thiếu trường bắt buộc

- **WHEN** body thiếu `staff`, hoặc `combo` không có trong `COMBO_META`
- **THEN** agent trả `{ ok: false, error: "missing_staff" | "missing_combo" }` với HTTP 400

#### Scenario: Client gửi số tiền sai

- **WHEN** body có `combo: "le-350"` kèm `amount: 1000`
- **THEN** agent ghi `amount = 159000` theo `COMBO_META`, bỏ qua số client gửi

#### Scenario: Combo của dòng sản phẩm khác

- **WHEN** body có `combo: "le-680"` hoặc `combo: "le-911"`
- **THEN** agent trả `{ ok: false, error: "missing_combo" }` với HTTP 400, KHÔNG ghi DB

### Requirement: Chống ghi trùng đơn

Bảng `noma350_orders` SHALL có unique index `(created_date, phone, combo)` và endpoint
SHALL dùng `INSERT OR IGNORE`. Ràng buộc PHẢI đặt ở tầng schema, KHÔNG được kiểm bằng
SELECT rồi INSERT — D1 không có transaction nhiều câu lệnh nên hai request gần nhau sẽ lọt.

#### Scenario: Khách bấm gửi hai lần

- **WHEN** cùng một SĐT gửi cùng một combo hai lần trong cùng ngày VN
- **THEN** D1 chỉ có 1 dòng, lần thứ hai trả `{ ok: true, duplicate: true }` — khách KHÔNG thấy lỗi

#### Scenario: Cùng SĐT nhưng combo khác

- **WHEN** cùng SĐT gửi `le-350` rồi gửi tiếp `combo-2x350` trong cùng ngày
- **THEN** D1 có 2 dòng — đây là hai đơn thật, không phải trùng

### Requirement: Thống kê đơn NOMA 350

Endpoint `GET /api/noma350/stats` SHALL trả thống kê theo khoảng ngày, nhận `days`
(mặc định 90, chặn trong 1–365) hoặc cặp `from`/`to` dạng `YYYY-MM-DD`. Response SHALL giữ
ĐÚNG hình dạng của `/api/noma680/stats`:
`{ range, summary, by_combo, by_staff, by_gift, by_source, by_date, actual }`.

#### Scenario: Doanh thu theo combo

- **WHEN** trong kỳ có 3 đơn `le-350` và 2 đơn `combo-350-911`
- **THEN** `by_combo` có dòng `le-350` với `revenue = 3 × 159000` và dòng `combo-350-911` với `revenue = 2 × 378000`

#### Scenario: Luật toàn vẹn tổng doanh thu

- **WHEN** gọi stats bất kỳ khoảng ngày nào
- **THEN** `summary.revenue` PHẢI bằng tổng `revenue` của mọi dòng trong `by_combo`

#### Scenario: Chưa có đối soát POS

- **WHEN** chưa có job nào ghi các cột `pos_*`
- **THEN** khối `actual` trả toàn 0 — KHÔNG suy đoán, KHÔNG lấy `summary.revenue` thay thế

#### Scenario: Không có đơn nào trong kỳ

- **WHEN** khoảng ngày không có đơn nào
- **THEN** `summary.orders = 0`, `summary.revenue = 0`, các mảng rỗng — KHÔNG lỗi 500
