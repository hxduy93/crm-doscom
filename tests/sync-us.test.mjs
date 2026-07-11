import { test } from "node:test";
import assert from "node:assert/strict";
import { stripInlineImages } from "../functions/api/products/sync-us.js";

test("stripInlineImages: bỏ <figure> và <img> nhưng GIỮ nguyên chữ + cấu trúc bài", () => {
  const html = [
    "<h2>Điểm nổi bật</h2>",
    "<p>Đoạn 1.</p>",
    "<figure class='wp-block-image'><img src='https://noma.vn/a.jpg' alt='x'/><figcaption>Chú thích</figcaption></figure>",
    "<ul><li>Ý 1</li><li>Ý 2</li></ul>",
    "<img src='https://noma.vn/b.jpg' alt='y'>",
    "<p>Kết luận.</p>",
  ].join("\n");
  const out = stripInlineImages(html);
  // Hết ảnh + hết hotlink về noma.vn
  assert.ok(!/<img/i.test(out), "phải hết thẻ <img>");
  assert.ok(!/<figure/i.test(out), "phải hết <figure>");
  assert.ok(!/noma\.vn/.test(out), "không còn hotlink ảnh về noma.vn");
  // Giữ nguyên chữ + cấu trúc
  assert.ok(out.includes("<h2>Điểm nổi bật</h2>"));
  assert.ok(out.includes("<p>Đoạn 1.</p>"));
  assert.ok(out.includes("<li>Ý 1</li>") && out.includes("<li>Ý 2</li>"));
  assert.ok(out.includes("<p>Kết luận.</p>"));
});

test("stripInlineImages: bài không có ảnh → giữ nguyên", () => {
  const html = "<p>Chỉ có chữ.</p>";
  assert.equal(stripInlineImages(html), html);
});

test("stripInlineImages: input rỗng/null → chuỗi rỗng", () => {
  assert.equal(stripInlineImages(""), "");
  assert.equal(stripInlineImages(null), "");
});
