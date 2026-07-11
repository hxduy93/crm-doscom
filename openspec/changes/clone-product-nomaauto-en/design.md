## Context

Menu "Đăng sản phẩm" (functions/api/products/*) đã đăng product WooCommerce lên doscom.vn / noma.vn / cả 2, với flow **generate (Claude vision → bài VN) → preview → publish**. `_wc.js` đã trừu tượng hoá site qua `siteCreds()` đọc `WC_<SITE>_*` + `SITE_URL` map, và `publish.js` đã lặp qua nhiều target. Nay thêm site thứ 3 **nomaauto.us** — cùng nền tảng WordPress + WooCommerce nhưng nội dung **tiếng Anh**. Ràng buộc: giữ RED LINES (secret qua env, Claude qua AI Gateway `doscom-erp` + `USE_CLAUDE`, mode AI tốn tiền cache KV, endpoint ghi có token, không bịa số), không thêm framework/build step, JS thuần ES module.

## Goals / Non-Goals

**Goals:**
- Thêm nomaauto.us làm target đăng, tái dùng tối đa `_wc.js` (không nhân bản logic upload/create).
- Sinh bản tiếng Anh bằng cách **dịch/clone** bài VN đã soạn (rẻ, trung thành với bản gốc), đạt Rank Math với focus keyword tiếng Anh tự nhiên.
- Kích hoạt qua 1 option "Cả 3 web" trên UI, preview được bản EN trước khi đăng.
- Tương thích ngược 100%: site cũ và body cũ không đổi hành vi.

**Non-Goals:**
- KHÔNG viết bài tiếng Anh mới từ ảnh (đã loại ở khâu chốt yêu cầu).
- KHÔNG đồng bộ giá/tồn kho ngược từ site này sang site kia.
- KHÔNG tự tạo danh mục trên nomaauto.us (chỉ chọn từ danh mục có sẵn).
- KHÔNG xử lý biến thể (variable product) — vẫn `type: "simple"` như hiện tại.

## Decisions

### 1. Bản tiếng Anh = dịch bài VN, không generate lại từ ảnh
Tái dùng chính xác object mà `generate.js` đã trả (`primary_keyword`, `seo_title`, `short_description`, `long_html`, `meta_description`, `tags`, `image_placements`). Endpoint `translate.js` gửi object này cho Claude (text-only, KHÔNG gửi lại ảnh → rẻ hơn vision) kèm system prompt yêu cầu: dịch tự nhiên, **sinh focus keyword tiếng Anh mới** (không dịch máy móc tên/model), giữ nguyên cấu trúc thẻ + số lượng `image_placements` (chỉ dịch alt/caption), giữ `index`/`after_heading`/`role`. `after_heading` phải khớp đúng chữ H2 tiếng Anh sau khi dịch → yêu cầu Claude trả `after_heading` = đúng text H2 đã dịch trong `long_html`.
- *Alternative:* generate lại bằng vision tiếng Anh → tốn credit gấp đôi, dễ lệch bản Việt. Loại.

### 2. `translate.js` là endpoint riêng (không gộp vào publish)
Đúng triết lý generate→preview→publish: client gọi `/translate` sau khi có bài VN, hiển thị bản EN cho nhân sự xem/sửa, rồi mới `/publish` gửi kèm object `en`. `translate` là **đọc-AI** (không ghi ra ngoài) nên KHÔNG cần token; publish (ghi) vẫn giữ token.
- *Alternative:* publish tự gọi translate nội bộ → mất bước preview, nhân sự không kiểm được bản Anh trước khi lên site thật. Loại.

### 3. Cache KV cho translate
Key: `prodtrans:v1:${slugify(name)}:${hash(sourceJSON)}:${dateVN}`. Dùng hash nội dung nguồn (độ dài + primary_keyword + seo_title) để cùng bài trong ngày không tốn credit; `regenerate:true` bỏ cache. Tái dùng cùng cơ chế `env.INVENTORY` như generate.js.

### 4. publish.js: mở rộng target, tách nội dung theo site
- `site` chấp nhận thêm `"nomaauto"` và một giá trị gộp cho "cả 3". Giữ `"both"` = doscom+noma. Thêm `"all"` = doscom+noma+nomaauto (map trong handler). `categories` mở rộng `{ doscom, noma, nomaauto }`.
- `publishToSite("nomaauto", ...)` dùng **object `en`** trong body làm nguồn nội dung (seo_title/short_description/long_html/meta_description/tags/primary_keyword/image_placements) thay cho các field VN top-level. Cụ thể: hàm `publishToSite` nhận thêm tham số `content` (mặc định = data cho site VN; = `data.en` cho nomaauto). Ảnh (`data.images`) DÙNG CHUNG nhưng **upload lại** vào WP Media của nomaauto (media ID theo site) với alt/caption lấy từ `en.image_placements`.
- Nếu target gồm nomaauto mà thiếu `data.en` → chỉ site nomaauto fail (`{ ok:false, error }`), site VN vẫn chạy (đúng pattern try/catch từng site hiện có).

### 5. UI "Cả 3 web"
Thêm nút `data-site="all"` vào `#siteSwitch`. `state` thêm `csite` khi all → vẫn dùng `doscom` để generate bản VN (brand chính). Khi chọn all: hiện dropdown danh mục thứ 3 (`catSel3`) kéo từ `categories?site=nomaauto`; ở bước publish, client (a) đảm bảo đã có bản EN — gọi `/translate` nếu chưa, (b) gửi `site:"all"`, `categories:{doscom,noma,nomaauto}`, `en:<bản EN>`, các field VN như cũ. Thêm khối preview EN (tái dùng renderResult với nguồn en) để nhân sự xem trước.

### 6. Ảnh dùng chung, upload theo site
Media ID không chia sẻ giữa các WP site → mỗi site upload riêng (đã đúng với doscom/noma hiện tại vì `publishToSite` upload trong vòng lặp từng site). nomaauto không phá vỡ điều này; chỉ khác alt/caption tiếng Anh. Ảnh đại diện (`role:"featured"`) vẫn xác định qua `en.image_placements`.

## Risks / Trade-offs

- **Claude dịch làm lệch `after_heading` ⇒ ảnh chèn sai chỗ** → Mitigation: `injectFigure` đã khớp gần đúng (substring, 30 ký tự đầu) và fallback nối cuối bài; prompt ép Claude trả `after_heading` = đúng text H2 tiếng Anh trong `long_html`. Không tìm thấy heading vẫn không crash.
- **Focus keyword EN dịch máy móc → Rank Math yếu** → Mitigation: prompt yêu cầu keyword tiếng Anh tự nhiên theo ngữ cảnh sản phẩm chăm sóc ô tô + fallback `deriveKeyword(name)` (đã có) để không bao giờ rỗng.
- **Chi phí gấp ~1.5x mỗi sản phẩm cả-3-web (generate VN + translate)** → Mitigation: translate là text-only (rẻ hơn vision nhiều) + cache KV theo ngày.
- **Chưa set `WC_NOMAAUTO_*`** → categories/publish nomaauto báo "chưa cấu hình" rõ ràng, không crash các site khác. Người dùng set secret sau (ngoài phạm vi code).
- **nomaauto.us chưa bật WooCommerce REST/App Password** → lỗi WC/WP trả nguyên message (đã có `.slice(0,300)`), nhân sự đọc được.

## Migration Plan

1. Merge code (thêm `translate.js`, sửa `_wc.js`/`categories.js`/`publish.js`/`product-publisher.html`) → deploy.yml đã copy product-publisher.html, `_headers` no-cache đã có.
2. Set 4 secret Pages: `WC_NOMAAUTO_CK/CS/USER/APP_PWD` (`npx wrangler pages secret put <NAME> --project-name crm-doscom`) → redeploy để bind.
3. Bật WooCommerce REST + tạo Application Password trên nomaauto.us (thao tác WordPress).
4. Rollback: option "Cả 3 web" chỉ là thêm; xoá secret / ẩn nút là quay lại hành vi cũ. Không migration dữ liệu.

## Open Questions

- Danh mục nomaauto.us có sẵn tương ứng brand Noma car-care hay chưa? (nếu trống, nhân sự tạo trước trên WP). Không chặn code.
- Có cần dịch cả **tên sản phẩm** (`name`) sang tiếng Anh cho nomaauto không, hay giữ tên gốc? Mặc định: dịch tên sang tiếng Anh trong object `en.name` (Claude trả), product name trên nomaauto = `en.name`.
