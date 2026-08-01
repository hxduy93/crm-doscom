// Khối TikTok Shop trong index.html có KHỞI ĐỘNG được không.
//
// Vì sao cần test này: 01/08/2026 gỡ hàng thẻ KPI đi đã xoá luôn `var cards`, nhưng
// chốt bảo vệ `if(!nav||!cards) return;` ngay dòng dưới vẫn còn — ReferenceError,
// cả khối chết câm lúc khởi động, menu bấm không ra gì, mà kiểm cú pháp thì VẪN XANH
// vì cú pháp hợp lệ. Test này chạy THẬT khối mã trên một DOM giả và bắt lỗi loại đó.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

// Cắt đúng IIFE của TikTok Shop: từ dấu mở ngay sau bình luận tiêu đề tới ngoặc đóng cân bằng.
function layKhoiTikTok() {
  const moc = html.indexOf("// ===== TikTok Shop");
  assert.ok(moc > 0, "khong tim thay khoi TikTok Shop trong index.html");
  const dau = html.indexOf("(function(){", moc);
  let sau = 0;
  for (let i = dau; i < html.length; i++) {
    if (html[i] === "{") sau++;
    else if (html[i] === "}" && --sau === 0) return html.slice(dau, i + 1) + ")();";
  }
  throw new Error("khong dong duoc ngoac cua IIFE");
}

// DOM giả: mọi id đều trả về một phần tử, và ghi lại listener đã gắn.
function domGia() {
  const daGan = [];
  const tao = (ten) => ({
    id: ten, value: "", checked: false, textContent: "", innerHTML: "", style: {},
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    dataset: {}, disabled: false,
    addEventListener(su) { daGan.push(`${ten}:${su}`); },
    querySelectorAll: () => [], querySelector: () => null,
    insertAdjacentHTML() {}, remove() {}, closest: () => null, appendChild() {}, click() {},
  });
  const document = {
    getElementById: (id) => tao(id),
    querySelector: (s) => tao(s),
    querySelectorAll: () => [],
    createElement: (t) => tao(t),
    body: tao("body"),
  };
  return { document, daGan };
}

test("khối TikTok Shop khởi động được, không ném ReferenceError", () => {
  const { document, daGan } = domGia();
  const ctx = {
    document, window: { location: { origin: "https://x" } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {} },
    fetch: () => new Promise(() => {}),      // treo mãi — khởi động không được phụ thuộc mạng
    setTimeout() {}, clearTimeout() {}, console,
    Promise, Map, Set, Array, Object, Number, String, Math, JSON, Date, URL, Blob: function () {},
    navigator: { clipboard: { writeText: async () => {} } },
    confirm: () => true, alert() {},
  };
  vm.createContext(ctx);
  vm.runInContext(layKhoiTikTok(), ctx);   // ném ở đây = khối chết lúc khởi động

  // Khởi động xong PHẢI gắn được listener. Không có cái nào = khối đã return sớm
  // (chốt bảo vệ sai) và menu sẽ câm dù không báo lỗi gì.
  assert.ok(daGan.length > 0, "khong gan duoc listener nao — khoi da return som");
  const co = (x) => daGan.some((k) => k.includes(x));
  assert.ok(co("tiktok"), "thieu listener mo menu TikTok — bam vao menu se khong tai du lieu");
  assert.ok(co("tt-vid-days"), "thieu listener doi khoang ngay");
  assert.ok(co("tt-refresh"), "thieu listener nut Tai lai");
  assert.ok(co("tt-sort") && co("tt-fcamp") && co("tt-fstaff"), "thieu listener bo loc");
});

test("chốt bảo vệ chỉ dựa vào phần tử khối này THẬT SỰ dùng", () => {
  const src = layKhoiTikTok();
  // Bỏ bình luận trước khi soi — bình luận có quyền nhắc tên phần tử đã gỡ (và đang nhắc,
  // để người sau hiểu vì sao chốt lại viết như vậy); chỉ MÃ THẬT mới không được trỏ vào.
  const chot = src.slice(0, src.indexOf("return;") + 7).replace(/\/\/[^\n]*/g, "");
  // Gỡ một khối giao diện đi mà chốt còn trỏ vào phần tử của khối đó là chết câm.
  for (const bo of ["cards", "tt-cards", "tt-src", "tt-shops", "tt-daily"]) {
    assert.ok(!chot.includes(bo), `chot bao ve con tro vao '${bo}' — phan tu nay da bi go`);
  }
});
