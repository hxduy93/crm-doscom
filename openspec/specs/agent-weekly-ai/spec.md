# agent-weekly-ai Specification

## Purpose

Agent viết nhận xét báo cáo tuần. Nhận số liệu tuần ĐÃ TÍNH SẴN từ client (KPI, theo kênh, top SKU, creative, dự báo chi phí), gọi Claude Haiku qua AI Gateway `doscom-erp` để sinh nhận xét hiệu quả quảng cáo + đề xuất cải thiện dưới dạng markdown tiếng Việt 6 mục. Endpoint chỉ chạy Claude (không fallback Llama); thiếu credit thì trả lỗi rõ ràng.

## Requirements

### Requirement: Sinh nhận xét báo cáo tuần

Endpoint `POST /api/weekly-ai` SHALL nhận body JSON là summary số liệu tuần và trả về `{ ok: true, analysis, model, usage }` với `analysis` là markdown tiếng Việt gồm 6 mục: tổng quan, kênh, sản phẩm, creative, hành động tuần tới, nhận xét dự báo chi phí. Agent SHALL hỗ trợ `onRequestOptions` cho CORS.

#### Scenario: Báo cáo tuần hợp lệ

- **WHEN** client gửi JSON số liệu tuần đầy đủ
- **THEN** agent gọi Claude và trả `{ ok: true, analysis }` với nhận xét dẫn số liệu cụ thể từ data

#### Scenario: Body không phải JSON

- **WHEN** body request không parse được thành JSON
- **THEN** agent trả `{ ok: false, error: "invalid_json" }` với HTTP 400

### Requirement: Báo lỗi khi thiếu cấu hình hoặc credit

Agent SHALL trả lỗi rõ ràng khi thiếu `ANTHROPIC_API_KEY`/`CF_ACCOUNT_ID` hoặc khi tài khoản Anthropic không đủ credit, thay vì lỗi mơ hồ.

#### Scenario: Thiếu credit Anthropic

- **WHEN** Claude trả lỗi billing/insufficient credit
- **THEN** agent trả `{ ok: false, need_credit: true, error }` hướng dẫn nạp credit, HTTP 502
