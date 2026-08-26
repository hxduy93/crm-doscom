import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { parseFbPostUrl, collectImages, readToken } from "../functions/api/thai-social/_fb-source.js";
import {
  RSTATUS, RPUBLISHABLE, checkScheduledAt, imageIdentity, imageKey, publicRepost, fullMessage,
  SCHEDULE_MIN_LEAD,
} from "../functions/api/thai-social/_repost-lib.js";
import { sniffWarnings, mergeWarnings } from "../functions/api/thai-social/_repost-prompt.js";
import { normalizeVision, imageSize, editSizeFor } from "../functions/api/thai-social/_image-translate.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

/* ── 1. Đọc link bài Facebook ───────────────────────────────────────────────
   Đây là cửa vào của cả tính năng. Đọc sai link thì hoặc dịch nhầm bài, hoặc bắt
   người dùng đoán tại sao "không tìm thấy". */

test("link có id số → tách được page + post", () => {
  assert.deepEqual(parseFbPostUrl("https://www.facebook.com/1234567/posts/9876543"),
    { pageRef: "1234567", postId: "9876543" });
  assert.deepEqual(parseFbPostUrl("https://www.facebook.com/permalink.php?story_fbid=999&id=111"),
    { pageRef: "111", postId: "999" });
  assert.deepEqual(parseFbPostUrl("https://m.facebook.com/story.php?story_fbid=999&id=111"),
    { pageRef: "111", postId: "999" });
});

test("link pfbid được nhận ra là pfbid, KHÔNG bị coi là id số", () => {
  const r = parseFbPostUrl("https://www.facebook.com/NomaVietnam/posts/pfbid02AbC-dEf123");
  assert.equal(r.pfbid, "pfbid02AbC-dEf123");
  assert.equal(r.postId, undefined, "pfbid không tra được qua Graph — nhầm là hỏng cả luồng");
  assert.equal(r.pageRef, "NomaVietnam");
});

test("link ảnh và album tách ra photoId", () => {
  assert.deepEqual(parseFbPostUrl("https://www.facebook.com/photo/?fbid=555&set=a.111"),
    { pageRef: undefined, photoId: "555" });
  assert.equal(parseFbPostUrl("https://www.facebook.com/nomavn/photos/a.123456/778899").photoId, "778899");
});

test("link rút gọn được đánh dấu phải đi theo redirect", () => {
  assert.ok(parseFbPostUrl("https://fb.watch/abc123/").shortlink);
  assert.ok(parseFbPostUrl("https://www.facebook.com/share/p/AbCdEf/").shortlink);
});

test("link không phải Facebook thì trả rỗng, không đoán bừa", () => {
  assert.deepEqual(parseFbPostUrl("https://tiktok.com/@x/video/1"), {});
  assert.deepEqual(parseFbPostUrl("khong-phai-url"), {});
  assert.deepEqual(parseFbPostUrl(""), {});
});

test("token đọc bài gốc: ưu tiên FB_PAGE_READ_TOKEN, không có thì mượn FB_ACCESS_TOKEN", () => {
  assert.equal(readToken({ FB_PAGE_READ_TOKEN: "A", FB_ACCESS_TOKEN: "B" }), "A");
  assert.equal(readToken({ FB_ACCESS_TOKEN: "B" }), "B");
  assert.equal(readToken({}), "");
});

test("gom ảnh: album lấy hết ảnh con, bài trơn rơi về full_picture", () => {
  const album = {
    attachments: { data: [{ subattachments: { data: [
      { media: { image: { src: "https://x/1.jpg" } } },
      { media: { image: { src: "https://x/2.jpg" } } },
      { media: { image: { src: "https://x/1.jpg" } } },   // trùng
    ] } }] },
    full_picture: "https://x/cover.jpg",
  };
  assert.deepEqual(collectImages(album), ["https://x/1.jpg", "https://x/2.jpg"]);
  assert.deepEqual(collectImages({ full_picture: "https://x/only.jpg" }), ["https://x/only.jpg"]);
  assert.deepEqual(collectImages({}), []);
});

/* ── 2. Giờ hẹn đăng ────────────────────────────────────────────────────────
   Facebook chỉ nhận lịch từ 10 phút tới 6 tháng. Chặn ở đây để người dùng đọc được
   lý do bằng tiếng Việt, thay vì một câu lỗi Graph khó hiểu SAU KHI ảnh đã lên. */

