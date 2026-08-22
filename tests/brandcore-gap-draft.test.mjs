import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* Khối "nội dung bổ sung" ghi vào mô tả sản phẩm trên web.

   Ba hàm dưới đây nằm trong brandcore-scan.js (module-scope, không export vì chỉ dùng
   nội bộ) nên test trích thẳng từ file rồi dựng lại — chép sang đây là có hai bản luật.

   Vì sao canh: nội dung này do AI sinh ra rồi ĐI THẲNG vào trang bán hàng. Hai rủi ro
   thật: (1) chạy soạn hai lần thì bài có hai đoạn "Thành phần" trùng nhau, (2) AI trả
   về thẻ lạ/script lọt vào web.
*/

// Chuẩn hoá xuống dòng: checkout trên Windows ra CRLF, mẫu cắt theo dấu } đầu dòng sẽ hụt.
const SRC = readFileSync(new URL("../functions/api/products/brandcore-scan.js", import.meta.url), "utf8")
  .split("\r\n").join("\n");

function lay(ten) {
  const i = SRC.indexOf(`function ${ten}(`);
  assert.ok(i > 0, `không tìm thấy hàm ${ten} trong brandcore-scan.js`);
  const j = SRC.indexOf("\n}\n", i);
  assert.ok(j > i, `không cắt được thân hàm ${ten}`);
  return SRC.slice(i, j + 3);
}

const MARKS = SRC.match(/const MARK_OPEN = "[^"]+";\s*const MARK_CLOSE = "[^"]+";/)[0];
const { ghepBoSung, sanitizeHtml, MARK_OPEN, MARK_CLOSE } = new Function(
  `${MARKS}\n${lay("sanitizeHtml")}\n${lay("ghepBoSung")}\nreturn { ghepBoSung, sanitizeHtml, MARK_OPEN, MARK_CLOSE };`,
)();

test("soạn lần hai THAY khối cũ, không nối thêm khối trùng", () => {
  const goc = "<p>Mô tả gốc của sản phẩm.</p>";
  const lan1 = ghepBoSung(goc, `${MARK_OPEN}\n<h3>Thành phần</h3>\n${MARK_CLOSE}`);
  const lan2 = ghepBoSung(lan1, `${MARK_OPEN}\n<h3>Thành phần</h3><h3>Hạn dùng</h3>\n${MARK_CLOSE}`);

  assert.equal(lan2.split(MARK_OPEN).length - 1, 1, "chỉ được có MỘT khối bổ sung");
  assert.match(lan2, /Hạn dùng/, "nội dung mới phải vào");
  assert.match(lan2, /Mô tả gốc của sản phẩm/, "mô tả gốc phải còn nguyên");
  assert.equal(lan2.split("<h3>Thành phần</h3>").length - 1, 1, "không được nhân đôi mục cũ");
});

test("mô tả gốc luôn được giữ, khối bổ sung nằm ở CUỐI", () => {
  const out = ghepBoSung("<p>A</p>", `${MARK_OPEN}\nB\n${MARK_CLOSE}`);
  assert.ok(out.indexOf("<p>A</p>") < out.indexOf(MARK_OPEN), "phần gốc phải đứng trước");
});

test("mô tả đang trống vẫn ghép được", () => {
  assert.match(ghepBoSung("", `${MARK_OPEN}\nB\n${MARK_CLOSE}`), /B/);
});

test("lọc HTML: script và thuộc tính sự kiện KHÔNG được lọt vào trang bán hàng", () => {
  const ban = '<p onclick="steal()">Xin chào</p><script>alert(1)</script><iframe src="x"></iframe>';
  const sach = sanitizeHtml(ban);
  assert.ok(!/script|iframe|onclick/i.test(sach), "phải sạch thẻ và thuộc tính nguy hiểm");
  assert.match(sach, /Xin chào/, "chữ vẫn phải còn");
});

test("lọc HTML: giữ đúng bộ thẻ trình bày cho phép", () => {
  const sach = sanitizeHtml('<h3>Tiêu đề</h3><ul><li><strong>Đậm</strong></li></ul><div class="x">Bọc</div>');
  for (const t of ["<h3>", "<ul>", "<li>", "<strong>"]) assert.ok(sach.includes(t), `phải giữ ${t}`);
  assert.ok(!sach.includes("<div"), "thẻ ngoài danh sách phải bị bỏ");
  assert.match(sach, /Bọc/, "chữ bên trong thẻ bị bỏ vẫn phải giữ lại");
});
