// Chạy THẬT đoạn nối 3 ô giá trong product-publisher.html trên DOM giả lập.
//
// Lỗi thật 2026-08-12: đoạn nối nằm trong <script> thường nên chạy NGAY khi
// trình duyệt đọc tới, còn <script type="module"> nạp file công thức thì luôn bị
// hoãn tới sau khi phân tích xong trang → window.PD chưa tồn tại → đoạn nối lặng
// lẽ thoát ra. Giao diện vẫn hiện đủ 3 ô, gõ giá gốc + % mà giá bán không nhảy.
// Test cũ không bắt được vì chỉ kiểm hàm tính thuần, không kiểm phần nối.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as PD from "../functions/lib/price-discount.js";

const html = readFileSync(new URL("../product-publisher.html", import.meta.url), "utf8");

// Lấy đúng khối "giá bán ↔ % giảm ↔ giá gốc" trong trang
function extractWiring() {
  const start = html.indexOf("// ---------- giá bán ↔ % giảm ↔ giá gốc ----------");
  assert.ok(start > 0, "không tìm thấy khối nối 3 ô giá trong product-publisher.html");
  // khối kết thúc ở dấu đóng của handler DOMContentLoaded, ngay sau dòng syncDiscount
  const anchor = html.indexOf("window.syncDiscount=showPercent", start);
  assert.ok(anchor > 0, "khối nối phải xuất khẩu syncDiscount cho phần nhập từ Shopee");
  const end = html.indexOf("\n});", anchor);
  assert.ok(end > 0, "không thấy dấu đóng của khối nối");
  return html.slice(start, end + 4);
}

function makeInput() {
  const el = { value: "", _h: [] };
  el.addEventListener = (ev, fn) => { if (ev === "input") el._h.push(fn); };
  el.type = (v) => { el.value = v; el._h.forEach((f) => f()); };   // người dùng gõ
  return el;
}

function setupPage() {
  const els = {
    priceInp: makeInput(), oldInp: makeInput(), discInp: makeInput(),
    discHint: { textContent: "" },
    pvResult: { classList: { contains: () => false } },
    pcNow: { textContent: "" }, pcOld: { textContent: "" },
  };
  const domReady = [];
  globalThis.document = {
    addEventListener: (ev, fn) => { if (ev === "DOMContentLoaded") domReady.push(fn); },
  };
  globalThis.window = { PD };
  globalThis.$ = (id) => els[id];
  globalThis.money = (v) => PD.formatMoney(PD.parseMoney(v));
  globalThis.console = console;

  eval(extractWiring());
  assert.equal(domReady.length, 1, "khối nối phải chờ DOMContentLoaded, nếu không sẽ chạy trước module");
  domReady.forEach((fn) => fn());          // trình duyệt bắn sự kiện sau khi module đã nạp
  return els;
}

test("gõ giá gốc rồi gõ % → giá bán tự nhảy (đúng ca người dùng báo lỗi)", () => {
  const els = setupPage();
  els.oldInp.type("3000000");              // gõ liền, không dấu chấm
  els.discInp.type("10");
  assert.equal(els.priceInp.value, "2.700.000");
});

test("gõ giá bán rồi gõ % → giá gốc tính ngược", () => {
  const els = setupPage();
  els.priceInp.type("400.000");
  els.discInp.type("20");
  assert.equal(els.oldInp.value, "500.000");
});

test("gõ cả 2 giá → % tự hiện", () => {
  const els = setupPage();
  els.oldInp.type("500.000");
  els.priceInp.type("400.000");
  assert.equal(els.discInp.value, "20");
});

test("giá gốc thấp hơn giá bán → không có %, có nhắc nhở", () => {
  const els = setupPage();
  els.priceInp.type("500.000");
  els.oldInp.type("400.000");
  assert.equal(els.discInp.value, "");
  assert.match(els.discHint.textContent, /CAO HƠN/);
});

test("có cả 2 giá, gõ % → giữ ô giá vừa gõ, sửa ô còn lại", () => {
  const els = setupPage();
  els.oldInp.type("500.000");
  els.priceInp.type("450.000");            // ô giá gõ gần nhất = giá bán
  els.discInp.type("50");
  assert.equal(els.priceInp.value, "450.000", "không được đụng vào ô vừa gõ");
  assert.equal(els.oldInp.value, "900.000");
});

test("gõ % khi chưa có giá nào → không bịa số, có nhắc nhở", () => {
  const els = setupPage();
  els.discInp.type("20");
  assert.equal(els.priceInp.value, "");
  assert.equal(els.oldInp.value, "");
  assert.match(els.discHint.textContent, /Nhập giá bán hoặc giá gốc trước/);
});

test("đang gõ % dở dang không bị đè số", () => {
  const els = setupPage();
  els.oldInp.type("500.000");
  els.discInp.type("2");                   // mới gõ chữ số đầu của 20
  assert.equal(els.discInp.value, "2", "ô % phải giữ nguyên số đang gõ");
  assert.equal(els.priceInp.value, "490.000");
});
