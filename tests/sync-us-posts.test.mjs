import { test } from "node:test";
import assert from "node:assert/strict";
import { extractImages, restoreImages, IMG_PLACEHOLDER_PREFIX } from "../functions/api/products/_posts.js";
import { stripTags } from "../functions/api/products/sync-us.js";

test("extractImages: thay src bằng placeholder, bỏ srcset/sizes, giữ nguyên chữ + alt", () => {
  const html = [
    "<h2>Điểm nổi bật</h2>",
    "<p>Đoạn 1.</p>",
    `<figure class='wp-block-image'><img src="https://noma.vn/a.jpg" srcset="https://noma.vn/a-300.jpg 300w" sizes="(max-width:300px) 100vw" alt="Bọt vệ sinh"/><figcaption>Chú thích</figcaption></figure>`,
    `<p>Giữa bài.</p><img src="https://noma.vn/b.jpg" alt="y">`,
  ].join("\n");
  const { html: out, images } = extractImages(html);

  assert.deepEqual(images.map((i) => i.src), ["https://noma.vn/a.jpg", "https://noma.vn/b.jpg"]);
  assert.ok(out.includes(`src="${IMG_PLACEHOLDER_PREFIX}0__"`), "ảnh 1 → placeholder 0");
  assert.ok(out.includes(`src="${IMG_PLACEHOLDER_PREFIX}1__"`), "ảnh 2 → placeholder 1");
  assert.ok(!/noma\.vn/.test(out), "không còn URL web VN (kể cả trong srcset)");
  assert.ok(!/srcset|sizes=/i.test(out), "đã bỏ srcset/sizes");
  // Chữ + cấu trúc + alt giữ nguyên để AI dịch
  assert.ok(out.includes("<h2>Điểm nổi bật</h2>") && out.includes("<p>Đoạn 1.</p>"));
  assert.ok(out.includes('alt="Bọt vệ sinh"') && out.includes("<figcaption>Chú thích</figcaption>"));
});

test("extractImages: ảnh trùng src chỉ copy 1 lần (dùng chung placeholder)", () => {
  const html = `<img src="https://noma.vn/a.jpg"><p>x</p><img src="https://noma.vn/a.jpg">`;
  const { html: out, images } = extractImages(html);
  assert.equal(images.length, 1);
  assert.equal(out.split(`${IMG_PLACEHOLDER_PREFIX}0__`).length - 1, 2, "cả 2 thẻ trỏ cùng placeholder");
});

test("extractImages: vượt hạn mức → gỡ hẳn ảnh thừa (không hotlink web VN)", () => {
  const html = Array.from({ length: 4 }, (_, i) => `<img src="https://noma.vn/${i}.jpg">`).join("");
  const { html: out, images } = extractImages(html, { limit: 2 });
  assert.equal(images.length, 2);
  assert.equal(out.split("<img").length - 1, 2, "chỉ còn 2 thẻ img");
  assert.ok(!/noma\.vn/.test(out));
});

test("restoreImages: gắn URL nomaauto.us vào đúng placeholder", () => {
  const { html: ph, images } = extractImages(
    `<p>a</p><img src="https://noma.vn/a.jpg" alt="x"><p>b</p><img src="https://noma.vn/b.jpg" alt="y">`
  );
  assert.equal(images.length, 2);
  const out = restoreImages(ph, ["https://nomaauto.us/wp/a.jpg", "https://nomaauto.us/wp/b.jpg"]);
  assert.ok(out.includes('src="https://nomaauto.us/wp/a.jpg"'));
  assert.ok(out.includes('src="https://nomaauto.us/wp/b.jpg"'));
  assert.ok(!out.includes(IMG_PLACEHOLDER_PREFIX), "không còn placeholder sót");
  assert.ok(out.includes("<p>a</p>") && out.includes("<p>b</p>"));
});

test("restoreImages: copy ảnh hỏng (url rỗng) → gỡ thẻ ảnh, giữ nguyên chữ", () => {
  const { html: ph } = extractImages(`<p>Chữ.</p><img src="https://noma.vn/a.jpg" alt="x">`);
  const out = restoreImages(ph, [""]);
  assert.ok(!/<img/i.test(out), "thẻ ảnh hỏng bị gỡ");
  assert.ok(!out.includes(IMG_PLACEHOLDER_PREFIX));
  assert.ok(out.includes("<p>Chữ.</p>"), "chữ giữ nguyên");
});

test("restoreImages: figure rỗng sau khi gỡ ảnh hỏng → bỏ luôn cả figure + figcaption", () => {
  const { html: ph } = extractImages(
    `<figure class='wp-block-image'><img src="https://noma.vn/a.jpg"><figcaption>Chú thích</figcaption></figure><p>Kết.</p>`
  );
  const out = restoreImages(ph, [""]);
  assert.ok(!/<figure|<figcaption/i.test(out), "không để lại figure/figcaption rỗng");
  assert.ok(out.includes("<p>Kết.</p>"));
});

test("restoreImages: AI dịch xong vẫn giữ placeholder → gắn được URL thật", () => {
  const translated = `<h2>Highlights</h2><p>Intro.</p><img src="${IMG_PLACEHOLDER_PREFIX}0__" alt="Cleaning foam"/>`;
  const out = restoreImages(translated, ["https://nomaauto.us/wp/a.jpg"]);
  assert.ok(out.includes('src="https://nomaauto.us/wp/a.jpg"'));
  assert.ok(out.includes('alt="Cleaning foam"'), "alt đã dịch được giữ");
});

test("stripTags: excerpt WP (HTML + dấu […]) → chữ trần", () => {
  assert.equal(stripTags("<p>Bọt vệ sinh đa năng&nbsp;NOMA [&hellip;]</p>"), "Bọt vệ sinh đa năng NOMA");
  assert.equal(stripTags(""), "");
  assert.equal(stripTags(null), "");
});
