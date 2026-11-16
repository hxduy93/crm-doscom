import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRODUCTS } from "../functions/lib/product-catalog.js";
import { CONG_THUC_SAN_PHAM } from "../functions/lib/ad-formula.js";
import { kiemTraBai } from "../functions/lib/ad-copy-validate.js";

// 16/11/2026: thêm Camera mini 4G DA1 Pro vào trang Tạo ads.

test("catalog DA1 Pro: giá landing, trung thực pin/chống nước/quay đêm", () => {
  const p = PRODUCTS["DA1 Pro"];
  assert.equal(p.brand, "DOSCOM");
  assert.ok(p.priceRange.includes("1.100.000đ"));
  // 16/11/2026: bỏ quà sim 4G — không câu nào được hứa tặng sim.
  assert.ok(p.priceRange.includes("KHÔNG kèm sim"));
  assert.ok(!p.usps.some((u) => /tặng/i.test(u)));
  assert.ok(p.avoidWords.includes("tặng sim"));
  assert.ok(p.limits.some((l) => /KHÔNG chống nước/.test(l)));
  assert.ok(p.limits.some((l) => /đen trắng/.test(l)));
  assert.ok(p.specs.some((l) => /chờ tới 15 ngày/.test(l) && /liên tục ~10 giờ/.test(l)));
  for (const cam of ["quay lén", "ẩn thân", "không bị phát hiện"]) assert.ok(p.avoidWords.includes(cam), cam);
});

test("công thức DA1 Pro có câu bắt buộc sim 4G; bộ kiểm nhận tên 'DA1' chứ không phải 'Pro'", () => {
  const bb = CONG_THUC_SAN_PHAM["DA1 Pro"].batBuoc.map((b) => new RegExp(b.re, "iu"));
  assert.ok(bb.some((r) => r.test("chỉ cần chỗ lắp có sóng 4G")));
  const bai = (ten) => ({ headline: "Camera 4G không cần Wifi", description: "",
    primary_text: `📷 ${ten} – Không cần Wifi\n\nNhà chưa có mạng.\n\nCamera chạy sim 4G.\n\n✅ a\n✅ b\n✅ c\n\n💼 Phù hợp cho: kho\n\n🎁 Bảo hành 12 tháng\n\n👉 Đặt tại đây: {{URL}}` });
  const loiTen = (v) => kiemTraBai(v, { productKey: "DA1 Pro", product: PRODUCTS["DA1 Pro"] }).filter((l) => /tên sản phẩm/.test(l));
  assert.deepEqual(loiTen(bai("Camera DA1 Pro Doscom")), []);
  assert.equal(loiTen(bai("Camera Pro Doscom")).length, 1);
});

test("trang tạo ads khai DA1 Pro: pixel riêng, link Duy/PN, tên pixel", () => {
  const html = readFileSync(new URL("../ads-creator.html", import.meta.url), "utf8");
  const P = new Function(`${html.match(/const PRODUCTS = \{[\s\S]*?\r?\n  \}/)[0]};\nreturn PRODUCTS`)();
  const X = new Function(`${html.match(/const PIXELS = \{[\s\S]*?\r?\n  \}/)[0]};\nreturn PIXELS`)();
  assert.deepEqual([P["DA1 Pro"].pixel, P["DA1 Pro"].link, P["DA1 Pro"].linkPn],
    ["325941099813664", "https://www.doscomholding.click/da1prolad", "https://www.doscomholding.click/da1protpn"]);
  assert.equal(X["325941099813664"], "DA1 PRO");
});
