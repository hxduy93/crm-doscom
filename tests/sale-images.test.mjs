// Menu "Ảnh sale": khớp file ↔ SP, xếp mảng ảnh khi gắn/gỡ, proxy ảnh, hợp đồng endpoint + nối menu.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  matchFileToProduct, discountText, imagesWithFeatured, planApply, planRestore,
  saleFilename, isProxyableImage, normalizeName, extFromMime,
} from "../functions/lib/sale-images.js";
import { onRequestPost, onRequestGet } from "../functions/api/products/sale-images.js";

const PRODUCTS = [
  { id: 24142, name: "NOMA 911 phục hồi đèn pha", sku: "NOMA911" },
  { id: 2, name: "NOMA 9110 test", sku: "" },
  { id: 3, name: "Camera DA3 PRO 4G zoom 5x", sku: "DA3-5X" },
  { id: 4, name: "Camera DA3 PRO 4G zoom 10x", sku: "DA3-10X" },
  { id: 5, name: "Máy dò định vị D1", sku: "" },
];

test("khớp theo SKU/mã model, không nhầm noma911 với noma9110", () => {
  assert.equal(matchFileToProduct("noma-911.jpg", PRODUCTS).id, 24142);
  assert.equal(matchFileToProduct("NOMA911.PNG", PRODUCTS).id, 24142);
  assert.equal(matchFileToProduct("sale-10-10-noma-911.png", PRODUCTS).id, 24142);
  assert.equal(matchFileToProduct("noma-9110.jpg", PRODUCTS).id, 2);
});

test("khớp theo ID, theo tên có dấu, theo SKU biến thể", () => {
  assert.deepEqual(matchFileToProduct("24142.jpg", PRODUCTS).by, "id");
  assert.equal(matchFileToProduct("Máy dò định vị D1.webp", PRODUCTS).id, 5);
  assert.equal(matchFileToProduct("da3-10x.jpg", PRODUCTS).id, 4);
});

test("nhiều SP ngang điểm → KHÔNG đoán, trả danh sách để chọn tay", () => {
  const m = matchFileToProduct("camera-da3-pro.jpg", PRODUCTS);
  assert.equal(m.id, null);
  assert.deepEqual(m.candidates.sort(), [3, 4]);
});

test("không liên quan → không khớp", () => {
  const m = matchFileToProduct("banner.jpg", PRODUCTS);
  assert.equal(m.id, null);
  assert.equal(m.candidates.length, 0);
});

test("tem % giảm lấy từ giá thật; không tính được thì dùng chữ dự phòng, không bịa số", () => {
  assert.equal(discountText("-{pct}%", { regular_price: "1000000", sale_price: "700000" }, "SALE"), "-30%");
  assert.equal(discountText("-{pct}%", { regular_price: "1000000", sale_price: "" }, "SALE"), "SALE");
  assert.equal(discountText("GIẢM SỐC", { regular_price: "", sale_price: "" }, "SALE"), "GIẢM SỐC");
});

test("gắn ảnh: ảnh mới lên đầu, giữ gallery, không lặp", () => {
  const cur = [{ id: 10 }, { id: 11 }, { id: 12 }];
  assert.deepEqual(imagesWithFeatured(cur, 99), [{ id: 99 }, { id: 11 }, { id: 12 }]);
  assert.deepEqual(imagesWithFeatured([], 99), [{ id: 99 }]);
});

test("planApply: lần đầu lưu ảnh hiện tại làm gốc", () => {
  const p = planApply([{ id: 10, src: "a.jpg" }], null);
  assert.deepEqual(p, { orig_id: 10, orig_src: "a.jpg", delete_old_sale_id: null, mismatch: false });
});

test("planApply: gắn lại khi đang có ảnh sale → GIỮ gốc cũ, xoá ảnh sale cũ", () => {
  const state = { sale_id: 50, orig_id: 10, orig_src: "a.jpg" };
  const p = planApply([{ id: 50, src: "sale.jpg" }, { id: 11 }], state);
  assert.equal(p.orig_id, 10);
  assert.equal(p.delete_old_sale_id, 50);
});

test("planApply: ảnh đã bị đổi tay → lấy ảnh hiện tại làm gốc, không xoá gì", () => {
  const p = planApply([{ id: 77, src: "tay.jpg" }], { sale_id: 50, orig_id: 10 });
  assert.equal(p.orig_id, 77);
  assert.equal(p.delete_old_sale_id, null);
  assert.equal(p.mismatch, true);
});

test("planRestore: trả ảnh gốc lên đầu, bỏ ảnh sale, giữ gallery", () => {
  const r = planRestore([{ id: 50 }, { id: 11 }, { id: 10 }], { sale_id: 50, orig_id: 10 });
  assert.deepEqual(r, { ok: true, images: [{ id: 10 }, { id: 11 }] });
});

