// Menu "Giảm giá hàng loạt": ngày giờ VN↔GMT, tính giá sale, lưu/trả giá cũ, danh mục, hợp đồng endpoint.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  vnDateToGmt, gmtToVnDate, vnToday, validateRange, campStatus, planPrice, choosePrev, endUnitDecision,
  restorePayload, planCategories, endCategories, sameIds, PAST_GMT, FAR_GMT,
} from "../functions/lib/bulk-sale.js";
import { onRequestPost } from "../functions/api/products/bulk-sale.js";

test("ngày VN → GMT: bắt đầu 00:00, kết thúc 23:59:59 giờ Việt Nam", () => {
  assert.equal(vnDateToGmt("2026-10-10"), "2026-10-09T17:00:00");
  assert.equal(vnDateToGmt("2026-10-10", "end"), "2026-10-10T16:59:59");
  assert.equal(gmtToVnDate("2026-10-09T17:00:00"), "2026-10-10");
  assert.equal(vnDateToGmt("2026-02-30"), null);
  assert.equal(vnDateToGmt("10/10/2026"), null);
  assert.equal(vnToday(Date.parse("2026-09-14T18:30:00Z")), "2026-09-15"); // 1h30 sáng VN
});

test("khoảng ngày của đợt", () => {
  assert.equal(validateRange("2026-10-10", "2026-10-12", "2026-10-01"), null);
  assert.match(validateRange("2026-10-10", "2026-10-09", "2026-10-01"), /kết thúc/);
  assert.match(validateRange("2026-09-01", "2026-09-02", "2026-09-14"), /đã qua/);
  assert.match(validateRange("", "2026-10-02", "2026-09-14"), /bắt đầu/);
  assert.equal(campStatus({ from: "2026-10-10", to: "2026-10-12" }, "2026-10-09"), "pending");
  assert.equal(campStatus({ from: "2026-10-10", to: "2026-10-12" }, "2026-10-12"), "running");
  assert.equal(campStatus({ from: "2026-10-10", to: "2026-10-12" }, "2026-10-13"), "expired");
});

test("giá sale theo %: làm tròn 1.000đ, không đụng giá gốc", () => {
  const r = planPrice({ regular_price: "1290000" }, { pct: 15 });
  assert.equal(r.ok, true);
  assert.equal(r.sale_price, "1097000"); // 1.096.500 → 1.097.000
  assert.equal(r.regular, 1290000);
});

test("giá sale gõ tay được ưu tiên hơn %", () => {
  const r = planPrice({ regular_price: "1000000" }, { pct: 10, sale_price: "750.000" });
  assert.equal(r.sale_price, "750000");
  assert.equal(Math.round(r.pct), 25);
});

test("giá sale không hợp lệ → bỏ qua kèm lý do", () => {
  assert.equal(planPrice({ regular_price: "" }, { pct: 20 }).reason, "chưa có giá gốc");
  assert.equal(planPrice({ regular_price: "1000000" }, { sale_price: "1000000" }).ok, false);
  assert.equal(planPrice({ regular_price: "1000" }, { pct: 10 }).ok, false); // tròn lên = giá gốc
  assert.equal(planPrice({ regular_price: "1000000" }, { pct: "abc" }).ok, false);
});

test("giảm trên 50% → cảnh báo, vẫn cho đặt", () => {
  const r = planPrice({ regular_price: "1000000" }, { pct: 60 });
  assert.equal(r.ok, true);
  assert.equal(r.warnings.length, 1);
});

test("lưu giá cũ: lần đầu chụp giá sale hiện có", () => {
  assert.deepEqual(choosePrev({ sale_price: "800000", date_on_sale_from_gmt: "", date_on_sale_to_gmt: "" }, undefined),
    { sale_price: "800000", from: "", to: "" });
});

test("lưu giá cũ: áp lại lên SP đang trong đợt → giữ giá cũ ban đầu", () => {
  const u = { prev: { sale_price: "800000", from: "", to: "" }, set_sale: "700000" };
  assert.equal(choosePrev({ sale_price: "700000" }, u).sale_price, "800000");
  assert.equal(choosePrev({ sale_price: "" }, u).sale_price, "800000"); // đợt cũ đã hết hạn
  assert.equal(choosePrev({ sale_price: "650000" }, u).sale_price, "650000"); // bị sửa tay
});

