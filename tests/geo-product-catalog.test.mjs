import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRODUCT_CATALOG,
  catalogText,
  isRealProduct,
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
