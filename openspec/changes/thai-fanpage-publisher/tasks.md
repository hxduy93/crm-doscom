## 1. Nền dữ liệu

- [x] 1.1 Viết `migrations/0020_thai_social.sql`: bảng `thai_pages` và `thai_post_queue` theo đúng cột ở design D1, kèm UNIQUE `(page_id, vn_date, source)` chống sinh trùng
- [ ] 1.2 Áp migration bằng `wrangler d1 migrations apply crm-doscom-db` (KHÔNG dùng `d1 execute --file`)
- [x] 1.3 Thêm secret `THAI_SOCIAL_TOKEN` bằng `wrangler pages secret put`, ghi tên biến vào phần chú thích secret trong `wrangler.toml`

## 2. Cấu hình fanpage

- [x] 2.1 Viết `functions/api/thai-social/pages.js`: `onRequestGet` trả danh sách page kèm `token_status`, tuyệt đối không trả `page_token`
- [x] 2.2 Thêm `onRequestPost` cho `pages.js`: thêm/sửa page, bắt buộc header `X-Thai-Token`, trả 401 khi sai
- [x] 2.3 Viết test `tests/thai-social.test.mjs`: khoá lại việc `page_token` không rò ra response và endpoint ghi từ chối khi thiếu token

## 3. Sinh nội dung và ảnh

- [x] 3.1 Viết `functions/api/thai-social/_prompt.js`: dựng system prompt tiếng Thái từ `noma-sku-specs.js` + `noma-brandcore.js`, nhận `sku_main` + `sku_addon`, yêu cầu trả JSON `{ caption_th, image_prompt, hashtags }`
- [x] 3.2 Viết `functions/api/thai-social/generate.js`: gọi AI qua `_utils/claude.js` (giữ kill switch `USE_CLAUDE`), trả 400 `unknown_sku` khi SKU không có trong hồ sơ
- [x] 3.3 Thêm cache KV theo khoá `(page_id, sku_main, sku_addon, vn_date)` + cờ `force=true` để ép làm mới
- [x] 3.4 Nối phần sinh ảnh: tái dùng đường Flux của `functions/api/geo/generate-image.js`, ghi cost vào `thai_post_queue`
- [x] 3.5 Xử lý nhánh thiếu binding `AI` / hết free tier: vẫn lưu caption, đánh dấu bài thiếu ảnh, trả lỗi nói rõ nguyên nhân
- [x] 3.6 Viết test `tests/thai-social.test.mjs`: khoá `unknown_sku`, khoá cache không gọi AI lần hai, khoá việc thiếu ảnh không bị báo là thành công

## 4. Hàng đợi và duyệt bài

- [x] 4.1 Viết `functions/api/thai-social/queue.js`: `onRequestGet` liệt kê bài theo `page_id` + khoảng ngày
- [x] 4.2 Viết `functions/api/thai-social/queue/[id].js`: `PATCH` sửa caption/đổi ảnh/đổi cặp SKU (chuyển status `edited`), `DELETE` chuyển status `discarded`
- [x] 4.3 Viết test `tests/thai-social.test.mjs`: khoá chuyển trạng thái đúng vòng đời, không cho sửa bài đã `published`

## 5. Đăng lên Facebook Page

- [x] 5.1 Viết `functions/api/thai-social/_graph.js`: hàm đăng Page qua `/{page_id}/photos` (có ảnh) và `/{page_id}/feed` (chỉ chữ), tham chiếu `post_to_page()` của repo `fb-group-seeding-agent`
- [x] 5.2 Viết `functions/api/thai-social/publish.js`: bắt buộc `X-Thai-Token`, chỉ nhận bài `pending_review`/`edited`, lưu `fb_post_id`, chuyển `published`, xoá `image_base64`
- [x] 5.3 Xử lý lỗi: 409 `already_published`; token thiếu/hết hạn thì giữ nguyên status và ghi `last_error`; lỗi Graph khác thì cũng giữ status, KHÔNG tự retry vòng lặp
- [x] 5.4 Viết test `tests/thai-social.test.mjs`: khoá việc chỉ `published` khi có `fb_post_id` thật, khoá 409, khoá không có đường đăng nào ngoài endpoint này

## 6. Lịch hằng ngày

- [x] 6.1 Viết `functions/api/thai-social/schedule/run.js`: duyệt page `active`, so giờ + thứ theo giờ VN, tạo bài rồi gọi phần sinh; trả `{ created: [...], skipped: [...] }`
- [x] 6.2 Khoá cứng: endpoint lịch KHÔNG được gọi tới `_graph.js`; thêm test khẳng định điều đó
- [ ] 6.3 Thêm nhịp gọi trong `cron-worker/src`, kèm header `CF-Access-Client-Id` / `CF-Access-Client-Secret` + `X-Thai-Token`
- [ ] 6.4 **ĐÃ THỬ 24/08/2026 — BỊ CHẶN THẬT.** Service token đi lọt `/api/refresh/next` (200)
      nhưng `/api/thai-social/skus` trả 302 kèm `service_token_status:false`. Chính sách
      Cloudflare Access đang giới hạn theo ĐƯỜNG DẪN → phải thêm `/api/thai-social/*` vào
      policy service token thì cron mới gọi được. Giao diện trên trình duyệt KHÔNG ảnh hưởng
      (người dùng vẫn đăng nhập Access như thường).

## 7. Giao diện

- [x] 7.1 Viết `thai-social.html`: ô chọn fanpage, ô chọn sản phẩm chính, ô chọn sản phẩm bán kèm, nút "Sinh bài", nút "Ép làm mới"
- [x] 7.2 Thêm màn duyệt: xem ảnh, sửa caption, nút "Đăng", hiện `token_status` của page và `last_error` của bài
- [x] 7.3 Thêm màn cài lịch: giờ đăng trong ngày, các thứ chạy, cặp SKU mặc định cho từng page
- [x] 7.4 Thêm nút menu + `lazyFrame('thai-social',...)` vào `index.html`, thêm tiêu đề vào bảng `TITLES`
- [x] 7.5 Thêm `thai-social.html` vào `scripts/build-dist.sh` (dùng chung cho `deploy.yml` và `refresh-data.yml`)

## 8. Chốt

- [x] 8.1 Chạy `node --test tests/*.mjs` — phải xanh toàn bộ trước khi giao
- [x] 8.2 **ĐÃ NẠP 5 ẢNH 24/08/2026.** 911, 922, 310, 250 (dung dịch NOMA) + D1 (máy dò).
      Ảnh D1 có chữ TIẾNG VIỆT in sẵn → có cảnh báo trên UI, nên thay bản không chữ.
      Chưa nạp DR4 Pro: không có hồ sơ trong noma-sku-specs.js lẫn product-catalog.js.
- [x] 8.5 **Kiểm ảnh lên Facebook 24/08/2026:** gửi 911.png dạng multipart, bài ẩn →
      Facebook nhận, sinh 6 bản resize (561×560), xoá xong, feed sạch.
- [x] 8.3 **ĐÃ KIỂM 24/08/2026 — THÔNG.** System user token (app "Đăng bài tự động", ID
      28516518767940939) có `pages_manage_posts`, không hết hạn. Page token của CẢ HAI page
      cũng không hết hạn. Kiểm bằng bài ẨN (`published=false`) trên từng page: Facebook trả
      id thật rồi xoá ngay, soát lại feed không còn bài kiểm thử. Hai page đã nhập vào D1.
- [ ] 8.4 Chạy `/opsx:sync` để đưa spec `thai-social-publisher` vào `openspec/specs/`, rồi `/opsx:archive`
