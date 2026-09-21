// Popup "Ai sẽ chạy N video này?" và toast gỡ nhận PHẢI có CSS, và CSS đó KHÔNG
// được bọc trong #view-tiktok.
//
// Sự cố 21/09/2026 — bấm "▶ Chạy Ads luôn" nhìn như không có gì xảy ra:
// commit `934b4768` thêm cả JS lẫn CSS của popup; commit `a26cd765` ("dựng lại toàn
// bộ giao diện theo bản duyệt") xoá nhóm luật CSS mà vẫn giữ nguyên JS. Popup vẫn
// được tạo và appendChild vào document.body, nhưng là <div> trần: không position,
// không nền, không z-index → nằm ở đáy trang, mắt thường không thấy. Không lỗi
// console, không cảnh báo, nên nhìn từ ngoài giống hệt "nút hỏng".
//
// Vì sao phải kiểm CẢ chuyện không bọc #view-tiktok: toàn bộ CSS còn lại của menu
// TikTok đều mang tiền tố đó. Khôi phục mà bê nguyên tiền tố vào thì luật vẫn không
// ăn, vì hai phần tử này gắn vào <body> chứ không nằm trong #view-tiktok.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

// Các class mà JS gắn cho phần tử con của <body> (xem openClaimModal / showUndoToast).
const BODY_LEVEL = ["tt-modal-bg", "tt-modal", "tt-who", "tt-toast"];

for (const cls of BODY_LEVEL) {
  test(`.${cls} phải có luật CSS`, () => {
    const re = new RegExp(`\\.${cls}\\s*[{,:]`);
    assert.ok(re.test(html),
      `không tìm thấy luật CSS nào cho .${cls} — popup/toast sẽ hiện ra dưới dạng div trần ở đáy trang`);
  });

  test(`.${cls} KHÔNG được bọc trong #view-tiktok`, () => {
    // Bắt mọi lần class này đứng làm selector và soi xem ngay trước nó có #view-tiktok không.
    const re = new RegExp(`([^\\n{};]*)\\.${cls}\\s*[{,]`, "g");
    const scoped = [...html.matchAll(re)]
      .map(m => m[1])
      .filter(prefix => prefix.includes("#view-tiktok"));
    assert.equal(scoped.length, 0,
      `.${cls} đang bị bọc trong #view-tiktok (${scoped.join(" | ")}) — phần tử này gắn vào <body> nên luật sẽ không ăn`);
  });
}

// Chốt chặn riêng cho thứ quyết định "nhìn thấy hay không": lớp phủ phải định vị
// cố định và nổi lên trên. Thiếu 1 trong 2 là popup lại chìm mất.
test("lớp phủ .tt-modal-bg phải position:fixed và có z-index", () => {
  const m = html.match(/\.tt-modal-bg\{([\s\S]*?)\}/);
  assert.ok(m, "không trích được luật .tt-modal-bg");
  const rule = m[1].replace(/\s+/g, "");
  assert.match(rule, /position:fixed/, "thiếu position:fixed → popup trôi theo luồng trang");
  assert.match(rule, /z-index:\d+/, "thiếu z-index → popup bị nội dung khác đè lên");
});
