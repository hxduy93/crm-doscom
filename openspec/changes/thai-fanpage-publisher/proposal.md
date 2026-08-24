## Why

Doscom có 2 fanpage Facebook thị trường Thái Lan (**Noma Thailand** và **Doscom Thailand**)
đang phải viết bài và làm ảnh thủ công mỗi ngày. Trong khi đó CRM đã có sẵn gần đủ nguyên
liệu: sinh ảnh Flux qua Workers AI, gọi Claude/Gemini/OpenAI qua AI Gateway, hồ sơ 17 SKU và
Brand Core để AI không bịa thông số. Thiếu duy nhất một chỗ ghép chúng lại cho kênh Facebook
tiếng Thái, cộng với đường đẩy bài lên Page.

Làm bây giờ vì thị trường Thái đã chạy thật (landing `noma955.click`, menu "Thị trường Thái Lan"
đã có trong CRM) nhưng phần nội dung mạng xã hội vẫn hoàn toàn thủ công.

## What Changes

- Thêm menu **"Đăng fanpage Thái"** trên CRM (khuôn iframe giống menu "Đăng sản phẩm").
- Người dùng **chọn sản phẩm chính + sản phẩm bán kèm** cho từng bài; AI viết nội dung
  tiếng Thái và sinh ảnh dựa trên đúng 2 SKU đó, không tự chọn hộ.
- **Đặt lịch hằng ngày** theo từng fanpage: tới giờ đã cài, hệ thống tự sinh sẵn bài + ảnh
  và xếp vào hàng chờ ở trạng thái `pending_review`.
- Người dùng vào menu **xem, sửa chữ, đổi ảnh, rồi bấm "Đăng"** — không có đường tự động
  đăng thẳng lên Page. Đăng là hành động do người bấm.
- Đẩy bài lên Facebook Page qua Graph API (`/{page_id}/photos` khi có ảnh, `/{page_id}/feed`
  khi chỉ có chữ).
- Lưu cấu hình fanpage (page_id, token, múi giờ, giờ đăng) và hàng đợi bài vào D1 bằng
  **migration mới**, không đụng bảng của agent khác.
- Breaking change: **Không**. Toàn bộ là endpoint mới `/api/thai-social/*`, bảng D1 mới,
  file HTML mới. Không sửa hành vi của agent nào đang chạy.

## Capabilities

### New Capabilities
- `thai-social-publisher`: quản lý fanpage Thái, lịch sinh bài hằng ngày, hàng đợi bài
  (sinh → chờ duyệt → đã sửa → đã đăng), sinh nội dung tiếng Thái + ảnh theo cặp SKU do
  người dùng chọn, và đẩy bài lên Facebook Page qua Graph API.

### Modified Capabilities
<!-- Không có. agent-geo giữ nguyên: nó phục vụ bài SEO tiếng Việt/Anh trên WordPress,
     bảng D1 riêng, vòng đời riêng. Change này TÁI DÙNG các module dùng chung của nó
     (generate-image.js, _utils/claude.js, ai-engines/, noma-brandcore.js,
     noma-sku-specs.js, product-catalog.js) chứ không sửa yêu cầu của agent-geo.
     Theo red line "1 agent KHÔNG tự ý đọc DB của agent khác", capability mới dùng
     bảng D1 riêng thay vì ghi vào geo_content_queue. -->

## Impact

**Code mới**
- `functions/api/thai-social/*` — endpoint cấu hình page, lịch, hàng đợi, sinh bài, đăng.
- `thai-social.html` — giao diện, nhúng iframe từ `index.html` giống `product-publisher`.
- `migrations/0020_thai_social.sql` — bảng `thai_pages`, `thai_post_queue`.
- `cron-worker/` — thêm nhịp gọi endpoint sinh bài theo lịch.

**Tái dùng, không sửa**
- `functions/api/geo/generate-image.js` (Flux Schnell qua binding `AI`, gateway `doscom-erp`).
- `functions/api/geo/_utils/claude.js`, `_utils/ai-engines/`, `_utils/ai-usage.js`.
- `functions/api/geo/_utils/noma-brandcore.js`, `noma-sku-specs.js`, `product-catalog.js`.
- Mẫu gọi Graph API tham chiếu `post_to_page()` trong repo `fb-group-seeding-agent`.

**Phụ thuộc ngoài — CHẶN phần đăng**
- Cần **Page Access Token dài hạn** cho từng fanpage, quyền `pages_manage_posts` +
  `pages_read_engagement`. `FB_ACCESS_TOKEN` đang có là token quảng cáo (`ads_read`),
  KHÔNG đăng bài được. Chưa có token thì phần sinh ảnh + nội dung vẫn chạy đầy đủ,
  chỉ nút "Đăng" là chưa dùng được.

**Rủi ro cần chặn trong design**
- Cloudflare Access đứng trước `crm-doscom.pages.dev`: cron gọi endpoint sinh bài sẽ bị
  chặn ở tầng Access nếu không có bypass hoặc service token — đúng vết xe đổ của
  `/api/noma350/*` và `/api/health/keys`.
- Endpoint ghi dữ liệu phải có token theo red line dự án.
- Bài đăng nhầm lên fanpage thật không có nút hoàn tác trong CRM — nên vòng đời bắt buộc
  đi qua `pending_review`, không cho phép đường tắt sinh-xong-đăng-luôn.
