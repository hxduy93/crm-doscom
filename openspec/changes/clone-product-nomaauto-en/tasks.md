## 1. Backend — site nomaauto + helper

- [ ] 1.1 `_wc.js`: thêm `nomaauto: "https://nomaauto.us"` vào `SITE_URL` (siteCreds tự đọc `WC_NOMAAUTO_*` nhờ pattern `WC_<UPPER>_*` — không cần sửa siteCreds/isConfigured).
- [ ] 1.2 `categories.js`: cho phép `site=nomaauto` (mở rộng điều kiện kiểm tra site hợp lệ + thông báo lỗi kèm nomaauto).

## 2. Backend — endpoint translate

- [ ] 2.1 Tạo `functions/api/products/translate.js`: `onRequestPost` nhận `{ name, source:{primary_keyword,seo_title,short_description,long_html,meta_description,tags,image_placements}, regenerate? }`. Kill switch `USE_CLAUDE=false` → 503. Thiếu `source.long_html` → 400.
- [ ] 2.2 System prompt tiếng Anh: dịch tự nhiên; sinh **focus keyword tiếng Anh** tự nhiên đạt Rank Math (40% đầu title, trong meta, câu đầu long_html, ≥1 `<h2>`, đoạn kết); giữ nguyên cấu trúc H2/H3 và số phần tử `image_placements` (chỉ dịch alt/caption, giữ index/role, đặt `after_heading` = đúng text H2 tiếng Anh); HTML dùng nháy đơn; KHÔNG bịa số; trả JSON đúng schema (thêm `name` tiếng Anh).
- [ ] 2.3 Gọi `callClaude(env, {model:"haiku", systemPrompt, userPrompt, jsonOutput:true})`; retry 1 lần khi parse lỗi (như generate.js); chuẩn hoá field trả về (fallback `deriveKeyword` cho keyword EN nếu rỗng).
- [ ] 2.4 Cache KV `INVENTORY` key `prodtrans:v1:${slugify(name)}:${sourceHash}:${dateVN}`; `regenerate:true` bỏ cache; trả `{ ok, translated, cached?, cost_usd }`.

## 3. Backend — publish target nomaauto

- [ ] 3.1 `publish.js`: `targets` map `both`→[doscom,noma], thêm `all`→[doscom,noma,nomaauto]; chấp nhận `site` = doscom|noma|nomaauto|both|all. Validate site.
- [ ] 3.2 `publishToSite`: nhận `content` nguồn (VN = data cho doscom/noma; = `data.en` cho nomaauto). Với nomaauto dùng `en.name/seo_title/short_description/long_html/meta_description/tags/primary_keyword/image_placements`; ảnh `data.images` upload lại vào WP Media nomaauto với alt/caption tiếng Anh.
- [ ] 3.3 Target gồm nomaauto mà thiếu `data.en` → chỉ site nomaauto trả `{ ok:false, error:"thiếu bản tiếng Anh" }`, không chặn site VN. Giữ nguyên bảo vệ token `X-Products-Token`. `category_id` cho nomaauto lấy từ `body.categories.nomaauto`.

## 4. Frontend — product-publisher.html

- [ ] 4.1 Thêm nút `data-site="all"` ("Cả 3 web") vào `#siteSwitch`; `loadSite('all')` set `csite='doscom'`, hiện dropdown danh mục thứ 3 (`catSel3`) nạp từ `categories?site=nomaauto`; cập nhật banner/nhãn nút publish.
- [ ] 4.2 Bước publish khi site=all: nếu chưa có bản EN thì gọi `/api/products/translate` (truyền `state.gen` làm source), lưu `state.en`; render preview bản tiếng Anh (tái dùng renderResult với nguồn en).
- [ ] 4.3 Gửi publish `{ site:'all', categories:{doscom,noma,nomaauto}, en:state.en, ...field VN }`; hiển thị 3 link kết quả (2 VN + nomaauto.us EN). Giữ nguyên luồng token 401 → nhập token.

## 5. Test + kiểm

- [ ] 5.1 `tests/products.test.mjs`: test translate — schema trả về đúng field, giữ số `image_placements`, keyword không rỗng, xử lý `USE_CLAUDE=false` (mock/skip AI như test hiện có).
- [ ] 5.2 Test publish target nomaauto: `site=all` map đúng 3 target; thiếu `en` → nomaauto fail nhưng VN ok; `categories.nomaauto` được dùng.
- [ ] 5.3 Chạy `node --test tests/` tới khi XANH toàn bộ; sửa nếu đỏ.

## 6. Bàn giao (ngoài code)

- [ ] 6.1 Ghi chú người dùng set 4 secret `WC_NOMAAUTO_CK/CS/USER/APP_PWD` (`npx wrangler pages secret put <NAME> --project-name crm-doscom`) + bật WooCommerce REST/Application Password trên nomaauto.us, rồi redeploy.