test("giờ hẹn quá gần / quá xa / sai đều bị chặn", () => {
  const now = 1_700_000_000;
  assert.equal(checkScheduledAt(now + 60, now).error, "gio_hen_qua_gan");
  assert.equal(checkScheduledAt(now + 400 * 86400, now).error, "gio_hen_qua_xa");
  assert.equal(checkScheduledAt("khong-phai-so", now).error, "gio_hen_khong_hop_le");
  assert.equal(checkScheduledAt(0, now).error, "gio_hen_khong_hop_le");
  assert.equal(checkScheduledAt(now + 3600, now).at, now + 3600);
});

test("chừa dư so với mốc 10 phút của Facebook", () => {
  assert.ok(SCHEDULE_MIN_LEAD > 600, "đúng 600 giây là trượt vì mấy giây gọi mạng");
});

/* ── 3. Khoá cất ảnh ────────────────────────────────────────────────────────
   Link scontent của Facebook mang chữ ký hết hạn ở query: cùng MỘT tấm ảnh, mỗi lần
   lấy lại ra URL khác. Lấy cả URL làm khoá cache là không bao giờ trúng, và mỗi lần
   xem lại bài là trả tiền vẽ lại ảnh một lần nữa. */

test("cùng một ảnh, khác chữ ký query → CÙNG một khoá", () => {
  const a = "https://scontent.fhan2.fna.fbcdn.net/v/t39.30808-6/123_456_789_n.jpg?oh=AAA&oe=BBB";
  const b = "https://scontent.fsgn5.fna.fbcdn.net/v/t39.30808-6/123_456_789_n.jpg?oh=ZZZ&oe=YYY&_nc_cat=1";
  assert.equal(imageIdentity(a), imageIdentity(b));
  assert.equal(imageKey(a), imageKey(b));
});

test("hai ảnh khác nhau → khác khoá", () => {
  assert.notEqual(imageKey("https://x/v/t39/111_n.jpg"), imageKey("https://x/v/t39/222_n.jpg"));
});

/* ── 4. Hình dạng dữ liệu trả ra UI ─────────────────────────────────────────── */

const ROW = {
  id: 7, page_id: "p1", vn_date: "2026-08-26", src_url: "https://facebook.com/x/posts/1",
  src_post_id: "111_222", src_page_id: "111", src_page_name: "Noma Việt Nam",
  caption_vi: "Bài gốc", caption_th: "ข้อความ", caption_vi_back: "Dịch ngược",
  hashtags: '["noma","รถยนต์"]', warnings: '["Giá tiền Việt"]',
  images: JSON.stringify([
    { src: "https://x/1.jpg", has_text: true, translated: true, kv_key: "thai_repost:img:v1:1.jpg", text_vi: "Giảm 50%", text_th: "ลด 50%" },
    { src: "https://x/2.jpg", has_text: false, translated: false, kv_key: null },
  ]),
  image_mode: "auto", scheduled_at: null, status: RSTATUS.REVIEW, fb_post_id: null,
  last_error: null, cost_usd: 0.08, created_at: 1, updated_at: 2,
};

test("publicRepost không đẩy khoá KV ra ngoài trừ khi xin rõ", () => {
  const out = publicRepost(ROW);
  assert.equal(out.images[0].kv_key, undefined);
  assert.equal(publicRepost(ROW, { withImages: true }).images[0].kv_key, "thai_repost:img:v1:1.jpg");
});

test("ảnh đã vẽ lại xem qua endpoint riêng, ảnh giữ nguyên trỏ thẳng link gốc", () => {
  const out = publicRepost(ROW);
  assert.equal(out.images[0].preview, "/api/thai-social/repost/image/7/0");
  assert.equal(out.images[1].preview, "https://x/2.jpg");
});

test("JSON hỏng trong D1 không làm gãy cả danh sách", () => {
  const out = publicRepost({ ...ROW, hashtags: "{hỏng", images: "[[[", warnings: null });
  assert.deepEqual(out.hashtags, []);
  assert.deepEqual(out.images, []);
  assert.deepEqual(out.warnings, []);
});

test("chữ đăng lên = caption + hashtag, hashtag không dính dấu # đôi và không có khoảng trắng", () => {
  const msg = fullMessage({ caption_th: "ข้อความ  ", hashtags: '["#noma","xe hoi"]' });
  assert.equal(msg, "ข้อความ\n\n#noma #xehoi");
  assert.equal(fullMessage({ caption_th: "chỉ chữ", hashtags: "[]" }), "chỉ chữ");
});

/* ── 5. Trạng thái: bài đã giao cho Facebook là bất biến ─────────────────── */

