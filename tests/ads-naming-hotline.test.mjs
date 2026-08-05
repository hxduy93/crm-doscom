import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// YÊU CẦU 2026-08-05 (chủ dự án): camp chạy từ TikTok Shop phải đặt tên theo công thức
// "ngày/tháng - Tên sản phẩm - Tên KOC" (KOC = username TikTok của người quay), KOC có
// nhiều video thì đánh số KOC1/KOC2/KOC3 — thay cho cách cũ lấy tên/nội dung video.
// Kèm ô nhập số điện thoại: hotline phải xuống cuối bài và KHÔNG chèn trùng.

const html = readFileSync(new URL("../ads-creator.html", import.meta.url), "utf8");
const grab = (re, name) => {
  const m = html.match(re);
  assert.ok(m, `không trích được ${name} từ ads-creator.html (cấu trúc đổi?)`);
  return m[0];
};

// ── Đặt tên campaign / ad ────────────────────────────────────────────────────
const nameBlock = grab(/const kocOf = \(f\) =>[\s\S]*?const campKoc = [^\n]*\n/, "khối đặt tên KOC");
const datNhomTen = new Function("files", "runner", "dm", "g", `
  ${nameBlock}
  return { adNames, campKoc };
`);

test("mỗi KOC được đánh số theo thứ tự video của chính họ", () => {
  const r = datNhomTen(
    [{ koc: "quangteo" }, { koc: "khanhmexe" }, { koc: "quangteo" }, { koc: "quangteo" }],
    "duy", "5/8", { product: "NOMA 680" });
  assert.deepEqual(r.adNames, [
    "5/8 - NOMA 680 - quangteo1",
    "5/8 - NOMA 680 - khanhmexe1",
    "5/8 - NOMA 680 - quangteo2",
    "5/8 - NOMA 680 - quangteo3",
  ]);
});

test("1 KOC → tên campaign ghi thẳng tên KOC", () => {
  const r = datNhomTen([{ koc: "quangteo" }, { koc: "quangteo" }], "duy", "5/8", { product: "NOMA 680" });
  assert.equal(r.campKoc, "quangteo");
});

test("nhiều KOC → tên campaign ghi số lượng KOC", () => {
  const r = datNhomTen([{ koc: "a" }, { koc: "b" }, { koc: "c" }, { koc: "a" }], "duy", "5/8", { product: "NOMA 680" });
  assert.equal(r.campKoc, "3 KOC");
});

test("video từ folder (không có KOC) lùi về tên người chạy", () => {
  const r = datNhomTen([{ name: "v1.mp4" }, { name: "v2.mp4" }], "duy", "5/8", { product: "NOMA 680" });
  assert.deepEqual(r.adNames, ["5/8 - NOMA 680 - duy1", "5/8 - NOMA 680 - duy2"]);
  assert.equal(r.campKoc, "duy");
});

test("tên ad KHÔNG còn lấy theo tên/nội dung video", () => {
  assert.match(html, /ad_name: adNames\[i\]/, "tên ad phải theo công thức KOC + số thứ tự");
  assert.doesNotMatch(html, /ad_name: `\$\{dm\} - \$\{g\.product\} - \$\{baseName\}`/,
    "vẫn còn đặt tên ad theo tên video");
  assert.match(html, /campaign_name: `\$\{dm\} - \$\{g\.product\} - \$\{campKoc\}`/,
    "tên campaign phải là ngày/tháng - sản phẩm - KOC");
});

test("username TikTok được chuẩn hoá (bỏ @, bỏ khoảng trắng)", () => {
  const kocName = new Function("u", `${grab(/const kocName = \(u\) =>[^\n]*\n/, "kocName")} return kocName(u);`);
  assert.equal(kocName("@quang teo "), "quangteo");
  assert.equal(kocName(null), "");
});

// ── Hotline trong bài ────────────────────────────────────────────────────────
const hotlineSrc = grab(/const digitsOf = [\s\S]*?const withHotline = \(text, ph\) => \{[\s\S]*?\n  \}/, "withHotline");
const hotline = new Function("text", "ph", `${hotlineSrc};
 return withHotline(text, ph);`);
const tel = new Function("s", `${hotlineSrc};
 return telLink(s);`);

test("chèn hotline xuống cuối bài", () => {
  assert.equal(hotline("Mua ngay đi bạn", "1900638597"), "Mua ngay đi bạn\n📞 Hotline: 1900638597");
});

test("bài đã có số rồi thì KHÔNG chèn thêm (kể cả số viết cách nhau)", () => {
  const co = "Gọi 1900 638 597 để đặt hàng";
  assert.equal(hotline(co, "1900638597"), co);
});

test("không nhập số thì giữ nguyên bài", () => {
  assert.equal(hotline("Nội dung", ""), "Nội dung");
  assert.equal(hotline("Nội dung", null), "Nội dung");
});

test("nút gọi dùng link tel: chỉ gồm chữ số", () => {
  assert.equal(tel("1900 638 597"), "tel:1900638597");
});

test("bài viết ở CẢ hai chế độ đều đi qua withHotline", () => {
  assert.match(html, /ad_copy: withHotline\(fillUrl\(adCopy, autoLink\), phone\)/, "thiếu ở chế độ tự động");
  assert.match(html, /ad_copy: withHotline\(fillUrl\(a\.adCopy, a\.link\), phone\)/, "thiếu ở chế độ thủ công");
});
