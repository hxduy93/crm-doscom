import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractImageUrls,
  mediaStem,
  buildMediaIndex,
  pickReplacement,
  replaceImageUrls,
} from "../functions/api/products/_images.js";

// Mô tả thật trên noma.vn: ảnh chèn bằng src thẳng tới file gốc (không srcset, không -WxH).
const DESC = `<h2>NOMA 890</h2><p>Phủ bóng</p>
<figure class="wp-block-image"><img loading="lazy" class="wp-image-30255 size-full"
 src="https://noma.vn/wp-content/uploads/2025/12/anh-bia-noma-890-1.webp" alt="NOMA 890"
 style="max-width:100%;height:auto"/><figcaption>Ảnh bìa</figcaption></figure>
<p>Bảo vệ sơn</p>
<img src="https://noma.vn/wp-content/uploads/2025/12/noma-890-phu-bong-lam-moi-son-xe-1.webp" alt="x"/>`;

const MEDIA = [
  { id: 546, source_url: "https://noma.vn/wp-content/uploads/2026/03/anh-bia-noma-890-1.webp" },
  { id: 547, source_url: "https://noma.vn/wp-content/uploads/2026/03/noma-890-phu-bong-lam-moi-son-xe-1.webp" },
  { id: 548, source_url: "https://noma.vn/wp-content/uploads/2026/03/noma-310-chai-xit-chong-hap-hoi-kinh-7-1.webp" },
];

test("extractImageUrls lấy đúng ảnh trong mô tả (src, không dính chữ)", () => {
  const urls = extractImageUrls(DESC);
  assert.equal(urls.length, 2);
  assert.ok(urls.every((u) => u.startsWith("https://noma.vn/wp-content/uploads/2025/12/")));
});

test("extractImageUrls bắt cả data-src (lazy load) và srcset, bỏ URL không phải ảnh", () => {
  const html = `<a href="https://noma.vn/lien-he">x</a>
    <img data-src="https://noma.vn/wp-content/uploads/2025/10/a.jpg"
         srcset="https://noma.vn/wp-content/uploads/2025/10/a-600x600.jpg 600w, https://noma.vn/wp-content/uploads/2025/10/a.jpg 900w"/>`;
  const urls = extractImageUrls(html);
  assert.ok(urls.includes("https://noma.vn/wp-content/uploads/2025/10/a.jpg"));
  assert.ok(urls.includes("https://noma.vn/wp-content/uploads/2025/10/a-600x600.jpg"));
  assert.ok(!urls.includes("https://noma.vn/lien-he"), "link thường không phải ảnh");
});

test("mediaStem bỏ đuôi file + hậu tố kích thước, hạ thường", () => {
  assert.equal(mediaStem("https://noma.vn/wp-content/uploads/2025/12/Anh-Bia-890.webp"), "anh-bia-890");
  assert.equal(mediaStem("https://noma.vn/wp-content/uploads/2026/03/anh-bia-890-600x600.webp"), "anh-bia-890");
});

test("pickReplacement: khớp exact khi cùng tên file khác thư mục", () => {
  const idx = buildMediaIndex(MEDIA);
  const r = pickReplacement("https://noma.vn/wp-content/uploads/2025/12/anh-bia-noma-890-1.webp", idx);
  assert.equal(r.match, "exact");
  assert.equal(r.url, "https://noma.vn/wp-content/uploads/2026/03/anh-bia-noma-890-1.webp");
});

test("pickReplacement: khớp suffix khi WordPress thêm hậu tố -1 lúc upload lại", () => {
  const idx = buildMediaIndex(MEDIA);
  const r = pickReplacement("https://noma.vn/wp-content/uploads/2025/12/noma-310-chai-xit-chong-hap-hoi-kinh-7.webp", idx);
  assert.equal(r.match, "suffix");
  assert.equal(r.url, "https://noma.vn/wp-content/uploads/2026/03/noma-310-chai-xit-chong-hap-hoi-kinh-7-1.webp");
});

test("pickReplacement: KHÔNG đoán mò — tên khác hẳn thì trả none (thà bỏ qua còn hơn chèn nhầm ảnh)", () => {
  const idx = buildMediaIndex(MEDIA);
  const r = pickReplacement("https://noma.vn/wp-content/uploads/2025/11/noma-310-chong-hap-hoi-kinh-9.webp", idx);
  assert.equal(r.match, "none");
  assert.equal(r.url, null);
});

test("replaceImageUrls thay URL nhưng giữ NGUYÊN 100% phần còn lại của HTML", () => {
  const pairs = [
    { from: "https://noma.vn/wp-content/uploads/2025/12/anh-bia-noma-890-1.webp",
      to: "https://noma.vn/wp-content/uploads/2026/03/anh-bia-noma-890-1.webp" },
  ];
  const { html, replaced } = replaceImageUrls(DESC, pairs);
  assert.deepEqual(replaced, [pairs[0].from]);
  assert.ok(html.includes("/2026/03/anh-bia-noma-890-1.webp"));
  assert.ok(!html.includes("/2025/12/anh-bia-noma-890-1.webp"));
  // không đụng chữ, caption, class, style, hay ảnh còn lại
  assert.ok(html.includes("<figcaption>Ảnh bìa</figcaption>"));
  assert.ok(html.includes('class="wp-image-30255 size-full"'));
  assert.ok(html.includes('style="max-width:100%;height:auto"'));
  assert.ok(html.includes("/2025/12/noma-890-phu-bong-lam-moi-son-xe-1.webp"), "ảnh chưa chọn thì để nguyên");
  assert.equal(html.length - DESC.length, 0, "chỉ đổi tháng trong URL → độ dài không đổi");
});

test("replaceImageUrls bỏ qua cặp không khớp mô tả hiện tại (không ghi bừa)", () => {
  const { html, replaced } = replaceImageUrls(DESC, [{ from: "https://noma.vn/khong-ton-tai.webp", to: "https://noma.vn/x.webp" }]);
  assert.deepEqual(replaced, []);
  assert.equal(html, DESC);
});
