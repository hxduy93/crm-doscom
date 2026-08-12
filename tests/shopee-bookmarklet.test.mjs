// Chạy thử bookmarklet Shopee trên một DOM giả lập.
//
// Việc cần bảo vệ: đoạn bookmarklet nằm NHÚNG trong product-publisher.html dưới
// dạng chuỗi (hằng BOOKMARKLET_SRC) nên không có gì kiểm nó — sửa hỏng một dấu
// gạch chéo là người dùng bấm nút chẳng ra gì mà cũng chẳng báo lỗi. Test này
// bóc chuỗi đó ra, chạy thật trong DOM giả, đối chiếu dữ liệu thu được.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { TextEncoder } from "node:util";

const CDN = "https://down-vn.img.susercontent.com/file/";

function loadBookmarkletSource() {
  const html = fs.readFileSync(new URL("../product-publisher.html", import.meta.url), "utf8");
  const m = html.match(/const BOOKMARKLET_SRC = `([\s\S]*?)`;/);
  assert.ok(m, "không tìm thấy BOOKMARKLET_SRC trong product-publisher.html");
  // để chính JS diễn giải template literal đúng như trình duyệt sẽ làm
  return eval("`" + m[1] + "`");
}

function fakeShopeePage() {
  const els = {
    h1: { innerText: "NOMA 911 tẩy ố kính" },
    imgs: [
      { src: CDN + "aaa11111" },
      { currentSrc: CDN + "bbb22222_tn" },
      { src: "https://khac.com/x.jpg" },          // khác host → phải bỏ
    ],
    styled: [{ getAttribute: () => "background-image:url(" + CDN + "ccc33333)" }],
    blocks: [
      { innerText: "linh tinh" },
      { innerText: "MÔ TẢ SẢN PHẨM\nDung tích 100ml, hàng chính hãng, bảo hành 12 tháng cho mọi loại kính." },
    ],
    cats: [{ innerText: "Chăm sóc xe cơ giới" }, { innerText: "Khác" }],
  };
  let opened = null;
  global.location = {
    pathname: "/NOMA-911-i.1343630849.46751925957",
    href: "https://shopee.vn/NOMA-911-i.1343630849.46751925957",
    origin: "https://crm-doscom.pages.dev",
  };
  global.document = {
    title: "Mua NOMA 911 | Shopee Việt Nam",
    body: { innerText: "₫219.000 ₫438.000 Đã bán 1,2k", scrollHeight: 1000 },
    querySelector: (s) => (s === "h1" ? els.h1 : null),
    querySelectorAll: (s) =>
      s === "img" ? els.imgs : s.includes("style") ? els.styled : s.includes("-cat.") ? els.cats : els.blocks,
  };
  global.window = { scrollTo() {}, open: (u) => { opened = u; } };
  global.alert = () => {};
  global.confirm = () => true;
  // Node định nghĩa navigator bằng getter → gán thẳng sẽ ném lỗi
  Object.defineProperty(globalThis, "navigator", {
    value: { clipboard: { writeText: async () => {} } },
    configurable: true,
    writable: true,
  });
  global.btoa = (s) => Buffer.from(s, "binary").toString("base64");
  global.TextEncoder = TextEncoder;
  return () => opened;
}

test("bookmarklet bóc đúng tên, giá, ảnh, mô tả, ngành hàng", async () => {
  const getOpened = fakeShopeePage();
  eval(loadBookmarkletSource());
  await new Promise((r) => setTimeout(r, 3000));   // chờ vòng cuộn lazy-load

  const url = getOpened();
  assert.ok(url && url.includes("#shopee="), "phải mở CRM kèm dữ liệu trên fragment");
  const b64 = decodeURIComponent(url.split("#shopee=")[1]);
  const d = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));

  assert.equal(d.name, "NOMA 911 tẩy ố kính");
  assert.deepEqual(d.prices, ["219.000", "438.000"]);
  assert.equal(d.shop_id, "1343630849");
  assert.equal(d.item_id, "46751925957");
  assert.equal(d.images.length, 3, "lấy cả ảnh trong background-image, bỏ ảnh khác host");
  assert.ok(d.images.every((u) => u.includes("susercontent.com/file/")));
  assert.ok(d.description.includes("Dung tích 100ml"));
  assert.deepEqual(d.breadcrumb, ["Chăm sóc xe cơ giới", "Khác"]);
});

test("bookmarklet từ chối trang không phải sản phẩm", async () => {
  const getOpened = fakeShopeePage();
  global.location.pathname = "/search";           // không có -i.<shop>.<item>
  let warned = "";
  global.alert = (m) => { warned = m; };
  eval(loadBookmarkletSource());
  await new Promise((r) => setTimeout(r, 200));
  assert.match(warned, /TRANG SẢN PHẨM/i);
  assert.equal(getOpened(), null, "không được mở CRM khi chưa ở trang sản phẩm");
});