test("chỉ bài chờ duyệt / đã sửa mới được đăng", () => {
  assert.deepEqual(RPUBLISHABLE, [RSTATUS.REVIEW, RSTATUS.EDITED]);
  assert.ok(!RPUBLISHABLE.includes(RSTATUS.SCHEDULED), "bài đã hẹn giờ không được đăng lần nữa");
  assert.ok(!RPUBLISHABLE.includes(RSTATUS.PUBLISHED));
  assert.ok(!RPUBLISHABLE.includes(RSTATUS.DISCARDED));
});

test("sửa/bỏ bài đã hẹn giờ đều bị chặn, không chỉ bài đã đăng", () => {
  const src = read("../functions/api/thai-social/repost/queue/[id].js");
  assert.match(src, /FROZEN\s*=\s*\[RSTATUS\.PUBLISHED,\s*RSTATUS\.SCHEDULED\]/);
  // Cả PATCH lẫn DELETE phải dùng cùng một danh sách khoá.
  assert.equal((src.match(/FROZEN\.includes\(row\.status\)/g) || []).length, 2);
});

/* ── 6. Chỉ MỘT đường đăng bài ──────────────────────────────────────────────
   Cùng luật với tính năng bài theo SKU: bước dịch/xem trước không được đụng Graph API
   đăng bài. Bài sai lên fanpage thật thì CRM không hoàn tác được. */

test("chỉ repost/publish.js được gọi Graph API đăng bài", () => {
  const graphImport = /^[ \t]*import[^\r\n]*from\s+["'][^"']*_graph\.js["']/m;
  assert.match(read("../functions/api/thai-social/repost/publish.js"), graphImport);
  assert.doesNotMatch(read("../functions/api/thai-social/repost/preview.js"), graphImport,
    "bước dịch bài không được đăng gì");
  assert.doesNotMatch(read("../functions/api/thai-social/repost/queue.js"), graphImport);
  assert.doesNotMatch(read("../functions/api/thai-social/repost/queue/[id].js"), graphImport);
});

