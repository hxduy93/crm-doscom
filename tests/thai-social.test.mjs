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

test("pickImage ưu tiên ảnh thật trong thư viện, không gọi Flux", async () => {
  const { pickImage } = await import("../functions/api/thai-social/_image.js");
  let fluxCalled = false;
  const env = { AI: { run: async () => { fluxCalled = true; return { image: "zz" }; } } };
  const r = await pickImage(env, { skuMain: "350", images: { 350: "/sku-images/350.webp" }, scene: "s" });
  assert.equal(r.image_url, "/sku-images/350.webp");
  assert.equal(r.image_base64, null);
  assert.equal(r.cost_usd, 0);
  assert.equal(fluxCalled, false, "có ảnh thật thì không được đốt tiền gọi Flux");
});

test("không có ảnh và Flux hỏng → bài vẫn giữ, nhưng PHẢI báo thiếu ảnh", async () => {
  const { pickImage } = await import("../functions/api/thai-social/_image.js");
  const r = await pickImage({}, { skuMain: "999", images: {}, scene: "s" }); // env không có AI
  assert.equal(r.image_url, null);
  assert.equal(r.image_base64, null);
  assert.match(r.image_note, /chưa có ảnh/i, "im lặng trả bài thiếu ảnh là kiểu hỏng tệ nhất");
  assert.match(r.image_note, /999/);
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
