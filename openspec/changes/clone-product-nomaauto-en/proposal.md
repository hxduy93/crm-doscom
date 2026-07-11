## Why

Doscom vừa có thêm website thứ 3 **nomaauto.us** (WordPress + WooCommerce, bản US của brand Noma) đăng bài bằng **tiếng Anh**. Hiện menu "Đăng sản phẩm" chỉ đăng bản tiếng Việt lên doscom.vn / noma.vn. Nhân sự phải viết + đăng lại thủ công bản tiếng Anh → tốn công, dễ lệch nội dung so với bản Việt. Cần cho phép **clone (dịch) 1 sản phẩm đã soạn sang tiếng Anh và đăng thẳng lên nomaauto.us** trong cùng một thao tác.

## What Changes

- Thêm **nomaauto.us** làm site đích thứ 3 cho menu "Đăng sản phẩm" (WordPress + WooCommerce, tái dùng nguyên pipeline `_wc.js`: `siteCreds`/`uploadMedia`/`createProduct`/`fetchCategories`). Thêm `SITE_URL.nomaauto = https://nomaauto.us` và bộ env `WC_NOMAAUTO_CK/CS/USER/APP_PWD`.
- **Endpoint mới `POST /api/products/translate`**: nhận object bài tiếng Việt đã generate (`primary_keyword`, `seo_title`, `short_description`, `long_html`, `meta_description`, `tags`, `image_placements` alt/caption) + `name` → Claude **dịch/clone sang tiếng Anh**, sinh **focus keyword tiếng Anh tự nhiên** đạt tiêu chí Rank Math, giữ nguyên cấu trúc H2/H3 và vị trí ảnh. Tái dùng `callClaude` (AI Gateway `doscom-erp`), **cache KV** (key gồm version + ngày VN), tôn trọng kill switch `USE_CLAUDE`. Không viết mới từ ảnh, không bịa số.
- **`GET /api/products/categories`**: cho phép `site=nomaauto` (kéo danh mục live từ nomaauto.us cho dropdown).
- **`POST /api/products/publish`**: thêm mục đăng nomaauto **độc lập** với site tiếng Việt. Khi body có cờ `nomaauto` (bật) + object `en` (bản tiếng Anh) + `category_id`/`image` cho nomaauto → đăng thêm 1 product tiếng Anh lên nomaauto.us. Product nomaauto chỉ dùng **đúng 1 ảnh không nền** (do người dùng đánh dấu), alt tiếng Anh, Rank Math focus keyword tiếng Anh, slug theo keyword EN, **không** chèn ảnh inline vào bài. Giữ nguyên bảo vệ token `X-Products-Token`.
- **UI `product-publisher.html`**: thêm **1 công tắc tùy chọn độc lập** "Đăng thêm lên nomaauto.us (bản tiếng Anh)" (KHÔNG phải đổi site switch). Bật/tắt tùy ý, chạy song song với lựa chọn doscom/noma/cả 2. Khi bật: hiện dropdown danh mục nomaauto.us + cho phép **đánh dấu ảnh không nền** dùng cho nomaauto; preview bản tiếng Anh trước khi đăng.
- Mặc định trạng thái `draft` (giữ nút "Đăng ngay"). Trả về link của các site đã đăng (kể cả nomaauto.us nếu bật).

**Breaking change: Không.** `site` cũ (`doscom`/`noma`/`both`) và body cũ vẫn chạy nguyên; nomaauto là nhánh tùy chọn thêm vào. Agent khác không bị ảnh hưởng (chỉ đụng nhánh `functions/api/products/*` + trang standalone).

## Capabilities

### New Capabilities
- `product-clone-en`: dịch/clone sản phẩm đã soạn sang tiếng Anh (endpoint `translate`, có cache KV + kill switch) và đăng lên site WooCommerce tiếng Anh nomaauto.us với đúng 1 ảnh không nền, qua 1 công tắc tùy chọn độc lập trên UI (mở rộng `categories`/`publish`).

### Modified Capabilities
<!-- Menu "Đăng sản phẩm" hiện chưa có spec riêng trong openspec/specs/ (xây ad-hoc), nên toàn bộ hành vi mới gom vào capability MỚI product-clone-en; không có capability cũ nào đổi requirement. -->

## Impact

- **Code:** `functions/api/products/_wc.js` (thêm SITE_URL.nomaauto), `functions/api/products/categories.js` (chấp nhận site=nomaauto), `functions/api/products/publish.js` (target nomaauto + content EN + categories 3 site), **mới** `functions/api/products/translate.js`, `product-publisher.html` (site switch "Cả 3 web" + dropdown + preview EN).
- **Env/secret (Cloudflare Pages, KHÔNG hard-code):** `WC_NOMAAUTO_CK`, `WC_NOMAAUTO_CS`, `WC_NOMAAUTO_USER`, `WC_NOMAAUTO_APP_PWD` — người dùng tự set qua `wrangler pages secret put`.
- **Bên ngoài:** website nomaauto.us cần bật WooCommerce REST + Application Password (giống doscom.vn/noma.vn).
- **Deploy:** `product-publisher.html` đã nằm trong deploy.yml copy list — không thêm file tĩnh mới. `_headers` no-cache đã có.
- **Test:** thêm case trong `tests/products.test.mjs` cho translate + publish target nomaauto.
- **Không** đổi schema D1, không thêm framework/build step.
