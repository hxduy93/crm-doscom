import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  STATUS, PUBLISHABLE, publicPage, publicPost, tokenStatus,
  vnDate, vnHour, vnWeekday, parseWeekdays, requireToken,
} from "../functions/api/thai-social/_lib.js";
import { classifyGraphError } from "../functions/api/thai-social/_graph.js";
import { buildSystemPrompt, buildUserPrompt, buildImagePrompt, ANGLES } from "../functions/api/thai-social/_prompt.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

/* ── 1. Bí mật không được rò ra client ──────────────────────────────────────
   page_token là thứ đăng được bài lên fanpage thật. Lọt ra response là ai mở
   DevTools cũng đăng được. */

test("publicPage KHÔNG bao giờ trả page_token", () => {
  const row = {
    page_id: "1", name: "Noma Thailand", page_token: "EAABsecret", token_expires_at: 0,
    active: 1, post_hour_vn: 8, weekdays: "1,2,3", default_sku_main: "350", default_sku_addon: null,
  };
  const out = publicPage(row, 1000);
  assert.equal(out.page_token, undefined);
  assert.doesNotMatch(JSON.stringify(out), /EAABsecret/);
  assert.equal(out.token_status, "ok");
});

test("token hết hạn phải báo expired, không im lặng coi là ok", () => {
  assert.equal(tokenStatus({ page_token: "x", token_expires_at: 500 }, 1000), "expired");
  assert.equal(tokenStatus({ page_token: "x", token_expires_at: 5000 }, 1000), "ok");
  assert.equal(tokenStatus({ page_token: null }, 1000), "missing");
  assert.equal(tokenStatus({ page_token: "x", token_expires_at: 0 }, 1000), "ok", "0 = không hết hạn");
});

test("endpoint ghi từ chối khi thiếu/sai X-Thai-Token", async () => {
  const env = { THAI_SOCIAL_TOKEN: "dung" };
  const mk = (h) => new Request("https://x/api", { method: "POST", headers: h });

  assert.equal(requireToken(mk({}), env).status, 401);
  assert.equal(requireToken(mk({ "X-Thai-Token": "sai" }), env).status, 401);
  assert.equal(requireToken(mk({ "X-Thai-Token": "dung" }), env), null);

  // Server chưa đặt secret → 500, KHÔNG được mặc định cho qua.
  assert.equal(requireToken(mk({ "X-Thai-Token": "" }), {}).status, 500);
});

test("publicPost bỏ ảnh base64 trừ khi xin rõ", () => {
  const row = { id: 1, page_id: "p", vn_date: "2026-08-24", source: "manual", sku_main: "350",
    caption_th: "x", hashtags: '["a"]', image_base64: "AAA", status: STATUS.REVIEW, updated_at: 1 };
  assert.equal(publicPost(row).image_base64, undefined);
  assert.equal(publicPost(row).has_image, true);
  assert.equal(publicPost(row, { withImage: true }).image_base64, "AAA");
});

/* ── 2. Quy ngày theo giờ Việt Nam ──────────────────────────────────────────
   Cả CRM quy ngày theo UTC+7. Lệch múi giờ ở đây là lịch chạy sai giờ và
   khoá chống-sinh-trùng rơi nhầm ngày. */

test("vnDate/vnHour/vnWeekday theo đúng UTC+7", () => {
  // 2026-08-24T17:30:00Z = 00:30 ngày 25/08 giờ VN (25/08/2026 là thứ Ba → ISO 2)
  const t = Date.UTC(2026, 7, 24, 17, 30) / 1000;
  assert.equal(vnDate(t), "2026-08-25");
  assert.equal(vnHour(t), 0);
  assert.equal(vnWeekday(t), 2);

  // 2026-08-23 là Chủ nhật → ISO 7
  assert.equal(vnWeekday(Date.UTC(2026, 7, 23, 5, 0) / 1000), 7);
});

