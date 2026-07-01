import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRODUCT_CATALOG,
  catalogText,
  isRealProduct,
  findProductsInText,
  ideaHasValidProduct,
} from "../functions/api/geo/_utils/product-catalog.js";

test("catalog có cả doscom + noma, mỗi mục đủ name + use", () => {
  for (const brand of ["doscom", "noma"]) {
    const items = PRODUCT_CATALOG[brand];
    assert.ok(Array.isArray(items) && items.length > 0, `${brand} phải có sản phẩm`);
    for (const p of items) {
      assert.ok(p.name && typeof p.name === "string", "phải có name");
      assert.ok(p.use && typeof p.use === "string", "phải có use");
    }
  }
});

test("catalogText render đúng danh mục, chứa sản phẩm thật", () => {
  const noma = catalogText("noma");
  assert.match(noma, /NOMA 620/);   // phục hồi đèn pha
  assert.match(noma, /NOMA 911/);
  const doscom = catalogText("doscom");
  assert.match(doscom, /Doscom D1\b/);
  assert.match(doscom, /Doscom DV3/);
  // brand không tồn tại → chuỗi rỗng, KHÔNG throw
  assert.equal(catalogText("khong-co"), "");
});

test("isRealProduct: chống bịa — chỉ true với sản phẩm trong danh mục", () => {
  assert.equal(isRealProduct("noma", "NOMA 620"), true);
  assert.equal(isRealProduct("noma", "noma 620"), true); // không phân biệt hoa thường
  assert.equal(isRealProduct("doscom", "Doscom DV3"), true);
  // các tên bịa phải là false
  assert.equal(isRealProduct("noma", "NOMA 999"), false);
  assert.equal(isRealProduct("doscom", "Doscom X-9000"), false);
  assert.equal(isRealProduct("noma", ""), false);
});

test("findProductsInText: dò đúng sản phẩm thật trong câu title", () => {
  const found = findProductsInText("noma", "Phục hồi đèn pha ố vàng với NOMA 620 hiệu quả 2026");
  assert.deepEqual(found, ["NOMA 620"]);
  // không có sản phẩm nào → mảng rỗng
  assert.deepEqual(findProductsInText("noma", "Cách chăm sóc xe tại nhà"), []);
  // tên bịa không được nhận là thật
  assert.deepEqual(findProductsInText("noma", "Dùng NOMA 999 siêu việt"), []);
});

test("ideaHasValidProduct: guardrail — chỉ pass khi featured_product thật VÀ có trong title", () => {
  // hợp lệ
  assert.equal(ideaHasValidProduct("noma", {
    title: "Phục hồi đèn pha với NOMA 620 2026", featured_product: "NOMA 620",
  }), true);
  // featured_product bịa → loại
  assert.equal(ideaHasValidProduct("noma", {
    title: "Đèn pha với NOMA 999", featured_product: "NOMA 999",
  }), false);
  // featured_product thật nhưng KHÔNG có trong title → loại (title phải chứa sản phẩm)
  assert.equal(ideaHasValidProduct("noma", {
    title: "Phục hồi đèn pha ố vàng 2026", featured_product: "NOMA 620",
  }), false);
  // thiếu field → loại
  assert.equal(ideaHasValidProduct("noma", { title: "Bài không có sản phẩm" }), false);
  assert.equal(ideaHasValidProduct("noma", null), false);
});