test("kết thúc đợt: giá bị sửa tay thì không đè", () => {
  const u = { set_sale: "700000" };
  assert.equal(endUnitDecision({ sale_price: "700000" }, u), "restore");
  assert.equal(endUnitDecision({ sale_price: "" }, u), "restore");
  assert.equal(endUnitDecision({ sale_price: "650000" }, u), "manual");
});

test("trả giá cũ: không có sale / sale có hạn / sale vĩnh viễn", () => {
  assert.deepEqual(restorePayload({ sale_price: "", from: "", to: "" }), { sale_price: "" });
  assert.deepEqual(restorePayload(null), { sale_price: "" });
  assert.deepEqual(restorePayload({ sale_price: "800000", from: "2026-09-01T00:00:00", to: "2026-12-01T00:00:00" }),
    { sale_price: "800000", date_on_sale_from_gmt: "2026-09-01T00:00:00", date_on_sale_to_gmt: "2026-12-01T00:00:00" });
  assert.deepEqual(restorePayload({ sale_price: "800000", from: "", to: "" }),
    { sale_price: "800000", date_on_sale_from_gmt: PAST_GMT, date_on_sale_to_gmt: FAR_GMT });
});

test("danh mục: chỉ gỡ cái tool tự gắn", () => {
  assert.deepEqual(planCategories([5, 6], 9, null), { ids: [5, 6, 9], category_id: 9, category_added: true });
  assert.equal(planCategories([5, 9], 9, null).category_added, false);
  assert.deepEqual(planCategories([5, 9], 12, { category_id: 9, category_added: true }).ids, [5, 12]);
  assert.deepEqual(planCategories([5], null, null), { ids: [5], category_id: null, category_added: false });
  assert.deepEqual(endCategories([5, 9], { category_id: 9, category_added: true }), { ids: [5], changed: true });
  assert.equal(endCategories([5, 9], { category_id: 9, category_added: false }).changed, false);
  assert.ok(sameIds([9, 5], [5, 9]));
});

// ── Hợp đồng endpoint ──
function ctx(body, { token, raw } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers["X-Products-Token"] = token;
  return {
    request: new Request("https://crm/api/products/bulk-sale", { method: "POST", headers, body: raw != null ? raw : JSON.stringify(body) }),
    env: { PRODUCTS_TOKEN: "T", INVENTORY: {} },
  };
}
async function callJson(context) {
  const r = await onRequestPost(context);
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { assert.fail(`không trả JSON: ${text.slice(0, 120)}`); }
  return { status: r.status, data };
}

test("endpoint: body không phải JSON / web ngoài phạm vi → 400", async () => {
  assert.equal((await callJson(ctx(null, { raw: "x" }))).status, 400);
  assert.equal((await callJson(ctx({ site: "nomaauto", mode: "list" }))).status, 400);
});

test("endpoint: mode ghi không có token → 401", async () => {
  for (const mode of ["apply", "end", "create_category"]) {
    const { status, data } = await callJson(ctx({ site: "doscom", mode }));
    assert.equal(status, 401, mode);
    assert.equal(data.ok, false);
  }
});

test("endpoint: có token nhưng web chưa cấu hình → 400 JSON", async () => {
  const { status, data } = await callJson(ctx({ site: "noma", mode: "end" }, { token: "T" }));
  assert.equal(status, 400);
  assert.match(data.error, /chưa cấu hình/);
});

test("menu Giảm giá hàng loạt được nối đủ: nav, iframe, build, không cache", () => {
  const root = new URL("../", import.meta.url);
  const index = readFileSync(new URL("index.html", root), "utf8");
  const build = readFileSync(new URL("scripts/build-dist.sh", root), "utf8");
  const headers = readFileSync(new URL("_headers", root), "utf8");
  const page = readFileSync(new URL("bulk-sale.html", root), "utf8");
  assert.match(index, /data-view="bulk-sale"/);
  assert.match(index, /id="view-bulk-sale"/);
  assert.match(index, /lazyFrame\('bulk-sale','bulksale-frame','\/bulk-sale'\)/);
  assert.match(build, /PAGES=.*bulk-sale\.html/);
  assert.match(build, /cp functions\/lib\/bulk-sale\.js dist\/js\//);
  assert.match(headers, /^\/bulk-sale$/m);
  assert.match(page, /\.\/js\/bulk-sale\.js/);
  assert.match(page, /\/api\/products\/bulk-sale/);
});
