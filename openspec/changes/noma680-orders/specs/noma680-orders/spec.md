# noma680-orders Specification

## Purpose

Module thu và thống kê đơn đăng ký từ landing NOMA 680 (bọt tuyết vệ sinh đa năng 650ml).
Nhận đơn qua webhook bảo vệ bằng token, lưu vào D1 riêng của CRM (`crm-doscom-db`, binding
`DB`, bảng `noma680_orders`), và cung cấp thống kê tổng hợp theo combo/nhân sự/quà/nguồn/ngày.

Tách hẳn khỏi `noma911-orders`: hai bảng riêng, hai token riêng, hai bảng giá riêng. Lý do
ở `design.md` — trộn hai dòng sản phẩm vào một bảng làm hỏng thống kê combo của cả hai.

## Requirements

### Requirement: Thu đơn đăng ký NOMA 680

Endpoint `POST /api/noma680/order` SHALL nhận đơn từ landing và lưu vào D1. Request PHẢI có
header `X-Noma-Token` khớp `env.NOMA680_INGEST_TOKEN`. Body SHALL có tối thiểu `staff` và
`combo`. Agent SHALL map `combo` sang `combo_label` + `amount` theo bảng `COMBO_META` phía
server và SHALL bỏ qua giá trị `amount` do client gửi lên. Agent SHALL chuẩn hoá `phone`,
cắt độ dài các trường text, tính `created_at` (epoch giây) và `created_date` theo giờ VN
(+7h). Agent SHALL hỗ trợ `onRequestOptions` cho CORS cross-origin.

#### Scenario: Đơn hợp lệ

- **WHEN** landing POST đơn có token đúng, đủ `staff` + `combo` hợp lệ
- **THEN** agent INSERT 1 dòng vào `noma680_orders` và trả `{ ok: true, stored: { combo, combo_label, amount, staff } }`

#### Scenario: Sai hoặc thiếu token

- **WHEN** request thiếu `X-Noma-Token` hoặc token không khớp `env.NOMA680_INGEST_TOKEN`
- **THEN** agent trả `{ ok: false, error: "unauthorized" }` với HTTP 401, KHÔNG ghi DB

#### Scenario: Thiếu trường bắt buộc

- **WHEN** body thiếu `staff`, hoặc `combo` không có trong `COMBO_META`
- **THEN** agent trả `{ ok: false, error: "missing_staff" | "missing_combo" }` với HTTP 400

#### Scenario: Client gửi số tiền sai

- **WHEN** body có `combo: "le-680"` kèm `amount: 1000`
- **THEN** agent ghi `amount = 99000` theo `COMBO_META`, KHÔNG ghi 1000

### Requirement: Chống ghi trùng đơn

Bảng `noma680_orders` SHALL có unique index trên `(created_date, phone, combo)`. Agent
SHALL dùng `INSERT OR IGNORE` và SHALL phân biệt đơn mới với đơn trùng qua số dòng thực sự
được ghi. Đơn trùng SHALL trả HTTP 200 để khách không thấy lỗi khi bấm gửi hai lần.

#### Scenario: Khách bấm gửi hai lần

- **WHEN** cùng `phone` + `combo` được POST hai lần trong cùng một ngày VN
- **THEN** DB chỉ có 1 dòng; lần thứ hai trả `{ ok: true, duplicate: true }` và doanh thu KHÔNG bị cộng đôi

### Requirement: Thống kê đơn NOMA 680

Endpoint `GET /api/noma680/stats` SHALL trả thống kê đơn trong khoảng thời gian. Tham số:
`days` (1-365, mặc định 90) HOẶC `from`/`to` (YYYY-MM-DD). Output SHALL có cùng hình dạng
với `/api/noma911/stats`: `range`, `summary` (orders, unique_customers, revenue),
`by_combo`, `by_staff` (kèm nhãn), `by_gift` (kèm nhãn), `by_source`, `by_date`, `actual`.

#### Scenario: Thống kê theo số ngày

- **WHEN** client gọi `GET /api/noma680/stats?days=30`
- **THEN** agent trả tổng hợp 30 ngày gần nhất với đầy đủ các nhóm breakdown

#### Scenario: Doanh thu khớp bảng giá

- **WHEN** trong kỳ có N đơn combo `le-680`
- **THEN** dòng `by_combo` tương ứng có `revenue = N × 99000`, và `summary.revenue` bằng tổng `revenue` của mọi dòng `by_combo`

#### Scenario: Chưa nối đối soát POS

- **WHEN** chưa có job nào ghi các cột `pos_*`
- **THEN** khối `actual` trả các số 0, KHÔNG suy đoán hay bịa số

#### Scenario: Thiếu binding D1

- **WHEN** binding `DB` không tồn tại
- **THEN** agent trả `{ error: "D1 binding 'DB' missing" }` với HTTP 500
