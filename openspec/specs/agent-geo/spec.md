# agent-geo Specification

## Purpose

Cụm GEO (Generative Engine Optimization) theo dõi mức độ xuất hiện của brand Doscom/NOMA trong câu trả lời của các AI engine (ChatGPT, Gemini, Meta AI) và vận hành pipeline nội dung để cải thiện độ phủ. Gồm 3 mảng: (1) quản lý bộ câu hỏi + chạy engine + đo brand mention/citation/đối thủ; (2) xử lý hàng đợi theo lô qua cron; (3) pipeline nội dung gap-analysis → sinh bài → duyệt → đăng WordPress. Dữ liệu lưu ở D1 (`DB`): `geo_queries`, `geo_runs`, `geo_citations`, `geo_competitor_mentions`, `geo_job_queue`, `geo_content_queue`, `geo_article_performance`, và log AI usage.

## Requirements

### Requirement: Quản lý bộ câu hỏi GEO

Endpoint `/api/geo/queries` SHALL hỗ trợ `GET` (lọc theo `brand`, `active`) để liệt kê câu hỏi và `POST` để thêm/cập nhật câu hỏi trong bảng `geo_queries` (có `category` TOFU/MOFU/BOFU, `brand_target` doscom/noma/both).

#### Scenario: Liệt kê câu hỏi active của brand

- **WHEN** client gọi `GET /api/geo/queries?brand=doscom&active=1`
- **THEN** agent trả danh sách câu hỏi doscom đang active từ `geo_queries`

### Requirement: Chạy thử AI engine cho một câu hỏi

Endpoint `/api/geo/test-engine` SHALL nhận `query` (string) hoặc `query_id` (từ `geo_queries`) qua GET hoặc POST, chạy song song các AI engine và trả về response kèm brand detection (Doscom/NOMA mentions, position, sentiment), citations và ước tính cost. Endpoint dùng để debug, KHÔNG ghi vào `geo_runs`.

#### Scenario: Test bằng query tự do

- **WHEN** client gọi `GET /api/geo/test-engine?q=máy dò camera ẩn nào tốt`
- **THEN** agent trả kết quả các engine + mentions, KHÔNG yêu cầu query_id

#### Scenario: query_id không tồn tại

- **WHEN** client gửi `query_id` không có trong `geo_queries`
- **THEN** agent trả lỗi 404 với thông báo query không tồn tại

### Requirement: Hàng đợi job và chạy theo lô

Endpoint `/api/geo/jobs` (`POST` tạo job, `GET` test) SHALL nạp các cặp query×engine vào `geo_job_queue` (status `pending`). Endpoint `/api/geo/run-batch` SHALL lấy tối đa BATCH_SIZE (6) job pending, chạy engine song song, ghi kết quả vào `geo_runs` + `geo_citations` + `geo_competitor_mentions`, rồi mark job `done`/`failed`. Job lỗi SHALL tăng `retry_count`; đạt 3 lần thì mark `failed`.

#### Scenario: Cron chạy batch

- **WHEN** GitHub Actions gọi `POST /api/geo/run-batch` mỗi 30 phút
- **THEN** agent xử lý tối đa 6 job pending và ghi runs/citations/competitor mentions vào D1

#### Scenario: Engine lỗi tới ngưỡng retry

- **WHEN** một job fail lần thứ 3
- **THEN** agent mark job đó `failed` thay vì retry tiếp

### Requirement: Báo cáo kết quả GEO

Các endpoint `GET /api/geo/queue`, `GET /api/geo/runs`, `GET /api/geo/sov`, `GET /api/geo/ai-usage` SHALL trả số liệu tổng hợp: trạng thái hàng đợi, lịch sử runs, Share of Voice theo khoảng ngày, và chi phí AI đã dùng.

#### Scenario: Share of Voice 30 ngày

- **WHEN** client gọi `GET /api/geo/sov?days=30`
- **THEN** agent trả SoV của brand vs đối thủ tính trên runs trong 30 ngày

### Requirement: Phân tích lỗ hổng nội dung

Endpoint `POST /api/geo/analyze-gaps` SHALL phát hiện các query mà brand bị miss (đối thủ thắng), phân mức nghiêm trọng (A: 3/3 engine miss, B: 2/3, C: 1/3) và tạo ý tưởng bài viết (status `idea`) trong `geo_content_queue` kèm `gap_summary`, `competitor_winners`, `source_citations`.

#### Scenario: Tạo ý tưởng từ gap

- **WHEN** client gọi `POST /api/geo/analyze-gaps`
- **THEN** agent ghi các ý tưởng bài viết mới vào `geo_content_queue` với `gap_severity` tương ứng

### Requirement: Sinh nội dung và ảnh

Endpoint `POST /api/geo/generate-content` SHALL sinh bài viết (title, slug, meta, content_html/markdown, faq, schema JSON-LD, internal/external links) cho một mục trong `geo_content_queue`, chuyển status `drafting` → `pending_review`. Endpoint `POST /api/geo/generate-image` và `POST /api/geo/generate-inline-images` SHALL sinh ảnh hero/inline. Agent SHALL ghi nhận cost (content + image) vào hàng đợi.

#### Scenario: Sinh bài cho một idea

- **WHEN** client gọi `POST /api/geo/generate-content` cho 1 article ở status `idea`/`drafting`
- **THEN** agent điền content fields và chuyển article sang `pending_review`

### Requirement: Quản lý và xuất bản bài viết

Các endpoint `/api/geo/queue/:id` (`GET` xem, `PATCH` sửa/duyệt, `DELETE` xoá) và `/api/geo/queue/:id/inline-images` (`GET`/`DELETE`) SHALL quản lý vòng đời bài viết. Endpoint `POST /api/geo/publish-wp` SHALL đẩy bài đã duyệt lên WordPress (status `publishing` → `published`), lưu `wp_post_id`/`wp_post_url` và xoá `image_base64` tạm sau khi publish.

#### Scenario: Duyệt rồi đăng

- **WHEN** user duyệt bài (PATCH status `edited`) và gọi `POST /api/geo/publish-wp`
- **THEN** agent đăng lên WordPress, lưu wp_post_id/url và chuyển status sang `published`
