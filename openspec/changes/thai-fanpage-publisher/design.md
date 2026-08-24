## Context

CRM Doscom đã có sẵn ba mảnh cần cho việc này:

- **Sinh ảnh**: `functions/api/geo/generate-image.js` gọi Workers AI `@cf/black-forest-labs/flux-1-schnell`
  qua binding `AI` và gateway `doscom-erp`. Free tier ~10.000 neuron/ngày ≈ 5–6 ảnh.
- **Sinh chữ**: `_utils/claude.js` (Claude Haiku qua AI Gateway, có kill switch `USE_CLAUDE`),
  `_utils/ai-engines/` (Gemini, OpenAI) và `_utils/openai-chat.js` làm đường lui.
- **Nguồn sự thật về sản phẩm**: `noma-sku-specs.js` (17 SKU, có test khoá), `product-catalog.js`,
  `noma-brandcore.js` (luật thương hiệu, cấm từ tuyệt đối, claim xuất xứ).

Thiếu: đường đẩy bài lên Facebook Page, và một vòng đời hàng đợi riêng cho kênh mạng xã hội Thái.

Ràng buộc quan trọng:

- `crm-doscom.pages.dev` nằm sau **Cloudflare Access**. Mọi lời gọi máy-với-máy (cron) bị chặn ở
  tầng Access trước khi tới function — đúng vết đã xảy ra với `/api/noma350/*` và `/api/health/keys`.
- Red line dự án: endpoint ghi dữ liệu phải có token; không hard-code secret; không đổi schema D1
  trực tiếp; 1 agent không đọc DB của agent khác.
- `FB_ACCESS_TOKEN` hiện có là token **quảng cáo**, không đăng bài Page được.

## Goals / Non-Goals

**Goals:**
- Mỗi ngày, đúng giờ đã cài, hai fanpage Thái có sẵn bài + ảnh nằm chờ trong CRM.
- Người dùng chọn chính xác **sản phẩm chính + sản phẩm bán kèm**, AI viết theo đúng cặp đó.
- Người dùng xem, sửa, rồi **tự bấm đăng**; đăng là hành động của người, không phải của máy.
- Tái dùng tối đa module đã có, không dựng lại đường sinh ảnh/gọi AI thứ hai.

**Non-Goals:**
- KHÔNG tự động đăng thẳng lên fanpage. Không làm nút "bật auto-post" ở giai đoạn này.
- KHÔNG quản lý bình luận, tin nhắn, hay chỉ số tương tác của fanpage.
- KHÔNG đụng vào agent-geo, WordPress, hay bảng `geo_content_queue`.
- KHÔNG làm bản tiếng Việt/Anh cho kênh này — chỉ tiếng Thái.
- KHÔNG đăng Instagram / TikTok ở change này.

## Decisions

### D1: Bảng D1 riêng, không dùng lại `geo_content_queue`

Vòng đời giống nhau về hình dạng (sinh → chờ duyệt → đăng) nhưng khác bản chất: agent-geo phục vụ
bài SEO dài trên WordPress, có slug/schema JSON-LD/internal link, và được lái bởi phân tích lỗ hổng
GEO. Bài fanpage là caption ngắn tiếng Thái, gắn với cặp SKU và một fanpage cụ thể.

Nhét chung bảng sẽ làm cột của cả hai bên phình ra và vi phạm red line "1 agent không tự ý đọc DB
của agent khác". Chọn `migrations/0020_thai_social.sql` với hai bảng mới:

- `thai_pages(page_id PK, name, page_token, active, post_hour_vn, weekdays, default_sku_main, default_sku_addon, created_at, updated_at)`
- `thai_post_queue(id PK, page_id FK, vn_date, sku_main, sku_addon, caption_th, image_base64, image_prompt, status, fb_post_id, last_error, cost_usd, created_at, updated_at)`

*Đã cân nhắc*: thêm cột `channel` vào `geo_content_queue` — bỏ vì kéo agent-geo vào một thay đổi
nó không cần, và làm mọi truy vấn GEO phải nhớ lọc thêm điều kiện.

### D2: Cron chỉ SINH, người mới ĐĂNG — tách hẳn hai endpoint

`POST /api/thai-social/schedule/run` (cron gọi) chỉ tạo bài và sinh nội dung.
`POST /api/thai-social/publish` (người bấm) mới gọi Graph API.

Lý do: bài sai lên fanpage thật không hoàn tác được từ CRM, phải vào Facebook xoá tay. Tách hai
endpoint khiến "tự đăng" không phải là thứ vô tình bật được — muốn có phải viết code mới.

*Đã cân nhắc*: một endpoint `run` có cờ `auto_publish` — bỏ vì một biến môi trường đặt nhầm là
bài chưa duyệt lên thẳng fanpage.

### D3: Chống sinh trùng bằng khoá `(page_id, vn_date)`

Cron có thể chạy lại (retry, bấm tay, hai nhịp trùng giờ). Đặt UNIQUE trên
`(page_id, vn_date, source='schedule')` để lần chạy thứ hai trong ngày rơi vào nhánh "skipped"
thay vì đốt thêm một lượt Flux + một lượt Claude.

Ngày tính theo **giờ Việt Nam (UTC+7)** cho khớp cách toàn bộ CRM đang quy ngày.

### D4: Cron đi qua Cloudflare Access bằng service token

Worker `doscom-cron` gọi endpoint kèm cặp header `CF-Access-Client-Id` / `CF-Access-Client-Secret`
(service token đã có sẵn, dùng cho runner refresh), **cộng thêm** `X-Thai-Token` của chính
endpoint. Access là cổng ngoài, token endpoint là cổng trong — thiếu cổng trong thì ai lọt qua
Access cũng ghi được dữ liệu.

