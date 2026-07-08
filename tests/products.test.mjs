import { test } from "node:test";
import assert from "node:assert/strict";
import {
  slugify,
  priceFields,
  figureHtml,
  injectFigure,
  siteCreds,
  isConfigured,
} from "../functions/api/products/_wc.js";

test("slugify: bỏ dấu tiếng Việt, đ→d, kebab-case", () => {
  assert.equal(slugify("Máy dò sóng Doscom D5"), "may-do-song-doscom-d5");
  assert.equal(slugify("NOMA 620 — Phục hồi đèn pha"), "noma-620-phuc-hoi-den-pha");
  assert.equal(slugify("  Đèn/Pha  "), "den-pha");
});

test("priceFields: có giá gốc > giá bán → regular=gốc, sale=bán", () => {
  assert.deepEqual(priceFields("2.500.000", "3.500.000"), { regular_price: "3500000", sale_price: "2500000" });
});

test("priceFields: không có giá gốc → chỉ regular", () => {
  assert.deepEqual(priceFields("250000", ""), { regular_price: "250000" });
});

test("priceFields: giá gốc <= giá bán → bỏ sale (không giảm giá ảo)", () => {
  assert.deepEqual(priceFields("300000", "250000"), { regular_price: "300000" });
});

test("figureHtml: có <img> + alt escape + figcaption khi có caption", () => {
  const h = figureHtml("https://x/y.jpg", 'alt "kép"', "chú thích");
  assert.match(h, /<img src="https:\/\/x\/y\.jpg"/);
  assert.match(h, /alt="alt &quot;kép&quot;"/);
  assert.match(h, /<figcaption/);
  assert.doesNotMatch(figureHtml("u", "a", ""), /<figcaption/);
});

test("injectFigure: chèn sau <h2> khớp, ngay sau </p> đầu tiên", () => {
  const html = "<h2>Vì sao nên chọn</h2><p>Đoạn một.</p><p>Đoạn hai.</p>";
  const out = injectFigure(html, "Vì sao nên chọn", "u.jpg", "a", "c");
  const figIdx = out.indexOf("<figure");
  assert.ok(figIdx > out.indexOf("Đoạn một."), "figure phải sau đoạn đầu");
  assert.ok(figIdx < out.indexOf("Đoạn hai."), "figure phải trước đoạn hai");
});

test("injectFigure: không khớp heading → nối cuối bài", () => {
  const html = "<h2>Khác</h2><p>x.</p>";
  const out = injectFigure(html, "Không tồn tại", "u.jpg", "a", "");
  assert.ok(out.trimEnd().endsWith("</figure>"), "figure ở cuối");
});

test("siteCreds/isConfigured: đọc đúng biến env theo site, thiếu → chưa cấu hình", () => {
  const env = {
    WC_DOSCOM_USER: "adminql", WC_DOSCOM_APP_PWD: "p",
    WC_DOSCOM_CK: "ck", WC_DOSCOM_CS: "cs",
  };
  const c = siteCreds("doscom", env);
  assert.equal(c.url, "https://doscom.vn");
  assert.equal(c.user, "adminql");
  assert.ok(isConfigured(c));
  assert.equal(isConfigured(siteCreds("noma", env)), false);
});
