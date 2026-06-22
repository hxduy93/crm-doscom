# noma911-orders Specification

## Purpose

Module thu và thống kê đơn đăng ký từ landing NOMA 911. Nhận đơn qua webhook (bảo vệ bằng token), lưu vào D1 riêng của CRM (`crm-doscom-db`, binding `DB`, bảng `noma911_orders`), và cung cấp thống kê tổng hợp theo combo/nhân sự/quà/nguồn/ngày. Hoạt động độc lập, KHÔNG gọi API dashboard cũ.

## Requirements

### Requirement: Thu đơn đăng ký NOMA 911

Endpoint `POST /api/noma911/order` SHALL nhận đơn từ landing và lưu vào D1. Request PHẢI có header `X-Noma-Token` khớp `env.NOMA911_INGEST_TOKEN`. Body SHALL có tối thiểu `staff` và `combo`; agent map `combo` sang `combo_label` + `amount` theo bảng combo, chuẩn hoá `phone`/`province`, tính `created_at`/`created_date` theo giờ VN. Agent SHALL hỗ trợ `onRequestOptions` cho CORS cross-origin.

#### Scenario: Đơn hợp lệ

- **WHEN** landing POST đơn có token đúng và đủ `staff` + `combo`
- **THEN** agent INSERT 1 dòng vào `noma911_orders` và trả `{ ok: true, stored: {...} }`

#### Scenario: Sai hoặc thiếu token

- **WHEN** request thiếu `X-Noma-Token` hoặc token không khớp
- **THEN** agent trả `{ ok: false, error: "unauthorized" }` với HTTP 401, KHÔNG ghi DB

#### Scenario: Thiếu trường bắt buộc

- **WHEN** body thiếu `staff` hoặc `combo`
- **THEN** agent trả `{ ok: false, error: "missing_staff" | "missing_combo" }` với HTTP 400

### Requirement: Thống kê đơn NOMA 911

Endpoint `GET /api/noma911/stats` SHALL trả thống kê đơn trong khoảng thời gian. Tham số: `days` (1-365, mặc định 90) HOẶC `from`/`to` (YYYY-MM-DD). Output gồm `range`, `summary` (orders, unique_customers, revenue), `by_combo`, `by_staff` (kèm nhãn), `by_gift`, `by_source`, `by_date`, và `actual` (doanh thu/đơn đã giao + booked + conversion_rate dựa POS matching).

#### Scenario: Thống kê theo số ngày

- **WHEN** client gọi `GET /api/noma911/stats?days=30`
- **THEN** agent trả tổng hợp 30 ngày gần nhất với đầy đủ các nhóm breakdown

#### Scenario: Thiếu binding D1

- **WHEN** binding `DB` không tồn tại
- **THEN** agent trả `{ error: "D1 binding 'DB' missing" }` với HTTP 500
