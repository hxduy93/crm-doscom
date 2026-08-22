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
