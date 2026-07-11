## ADDED Requirements

### Requirement: Site đích thứ 3 nomaauto.us

Hệ thống SHALL nhận diện `nomaauto` là một site WooCommerce đích, đọc credential từ env `WC_NOMAAUTO_CK/CS/USER/APP_PWD` và URL cố định `https://nomaauto.us`, tái dùng nguyên pipeline `_wc.js` (`siteCreds`, `uploadMedia`, `createProduct`, `fetchCategories`). Credential MUST lấy từ `env`, KHÔNG hard-code.

#### Scenario: Đọc credential nomaauto từ env
- **WHEN** gọi `siteCreds("nomaauto", env)` với 4 biến `WC_NOMAAUTO_*` đã set
- **THEN** trả về `{ url: "https://nomaauto.us", ck, cs, user, pwd }` và `isConfigured()` = true

#### Scenario: Thiếu credential nomaauto
- **WHEN** gọi endpoint liên quan nomaauto mà chưa set đủ `WC_NOMAAUTO_*`
- **THEN** trả lỗi rõ ràng "Chưa cấu hình secret WC_NOMAAUTO_*" (không cố gọi WooCommerce)

### Requirement: Kéo danh mục nomaauto.us

`GET /api/products/categories?site=nomaauto` SHALL trả danh mục product kéo live từ nomaauto.us cho dropdown, cùng khuôn với site doscom/noma.

#### Scenario: Lấy danh mục nomaauto
- **WHEN** `GET /api/products/categories?site=nomaauto` và env đã cấu hình
- **THEN** trả `{ ok: true, site: "nomaauto", categories: [{ id, name, parent, count }] }`

#### Scenario: Site không hợp lệ
- **WHEN** tham số `site` không thuộc {doscom, noma, nomaauto}
- **THEN** trả `{ ok: false }` với thông báo tham số site hợp lệ

### Requirement: Dịch/clone bài sang tiếng Anh

`POST /api/products/translate` SHALL nhận object bài tiếng Việt đã generate và trả bản tiếng Anh tương ứng, giữ nguyên cấu trúc H2/H3 và số lượng/thứ tự `image_placements`. AI MUST gọi qua Claude (`callClaude`, AI Gateway `doscom-erp`), tôn trọng kill switch `USE_CLAUDE`, và KHÔNG bịa thông số ngoài bản gốc (chỉ dịch, không thêm số liệu mới).

#### Scenario: Dịch thành công
- **WHEN** POST body có `name` + object bài VN (`seo_title`, `short_description`, `long_html`, `meta_description`, `tags`, `primary_keyword`, `image_placements`)
- **THEN** trả `{ ok: true, translated: { primary_keyword, seo_title, short_description, long_html, meta_description, tags, image_placements } }` bằng tiếng Anh, cùng số phần tử `image_placements` và cùng các `index`/`after_heading` (chỉ alt/caption được dịch)

#### Scenario: Focus keyword tiếng Anh đạt Rank Math
- **WHEN** dịch xong
- **THEN** `primary_keyword` là cụm tiếng Anh tự nhiên (không dịch máy móc tên/model) và xuất hiện trong 40% đầu `seo_title`, trong `meta_description`, câu đầu `long_html`, ít nhất 1 thẻ `<h2>` và đoạn kết; HTML dùng nháy đơn cho mọi thuộc tính

#### Scenario: Kill switch tắt AI
- **WHEN** `env.USE_CLAUDE === "false"`
- **THEN** trả `{ ok: false }` mã 503 báo AI đang tắt, KHÔNG gọi Claude

#### Scenario: Không truyền bài nguồn
- **WHEN** body thiếu `long_html` (hoặc object bài VN rỗng)
- **THEN** trả `{ ok: false }` mã 400 báo thiếu nội dung nguồn để dịch

### Requirement: Cache KV cho translate

`POST /api/products/translate` SHALL cache kết quả vào KV `INVENTORY` với key gồm version + ngày VN + hash nội dung nguồn, để cùng input trong ngày không tốn credit; cho phép `regenerate: true` bỏ cache.

#### Scenario: Trúng cache
- **WHEN** gọi lần 2 cùng bài nguồn trong cùng ngày VN, `regenerate` không đặt
- **THEN** trả kết quả từ KV (không gọi Claude), cờ `cached: true`

#### Scenario: Ép dịch lại
- **WHEN** gọi với `regenerate: true`
- **THEN** bỏ qua cache, gọi Claude dịch lại và ghi đè cache

### Requirement: Đăng bản tiếng Anh lên nomaauto.us

`POST /api/products/publish` SHALL hỗ trợ target `nomaauto` dùng **nội dung tiếng Anh** (object `en` trong body). Ảnh MUST upload lại vào WP Media của nomaauto.us (media ID theo từng site), alt/caption tiếng Anh, product có Rank Math focus keyword tiếng Anh và slug theo keyword EN. Endpoint ghi MUST giữ bảo vệ token `X-Products-Token` khi Access chưa bật.

#### Scenario: Đăng sản phẩm tiếng Anh
- **WHEN** POST body `site` gồm nomaauto, có object `en` (bài tiếng Anh) + `categories.nomaauto`
- **THEN** upload ảnh vào nomaauto.us, tạo product tiếng Anh trạng thái `draft` (mặc định), trả `{ ok: true, site: "nomaauto", id, url, status }`

#### Scenario: Thiếu nội dung tiếng Anh
- **WHEN** target gồm nomaauto nhưng body không có object `en`
- **THEN** kết quả của site nomaauto là `{ ok: false, site: "nomaauto", error }` báo thiếu bản tiếng Anh, KHÔNG chặn các site tiếng Việt còn lại

#### Scenario: Bảo vệ token endpoint ghi
- **WHEN** Access chưa bật (role "open") và thiếu/sai header `X-Products-Token`
- **THEN** trả 401 unauthorized, không đăng bài

### Requirement: Đăng "Cả 3 web" trên UI

Trang `product-publisher.html` SHALL có option "Cả 3 web" ở site switch. Chọn option này SHALL đăng bản tiếng Việt lên doscom.vn + noma.vn và bản tiếng Anh (clone dịch) lên nomaauto.us, cho phép chọn danh mục riêng cho từng site (`{ doscom, noma, nomaauto }`) và preview bản tiếng Anh trước khi đăng.

#### Scenario: Chọn Cả 3 web
- **WHEN** người dùng chọn "Cả 3 web" sau khi đã generate bài tiếng Việt và bấm Đăng
- **THEN** UI gọi `/api/products/translate` để lấy bản EN (hoặc dùng bản đã preview), rồi gọi `/api/products/publish` với `site` gồm 3 target và `categories` cho 3 site; hiển thị 3 link kết quả (2 tiếng Việt + 1 tiếng Anh nomaauto.us)

#### Scenario: Tương thích ngược option cũ
- **WHEN** người dùng chọn doscom.vn / noma.vn / Cả 2 như trước
- **THEN** hành vi đăng bản tiếng Việt giữ nguyên, không đụng tới nomaauto.us
