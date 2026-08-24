## ADDED Requirements

### Requirement: Quản lý fanpage Thái

Hệ thống SHALL lưu danh sách fanpage Thái trong D1 (`thai_pages`), mỗi page gồm
`page_id`, tên hiển thị, `page_token` và trạng thái bật/tắt. Endpoint
`GET /api/thai-social/pages` SHALL trả danh sách page kèm trạng thái token,
và MUST NOT trả `page_token` ra client. Endpoint `POST /api/thai-social/pages`
SHALL thêm/sửa page và PHẢI kiểm token bằng header `X-Thai-Token` khớp
`env.THAI_SOCIAL_TOKEN` trước khi ghi.

#### Scenario: Liệt kê fanpage

- **WHEN** client gọi `GET /api/thai-social/pages`
- **THEN** hệ thống trả `{ ok: true, data: [...] }` gồm `page_id`, tên, `active`,
  `token_status` ("ok" | "missing" | "expired"), và KHÔNG có trường `page_token`

#### Scenario: Ghi cấu hình page thiếu token

- **WHEN** client gọi `POST /api/thai-social/pages` mà header `X-Thai-Token` sai hoặc thiếu
- **THEN** hệ thống trả HTTP 401 `{ ok: false, error: "unauthorized" }` và KHÔNG ghi gì vào D1

### Requirement: Lịch sinh bài hằng ngày theo từng fanpage

Hệ thống SHALL cho phép cài lịch cho từng fanpage: giờ sinh bài trong ngày (giờ Việt Nam),
các thứ trong tuần được chạy, sản phẩm chính và sản phẩm bán kèm mặc định. Endpoint
`POST /api/thai-social/schedule/run` SHALL được cron gọi; với mỗi fanpage tới giờ và chưa
có bài của ngày hôm đó, hệ thống SHALL tạo một bản ghi hàng đợi mới rồi sinh nội dung + ảnh.

Lịch SHALL chỉ sinh bài. Hệ thống MUST NOT tự đăng bài lên Facebook từ lịch.

#### Scenario: Cron chạy đúng giờ đã cài

- **WHEN** cron gọi `POST /api/thai-social/schedule/run` lúc trùng giờ đã cài của một fanpage
  đang `active`, và ngày hôm đó fanpage chưa có bài nào trong hàng đợi
- **THEN** hệ thống tạo bài mới ở status `pending_review` kèm nội dung tiếng Thái và ảnh,
  và KHÔNG gọi Graph API đăng bài

#### Scenario: Chạy lại trong cùng ngày không sinh trùng

- **WHEN** cron gọi lại `POST /api/thai-social/schedule/run` trong cùng ngày cho fanpage
  đã có bài sinh theo lịch
- **THEN** hệ thống bỏ qua fanpage đó và trả `{ ok: true, data: { skipped: [...] } }`,
  KHÔNG tạo bài thứ hai và KHÔNG tốn credit AI

#### Scenario: Ngày nghỉ trong lịch

- **WHEN** cron chạy vào thứ không nằm trong danh sách thứ được cài của fanpage
- **THEN** hệ thống bỏ qua fanpage đó, không sinh bài

### Requirement: Sinh nội dung tiếng Thái theo cặp sản phẩm người dùng chọn

Endpoint `POST /api/thai-social/generate` SHALL sinh caption tiếng Thái và ảnh cho một bài
trong hàng đợi, dựa trên `sku_main` (sản phẩm chính, bắt buộc) và `sku_addon`
(sản phẩm bán kèm, tuỳ chọn) do người dùng chọn. Hệ thống MUST lấy tên, công dụng và thông số
sản phẩm từ `noma-sku-specs.js` / `product-catalog.js` và luật thương hiệu từ
`noma-brandcore.js`; MUST NOT bịa thông số hoặc công dụng không có trong hai nguồn đó.

Ảnh SHALL sinh qua Workers AI Flux Schnell theo đúng đường đang dùng ở
`/api/geo/generate-image` (binding `AI`, gateway `doscom-erp`). Chi phí AI (nội dung + ảnh)
SHALL được ghi nhận vào bản ghi hàng đợi.

Kết quả sinh SHALL đặt bài ở status `pending_review`.