test("planRestore: SP gốc không có ảnh → chỉ còn gallery", () => {
  const r = planRestore([{ id: 50 }, { id: 11 }], { sale_id: 50, orig_id: null });
  assert.deepEqual(r.images, [{ id: 11 }]);
});

test("planRestore: ảnh đại diện đã bị đổi tay → không đụng", () => {
  assert.equal(planRestore([{ id: 77 }], { sale_id: 50, orig_id: 10 }).ok, false);
  assert.equal(planRestore([{ id: 50 }], null).ok, false);
});

test("tên file ảnh sale gọn, không dấu", () => {
  assert.equal(saleFilename("SALE 10.10", "NOMA 911 Phục hồi đèn pha", "png"), "sale-sale-10-10-noma-911-phuc-hoi-den-pha.png");
  assert.equal(saleFilename("", "", "exe"), "sale-sale-san-pham.jpg");
  assert.equal(normalizeName("Đèn  Pha!"), "den-pha");
  assert.equal(extFromMime("image/gif"), null);
});

test("proxy ảnh chỉ nhận ảnh https của doscom.vn / noma.vn", () => {
  assert.ok(isProxyableImage("https://doscom.vn/wp-content/uploads/a.jpg"));
  assert.ok(isProxyableImage("https://www.noma.vn/wp-content/uploads/a.webp"));
  assert.ok(isProxyableImage("https://i0.wp.com/noma.vn/wp-content/uploads/a.jpg"));
  assert.ok(!isProxyableImage("http://doscom.vn/a.jpg"));
  assert.ok(!isProxyableImage("https://doscom.vn.evil.com/a.jpg"));
  assert.ok(!isProxyableImage("https://nomaauto.us/a.jpg"));
  assert.ok(!isProxyableImage("https://i0.wp.com/evil.com/a.jpg"));
  assert.ok(!isProxyableImage("http://169.254.169.254/latest"));
});

// ── Hợp đồng endpoint: luôn JSON, ghi phải có token ──
function ctx(body, { token, raw } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers["X-Products-Token"] = token;
  return {
    request: new Request("https://crm/api/products/sale-images", {
      method: "POST", headers, body: raw != null ? raw : JSON.stringify(body),
    }),
    env: { PRODUCTS_TOKEN: "T", INVENTORY: {} },
  };
}
async function callJson(handler, context) {
  const r = await handler(context);
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { assert.fail(`không trả JSON: ${text.slice(0, 120)}`); }
  return { status: r.status, data };
}

test("endpoint: body không phải JSON → 400 JSON", async () => {
  const { status, data } = await callJson(onRequestPost, ctx(null, { raw: "khong-phai-json" }));
  assert.equal(status, 400);
  assert.equal(data.ok, false);
});

test("endpoint: nomaauto.us không nằm trong phạm vi → 400", async () => {
  const { status } = await callJson(onRequestPost, ctx({ site: "nomaauto", mode: "list" }));
  assert.equal(status, 400);
});

test("endpoint: gắn/gỡ ảnh không có token → 401", async () => {
  for (const mode of ["apply", "restore", "forget"]) {
    const { status, data } = await callJson(onRequestPost, ctx({ site: "noma", mode }));
    assert.equal(status, 401, mode);
    assert.equal(data.ok, false);
  }
});

test("endpoint: có token nhưng web chưa cấu hình → 400 JSON, không ném", async () => {
  const { status, data } = await callJson(onRequestPost, ctx({ site: "doscom", mode: "restore" }, { token: "T" }));
  assert.equal(status, 400);
  assert.match(data.error, /chưa cấu hình/);
});

test("proxy GET: link ngoài 2 web → 400 JSON", async () => {
  const { status } = await callJson(onRequestGet, {
    request: new Request("https://crm/api/products/sale-images?img=" + encodeURIComponent("https://evil.com/a.jpg")),
    env: {},
  });
  assert.equal(status, 400);
});

// ── Menu riêng + đường deploy ──
test("menu Ảnh sale được nối đủ: nav, iframe, build, không cache", () => {
  const root = new URL("../", import.meta.url);
  const index = readFileSync(new URL("index.html", root), "utf8");
  const build = readFileSync(new URL("scripts/build-dist.sh", root), "utf8");
  const headers = readFileSync(new URL("_headers", root), "utf8");
  const page = readFileSync(new URL("sale-images.html", root), "utf8");
  assert.match(index, /data-view="sale-images"/);
  assert.match(index, /id="view-sale-images"/);
  assert.match(index, /lazyFrame\('sale-images','saleimg-frame','\/sale-images'\)/);
  assert.match(build, /PAGES=.*sale-images\.html/);
  assert.match(build, /cp functions\/lib\/sale-images\.js dist\/js\//);
  assert.match(headers, /^\/sale-images$/m);
  assert.match(page, /\.\/js\/sale-images\.js/);
  assert.match(page, /\/api\/products\/sale-images/);
});
