// Khung sale DOSCOM đổi được ngày: thông số khớp HUONG-DAN-KHUNG-SALE.md + luật brand mục 6.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DOSCOM_FRAME, brandWordViolations, tagPercentMismatch } from "../functions/lib/sale-images.js";

test("thông số khung khớp file hướng dẫn designer", () => {
  assert.equal(DOSCOM_FRAME.bar.h, 130);
  assert.deepEqual(DOSCOM_FRAME.bar.stops, ["#D32F2F", "#F4511E", "#FB8C00"]);
  assert.deepEqual(DOSCOM_FRAME.badge.stops, ["#FFD54F", "#FFB300"]);
  assert.equal(DOSCOM_FRAME.badge.text, "#C62828");
  assert.equal(DOSCOM_FRAME.tag.right, 56);
  assert.equal(DOSCOM_FRAME.tag.w, 230);
  assert.equal(DOSCOM_FRAME.tag.h, 160);
  assert.equal(DOSCOM_FRAME.chip.w, 230);
  assert.equal(DOSCOM_FRAME.chip.h, 52);
  assert.match(DOSCOM_FRAME.font, /Nunito/);
});

test("chặn từ brand cấm, không báo nhầm", () => {
  assert.deepEqual(brandWordViolations("SALE GIỮA THÁNG", "15.9", "GIẢM TỚI", "-30%"), []);
  assert.deepEqual(brandWordViolations("GIÁ SỐC 10.10"), ["giá sốc"]);
  assert.deepEqual(brandWordViolations("Rẻ nhất thị trường"), ["rẻ nhất"]);
  assert.deepEqual(brandWordViolations("Số 1 Việt Nam"), ["số 1"]);
  assert.deepEqual(brandWordViolations("Top số 10"), []);
  assert.deepEqual(brandWordViolations("Hoàn tiền 100 %"), ["100%"]);
  assert.deepEqual(brandWordViolations("siêu rẻ", "SIÊU RẺ"), ["siêu rẻ"]);
});

test("mức giảm trên khung phải khớp giá thật trên web", () => {
  const p30 = { regular_price: "1000000", sale_price: "700000" };
  assert.equal(tagPercentMismatch("-30%", p30), null);
  assert.match(tagPercentMismatch("-30%", { regular_price: "1000000", sale_price: "900000" }), /giảm 10%/);
  assert.match(tagPercentMismatch("-30%", { regular_price: "1000000", sale_price: "" }), /chưa có giá sale/);
  assert.equal(tagPercentMismatch("SALE", p30), null);
  assert.equal(tagPercentMismatch("", p30), null);
});

test("trang Ảnh sale có khung DOSCOM và kiểm brand trước khi gắn", () => {
  const page = readFileSync(new URL("../sale-images.html", import.meta.url), "utf8");
  assert.match(page, /value="doscom"/);
  assert.match(page, /DOSCOM_FRAME/);
  assert.match(page, /brandWordViolations/);
  assert.match(page, /tagPercentMismatch/);
  assert.doesNotMatch(page, /[Gg]iá sốc/, "placeholder cũ dùng từ brand cấm");
});
