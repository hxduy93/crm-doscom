import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NOMA_SKU_SPECS,
  findSkuCode,
  skuSpecText,
} from "../functions/api/geo/_utils/noma-sku-specs.js";

test("có đủ 17 SKU, mỗi SKU có name + cong_dung[] + hdsd[] + thoi_gian", () => {
  const codes = Object.keys(NOMA_SKU_SPECS);
  assert.equal(codes.length, 17);
  for (const [code, s] of Object.entries(NOMA_SKU_SPECS)) {
    assert.ok(s.name && s.name.includes(code), `${code}: name phải chứa mã`);
    assert.ok(Array.isArray(s.cong_dung) && s.cong_dung.length > 0, `${code}: cong_dung`);
    assert.ok(Array.isArray(s.hdsd) && s.hdsd.length >= 3, `${code}: hdsd >=3 bước`);
    assert.ok(s.thoi_gian && typeof s.thoi_gian === "string", `${code}: thoi_gian`);
  }
});

test("findSkuCode nhận đúng mã từ tên sản phẩm", () => {
  assert.equal(findSkuCode("NOMA 922 – Dung Dịch Phủ Nano Kính"), "922");
  assert.equal(findSkuCode("Dung dịch NOMA 250 phục hồi nhựa"), "250");
  assert.equal(findSkuCode("NOMA922 chống bám nước"), "922");
  assert.equal(findSkuCode("Camera Doscom DA1"), null);
  assert.equal(findSkuCode(""), null);
});

test("922 giữ đúng bước 'đợi 4 tiếng' (điểm web hay sai)", () => {
  const t = skuSpecText("922");
  assert.match(t, /4 TIẾNG|4 tiếng/);
  // HDSD 922 phải có bước đợi ≥4 tiếng (web hay ghi nhầm "5 phút")
  assert.ok(NOMA_SKU_SPECS["922"].hdsd.some((b) => /4 TIẾNG|4 tiếng/i.test(b)));
});

test("250 giữ đúng kỹ thuật 'một đường thẳng cùng hướng'", () => {
  assert.match(skuSpecText("250"), /MỘT ĐƯỜNG THẲNG|một đường thẳng/i);
});

test("692 giữ khuyến nghị 'xịt lên khăn trước' cho trần xe", () => {
  assert.match(skuSpecText("692"), /xịt lên KHĂN|lên khăn trước/i);
});

test("skuSpecText mã lạ trả rỗng", () => {
  assert.equal(skuSpecText("999"), "");
});