*Đã cân nhắc*: bypass Access theo đường dẫn `/api/thai-social/*` — bỏ vì nó mở endpoint ghi ra
Internet, chỉ còn `X-Thai-Token` che.

### D5: Ảnh lưu base64 trong D1, xoá sau khi đăng

Giống cách agent-geo làm với `image_base64`: giữ tạm để user xem trước và sửa, xoá ngay sau khi
publish thành công để D1 không phình. Graph API `/photos` nhận ảnh dạng multipart bytes nên không
cần ảnh có URL công khai.

*Đã cân nhắc*: đẩy ảnh lên R2 lấy URL rồi truyền `url` cho Graph API — bỏ vì thêm một binding và
một vòng đời file phải dọn, trong khi ảnh chỉ sống vài giờ.

### D6: Prompt tiếng Thái viết riêng, không tái dùng `_translate.js`

`_translate.js` cứng cho Việt→Anh và cho sản phẩm WooCommerce (`long_html`, `seo_title`,
`primary_keyword`). Caption fanpage cần thứ khác hẳn: ngắn, có hook, có CTA, emoji tiết chế,
tiếng Thái tự nhiên chứ không phải dịch máy từ tiếng Việt.

Viết prompt riêng trong `functions/api/thai-social/_prompt.js`, nạp thông số SKU từ
`noma-sku-specs.js` và luật thương hiệu từ `noma-brandcore.js` vào system prompt, yêu cầu model
trả JSON `{ caption_th, image_prompt, hashtags }`.

Giữ tính deterministic theo red line: temperature thấp, không cho model tự chèn emoji ngẫu nhiên —
danh sách emoji cho phép nằm trong prompt.

### D7: Cache KV theo `(sku_main, sku_addon, vn_date, page_id)`

Red line: mode AI tốn tiền phải cache KV. Bấm "Sinh lại" nhiều lần trong ngày với cùng cặp SKU
trả kết quả cũ, trừ khi user bấm "Ép làm mới" (`force=true`) — giống cách agent-fb-ai đang làm.

### D8: Giao diện là file HTML tĩnh riêng, nhúng iframe

`thai-social.html` + một dòng `lazyFrame('thai-social','thai-social-frame','/thai-social')` trong
`index.html`, đúng khuôn `product-publisher`. Không thêm framework, không thêm build step —
theo đúng rule tech stack.

Nhớ thêm file vào **cả `scripts/build-dist.sh`** (dùng chung cho `deploy.yml` và `refresh-data.yml`),
nếu không trang sẽ 404 trên bản deploy đi bằng đường refresh.

## Risks / Trade-offs

- **Chưa có Page Access Token → nút "Đăng" chết** → Làm phần sinh trước và cho chạy độc lập;
  UI hiện rõ trạng thái token của từng page (`token_status`) thay vì để user bấm rồi mới thấy lỗi.
- **Page token hết hạn im lặng, bài không lên mà tưởng đã lên** → Chỉ chuyển status `published`
  khi Graph API trả về `fb_post_id` thật; lỗi thì giữ nguyên status và ghi `last_error` hiện lên UI.
  Đây đúng bài học từ sự cố lệch `NOMA911_INGEST_TOKEN`: stats trả 200 mà đơn không về.
- **Cron sinh trùng, đốt credit AI** → UNIQUE `(page_id, vn_date, source)` + cache KV (D3, D7).
- **AI bịa thông số sản phẩm tiếng Thái mà người Việt đọc không phát hiện** → Thông số chỉ lấy từ
  `noma-sku-specs.js`; prompt cấm thêm con số không có trong input; bắt buộc qua `pending_review`.
  Cân nhắc thêm bước dịch ngược Thái→Việt hiển thị cạnh caption để người duyệt đọc hiểu.
- **Free tier Flux hết lượt giữa ngày** → 2 page × 1 ảnh = 2/ngày, còn xa mức 5–6. Nhưng dùng chung
  quota với agent-geo, nên khi hết phải báo lỗi rõ "hết free tier", không im lặng trả bài thiếu ảnh.
- **Access chặn cron** → D4. Kiểm bằng một lượt gọi thật sau khi deploy, không tin vào việc nó phải chạy.

## Migration Plan

1. Chạy `/opsx:apply` để sinh code theo `tasks.md`.
2. Áp migration bằng `wrangler d1 migrations apply` — **KHÔNG** chạy tay
   `d1 execute --file`, cách đó từng làm pipeline kẹt vĩnh viễn mà deploy vẫn báo xanh.
3. Đặt secret: `wrangler pages secret put THAI_SOCIAL_TOKEN --project-name crm-doscom`.
4. Nhập 2 fanpage qua UI (chưa cần token) → kiểm phần sinh bài chạy đúng.
5. Khi có Page Access Token: nhập vào từng page, thử đăng 1 bài lên page ít người theo dõi trước.
6. Bật nhịp cron trong `cron-worker/` sau khi bước 4 chạy ổn ít nhất 1 ngày.

**Rollback**: tắt `active` của cả hai page trong `thai_pages` là toàn bộ lịch dừng; bảng và
endpoint để nguyên, không ảnh hưởng phần nào khác của CRM.

## Open Questions

- Page Access Token của 2 fanpage lấy từ FB App nào? Có sẵn app có quyền `pages_manage_posts` chưa,
  hay phải tạo app mới và chờ Facebook duyệt quyền?
- Có cần hiển thị bản dịch ngược Thái→Việt cạnh caption để người duyệt đọc hiểu không? (tốn thêm
  1 lượt gọi AI mỗi bài)
- Một ngày một bài mỗi page là đủ, hay cần nhiều khung giờ trong ngày?
- Ảnh nên là ảnh AI sinh hoàn toàn, hay ghép ảnh sản phẩm thật đã có trong repo landing với nền AI?