test("parseWeekdays chỉ nhận 1..7", () => {
  assert.deepEqual(parseWeekdays("1,2,3,4,5,6"), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(parseWeekdays("0,8,3"), [3], "0 và 8 không phải thứ hợp lệ");
  assert.deepEqual(parseWeekdays(""), []);
});

/* ── 3. Chỉ MỘT đường đăng bài ──────────────────────────────────────────────
   Bài sai lên fanpage thật không hoàn tác được từ CRM. Cron chỉ được SINH.
   Test này là chốt an toàn quan trọng nhất của cả tính năng. */

test("chỉ publish.js được gọi Graph API — cron và generate thì KHÔNG", () => {
  // Bắt đúng câu IMPORT, không bắt chữ "_graph.js" trong comment — nếu không
  // thì chính dòng chú thích "tuyệt đối không import _graph.js" lại làm test đỏ.
  const graphImport = /^[ \t]*import[^\r\n]*from\s+["'][^"']*_graph\.js["']/m;

  assert.match(read("../functions/api/thai-social/publish.js"), graphImport,
    "publish.js phải là nơi gọi Graph API");

  assert.doesNotMatch(read("../functions/api/thai-social/schedule/run.js"), graphImport,
    "endpoint LỊCH không được import _graph.js — lịch chỉ sinh bài, không đăng");

  assert.doesNotMatch(read("../functions/api/thai-social/generate.js"), graphImport,
    "generate.js không được import _graph.js");

  // pages.js có dùng verifyPageToken (chỉ ĐỌC tên page), nhưng không được đăng bài.
  assert.doesNotMatch(read("../functions/api/thai-social/pages.js"), /postToPage/,
    "pages.js chỉ được kiểm token, không được đăng bài");
});

test("chỉ bài pending_review/edited mới được đăng", () => {
  assert.deepEqual(PUBLISHABLE, [STATUS.REVIEW, STATUS.EDITED]);
  assert.ok(!PUBLISHABLE.includes(STATUS.PUBLISHED), "bài đã đăng không được đăng lại");
  assert.ok(!PUBLISHABLE.includes(STATUS.DISCARDED), "bài đã bỏ không được đăng");
});

test("publish chỉ đánh dấu published KHI có fb_post_id thật", () => {
  const src = read("../functions/api/thai-social/publish.js");
  assert.match(src, /if \(!result \|\| !result\.fb_post_id\)/,
    "phải kiểm fb_post_id trước khi đổi status");
  // Đúng bài học lệch NOMA911_INGEST_TOKEN: trả 200 mà việc không hề xảy ra.
  const idxCheck = src.indexOf("!result.fb_post_id");
  const idxSet = src.indexOf("SET status = ?, fb_post_id = ?");
  assert.ok(idxCheck > -1 && idxSet > idxCheck, "kiểm id phải nằm TRƯỚC câu UPDATE published");
});

test("lỗi Graph không tự retry vòng lặp", () => {
  const src = read("../functions/api/thai-social/publish.js");
  assert.doesNotMatch(src, /for \(let i = 0|while \(/, "không được có vòng lặp retry trong publish");
});

/* ── 4. Phân loại lỗi Facebook ──────────────────────────────────────────── */

test("lỗi token của Facebook được nhận ra để bảo user đi cấp lại", () => {
  assert.equal(classifyGraphError({ code: 190 }), "token");
  assert.equal(classifyGraphError({ code: 102 }), "token");
  assert.equal(classifyGraphError({ code: 1, error_subcode: 463 }), "token");
  assert.equal(classifyGraphError({ code: 200 }), "permission");
  assert.equal(classifyGraphError({ code: 4 }), "rate_limit");
  assert.equal(classifyGraphError({ code: 999 }), "other");
});

/* ── 5. Prompt: chống bịa và giữ deterministic ──────────────────────────── */

test("prompt cấm bịa số liệu và ràng nguồn về hồ sơ SKU", () => {
  const sys = buildSystemPrompt();
  assert.match(sys, /THÔNG SỐ CHUẨN/);
  assert.match(sys, /KHÔNG thêm con số/);
  assert.match(sys, /TIẾNG THÁI/);
});

test("prompt xin luôn bản dịch ngược tiếng Việt để người duyệt đọc được", () => {
  // Không có caption_vi thì bước "duyệt" chỉ là bấm nút cho có.
  assert.match(buildSystemPrompt(), /caption_vi/);
});

test("emoji bị khoá vào danh sách cho phép — không để model tự nghĩ", () => {
  const sys = buildSystemPrompt();
  assert.match(sys, /chỉ được dùng trong tập này/);
  assert.match(sys, /KHÔNG tự nghĩ emoji khác/);
});

test("không có giá thì prompt KHÔNG được nhắc giá", () => {
  const noPrice = buildUserPrompt({ mainBlock: "x", mainName: "NOMA 350", angle: "combo" });
  assert.doesNotMatch(noPrice, /GIÁ \(/, "thiếu giá thì không được dựng dòng GIÁ");

  const withPrice = buildUserPrompt({ mainBlock: "x", mainName: "NOMA 350", angle: "combo", thbMain: 290 });
  assert.match(withPrice, /290 บาท/);
});

test("bài một sản phẩm không được nhắc sản phẩm bán kèm", () => {
  const one = buildUserPrompt({ mainBlock: "x", mainName: "NOMA 350", angle: "combo" });
  assert.match(one, /chỉ nói về MỘT sản phẩm/);
  const two = buildUserPrompt({ mainBlock: "x", mainName: "NOMA 350", addonBlock: "y", addonName: "NOMA 911", angle: "combo" });
  assert.match(two, /nhắc CẢ HAI sản phẩm/);
});

test("góc bán hàng lạ rơi về mặc định, không làm gãy prompt", () => {
  const p = buildUserPrompt({ mainBlock: "x", mainName: "N", angle: "khong-co-that" });
  assert.match(p, new RegExp(ANGLES.combo.slice(0, 20)));
});

test("prompt ảnh cấm vẽ chữ — Flux viết nhãn luôn sai", () => {
  const p = buildImagePrompt("a car wheel");
  assert.match(p, /no text/);
  assert.match(p, /no label writing/);
});

/* ── 6. Ảnh: thư viện trước, Flux sau, thiếu thì phải nói ───────────────── */

test("có ảnh thật thì Flux chỉ sinh NỀN, không vẽ lại sản phẩm", async () => {
  const { buildArtwork } = await import("../functions/api/thai-social/_image.js");
  let prompt = null;
  const env = { AI: { run: async (_m, inp) => { prompt = inp.prompt; return { image: "BG" }; } } };
  const r = await buildArtwork(env, { skuMain: "911", images: { 911: "/sku-images/911.png" }, angle: "combo" });

  assert.equal(r.image_url, "/sku-images/911.png", "sản phẩm vẫn lấy ảnh thật");
  assert.equal(r.bg_base64, "BG", "Flux sinh nền");
  assert.equal(r.image_base64, null, "ảnh ghép do trình duyệt dựng, server chưa có");
  assert.ok(prompt.includes("NO bottle"), "prompt phải cấm Flux vẽ chai — nhãn nó vẽ luôn sai");
});

test("Flux hỏng nhưng có ảnh sản phẩm → vẫn giữ bài, chỉ báo thiếu nền", async () => {
  const { buildArtwork } = await import("../functions/api/thai-social/_image.js");
  const r = await buildArtwork({}, { skuMain: "911", images: { 911: "/sku-images/911.png" }, angle: "combo" });
  assert.equal(r.image_url, "/sku-images/911.png");
  assert.equal(r.bg_base64, null);
  assert.match(r.image_note, /nền/i, "phải nói rõ là thiếu nền, không im lặng");
});

test("không ảnh thật và Flux hỏng → bài vẫn giữ, PHẢI báo thiếu ảnh", async () => {
  const { buildArtwork } = await import("../functions/api/thai-social/_image.js");
  const r = await buildArtwork({}, { skuMain: "999", images: {}, angle: "combo" });
  assert.equal(r.image_url, null);
  assert.equal(r.image_base64, null);
  assert.match(r.image_note, /chưa có ảnh/i, "im lặng trả bài thiếu ảnh là kiểu hỏng tệ nhất");
  assert.match(r.image_note, /999/);
});

test("SKU chưa có ảnh thật → Flux vẽ cả sản phẩm nhưng PHẢI cảnh báo nhãn có thể sai", async () => {
  const { buildArtwork } = await import("../functions/api/thai-social/_image.js");
  const env = { AI: { run: async () => ({ image: "XX" }) } };
  const r = await buildArtwork(env, { skuMain: "999", images: {}, angle: "combo" });
  assert.equal(r.image_base64, "XX");
  assert.match(r.image_note, /nhãn có thể SAI/i);
});

/* ── 7. Trang phải lên được web ─────────────────────────────────────────── */

test("thai-social.html nằm trong build-dist.sh, kèm thư mục ảnh", () => {
  const sh = read("../scripts/build-dist.sh");
  assert.match(sh, /thai-social\.html/, "quên thêm vào PAGES là trang 404 sau lần cron deploy kế tiếp");
  assert.match(sh, /sku-images/, "không copy sku-images thì ảnh 404 và bài đăng lên không có ảnh");
});

test("index.html có nút menu, iframe và lazyFrame khớp nhau", () => {
  const html = read("../index.html");
  assert.match(html, /data-view="thai-social"/);
  assert.match(html, /id="view-thai-social"/);
  assert.match(html, /id="thai-social-frame"/);
  assert.match(html, /lazyFrame\('thai-social','thai-social-frame','\/thai-social'\)/);
  assert.match(html, /'thai-social':'Đăng fanpage Thái'/);
});

/* ── 8. Migration ──────────────────────────────────────────────────────── */

test("migration có khoá chống sinh trùng bài theo lịch", () => {
  const sql = read("../migrations/0020_thai_social.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS thai_pages/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS thai_post_queue/);
  assert.match(sql, /UNIQUE INDEX[\s\S]*?page_id, vn_date[\s\S]*?source = 'schedule'/,
    "thiếu UNIQUE này thì cron chạy lại là sinh trùng và đốt credit AI");
});

/* ── 9. Thư viện ảnh + danh mục sản phẩm ────────────────────────────────────
   Ảnh đi thẳng lên fanpage thật nên phải khoá: đúng file, đúng mã, và ảnh có
   chữ sai thị trường thì phải cảnh báo chứ không im lặng dùng. */

test("mọi ảnh khai trong SKU_IMAGES đều có file thật trong sku-images/", async () => {
  const { SKU_IMAGES } = await import("../functions/api/thai-social/_skus.js");
  const { existsSync } = await import("node:fs");
  const codes = Object.keys(SKU_IMAGES);
  assert.ok(codes.length > 0, "thư viện ảnh không được rỗng sau khi đã nạp");
  for (const code of codes) {
    const url = SKU_IMAGES[code];
    assert.match(url, /^\/sku-images\//, `${code}: ảnh phải là đường dẫn cùng origin`);
    const f = new URL(".." + url, import.meta.url);
    assert.ok(existsSync(f), `${code}: khai ${url} nhưng không có file`);
  }
});

test("cơ chế cảnh báo ảnh: mọi mã cảnh báo phải là mã có ảnh thật", async () => {
  const { IMAGE_WARNINGS, SKU_IMAGES } = await import("../functions/api/thai-social/_skus.js");
  // Ảnh D1 bản đầu có chữ tiếng Việt in sẵn; đã tách nền lấy riêng phần máy nên hết cảnh báo.
  // Giữ test cho cơ chế: cảnh báo treo vào mã không có ảnh thì không bao giờ hiện ra được.
  for (const code of Object.keys(IMAGE_WARNINGS)) {
    assert.ok(SKU_IMAGES[code], `${code}: có cảnh báo nhưng không có ảnh — cảnh báo sẽ không bao giờ hiện`);
    assert.ok(String(IMAGE_WARNINGS[code]).length > 20, `${code}: cảnh báo phải nói rõ vấn đề`);
  }
});

test("ảnh D1 đã tách nền, không còn dùng bản có chữ tiếng Việt", async () => {
  const { SKU_IMAGES, IMAGE_WARNINGS } = await import("../functions/api/thai-social/_skus.js");
  const { existsSync } = await import("node:fs");
  assert.equal(SKU_IMAGES.D1, "/sku-images/D1.png");
  assert.ok(!existsSync(new URL("../sku-images/D1.jpg", import.meta.url)),
    "bản .jpg cũ (có chữ tiếng Việt) phải bị gỡ, tránh dùng nhầm");
  assert.equal(IMAGE_WARNINGS.D1, undefined, "hết chữ tiếng Việt thì không còn cảnh báo");
});

test("danh mục gộp cả thiết bị Doscom, không chỉ dung dịch NOMA", async () => {
  const { listSkus } = await import("../functions/api/thai-social/_skus.js");
  const d = await listSkus({});
  const codes = d.items.map((x) => x.code);
  // D1 là sản phẩm chủ lực của thị trường Thái (landing noma955.click) nhưng KHÔNG nằm
  // trong noma-sku-specs.js — thiếu bước gộp là ô chọn không có gì để chọn.
  assert.ok(codes.includes("D1"), "thiếu D1 trong danh mục");
  assert.ok(codes.includes("911"), "thiếu dung dịch NOMA trong danh mục");
  assert.ok(d.items.every((x) => x.nhom), "mỗi mục phải có nhóm để UI xếp optgroup");
});

test("thiết bị lấy được khối thông số, kèm luật Facebook", async () => {
  const { skuBlock } = await import("../functions/api/thai-social/_skus.js");
  const d1 = await skuBlock({}, "D1");
  assert.equal(d1.known, true);
  assert.match(d1.text, /1500 lần\/phút/, "phải lấy đúng thông số từ trang bán");
  assert.match(d1.text, /LUẬT FACEBOOK/, "D1 là máy dò — phải mang theo ghi chú chính sách Meta");
  assert.match(d1.text, /CẤM dùng ý\/từ/, "phải mang theo danh sách từ cấm");

  const la = await skuBlock({}, "KHONG-CO-THAT");
  assert.equal(la.known, false, "mã lạ phải trả known=false để endpoint chặn trước khi gọi AI");
});

/* ── 10. Ảnh thư viện KHÔNG được đưa URL cho Facebook tự lấy ────────────────
   crm-doscom.pages.dev nằm sau Cloudflare Access: đo thật 24/08/2026, mọi file
   /sku-images/* trả 302 về trang đăng nhập khi gọi từ ngoài. Facebook đi lấy ảnh
   qua URL sẽ nhận HTML đăng nhập, bài lên mà mất ảnh — mà vẫn báo thành công. */

test("publish đọc ảnh thư viện bằng ASSETS, không truyền imageUrl cho Graph", () => {
  const src = read("../functions/api/thai-social/publish.js");
  assert.match(src, /loadLibraryImage\(env, request, row\.image_url\)/,
    "phải tự đọc bytes ảnh thư viện");
  assert.doesNotMatch(src, /imageUrl:\s*row\.image_url/,
    "KHÔNG được đưa URL nội bộ cho Facebook tự tải — nó bị Access chặn");
});

test("đọc ảnh hỏng thì KHÔNG đăng, báo lỗi rõ", () => {
  const src = read("../functions/api/thai-social/publish.js");
  assert.match(src, /image_unreadable/,
    "thà không đăng còn hơn đăng bài mất ảnh mà vẫn báo thành công");
  const idxCheck = src.indexOf("image_unreadable");
  const idxPost = src.indexOf("postToPage({");
  assert.ok(idxCheck > -1 && idxPost > idxCheck, "chặn phải nằm TRƯỚC lúc gọi Graph");
});

test("loadLibraryImage từ chối đường dẫn lạ và nội dung quá ngắn", async () => {
  const { loadLibraryImage } = await import("../functions/api/thai-social/_image.js");
  const req = { url: "https://crm-doscom.pages.dev/api/x" };

  assert.equal(await loadLibraryImage({}, req, "https://ngoai.com/a.png"), null,
    "chỉ nhận đường dẫn cùng origin");
  assert.equal(await loadLibraryImage({}, req, "/sku-images/911.png"), null,
    "không có binding ASSETS thì trả null, không đoán bừa");

  // Trang chuyển hướng của Access là HTML, không có chữ ký ảnh → phải bị loại.
  const html = new TextEncoder().encode("<html><head><title>Redirecting</title></head><body>" + "x".repeat(200));
  const envHtml = { ASSETS: { fetch: async () => ({ ok: true, arrayBuffer: async () => html.buffer }) } };
  assert.equal(await loadLibraryImage(envHtml, req, "/sku-images/911.png"), null,
    "HTML không phải ảnh, dù đủ dài");

  // JPEG thật: FF D8 FF ở đầu.
  const jpg = new Uint8Array(5000); jpg[0] = 0xff; jpg[1] = 0xd8; jpg[2] = 0xff;
  const envOk = { ASSETS: { fetch: async () => ({ ok: true, arrayBuffer: async () => jpg.buffer }) } };
  const got = await loadLibraryImage(envOk, req, "/sku-images/250.jpg");
  assert.equal(got.type, "image/jpeg", "phải suy ra đúng kiểu ảnh từ đuôi file");
  assert.equal(got.bytes.length, 5000);
});

/* ── 11. Ảnh bài đăng là ẢNH GHÉP, không phải ảnh sản phẩm trơn ─────────────
   Chủ dự án chốt 24/08/2026: nền AI theo góc bán hàng + sản phẩm thật + chữ Thái.
   KHÔNG in giá, KHÔNG nút CTA. Kèm bản dịch tiếng Việt của chữ trên ảnh. */

test("prompt nền cấm vẽ chữ, chai và người", async () => {
  const { buildScenePrompt, SCENE_BY_ANGLE } = await import("../functions/api/thai-social/_poster.js");
  const p = buildScenePrompt("combo", "");
  for (const cam of ["NO text", "NO bottle", "NO product", "NO people"]) {
    assert.ok(p.includes(cam), `prompt nền phải cấm: ${cam}`);
  }
  // Nền phải SÁNG: ảnh sản phẩm giữ bóng đổ gốc chụp trên nền trắng, đặt lên nền tối
  // thì bóng đó thành vệt xám bẩn.
  assert.match(p, /bright/i, "nền phải sáng");
  assert.ok(Object.keys(SCENE_BY_ANGLE).length >= 4, "mỗi góc bán hàng một cảnh riêng");
});

test("mỗi góc bán hàng cho ra cảnh nền KHÁC nhau", async () => {
  const { buildScenePrompt } = await import("../functions/api/thai-social/_poster.js");
  const angles = ["combo", "howto", "ba", "vs_shop"];
  const seen = new Set(angles.map((a) => buildScenePrompt(a, "")));
  assert.equal(seen.size, angles.length,
    "cảnh nền phải bám góc bán hàng — giống hệt nhau thì ảnh không nói lên điều gì");
});

test("prompt xin chữ trên ảnh kèm bản dịch, KHÔNG giá KHÔNG CTA", async () => {
  const { buildSystemPrompt } = await import("../functions/api/thai-social/_prompt.js");
  const sys = buildSystemPrompt();
  for (const k of ["poster_title_th", "poster_sub_th", "poster_title_vi", "poster_sub_vi", "scene_prompt"]) {
    assert.ok(sys.includes(k), `thiếu khoá ${k}`);
  }
  assert.match(sys, /KHÔNG viết giá/, "chủ dự án chốt: không in giá lên ảnh");
  assert.match(sys, /KHÔNG viết lời kêu gọi/, "chủ dự án chốt: không có nút CTA trên ảnh");
});

test("chữ trên ảnh bị cắt ở server, không tin model tự giữ giới hạn", async () => {
  const { clipPosterText, POSTER_LIMITS } = await import("../functions/api/thai-social/_poster.js");
  const dai = "ก".repeat(200);
  assert.equal(clipPosterText(dai, POSTER_LIMITS.title).length, POSTER_LIMITS.title);
  assert.equal(clipPosterText("  a   b  ", 50), "a b", "gộp khoảng trắng thừa");
  assert.equal(clipPosterText(null, 10), "");
});

test("publish ưu tiên ảnh ghép hoàn chỉnh hơn ảnh sản phẩm trơn", () => {
  const src = read("../functions/api/thai-social/publish.js");
  const iPoster = src.indexOf("if (row.image_base64)");
  const iUrl = src.indexOf("else if (row.image_url)");
  assert.ok(iPoster > -1 && iUrl > iPoster,
    "ảnh ghép phải được xét TRƯỚC ảnh sản phẩm trơn");
});

test("lưu ảnh ghép KHÔNG tự đánh dấu bài là đã duyệt", () => {
  const src = read("../functions/api/thai-social/queue/[id].js");
  assert.match(src, /onlyPoster/,
    "trình duyệt tự ghép ảnh khi mở thẻ — nếu đổi status thì bài chưa ai đọc đã thành đã duyệt");
});

test("trang có bộ ghép ảnh 3 lớp và tách từ tiếng Thái bằng ICU", () => {
  const html = read("../thai-social.html");
  assert.match(html, /function composePoster/, "thiếu bộ ghép ảnh");
  assert.match(html, /Intl\.Segmenter\("th"/,
    "phải tách từ bằng ICU: ngắt theo dấu cách thì tràn khung, ngắt theo ký tự thì cắt giữa từ");
  assert.match(html, /function thaiWords/);
  assert.match(html, /Noto Sans Thai/, "phải nạp font Thái cho canvas");
  assert.doesNotMatch(html, /บาท|CTA button/, "không in giá / nút CTA lên ảnh");
});

test("ICU tách đúng từ tiếng Thái — đo lại chính ca đã sai", () => {
  // 24/08/2026: ngắt theo ký tự cắt "ฝนตก" (mưa rơi) thành "ฝ" + "นตก". Test giữ ca đó.
  const seg = new Intl.Segmenter("th", { granularity: "word" });
  const words = [...seg.segment("มองไม่ชัดตอนฝนตก")].map((x) => x.segment);
  assert.ok(words.includes("ฝน"), "phải tách được từ ฝน");
  assert.ok(words.includes("ตก"), "phải tách được từ ตก");
  assert.ok(!words.some((w) => w === "ฝ"), "không được để lẻ một ký tự giữa từ");
});

test("migration ảnh ghép có đủ cột nền và chữ hai thứ tiếng", () => {
  const sql = read("../migrations/0021_thai_poster.sql");
  for (const c of ["bg_base64", "scene_prompt", "poster_title_th", "poster_sub_th",
                   "poster_title_vi", "poster_sub_vi"]) {
    assert.ok(sql.includes(c), `migration thiếu cột ${c}`);
  }
});

test("mọi ảnh sản phẩm trong thư viện đều đã tách nền (PNG)", async () => {
  const { SKU_IMAGES } = await import("../functions/api/thai-social/_skus.js");
  for (const [code, url] of Object.entries(SKU_IMAGES)) {
    assert.match(url, /\.png$/i,
      `${code}: ảnh ghép cần nền trong suốt — JPG không có kênh alpha, sẽ thành ô vuông trắng`);
  }
});

/* ── 12. Không ghép ảnh cho bài đã đăng ─────────────────────────────────────
   Sự cố 24/08/2026 trên màn hình: "Không ghép được ảnh bài: already_published".
   publish.js xoá image_base64 sau khi đăng (cho D1 khỏi phình) nhưng image_url vẫn còn,
   nên thẻ bài đã đăng cũng ra canvas → bộ ghép ảnh PATCH ngược lên và ăn 409.
   Lỗi do chính giao diện tự gây ra, Facebook không liên quan. */

test("bài đã đăng KHÔNG được dựng canvas ghép ảnh", () => {
  const html = read("../thai-social.html");
  assert.match(html, /const editable = p\.status === "pending_review" \|\| p\.status === "edited"/,
    "postCard phải biết bài nào còn sửa được");
  assert.match(html, /editable && p\.image_url/,
    "canvas chỉ dựng cho bài còn sửa được");
});

test("bộ ghép ảnh bỏ qua bài đã đăng / đã bỏ — chốt thứ hai", () => {
  const html = read("../thai-social.html");
  const i = html.indexOf("async function renderPosters");
  const body = html.slice(i, i + 1400);
  assert.match(body, /post\.status !== "pending_review" && post\.status !== "edited"/,
    "renderPosters phải tự chặn, không dựa hết vào postCard");
  const iSkip = body.indexOf('post.status !== "pending_review"');
  const iPatch = body.indexOf("method: \"PATCH\"");
  assert.ok(iSkip > -1 && iPatch > iSkip, "chặn phải nằm TRƯỚC lúc gọi PATCH");
});

test("PATCH vẫn từ chối sửa bài đã đăng — hàng rào cuối ở server", () => {
  const src = read("../functions/api/thai-social/queue/[id].js");
  assert.match(src, /if \(row\.status === STATUS\.PUBLISHED\) return fail\("already_published", 409\)/,
    "server không được nới lỏng chỉ vì giao diện đã chặn");
});

