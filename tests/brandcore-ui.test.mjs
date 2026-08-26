import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* Canh giao diện trang "Sửa brandcore".

   Vì sao có file này: 22/08/2026 cửa sổ duyệt nội dung bổ sung BẬT LÊN NGAY khi mở
   trang (rỗng, không có nội dung) và bấm × không tắt. Nguyên nhân không phải lỗi
   JavaScript — cú pháp hoàn toàn hợp lệ — mà là thứ tự CSS: `.hide{display:none}`
   khai TRƯỚC `.modal-bg{display:flex}`, hai luật cùng độ ưu tiên thì luật đứng sau
   thắng, nên class `hide` mất tác dụng.

   Loại lỗi này không có công cụ nào bắt hộ, chỉ lộ khi mở trang thật → phải canh
   bằng test.
*/
const HTML = readFileSync(new URL("../brandcore-fix.html", import.meta.url), "utf8");

// Lấy phần <style> để soi thứ tự luật.
const CSS = (HTML.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || "";
assert.ok(CSS, "không trích được khối <style> của trang");

test("cửa sổ nổi mặc định ĐANG ẨN trong HTML", () => {
  const m = HTML.match(/<div id="duyetModal"[^>]*class="([^"]*)"/);
  assert.ok(m, "không tìm thấy thẻ #duyetModal");
  assert.match(m[1], /\bhide\b/, "phải có class hide ngay trong HTML, không đợi JS ẩn");
});