test("KHÔNG có cron nào tự đăng bài đã hẹn giờ — lịch là việc của Facebook", () => {
  const pub = read("../functions/api/thai-social/repost/publish.js");
  // Giờ hẹn được gửi NGAY trong lời gọi đăng, Facebook giữ bài; CRM không quay lại lần nữa.
  assert.match(read("../functions/api/thai-social/_graph.js"), /scheduled_publish_time/);
  assert.equal((pub.match(/postArticleToPage\(/g) || []).length, 1,
    "đúng MỘT lời gọi đăng — thêm cái nữa là có đường đăng thứ hai không ai duyệt");
  // Không tự retry: rate limit thì retry ngay chỉ làm Facebook siết thêm.
  assert.doesNotMatch(pub, /setTimeout|for \(let attempt|while \(!result/i);
});

test("publish chỉ đổi status KHI Facebook trả fb_post_id thật", () => {
  const src = read("../functions/api/thai-social/repost/publish.js");
  const idxCheck = src.indexOf("!result.fb_post_id");
  const idxSet = src.indexOf("SET status = ?, fb_post_id = ?");
  assert.ok(idxCheck > -1, "phải kiểm fb_post_id");
  assert.ok(idxSet > idxCheck, "kiểm id phải nằm TRƯỚC câu UPDATE");
});

test("ảnh vẽ lại hết hạn thì DỪNG, không lặng lẽ đăng ảnh tiếng Việt", () => {
  const src = read("../functions/api/thai-social/repost/publish.js");
  const idxGuard = src.indexOf('return fail("anh_het_han"');
  const idxPost = src.indexOf("postArticleToPage({");
  assert.ok(idxGuard > -1 && idxPost > idxGuard,
    "chặn ảnh hết hạn phải nằm trước lời gọi đăng bài");
});

/* ── 7. Không bịa số liệu ───────────────────────────────────────────────────
   Red line dự án. Máy dịch CHỮ, không tự quy đổi tiền tệ — giá bán ở Thái là quyết định
   kinh doanh, không phải phép nhân tỉ giá. */

test("prompt cấm quy đổi tiền tệ và cấm thêm thông tin", () => {
  const p = read("../functions/api/thai-social/_repost-prompt.js");
  assert.match(p, /KHÔNG quy đổi tiền tệ/);
  assert.match(p, /KHÔNG thêm thông tin không có trong bài gốc/);
});

test("bộ dò tự bắt giá tiền Việt, hotline và link kể cả khi AI quên", () => {
  const w = sniffWarnings("Chỉ 299.000đ, gọi ngay 0987654321 hoặc vào https://noma.vn/sp");
  assert.equal(w.length, 3);
  assert.ok(w.some((x) => x.includes("299.000đ")));
  assert.ok(w.some((x) => x.includes("0987654321")));
  assert.ok(w.some((x) => x.includes("noma.vn")));
  assert.deepEqual(sniffWarnings("Bài không có gì phải soát"), []);
});

test("cảnh báo của AI và của bộ dò gộp lại, bỏ trùng, cắt còn 12 dòng", () => {
  const out = mergeWarnings(["Giá tiền Việt còn nguyên", "Khác"], ["Giá tiền Việt còn nguyên"]);
  assert.deepEqual(out, ["Giá tiền Việt còn nguyên", "Khác"]);
  assert.equal(mergeWarnings(Array.from({ length: 30 }, (_, i) => `canh bao so ${i}`), []).length, 12);
});

/* ── 8. Đọc chữ trên ảnh ────────────────────────────────────────────────────
   Ảnh không có chữ mà vẫn đưa qua model vẽ lại là vừa tốn tiền vừa làm hỏng nhãn sản
   phẩm thật — đúng cái bẫy đã ghi trong _image.js. */

test("model bảo không có chữ → coi như không có chữ, giữ ảnh gốc", () => {
  assert.equal(normalizeVision({ co_chu: false, cac_dong: [] }).has_text, false);
  assert.equal(normalizeVision(null).has_text, false, "không đọc được cũng phải giữ ảnh gốc");
  assert.equal(normalizeVision({ co_chu: true, cac_dong: [] }).has_text, false,
    "nói có chữ mà không liệt kê được dòng nào thì không vẽ lại");
});

test("chữ đọc được gom thành cặp Việt → Thái", () => {
  const v = normalizeVision({ co_chu: true, cac_dong: [
    { vi: "Giảm 50%", th: "ลด 50%" }, { vi: "", th: "" }, { vi: "Miễn phí ship", th: "ส่งฟรี" },
  ] });
  assert.equal(v.has_text, true);
  assert.equal(v.blocks.length, 2);
  assert.equal(v.text_vi, "Giảm 50% · Miễn phí ship");
  assert.equal(v.text_th, "ลด 50% · ส่งฟรี");
});

test("đọc kích thước ảnh để vẽ lại ĐÚNG tỉ lệ, không bóp ảnh dọc thành vuông", () => {
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47], 0);
  png.set([0, 0, 4, 0], 16);   // rộng 1024
  png.set([0, 0, 5, 0], 20);   // cao 1280 → dọc 4:5
  assert.deepEqual(imageSize(png), { w: 1024, h: 1280 });
  assert.equal(editSizeFor(png, {}), "1024x1536");

  const jpg = new Uint8Array(32);
  jpg.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08], 0);
  jpg.set([0x02, 0x00], 7);    // cao 512
  jpg.set([0x04, 0x00], 9);    // rộng 1024 → ngang 2:1
  assert.deepEqual(imageSize(jpg), { w: 1024, h: 512 });
  assert.equal(editSizeFor(jpg, {}), "1536x1024");

  // Không đọc được định dạng thì để model tự chọn, KHÔNG đoán bừa 1024x1024.
  assert.equal(imageSize(new Uint8Array(32)), null);
  assert.equal(editSizeFor(new Uint8Array(32), {}), "auto");
  assert.equal(editSizeFor(png, { THAI_IMAGE_EDIT_SIZE: "1024x1024" }), "1024x1024", "env ép được");
});

/* ── 9. Giao diện có nối đúng vào CRM ───────────────────────────────────── */

test("menu mới được nối đủ 4 chỗ trong index.html", () => {
  const html = read("../index.html");
  assert.match(html, /data-view="thai-repost"/, "thiếu nút menu");
  assert.match(html, /id="view-thai-repost"/, "thiếu khung view");
  assert.match(html, /'thai-repost':'Dịch bài sang Thái'/, "thiếu tiêu đề");
  assert.match(html, /lazyFrame\('thai-repost','thai-repost-frame','\/thai-repost'\)/, "thiếu nạp iframe");
});

test("trang thai-repost.html nằm trong danh sách copy khi deploy", () => {
  // Quên dòng này là trang 404 trên web dù code đã lên — cùng bẫy đã ghi trong build-dist.sh.
  assert.match(read("../scripts/build-dist.sh"), /thai-repost\.html/);
});

test("có migration cho bảng bài dịch lại", () => {
  const sql = read("../migrations/0022_thai_repost.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS thai_repost_queue/);
  assert.match(sql, /scheduled_at/);
  // Dùng chung bảng fanpage của tính năng cũ, không nhân bản danh sách fanpage.
  assert.match(sql, /REFERENCES thai_pages\(page_id\)/);
});