#### Scenario: Sinh bài cho 1 SKU chính + 1 SKU bán kèm

- **WHEN** client gọi `POST /api/thai-social/generate` với `sku_main` và `sku_addon` hợp lệ
- **THEN** hệ thống trả caption tiếng Thái nhắc đúng cả hai sản phẩm, một ảnh, và chuyển bài
  sang status `pending_review`

#### Scenario: SKU không có trong hồ sơ sản phẩm

- **WHEN** client gọi `POST /api/thai-social/generate` với `sku_main` không có trong
  `noma-sku-specs.js` lẫn `product-catalog.js`
- **THEN** hệ thống trả HTTP 400 `{ ok: false, error: "unknown_sku" }` và KHÔNG gọi AI

#### Scenario: Thiếu binding Workers AI

- **WHEN** binding `AI` không tồn tại lúc sinh ảnh
- **THEN** hệ thống vẫn lưu phần caption đã sinh, đánh dấu bài thiếu ảnh, và trả lỗi nói rõ
  thiếu binding — KHÔNG trả bài như thể đã đủ ảnh

### Requirement: Duyệt và sửa bài trước khi đăng

Endpoint `GET /api/thai-social/queue` SHALL liệt kê bài theo fanpage và ngày.
`PATCH /api/thai-social/queue/:id` SHALL cho sửa caption, đổi ảnh, hoặc đổi cặp SKU rồi
sinh lại; sửa xong bài chuyển status `edited`. `DELETE /api/thai-social/queue/:id` SHALL bỏ bài.

#### Scenario: Sửa chữ rồi đánh dấu đã duyệt

- **WHEN** user gọi `PATCH /api/thai-social/queue/:id` với caption mới
- **THEN** hệ thống lưu caption mới và chuyển bài sang status `edited`

#### Scenario: Bỏ bài không dùng

- **WHEN** user gọi `DELETE /api/thai-social/queue/:id` cho bài chưa đăng
- **THEN** hệ thống chuyển bài sang status `discarded` và bài không còn xuất hiện ở danh sách chờ đăng

### Requirement: Đăng bài lên Facebook Page do người bấm

Endpoint `POST /api/thai-social/publish` SHALL đăng một bài lên fanpage tương ứng qua
Graph API: gọi `/{page_id}/photos` khi bài có ảnh, `/{page_id}/feed` khi chỉ có chữ.
Endpoint SHALL yêu cầu header `X-Thai-Token` khớp `env.THAI_SOCIAL_TOKEN`.

Hệ thống SHALL chỉ đăng bài đang ở status `pending_review` hoặc `edited`. Sau khi Facebook
trả về id bài, hệ thống SHALL lưu `fb_post_id` và chuyển status sang `published`.

Hệ thống MUST NOT đăng bài ở bất kỳ đường nào khác ngoài endpoint này — cron và bước sinh bài
KHÔNG được đăng.

#### Scenario: Đăng bài đã duyệt

- **WHEN** user bấm "Đăng" cho bài ở status `edited` và fanpage có `page_token` hợp lệ
- **THEN** hệ thống gọi Graph API, lưu `fb_post_id` trả về và chuyển bài sang `published`

#### Scenario: Bài đã đăng rồi bấm đăng lại

- **WHEN** user gọi `POST /api/thai-social/publish` cho bài đã ở status `published`
- **THEN** hệ thống trả HTTP 409 `{ ok: false, error: "already_published" }` và KHÔNG gọi Graph API

#### Scenario: Thiếu hoặc hết hạn Page Access Token

- **WHEN** fanpage chưa có `page_token`, hoặc Graph API trả lỗi token hết hạn
- **THEN** hệ thống giữ nguyên status bài, trả lỗi nói rõ cần cấp lại Page Access Token
  (quyền `pages_manage_posts`), và KHÔNG đánh dấu bài là đã đăng

#### Scenario: Facebook trả lỗi giữa chừng

- **WHEN** Graph API trả lỗi khác token (rate limit, ảnh hỏng, page bị hạn chế)
- **THEN** hệ thống giữ bài ở status cũ, lưu thông báo lỗi vào bản ghi để user thấy trên UI,
  và KHÔNG tự thử lại vòng lặp
