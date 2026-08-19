import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// 19/08/2026: các đoạn chú thích dài (phụ đề .s nhiều dòng + đoạn <p> dưới bảng) được gom
// vào MỘT dấu sao cạnh tiêu đề, rê chuột mới hiện. Test canh 2 việc: (1) chữ không bị mất,
// (2) không ai vô tình thả lại một đoạn chú thích dài vào giữa trang.

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

const stars = [...html.matchAll(/<span class="note"[^>]*>\*<span class="note-src" hidden>([\s\S]*?)<\/span><\/span>/g)]
  .map((m) => m[1]);

test("mỗi chú thích gom vào 1 dấu sao cạnh tiêu đề, không cái nào rỗng", () => {
  assert.ok(stars.length >= 5, "phải có ít nhất 5 dấu sao, đang có " + stars.length);
  stars.forEach((s, i) => assert.ok(s.trim().length > 40, "dấu sao thứ " + (i + 1) + " rỗng hoặc quá ngắn"));
});

test("đã gỡ hết đoạn chú thích dài nằm giữa trang", () => {
  assert.doesNotMatch(html, /<p style="font-size:11\.5px;color:var\(--text-2\);margin:10px 2px 0/,
    "còn sót đoạn <p> chú thích dưới bảng");
});

test("nội dung chú thích KHÔNG bị cắt bớt khi thu gọn", () => {
  const all = stars.join("\n");
  // vài mốc quyết định quan trọng — mất là mất luôn lý do đằng sau con số
  ["QUYẾT 31/07/2026", "Phụ phí agency = 15% chi phí FB Ads", "CHƯA trừ VAT 10%",
   "chạy hộ team content", "lãi gộp"].forEach((k) => {
    assert.ok(all.includes(k), "mất nội dung: " + k);
  });
});

test("lớp nổi dựng ở body — .mod có overflow:hidden nên popup lồng bên trong sẽ bị cắt", () => {
  assert.match(html, /#note-layer\{position:fixed/, "thiếu CSS #note-layer");
  assert.match(html, /document\.body\.appendChild\(layer\)/, "lớp chú thích không gắn vào body");
  assert.match(html, /\.mod\{[^}]*overflow:hidden/, "giả định .mod overflow:hidden không còn đúng — xem lại cách dựng lớp nổi");
});
