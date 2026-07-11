import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NOMA_FORBIDDEN,
  foldVi,
  scanForbidden,
  applyFixes,
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

test("scanForbidden bắt từ cấm mới (vượt trội / đột phá / tiên tiến) + claim chứng nhận", () => {
  assert.ok(scanForbidden("ba khả năng vượt trội").some((x) => /vượt trội/.test(x.type)));
  assert.ok(scanForbidden("Công nghệ 2 tầng đột phá").some((x) => /đột phá/.test(x.type)));
  assert.ok(scanForbidden("Công nghệ tiên tiến").some((x) => /tiên tiến/.test(x.type)));
  assert.ok(scanForbidden("Tiêu chuẩn Quốc tế, được kiểm định kỹ lưỡng").some((x) => /quốc tế/.test(x.type)));
  assert.ok(scanForbidden("Đạt chứng nhận SGS").length > 0);
});

test("scanForbidden KHÔNG báo nhầm 'chuẩn quốc tế' (giá trị brand core hợp lệ)", () => {
  assert.deepEqual(scanForbidden("Chất lượng chuẩn quốc tế, minh bạch"), []);
  assert.deepEqual(scanForbidden("Giải pháp chăm xe đạt chuẩn quốc tế"), []);
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

test("applyFixes: thay chuỗi nhưng GIỮ NGUYÊN thẻ HTML / ảnh / xuống dòng", () => {
  const html = `<h2>Điểm nổi bật</h2>\n<ul>\n<li>Chống UV vượt trội</li>\n<li>An toàn tuyệt đối cho sơn</li>\n</ul>\n<img src='a.jpg' alt='x'/>\n<p>Kết luận.</p>`;
  const { fixed, applied } = applyFixes(html, [
    { type: "vượt trội", original: "vượt trội", fixed: "hiệu quả" },
    { type: "an toàn tuyệt đối", original: "An toàn tuyệt đối", fixed: "An toàn" },
  ]);
  // Cấu trúc thẻ giữ NGUYÊN: số lượng <li>, <img>, <p>, <h2>, xuống dòng không đổi
  assert.equal((fixed.match(/<li>/g) || []).length, 2);
  assert.equal((fixed.match(/<img /g) || []).length, 1);
  assert.equal((fixed.match(/<\/p>/g) || []).length, 1);
  assert.equal((fixed.match(/\n/g) || []).length, (html.match(/\n/g) || []).length);
  assert.ok(fixed.includes("<img src='a.jpg' alt='x'/>"));
  // Nội dung đã đổi
  assert.ok(fixed.includes("Chống UV hiệu quả"));
  assert.ok(fixed.includes("An toàn cho sơn"));
  assert.ok(!/vượt trội/.test(fixed));
  assert.equal(applied.length, 2);
});

test("applyFixes: cặp không khớp chữ gốc → BỎ QUA, không đụng gì", () => {
  const html = "<p>Nội dung sạch.</p>";
  const { fixed, applied, skipped } = applyFixes(html, [{ type: "x", original: "không tồn tại", fixed: "y" }]);
  assert.equal(fixed, html);
  assert.equal(applied.length, 0);
  assert.equal(skipped.length, 1);
});

test("isNomaProduct: đúng cho SP NOMA, sai cho SP Doscom", () => {
  assert.equal(isNomaProduct({ name: "NOMA 911 tẩy ố kính" }), true);
  assert.equal(isNomaProduct({ name: "Dung dịch", description: "công thức noma" }), true);
  assert.equal(isNomaProduct({ name: "Doscom D1 máy dò camera" }), false);
  assert.equal(isNomaProduct({ name: "" }), false);
});
