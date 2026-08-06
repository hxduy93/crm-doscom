import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRODUCTS } from "../functions/lib/product-catalog.js";
import { NOMA_SKU_SPECS } from "../functions/api/geo/_utils/noma-sku-specs.js";

// 06/08/2026: nạp nội dung 3 SKU Noma có landing riêng (680 · 350 · 230) để dùng
// được "Tạo Ads tự động". LUẬT: không bịa số liệu — công dụng/HDSD/thời gian phải
// khớp NGUYÊN tài liệu 17 SKU (noma-sku-specs.js), giá khớp PRICING của landing.

const BA_SKU = [
  { key: "Noma 680", code: "680" },
  { key: "Noma 350", code: "350" },
  { key: "Noma 230", code: "230" },
];

test("ba sản phẩm đã có trong catalog cho AI viết caption", () => {
  for (const { key } of BA_SKU) assert.ok(PRODUCTS[key], `thiếu ${key} trong PRODUCTS`);
});

test("hướng dẫn sử dụng khớp NGUYÊN tài liệu 17 SKU, không tự rút gọn", () => {
  for (const { key, code } of BA_SKU) {
    const chuan = NOMA_SKU_SPECS[code].hdsd;
    const cat = PRODUCTS[key].usage;
    assert.equal(cat.length, chuan.length, `${key}: số bước HDSD lệch tài liệu chuẩn`);
    // Bước đầu của 230 có thêm ghi chú "bề mặt PHẢI khô" lấy từ landing → so lỏng:
    // mỗi bước trong catalog phải chứa đủ chữ của bước chuẩn tương ứng.
    chuan.forEach((b, i) => {
      const goc = b.split("(")[0].trim();
      assert.ok(cat[i].includes(goc.slice(0, 18)),
        `${key} bước ${i + 1}: "${cat[i]}" không khớp tài liệu "${b}"`);
    });
  }
});

test("thời gian hiệu lực lấy đúng tài liệu, không hứa vĩnh viễn", () => {
  for (const { key, code } of BA_SKU) {
    assert.equal(PRODUCTS[key].effectDuration, NOMA_SKU_SPECS[code].thoi_gian);
    assert.doesNotMatch(PRODUCTS[key].effectDuration, /vĩnh viễn|mãi mãi/i);
  }
});

test("giá khớp bảng giá landing", () => {
  assert.match(PRODUCTS["Noma 680"].priceRange, /99\.000đ \/ chai 650ml/);
  assert.match(PRODUCTS["Noma 350"].priceRange, /159\.000đ/);
  assert.match(PRODUCTS["Noma 230"].priceRange, /99\.000đ \/ chai 450ml/);
});

test("giữ nguyên luật Brand Core: cấm từ tuyệt đối và claim xuất xứ Mỹ", () => {
  for (const { key } of BA_SKU) {
    const p = PRODUCTS[key];
    for (const tu of ["100%", "tuyệt đối", "số 1", "tốt nhất"]) {
      assert.ok(p.avoidWords.includes(tu), `${key}: thiếu từ cấm "${tu}"`);
    }
    assert.ok(p.avoidWords.some(w => /Mỹ/.test(w)), `${key}: thiếu cấm claim xuất xứ Mỹ`);
    assert.equal(p.guarantee, null, `${key}: hàng tiêu dùng thì không có bảo hành`);
    assert.ok(p.source, `${key}: phải ghi nguồn số liệu`);
  }
});

// ── Trình tạo QC ────────────────────────────────────────────────────────────
const html = readFileSync(new URL("../ads-creator.html", import.meta.url), "utf8");

test("ba sản phẩm có mặt trong Trình tạo QC kèm pixel + landing đúng", () => {
  assert.match(html, /"Noma 680":\s*\{ pixel: "1281580350573958"/);
  assert.match(html, /"Noma 350":\s*\{ pixel: "1045069881269455"/);
  assert.match(html, /"Noma 230":\s*\{ pixel: "2082661435656423"/);
  assert.match(html, /nomaautocares\.cloud\/nm680d/);
  assert.match(html, /noma890\.click\/nm350d/);
  assert.match(html, /noma620\.click\/nm230d/);
});

test("đổi sản phẩm ở tab tự động thì tự điền link + pixel", () => {
  const fn = html.match(/const onAutoProductChange = \(p\) => \{[\s\S]*?\n  \}/);
  assert.ok(fn, "không trích được onAutoProductChange");
  assert.match(fn[0], /setAutoLink\(cfg\.link\)/, "phải tự điền link đích của sản phẩm");
  assert.match(fn[0], /setAutoPixel\(cfg\.pixel\)/, "phải tự điền pixel của sản phẩm");
  assert.doesNotMatch(fn[0], /setAutoAccount|setAutoPage/,
    "KHÔNG tự đổi tài khoản/Page — người chạy có thể cố ý chạy ở tài khoản khác");
});

// 06/08/2026 (chiều): pixel NOMA 230 đã được gán đủ 7/7 tài khoản QC bên BM YODAY
// → gỡ nhãn cảnh báo. Ba pixel Noma giờ đứng ngang hàng nhau.
test("ba pixel Noma đều dùng được, không còn nhãn cảnh báo", () => {
  assert.match(html, /"2082661435656423":\s*"NOMA 230"/);
  assert.doesNotMatch(html, /chưa gán vào tkqc/,
    "pixel đã gán rồi thì bỏ cảnh báo, kẻo người chạy né oan");
});
