// Test việc gắn LINK ĐÍCH vào bài content.
//
// Prompt bảo model giữ placeholder {{URL}} để đánh dấu chỗ chèn link. Trước
// 2026-07-22 không ai thay nó, nên người chạy ads phải mở từng bài sửa tay —
// và chỉ cần sót một bài là quảng cáo chạy với chữ "{{URL}}" giữa nội dung.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fillUrlPlaceholder } from "../functions/api/generate-ad-copy.js";

const LINK = "https://www.noma.io.vn/nm911d";

test("thay đúng placeholder chuẩn", () => {
  assert.equal(
    fillUrlPlaceholder("👉 Đặt Noma 911 tại đây: {{URL}}", LINK),
    `👉 Đặt Noma 911 tại đây: ${LINK}`
  );
});

test("bắt cả các biến thể model hay viết lệch", () => {
  for (const bien_the of ["{{URL}}", "{URL}", "{{ URL }}", "{{url}}", "{{Url}}", "{ URL }"]) {
    assert.equal(
      fillUrlPlaceholder(`Mua tại: ${bien_the}`, LINK),
      `Mua tại: ${LINK}`,
      `chưa bắt được biến thể ${bien_the}`
    );
  }
});

test("thay HẾT mọi chỗ, không chỉ chỗ đầu tiên", () => {
  const out = fillUrlPlaceholder("Xem {{URL}} rồi đặt tại {{URL}} nhé", LINK);
  assert.equal(out.includes("{{URL}}"), false);
  assert.equal(out.match(new RegExp(LINK.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")).length, 2);
});

test("không có link → GIỮ NGUYÊN placeholder, không xoá mất dấu chỗ chèn", () => {
  for (const rong of ["", "   ", null, undefined]) {
    assert.equal(fillUrlPlaceholder("Đặt tại: {{URL}}", rong), "Đặt tại: {{URL}}");
  }
});

test("link có khoảng trắng thừa thì cắt trước khi chèn", () => {
  assert.equal(fillUrlPlaceholder("{{URL}}", `  ${LINK}  `), LINK);
});

test("bài không có placeholder thì giữ nguyên, không chèn bừa", () => {
  const bai = "Nội dung không có chỗ đặt link.";
  assert.equal(fillUrlPlaceholder(bai, LINK), bai);
});

test("text rỗng/null → chuỗi rỗng, không ném lỗi giữa lúc tạo camp", () => {
  assert.equal(fillUrlPlaceholder(null, LINK), "");
  assert.equal(fillUrlPlaceholder(undefined, LINK), "");
});

test("không đụng vào các dấu ngoặc nhọn khác trong bài", () => {
  const bai = "Giá {{GIA}} và mã {{CODE}} giữ nguyên, chỉ {{URL}} bị thay";
  const out = fillUrlPlaceholder(bai, LINK);
  assert.match(out, /\{\{GIA\}\}/);
  assert.match(out, /\{\{CODE\}\}/);
  assert.equal(out.includes("{{URL}}"), false);
});
