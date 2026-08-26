import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════════
   AGENT GEO ĐĂNG BÀI VÀO ĐÂU TRÊN noma.vn / doscom.vn

   Đo thật 25/08/2026: noma.vn có 139 danh mục cho 111 bài, trong đó 95 danh mục chỉ
   chứa ĐÚNG 1 bài và 5 danh mục rỗng. Nguyên nhân: publish-wp.js nhận tên danh mục do
   AI nghĩ ra, không tìm thấy thì TỰ TẠO — mỗi bài đẻ một danh mục riêng.
   Chủ dự án chốt: bài GEO viết vào mục "Tin tức".

   Cùng lượt đó: 45/111 bài có post_title RỖNG (trang thật hiện <title>- Noma</title>,
   <h1></h1>). WordPress nhận post_title="" không một tiếng kêu — nên phải chặn ở đây.
   ══════════════════════════════════════════════════════════════════════════════ */
const SRC = readFileSync(new URL("../functions/api/geo/publish-wp.js", import.meta.url), "utf8")
  .split("\r\n").join("\n");

test("bài GEO luôn vào mục Tin tức", () => {
  assert.match(SRC, /const GEO_DANH_MUC_SLUG = "tin-tuc";/);
  assert.match(SRC, /const tinTuc = await timDanhMucTheoSlug\(siteConfig, GEO_DANH_MUC_SLUG\);/);
});

test("KHÔNG tự tạo danh mục mới nữa", () => {
  /* Đây là dòng đã đẻ ra 95 danh mục một bài. Thêm lại là dựng lại đúng đống đó. */
  const trongResolve = SRC.slice(SRC.indexOf("async function resolveCategories"), SRC.indexOf("async function resolveTags"));
  assert.ok(!/method:\s*"POST"/.test(trongResolve),
    "resolveCategories không được POST tạo danh mục nữa — chỉ nhận danh mục CÓ SẴN");
  assert.match(trongResolve, /chỉ nhận cái ĐÃ TỒN TẠI, tuyệt đối không tạo mới/);
});

test("tiêu đề rỗng thì TỪ CHỐI đăng, không đẩy bài trống lên web", () => {
  assert.match(SRC, /if \(!String\(finalTitle \|\| ""\)\.trim\(\)\) \{/);
  const iGuard = SRC.indexOf('if (!String(finalTitle || "").trim())');
  const iPost = SRC.indexOf("const post = await createPost(siteConfig, postPayload)");
  assert.ok(iGuard > 0 && iPost > iGuard, "phải chặn TRƯỚC khi tạo bài");
  // Ghi lại lý do vào hàng đợi để còn biết bài nào bị chặn, không nuốt lỗi.
  assert.match(SRC, /status='failed', last_error=\?/);
});
