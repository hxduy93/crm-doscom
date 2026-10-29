import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// 22/10/2026: hộp "Chưa lên camp" bật mặc định nên video đã tick + nhận biến mất khỏi
// menu TikTok Shop. Thêm hộp "Đã lên camp / đã nhận" (loại trừ với "Chưa lên camp")
// và nút "Chọn tất cả" — nút này KHÔNG được lách khoá video người khác đang giữ.
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("có hộp Đã lên camp / đã nhận, loại trừ với Chưa lên camp", () => {
  assert.match(html, /data-f="dalen"[^>]*>.*Đã lên camp \/ đã nhận/);
  assert.match(html, /var HOP=\{chua:true,dalen:false,/);
  assert.match(html, /var HOP_NGUOC=\{chua:'dalen',dalen:'chua'\}/);
  assert.match(html, /dalen: !!\(k && \(inCamp\.has\(k\) \|\| claims\.get\(k\)\) && !khongLay\.has\(k\)\)/);
});

test("Chọn tất cả bỏ qua video không link / người khác giữ / sổ lỗi", () => {
  const fn = html.match(/getElementById\('tt-pick-all'\)\.addEventListener\('click',function\(\)\{[\s\S]*?\n  \}\);/);
  assert.ok(fn, "thiếu handler nút Chọn tất cả");
  assert.match(fn[0], /!v\.link \|\| lockedByOther\(v\) \|\| khongLayDuoc\(v\)/);
});

test("chọn 'Đã lên camp' hoặc người nhận thì tự tắt hộp Chưa lên camp", () => {
  assert.match(html, /fCampSel\.addEventListener\('change',function\(\)\{ if\(fCampSel\.value==='yes'\) tatHopChua\(\);/);
  assert.match(html, /fStaffSel\.addEventListener\('change',function\(\)\{ if\(fStaffSel\.value && fStaffSel\.value!=='free'\) tatHopChua\(\);/);
});

// 29/10/2026: chọn NOMA 230 mà hộp "Mới ra đơn" báo +2.784 đơn (của cả shop).
test("hộp tổng quan tính theo sản phẩm đang chọn", () => {
  const fn = html.match(/function veHop\(\)\{[\s\S]*?\n  \}/)[0];
  assert.match(fn, /!activeSP \|\| spKeyOf\(v\)===activeSP/);
  assert.match(fn, /var ds=pham\.filter/);
});
