import { test } from "node:test";
import assert from "node:assert/strict";
import {
  slugify,
  priceFields,
  figureHtml,
  injectFigure,
  siteCreds,
  isConfigured,
  deriveKeyword,
  vndToUsd,
  usdPriceFields,
  injectByPosition,
  productSlug,
  SITE_URL,
} from "../functions/api/products/_wc.js";

test("productSlug: URL = tên SP + công dụng (dùng chung cho doscom.vn/noma.vn/nomaauto.us)", () => {
  assert.equal(productSlug("NOMA 911", "phục hồi đèn pha"), "noma-911-phuc-hoi-den-pha");
  assert.equal(productSlug("NOMA 911", "headlight restoration"), "noma-911-headlight-restoration");
});

test("productSlug: từ đã có trong tên thì không lặp lại", () => {
  assert.equal(
    productSlug("Bọt vệ sinh đa năng - Noma680", "bọt vệ sinh đa năng"),
    "bot-ve-sinh-da-nang-noma680"
  );
  assert.equal(productSlug("NOMA 922 Phục hồi", "phục hồi đèn pha"), "noma-922-phuc-hoi-den-pha");
});

test("productSlug: thiếu công dụng hoặc thiếu tên → dùng phần còn lại", () => {
  assert.equal(productSlug("NOMA 911", ""), "noma-911");
  assert.equal(productSlug("", "phục hồi đèn pha"), "phuc-hoi-den-pha");
});

test("productSlug: slug dài bị cắt TRÒN TỪ, không đứt giữa chữ", () => {
  const s = productSlug("Dung dịch phục hồi đèn pha ô tô chuyên dụng NOMA 911", "làm sạch bề mặt kính lái xe hơi");
  assert.ok(s.length <= 80);
  assert.ok(!s.endsWith("-"));
  assert.ok(s.startsWith("dung-dich-phuc-hoi-den-pha"));
  // không cắt cụt giữa 1 từ: mọi token cuối phải là từ nguyên vẹn có trong nguồn
  const src = "dung dich phuc hoi den pha o to chuyen dung noma 911 lam sach be mat kinh lai xe hoi".split(" ");
  assert.ok(s.split("-").every((t) => src.includes(t)));
});

test("vndToUsd: đổi VND (có dấu chấm) → USD 2 số lẻ theo tỉ giá", () => {
  assert.equal(vndToUsd("265.000", 26500), "10.00");
  assert.equal(vndToUsd("99000", 26500), "3.74");
  assert.equal(vndToUsd("", 26500), "");
});

test("usdPriceFields: giá gốc>bán → regular=gốc USD, sale=bán USD", () => {
  assert.deepEqual(usdPriceFields("265000", "530000", 26500), { regular_price: "20.00", sale_price: "10.00" });
  assert.deepEqual(usdPriceFields("265000", "", 26500), { regular_price: "10.00" });
});

test("injectByPosition: chèn ảnh sau H2 theo thứ tự (cho bài EN)", () => {
  const html = "<h2>Overview</h2><p>Intro.</p><h2>How to use</h2><p>Steps.</p>";
  const out = injectByPosition(html, [
    { url: "a.jpg", alt: "a", caption: "" },
    { url: "b.jpg", alt: "b", caption: "" },
  ]);
  assert.ok(out.indexOf("a.jpg") > out.indexOf("Intro.") && out.indexOf("a.jpg") < out.indexOf("How to use"), "ảnh 1 sau H2 đầu");
  assert.ok(out.indexOf("b.jpg") > out.indexOf("Steps."), "ảnh 2 sau H2 hai");
});

test("SITE_URL có nomaauto.us", () => {
  assert.equal(SITE_URL.nomaauto, "https://nomaauto.us");
});

test("deriveKeyword: fallback keyword sạch từ tên (bỏ model + đơn vị)", () => {
  assert.equal(deriveKeyword("Bọt vệ sinh đa năng - Noma680"), "bọt vệ sinh đa năng");
  assert.equal(deriveKeyword("Bọt vệ sinh đa năng Noma 680 – 650ml"), "bọt vệ sinh đa năng noma");
  assert.ok(deriveKeyword("Máy dò sóng Doscom D5").length > 0);
});

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
