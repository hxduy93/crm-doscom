import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NOMA_FORBIDDEN,
  foldVi,
  scanForbidden,
} from "../functions/api/geo/_utils/noma-brandcore.js";
import { isNomaProduct } from "../functions/api/products/_wc.js";

test("foldVi bỏ dấu + hạ thường + đ→d, giữ độ dài 1:1", () => {
  assert.equal(foldVi("Sản Xuất Tại Mỹ"), "san xuat tai my");
  assert.equal(foldVi("Độ bền").length, "Độ bền".length);
});

test("scanForbidden bắt vi phạm xuất xứ (Made in USA, công nghệ Mỹ, hàng Mỹ về)", () => {
  const types = (t) => scanForbidden(t).map((x) => x.type);
  assert.ok(types("Sản phẩm Made in USA cao cấp").some((t) => /Made in USA/.test(t)));
  assert.ok(types("Ứng dụng công nghệ Mỹ hiện đại").some((t) => /công nghệ Mỹ/.test(t)));
  assert.ok(types("Đây là hàng Mỹ về chính ngạch").some((t) => /hàng Mỹ về/.test(t)));
  assert.ok(types("Phân phối của Noma USA tại VN").some((t) => /Noma USA/.test(t)));
});

test("scanForbidden bắt claim tuyệt đối + từ cấm", () => {
  assert.ok(scanForbidden("An toàn tuyệt đối cho xe").length > 0);
  assert.ok(scanForbidden("Bảo hành trọn đời").length > 0);
  assert.ok(scanForbidden("Sản phẩm số 1 thị trường").length > 0);
  assert.ok(scanForbidden("Xịt kính siêu rẻ").length > 0);
  assert.ok(scanForbidden("Xoá hoàn toàn mọi vết bẩn").length > 0);
});

test("scanForbidden KHÔNG báo nhầm các cụm brand core ĐÚNG (chuẩn Mỹ / gốc Mỹ / OEM quốc tế)", () => {
  assert.deepEqual(scanForbidden("Chăm xe chuẩn Mỹ, tự làm tại nhà"), []);
  assert.deepEqual(scanForbidden("Thương hiệu gốc Mỹ, sản xuất qua đối tác OEM quốc tế"), []);
  assert.deepEqual(scanForbidden("Có MSDS theo chuẩn GHS, nhập khẩu chính ngạch"), []);
});

test("scanForbidden bỏ thẻ HTML trước khi quét", () => {
  assert.ok(scanForbidden("<p><strong>Made in USA</strong></p>").length > 0);
});

test("scanForbidden trả quote là đoạn khớp từ text gốc", () => {
  const r = scanForbidden("Cam kết an toàn tuyệt đối");
  assert.ok(r.length >= 1);
  assert.ok(r[0].quote && r[0].quote.length > 0);
});

test("NOMA_FORBIDDEN mỗi mục có type + regex", () => {
  for (const f of NOMA_FORBIDDEN) {
    assert.ok(typeof f.type === "string" && f.type.length > 0);
    assert.ok(f.re instanceof RegExp);
  }
});

test("isNomaProduct: đúng cho SP NOMA, sai cho SP Doscom", () => {
  assert.equal(isNomaProduct({ name: "NOMA 911 tẩy ố kính" }), true);
  assert.equal(isNomaProduct({ name: "Dung dịch", description: "công thức noma" }), true);
  assert.equal(isNomaProduct({ name: "Doscom D1 máy dò camera" }), false);
  assert.equal(isNomaProduct({ name: "" }), false);
});
