# agent-google-ai Specification

## Purpose

Agent phân tích & audit Google Ads cho Doscom theo 8 nhóm sản phẩm. Đọc spend (Windsor.ai), doanh thu 3 nguồn online (WEBSITE + ZALO_OA + HOTLINE), search terms, ads, placement (từ `data/*.json`) + inventory + Google Analytics, gọi Claude Haiku (fallback Llama) để audit tài khoản/từ khoá/GDN/headline và đề xuất từ khoá, headline, banner mới. Mục tiêu lợi nhuận ≥ 30% (không dùng ROAS).

## Requirements

### Requirement: Phân tích Google Ads theo mode và nhóm SP

Endpoint `POST /api/agent-google-ai` SHALL nhận body `{ mode, question?, context?: { product_group? } }` và trả về phân tích theo `mode`. Mode hợp lệ: `audit_account`, `audit_account_json`, `analyze_ga`, `audit_keyword`, `audit_gdn`, `audit_headline`, `suggest_keyword`, `suggest_headline`, `suggest_banner`, `analyze_combined`, `ask`. `product_group` thuộc 9 giá trị (`ALL`, `CAMERA_WIFI`, `CAMERA_4G`, `CAMERA_VIDEO_CALL`, `MAY_DO`, `GHI_AM`, `DINH_VI`, `CHONG_GHI_AM`, `NOMA`).

#### Scenario: Audit account JSON theo nhóm

- **WHEN** client gửi `{ "mode": "audit_account_json", "context": { "product_group": "GHI_AM" } }`
- **THEN** agent chấm điểm 8/8 nhóm (1-100), không để score 0, trả JSON có total_score, grade A-F và top_findings có số liệu

#### Scenario: Đề xuất từ khoá đúng nhóm

- **WHEN** client gửi `{ "mode": "suggest_keyword", "context": { "product_group": "MAY_DO" } }`
- **THEN** mọi keyword đề xuất đều thuộc nhóm MAY_DO, KHÔNG lẫn sản phẩm nhóm khác

### Requirement: Cache các mode đề xuất

Agent SHALL cache kết quả các mode `suggest_keyword`, `suggest_headline`, `suggest_banner`, `analyze_combined` trong KV 24h; `force_refresh` cho phép re-generate.

#### Scenario: Bấm lại trong ngày trả kết quả cũ

- **WHEN** client gọi lại `suggest_keyword` cùng nhóm trong ngày mà không ép làm mới
- **THEN** agent trả kết quả KV (đảm bảo nhất quán, không tốn credit)

### Requirement: Chuẩn hoá output bảng từ Llama

Khi dùng Llama (prompt-following yếu), agent SHALL hậu xử lý output `suggest_keyword` để gộp nhiều bảng nhỏ thành 1 bảng, strip heading/bold và đánh số lại cột `#` liên tục.

#### Scenario: Llama trả nhiều bảng rời

- **WHEN** Llama sinh output có nhiều bảng con kèm heading `### 1. HARVEST...`
- **THEN** agent gộp tất cả data row vào 1 bảng duy nhất, bỏ heading, renumber 1..N
