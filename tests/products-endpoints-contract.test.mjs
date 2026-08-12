// Hợp đồng tối thiểu của các endpoint /api/products/*: LUÔN trả JSON, không ném lỗi.
//
// Việc cần bảo vệ (lỗi thật 2026-08-12): shopee-import gọi getIdentity(request, env)
// trong khi hàm đó nhận cả context → ném TypeError → Pages trả 500 kèm trang HTML,
// giao diện chỉ hiện "Phản hồi không phải JSON (500)". Không test nào bắt được vì
// test cũ chỉ kiểm mấy hàm bóc dữ liệu thuần.
import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as shopeeImport } from "../functions/api/products/shopee-import.js";
import { onRequestPost as fetchImages } from "../functions/api/products/fetch-images.js";

function ctx(body, { token = "T", env = {} } = {}) {
  return {
    request: new Request("https://crm/api/products/x", {
      method: "POST",
      headers: { "content-type": "application/json", "x-products-token": token },
      body: JSON.stringify(body),
    }),
    env: { PRODUCTS_TOKEN: "T", ...env },
  };
}

async function callJson(handler, context) {
  const r = await handler(context);           // không được ném
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);                  // phải là JSON
  } catch {
    assert.fail(`không trả JSON: ${text.slice(0, 120)}`);
  }
  return { status: r.status, data };
}

test("shopee-import: link sai → 400 JSON, không ném lỗi", async () => {
  const { status, data } = await callJson(shopeeImport, ctx({ url: "https://lazada.vn/abc" }));
  assert.equal(status, 400);
  assert.equal(data.ok, false);
  assert.ok(data.hint, "phải nói cho người dùng biết cần link kiểu gì");
});

test("shopee-import: sai mã bảo vệ → 401 JSON", async () => {
  const { status, data } = await callJson(shopeeImport, ctx({ url: "x" }, { token: "SAI" }));
  assert.equal(status, 401);
  assert.equal(data.error, "unauthorized");
});

test("shopee-import: body không phải JSON → 400 JSON", async () => {
  const context = {
    request: new Request("https://crm/api/products/shopee-import", {
      method: "POST",
      headers: { "content-type": "application/json", "x-products-token": "T" },
      body: "khong-phai-json",
    }),
    env: { PRODUCTS_TOKEN: "T" },
  };
  const { status, data } = await callJson(shopeeImport, context);
  assert.equal(status, 400);
  assert.equal(data.error, "body_not_json");
});

test("fetch-images: không có link CDN hợp lệ → 400 JSON", async () => {
  const { status, data } = await callJson(fetchImages, ctx({ urls: ["https://evil.example.com/a.jpg"] }));
  assert.equal(status, 400);
  assert.equal(data.ok, false);
});

test("fetch-images: sai mã bảo vệ → 401 JSON", async () => {
  const { status } = await callJson(fetchImages, ctx({ urls: [] }, { token: "SAI" }));
  assert.equal(status, 401);
});
