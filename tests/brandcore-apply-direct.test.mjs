import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* Đường ghi THẲNG nội dung mới của brandcore-apply (dùng cho phần "soát nội dung thiếu").

   Vì sao có file này: 22/08/2026 chủ dự án báo "không xem được đã sửa hay chưa".
   Truy ra endpoint ghi CHƯA BAO GIỜ ghi nội dung bổ sung — nó bắt buộc phải có
   `fx.violations` (các cặp thay chuỗi), không có thì âm thầm bỏ qua và trả
   applied:false. Giao diện lại chỉ nhìn `ok` của phản hồi nên vẫn báo "Đã ghi".
   Hai lỗi cộng lại thành: bấm xong tưởng xong, thực tế web không đổi gì.

   Chú thích đầu file endpoint vốn đã mô tả kiểu ghi thẳng — chỉ là code chưa làm.
*/
const SRC = readFileSync(new URL("../functions/api/products/brandcore-apply.js", import.meta.url), "utf8")
  .split("\r\n").join("\n");
const UI = readFileSync(new URL("../brandcore-fix.html", import.meta.url), "utf8");

test("gửi `description` mà KHÔNG có cặp sửa thì vẫn phải ghi, không bỏ qua", () => {
  assert.match(SRC, /const ghiThang = typeof fx\.description === "string"/,
    "mất nhánh ghi thẳng — nút 'Áp lên web' của phần soát thiếu sẽ lại không ghi được gì");
  assert.match(SRC, /if \(!violations\.length && !ghiThang\)/,
    "chỉ được bỏ qua khi KHÔNG có cả cặp sửa lẫn nội dung ghi thẳng");
});

test("ghi thẳng KHÔNG được đụng mô tả ngắn nếu người gọi không gửi", () => {
  // Phần bổ sung chỉ nối vào mô tả dài. Ghi đè mô tả ngắn bằng chuỗi rỗng là xoá
  // mất nội dung đang hiển thị ở trang danh mục.
  assert.match(SRC, /typeof fx\.short_description === "string" \? fx\.short_description : \(orig\.short_description \|\| ""\)/);
});

test("nhánh cặp sửa cũ vẫn còn nguyên — không phá luồng sửa từ cấm", () => {
  assert.match(SRC, /applyFixes\(orig\.description \|\| "", violations\)/);
  assert.match(SRC, /applyFixes\(orig\.short_description \|\| "", violations\)/);
});

test("vẫn sao lưu bản gốc trước khi ghi, kể cả đường ghi thẳng", () => {
  /* Phải bám ĐÚNG lệnh ghi trong vòng lặp áp bản sửa. Tìm "updateProduct" đầu tiên
     trong file sẽ ra nhánh HOÀN TÁC ở phía trên — đó là lý do bản test đầu tiên của
     tôi báo đỏ nhầm. */
  const iBackup = SRC.indexOf("KV_BACKUP(site, id, ts)");
  const iUpdate = SRC.indexOf("updateProduct(c, id, { description: newDesc");
  assert.ok(iBackup > 0, "mất bước sao lưu");
  assert.ok(iUpdate > iBackup, "phải sao lưu TRƯỚC khi ghi đè");
});

// ── Giao diện: không được báo thành công khi web chưa nhận ──────────────────

test("giao diện phải soi items[].applied, không tin mỗi `ok` của phản hồi", () => {
  assert.match(UI, /const it = \(j\.items \|\| \[\]\)\.find/,
    "phải tìm đúng dòng kết quả của sản phẩm này");
  assert.match(UI, /if \(!it\.applied\)/,
    "applied=false mà vẫn báo 'Đã ghi' thì người dùng tưởng xong trong khi web không đổi");
});

test("ghi xong thì bài biến mất khỏi danh sách chờ sửa, không cần tải lại trang", () => {
  assert.match(UI, /function chuyenSangDaSua/);
  assert.match(UI, /khoi\.remove\(\)/, "phải gỡ khối sản phẩm khỏi danh sách đang hiển thị");
  assert.match(UI, /daSuaPhien\.push/, "phải đưa sang danh sách 'đã sửa' để còn thấy đường dẫn");
});

test("có đường dẫn mở bài đã sửa — cả trong cửa sổ lẫn bảng tổng kết", () => {
  assert.match(UI, /id="duyetXemBai"/, "thiếu nút mở bài ngay sau khi ghi");
  assert.match(UI, /a href="\$\{esc\(x\.permalink\)\}"/, "bảng 'đã sửa' phải có link từng bài");
});
