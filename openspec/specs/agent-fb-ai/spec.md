# agent-fb-ai Specification

## Purpose

Agent phân tích & audit quảng cáo Facebook cho Doscom. Nhận dữ liệu FB Ads (insights, đơn Pancake, profit) đã snapshot ở `data/*.json` + cấu hình ở KV, gọi Claude Haiku 4.5 (qua AI Gateway `doscom-erp`, fallback Llama) để chấm điểm tài khoản, audit funnel, tối ưu campaign và tổng quan theo nhân sự. Kết quả audit/optimize/staff được cache 24h trong KV để F5 cùng ngày không tốn credit.

## Requirements

### Requirement: Phân tích FB Ads theo mode

Endpoint `POST /api/agent-fb-ai` SHALL nhận body `{ mode, group?, question?, force_refresh? }` và trả về phân tích tương ứng với `mode`. Các mode hợp lệ: `audit_account`, `audit_account_json`, `audit_funnel`, `analyze_metrics`, `optimize_campaign`, `ask`, `staff_overview`. `group` thuộc `ALL | MAY_DO | CAMERA_VIDEO_CALL | GHI_AM | NOMA`. Mode có `json_output` SHALL trả JSON object đúng schema; mode còn lại trả markdown tiếng Việt.

#### Scenario: Audit account dạng JSON

- **WHEN** client gửi `{ "mode": "audit_account_json", "group": "MAY_DO" }`
- **THEN** agent nạp insights + orders + profit của nhóm, gọi Claude và trả về JSON có verdict, performance, evaluation 5 chiều và action (100% tiếng Việt)

#### Scenario: Mode không hợp lệ

- **WHEN** client gửi `mode` không nằm trong danh sách hỗ trợ
- **THEN** agent trả về lỗi rõ ràng thay vì gọi AI

### Requirement: Cache kết quả AI theo ngày

Agent SHALL cache kết quả các mode tốn credit trong KV `INVENTORY` với key gồm `CACHE_VERSION` + nhóm + ngày VN, TTL 24h. Khi `force_refresh=true`, agent SHALL bỏ qua cache và gọi AI lại.

#### Scenario: Hit cache trong ngày

- **WHEN** cùng một request được gửi lần thứ hai trong ngày VN và `force_refresh` không bật
- **THEN** agent trả kết quả từ KV, KHÔNG gọi Claude (không tốn credit)

#### Scenario: Ép làm mới

- **WHEN** client gửi `force_refresh: true`
- **THEN** agent bỏ qua cache, gọi lại AI và ghi đè entry KV

### Requirement: Lưu lịch sử phân tích

Agent SHALL lưu lịch sử phân tích campaign (tối đa 10 entry/campaign, TTL 45 ngày) và lịch sử staff overview (tối đa 12 tháng/nhân sự) vào KV để các lần phân tích sau tham chiếu diễn biến (verdict, score, CPA qua thời gian).

#### Scenario: Tham chiếu lịch sử khi optimize

- **WHEN** agent phân tích một campaign đã có lịch sử trong KV
- **THEN** agent đưa lịch sử vào prompt và xuất trường `comparison_with_previous_analysis` trong JSON

### Requirement: Fallback khi Claude lỗi

Agent SHALL gọi Claude qua AI Gateway `doscom-erp`; khi Claude lỗi hoặc env `USE_CLAUDE=false`, agent SHALL fallback sang Workers AI (Llama 70B → 8B) mà không cần đổi code.

#### Scenario: Kill switch tắt Claude

- **WHEN** env `USE_CLAUDE=false`
- **THEN** agent dùng Llama cho mọi mode thay vì Claude
