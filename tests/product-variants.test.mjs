// Test đăng sản phẩm CÓ BIẾN THỂ (variable product) lên WooCommerce.
//
// Việc cần bảo vệ — ba cách hỏng đều lặng lẽ, nhìn trong wp-admin vẫn thấy "bình thường":
//   1. Sản phẩm cha mang theo regular_price → trang web hiện một giá cứng, không đổi
//      theo lựa chọn của khách. Cha của hàng biến thể PHẢI không có giá và không có tồn kho.
//   2. Hai biến thể trùng nhãn → WooCommerce gắn chung một option, cái sau đè cái trước,
//      khách mất một lựa chọn mà không có lỗi nào báo.
//   3. Batch tạo biến thể trả HTTP 200 KÈM lỗi từng dòng. Không soi từng phần tử thì
//      sản phẩm lên web ở dạng "variable" mà không có biến thể nào → hiện nút "Đọc tiếp"
//      thay vì "Thêm vào giỏ": khách xem được nhưng KHÔNG mua được.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chuanHoaBienThe, variationPayload, createVariations, MAX_VARIANTS, priceFields,
} from "../functions/api/products/_wc.js";
import { onRequestPost as publish } from "../functions/api/products/publish.js";

// PNG 1x1 hợp lệ — publishToSite bắt buộc có ít nhất 1 ảnh.
const ANH_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const ENV = {
  PRODUCTS_TOKEN: "T",
  WC_DOSCOM_USER: "u", WC_DOSCOM_APP_PWD: "p",
  WC_DOSCOM_CK: "ck", WC_DOSCOM_CS: "cs",
};

function ctx(body) {
  return {
    request: new Request("https://crm/api/products/publish", {
      method: "POST",
      headers: { "content-type": "application/json", "x-products-token": "T" },
      body: JSON.stringify(body),
    }),
    env: ENV,
  };
}

const BODY_CO_BIEN_THE = {
  site: "doscom",
  name: "Camera DA3 Pro 4G",
  category_id: 12,
  status: "publish",
  price: "850.000",          // cố ý gửi kèm — server phải BỎ khi có biến thể
  stock: "100",              // cũng phải bỏ
  variant_attribute: "Phiên bản",
  variants: [
    { option: "Zoom 5x",  price: "850.000", old_price: "1.214.000", stock: "50" },
    { option: "Zoom 10x", price: "950.000", old_price: "1.357.000", stock: "50" },
  ],
  images: [{ data: ANH_1PX, media_type: "image/png", role: "featured" }],
};

// Giả lập WordPress + WooCommerce. `hong` = ép batch biến thể trả lỗi từng dòng.
function gaLapWp({ hong = false } = {}) {
  const goi = [];
  const that = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    // Ảnh gửi dạng nhị phân (Uint8Array) — chỉ bóc JSON khi body là chuỗi.
    const body = typeof opts.body === "string" ? JSON.parse(opts.body) : null;
    goi.push({ url: u, method: opts.method || "GET", body });

    if (/\/wp\/v2\/media\/\d+$/.test(u)) return Response.json({ id: 9 });
    if (/\/wp\/v2\/media$/.test(u)) return Response.json({ id: 9, source_url: "https://doscom.vn/a.png" });
    if (/\/wc\/v3\/products$/.test(u)) {
      return Response.json({ id: 777, permalink: "https://doscom.vn/product/da3-pro", status: body.status });
    }
    if (/\/wc\/v3\/products\/777$/.test(u)) return Response.json({ id: 777, status: body.status });
    if (/\/variations\/batch$/.test(u)) {
      if (hong) {
        return Response.json({ create: [{ id: 1, attributes: [{ option: "Zoom 5x" }] }, { error: { code: "product_invalid_sku", message: "SKU trùng" } }] });
      }
      return Response.json({ create: body.create.map((v, i) => ({ id: 100 + i, attributes: v.attributes })) });
    }
    throw new Error("URL không mong đợi trong test: " + u);
  };
  return { goi, thoi: () => { globalThis.fetch = that; } };
}

test("chuẩn hoá: bỏ dòng thiếu nhãn, gộp trùng (không phân biệt hoa thường), giữ thứ tự", () => {
  const got = chuanHoaBienThe([
    { option: " Zoom 5x ", price: "850000" },
    { option: "", price: "999000" },              // thiếu nhãn → loại
    { option: "zoom 5x", price: "111000" },       // trùng → loại
    { option: "Zoom 10x", price: "950000" },
  ]);
  assert.deepEqual(got.map((v) => v.option), ["Zoom 5x", "Zoom 10x"]);
});

test("chuẩn hoá: tôn trọng trần MAX_VARIANTS", () => {
  const nhieu = Array.from({ length: MAX_VARIANTS + 30 }, (_, i) => ({ option: "SP" + i, price: "1000" }));
  assert.equal(chuanHoaBienThe(nhieu).length, MAX_VARIANTS);
});