test("class hide phải THẮNG được display của .modal-bg", () => {
  const iHide = CSS.search(/(^|\n)\s*\.hide\s*\{/);
  const iModal = CSS.search(/(^|\n)\s*\.modal-bg\s*\{/);
  assert.ok(iHide >= 0 && iModal >= 0, "thiếu một trong hai luật .hide / .modal-bg");

  const coLuatRieng = /\.modal-bg\.hide\s*\{[^}]*display\s*:\s*none/.test(CSS);
  const hideImportant = /\.hide\s*\{[^}]*display\s*:\s*none\s*!important/.test(CSS);
  const hideDungSau = iHide > iModal;

  assert.ok(
    coLuatRieng || hideImportant || hideDungSau,
    "Cửa sổ sẽ KHÔNG ẨN được: `.hide` khai trước `.modal-bg` mà không có luật `.modal-bg.hide` " +
    "hay `!important` để thắng lại. Đây đúng là lỗi đã xảy ra 22/08/2026.",
  );
});

test("có đủ nút đóng cửa sổ — không được để người dùng kẹt trong đó", () => {
  assert.match(HTML, /id="duyetDong"/, "thiếu nút ×");
  assert.match(HTML, /key === "Escape"/, "thiếu lối thoát bằng phím Esc");
});

test("ba nấc dò → soạn → áp vẫn còn đủ nút", () => {
  for (const id of ["btnGap", "btnGapDraft", "duyetAp", "duyetBoQua"]) {
    assert.match(HTML, new RegExp(`id="${id}"`), `thiếu nút #${id}`);
  }
});

/* ══════════════════════════════════════════════════════════════════════════════
   LƯỢT GHI KHÔNG ĐƯỢC IM LẶNG.

   Ca thật 27/08/2026: chủ dự án vá 16 tiêu đề ở tab "Bài hướng dẫn", rồi sang tab
   "Tiêu đề bài viết" (danh sách quét từ trước, vẫn giữ tiêu đề CŨ) bấm "Vá tiêu đề đã
   chọn". Máy chủ trả về "không có gì thay đổi" cho cả 16 bài — đúng, vì web đã mang
   đúng tiêu đề đó rồi. Nhưng giao diện bỏ qua mọi dòng không applied: không dòng nào
   biến mất, khối "đã xong" trống, không thông báo gì → nhìn hệt như nút hỏng.
   ══════════════════════════════════════════════════════════════════════════════ */
test("dòng BỊ BỎ QUA vẫn phải hiện ra, kèm lý do", () => {
  assert.ok(!/if \(!it\.applied && !it\.error\) continue;/.test(HTML),
    "không được loại dòng bỏ qua khỏi khối 'đã xong' — im lặng là người dùng tưởng nút hỏng");
  assert.match(HTML, /bo_qua: it\.skipped \|\| null/, "phải giữ lý do máy chủ bỏ qua");
  assert.match(HTML, /pill grey">bỏ qua/, "phải vẽ nhãn 'bỏ qua' trong bảng đã xong");
});

test("mỗi lượt ghi phải có tóm tắt ở chỗ luôn nhìn thấy", () => {
  // Thanh trên cùng dính khi cuộn — đặt tóm tắt ở đó thì không phải cuộn đi tìm.
  assert.match(HTML, /\$\("#tienDo"\)\.innerHTML = `\$\{viecLam\}: <b>\$\{ghi\}<\/b> đã ghi/);
});

test("mục ĐÃ XỬ LÝ thì không hiện lại nữa — kể cả ở tab khác và ở lần quét sau", () => {
  /* Một bài viết nằm ở CẢ "Bài hướng dẫn" lẫn "Tiêu đề bài viết". Sổ `daXuLy` khoá theo
     `target:id` nên vá ở tab nào là biến khỏi cả hai, và lần quét sau cũng không hiện.
     Không có nó thì bấm tiếp bên kia là gửi đúng cái web đang có → lượt ghi rỗng, nhìn
     hệt như nút hỏng (ca thật 27/08/2026). */
  assert.match(HTML, /const daXuLy = new Map\(\);/);
  assert.match(HTML, /const khoaXuLy = \(target, id\) => `\$\{target\}:\$\{id\}`;/,
    "phải khoá theo NGUỒN chứ không theo tab, không thì mỗi tab quên một kiểu");
  assert.match(HTML, /it\.applied \|\| it\.skipped === "không có gì thay đổi"/,
    "web đã mang đúng nội dung định ghi cũng phải coi là xong");
  assert.match(HTML, /function conViec/, "tab phải đếm theo việc CÒN LẠI");
});

test("giấu bớt thì phải nói là đang giấu, và soi lại được", () => {
  // Giấu im lặng thì lần sau người dùng tưởng công cụ quét sót.
  assert.match(HTML, /Đang ẩn <b>\$\{n\}<\/b> mục đã xử lý trong phiên này/);
  assert.match(HTML, /id="btnHienLai"/);
});

test("ai đó sửa ngược trên web thì mục đó phải hiện lại", () => {
  /* Ẩn vĩnh viễn theo id là sai: bài bị sửa ngược trên WordPress sẽ không bao giờ được
     báo nữa. Nên sổ có lưu GIÁ TRỊ đã ghi và đối chiếu lại ở lần quét sau. */
  assert.match(HTML, /if \(d\.gia_tri == null\) return true;/);
  assert.match(HTML, /\[row\.tieu_de, row\.name\]\.some\(\(x\) => x != null && String\(x\) === d\.gia_tri\)/);
});

test("esc() phải chặn cả dấu nháy — giá trị đi thẳng vào thuộc tính HTML", () => {
  /* Tiêu đề/tên sản phẩm được nhét vào value="…", href="…", data-id="…". Chỉ escape
     &<> thì một dấu " trong tiêu đề là vỡ thẻ input: ô nhập mất nội dung phía sau và
     phần còn lại biến thành thuộc tính rác. */
  // Không cắt ở dấu chấm phẩy đầu tiên: chính chuỗi "&amp;" đã có một cái.
  const m = HTML.match(/const esc = \(s\) =>[\s\S]{0,300}/);
  assert.ok(m, "không tìm thấy hàm esc()");
  assert.match(m[0], /&quot;/, "thiếu escape dấu nháy kép");
  assert.match(m[0], /&#39;/, "thiếu escape dấu nháy đơn");
});
