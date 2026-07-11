import { test } from "node:test";
import assert from "node:assert/strict";
import { isNomaProductName } from "../functions/api/products/generate.js";
import { findSkuCode, skuSpecText } from "../functions/api/geo/_utils/noma-sku-specs.js";

// Lỗi cũ: brand core + thông số 17 SKU chỉ nạp khi site==="noma". UI chọn "Cả 3 web" gửi
// site="doscom" (product-publisher.html) → bài NOMA viết ra KHÔNG có brand core, KHÔNG có HDSD chuẩn.
test("SP NOMA đăng lên doscom.vn / Cả 3 web vẫn nhận diện là NOMA (theo tên, không theo site)", () => {
  assert.equal(isNomaProductName("NOMA 110 — Dầu tẩy rỉ và bôi trơn đa năng", "doscom"), true);
  assert.equal(isNomaProductName("Dung Dịch Tẩy Ố Kính Chuyên Sâu – Noma 911", "doscom"), true);
});

test("site=noma vẫn luôn là NOMA kể cả tên không ghi chữ NOMA", () => {
  assert.equal(isNomaProductName("Dung dịch phủ nano kính", "noma"), true);
});

test("SP Doscom (an ninh) KHÔNG bị áp brand core NOMA", () => {
  assert.equal(isNomaProductName("Máy dò camera ẩn Doscom D5", "doscom"), false);
  assert.equal(isNomaProductName("", "doscom"), false);
});

test("5 SKU chưa đăng đều dò được mã + có thông số chuẩn để AI viết bài", () => {
  for (const [name, code] of [
    ["NOMA 110 — Dầu tẩy rỉ và bôi trơn đa năng", "110"],
    ["NOMA 120 — Dung dịch vệ sinh súc rửa kim phun", "120"],
    ["NOMA 130 — Xịt silicone dưỡng ron cao su", "130"],
    ["NOMA 880 — Dung dịch phủ tinh thể bảo vệ sơn", "880"],
    ["NOMA 998 — Dung dịch vá & bơm lốp khẩn cấp", "998"],
  ]) {
    assert.equal(findSkuCode(name), code, `phải dò ra mã ${code}`);
    const spec = skuSpecText(code);
    assert.match(spec, /Công dụng:/, `SKU ${code} phải có công dụng`);
    assert.match(spec, /Hướng dẫn sử dụng/, `SKU ${code} phải có HDSD`);
  }
});