test("chuẩn hoá: đầu vào không phải mảng → mảng rỗng, không ném", () => {
  assert.deepEqual(chuanHoaBienThe(null), []);
  assert.deepEqual(chuanHoaBienThe("x"), []);
});

test("payload biến thể: giá gốc > giá bán → regular + sale, tồn kho bật manage_stock", () => {
  const p = variationPayload("Phiên bản", { option: "Zoom 5x", price: "850.000", old_price: "1.214.000", sku: "DA3-5X", stock: "50" }, priceFields);
  assert.equal(p.regular_price, "1214000");
  assert.equal(p.sale_price, "850000");
  assert.equal(p.sku, "DA3-5X");
  assert.deepEqual(p.attributes, [{ name: "Phiên bản", option: "Zoom 5x" }]);
  assert.equal(p.manage_stock, true);
  assert.equal(p.stock_quantity, 50);
});

test("payload biến thể: không có SKU/tồn kho → không gửi khoá thừa", () => {
  const p = variationPayload("Dung tích", { option: "300ml", price: "200000", old_price: "", sku: "", stock: "" }, priceFields);
  assert.equal(p.regular_price, "200000");
  assert.ok(!("sale_price" in p));
  assert.ok(!("sku" in p));
  assert.ok(!("manage_stock" in p));
});

test("batch 200 kèm lỗi từng dòng vẫn phải NÉM, không nuốt lặng", async () => {
  const wp = gaLapWp({ hong: true });
  try {
    await assert.rejects(
      () => createVariations({ url: "https://doscom.vn", site: "doscom", ck: "a", cs: "b" }, 777, [
        { attributes: [{ name: "Phiên bản", option: "Zoom 5x" }] },
        { attributes: [{ name: "Phiên bản", option: "Zoom 10x" }] },
      ]),
      /1\/2 biến thể lỗi.*Zoom 10x/s
    );
  } finally { wp.thoi(); }
});

test("đăng có biến thể: cha là 'variable', KHÔNG giá KHÔNG tồn, có attributes variation:true", async () => {
  const wp = gaLapWp();
  try {
    const r = await publish(ctx(BODY_CO_BIEN_THE));
    const d = await r.json();
    assert.equal(d.ok, true, JSON.stringify(d));

    const taoSp = wp.goi.find((g) => /\/wc\/v3\/products$/.test(g.url)).body;
    assert.equal(taoSp.type, "variable");
    assert.ok(!("regular_price" in taoSp), "cha KHÔNG được mang giá");
    assert.ok(!("sale_price" in taoSp), "cha KHÔNG được mang giá khuyến mãi");
    assert.ok(!("manage_stock" in taoSp), "cha KHÔNG được quản tồn kho");
    assert.deepEqual(taoSp.attributes, [{
      name: "Phiên bản", position: 0, visible: true, variation: true,
      options: ["Zoom 5x", "Zoom 10x"],
    }]);

    const batch = wp.goi.find((g) => /\/variations\/batch$/.test(g.url)).body;
    assert.equal(batch.create.length, 2);
    assert.equal(batch.create[0].regular_price, "1214000");
    assert.equal(batch.create[0].sale_price, "850000");
    assert.equal(batch.create[1].sale_price, "950000");
    assert.equal(d.results[0].variants, 2);
  } finally { wp.thoi(); }
});

test("không có biến thể: giữ nguyên 'simple' + giá ở cha (không phá luồng cũ)", async () => {
  const wp = gaLapWp();
  try {
    const { variants, variant_attribute, ...khongBienThe } = BODY_CO_BIEN_THE;
    const r = await publish(ctx(khongBienThe));
    const d = await r.json();
    assert.equal(d.ok, true, JSON.stringify(d));

    const taoSp = wp.goi.find((g) => /\/wc\/v3\/products$/.test(g.url)).body;
    assert.equal(taoSp.type, "simple");
    assert.equal(taoSp.regular_price, "850000");
    assert.equal(taoSp.manage_stock, true);
    assert.ok(!wp.goi.some((g) => /\/variations\/batch$/.test(g.url)), "không được gọi batch khi không có biến thể");
  } finally { wp.thoi(); }
});

test("biến thể lỗi khi đang ĐĂNG CÔNG KHAI → hạ sản phẩm về nháp rồi mới báo lỗi", async () => {
  const wp = gaLapWp({ hong: true });
  try {
    const r = await publish(ctx(BODY_CO_BIEN_THE));
    const d = await r.json();
    assert.equal(d.ok, false);
    assert.match(d.results[0].error, /biến thể lỗi/);
    assert.match(d.results[0].error, /NHÁP/);

    const haNhap = wp.goi.find((g) => /\/wc\/v3\/products\/777$/.test(g.url) && g.method === "PUT");
    assert.ok(haNhap, "phải PUT sản phẩm về nháp");
    assert.equal(haNhap.body.status, "draft");
  } finally { wp.thoi(); }
});
