import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { onRequestPost as scan } from "../functions/api/products/brandcore-scan.js";

/* ══════════════════════════════════════════════════════════════════════════════
   ĐỔI TÊN SẢN PHẨM trong danh mục theo hồ sơ (target "product-name").

   Vì sao cần: trên noma.vn cùng một sản phẩm đang mang ba kiểu tên khác nhau —
   "Dung Dịch Tẩy Ố Kính Chuyên Sâu - Noma 911" (đảo ngược), "NOMA 250 - … NGUYÊN BẢN"
   (thêm đuôi), "NOMA 890 - DUNG DỊCH XỊT  BÓNG" (thiếu chữ "phủ", thừa dấu cách) — nên
   khách, quảng cáo và bài viết gọi mỗi nơi một tên.

   Rào chắn: chỉ ghi trường `name`. WooCommerce KHÔNG sinh lại slug khi đổi tên, nên URL
   và mọi liên kết/quảng cáo đang chạy vẫn sống — đây là điều kiện để dám đổi hàng loạt.
   ══════════════════════════════════════════════════════════════════════════════ */
const HO_SO = {
  "911": { ten: "NOMA 911 - Dung dịch tẩy ố kính" },
  "890": { ten: "NOMA 890 - Dung dịch xịt phủ bóng, làm mới sơn xe" },
  "350": { ten: "NOMA 350 - Dung Dịch Vệ Sinh Đĩa Phanh" },
};

const SP = [
  { id: 1, name: "Dung Dịch Tẩy Ố Kính Chuyên Sâu - Noma 911", permalink: "https://noma.vn/p1", status: "publish", description: "", short_description: "" },
  { id: 2, name: "NOMA 890 - DUNG DỊCH XỊT  BÓNG, LÀM MỚI SƠN XE", permalink: "https://noma.vn/p2", status: "publish", description: "", short_description: "" },
  { id: 3, name: "NOMA 350 - Dung dịch vệ sinh đĩa phanh", permalink: "https://noma.vn/p3", status: "publish", description: "", short_description: "" },
  { id: 5, name: "NOMA 350 - Dung Dịch Vệ Sinh Đĩa Phanh", permalink: "https://noma.vn/p5", status: "publish", description: "", short_description: "" },
  { id: 4, name: "Combo chăm kính chuẩn chuyên gia", permalink: "https://noma.vn/p4", status: "publish", description: "Bộ đôi NOMA", short_description: "" },
];

function gaWoo() {
  return async (url) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith("/wp-json/wc/v3/products")) {
      return new Response(JSON.stringify(SP), {
        status: 200,
        headers: { "content-type": "application/json", "X-WP-TotalPages": "1", "X-WP-Total": String(SP.length) },
      });
    }
    throw new Error("gọi nhầm endpoint: " + u.pathname);
  };
}

const ENV = {
  WC_NOMA_USER: "u", WC_NOMA_APP_PWD: "p", WC_NOMA_CK: "ck", WC_NOMA_CS: "cs",
  INVENTORY: { get: async (k) => (k === "noma_sku_specs:v2" ? JSON.stringify({ specs: HO_SO }) : null) },
};

async function quetTen() {
  const goc = globalThis.fetch;
  globalThis.fetch = gaWoo();
  try {
    const res = await scan({
      request: new Request("https://crm.test/api/products/brandcore-scan", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ site: "noma", target: "product-name", mode: "list" }),
      }),
      env: ENV,
    });
    return await res.json();
  } finally { globalThis.fetch = goc; }
}

test("tên đảo ngược / thêm đuôi / thiếu chữ đều bị bắt và có sẵn tên chuẩn", async () => {
  const d = await quetTen();
  assert.ok(d.ok, d.error);
  assert.equal(d.target, "product-name");

  const a = d.items.find((x) => x.id === 1);
  assert.equal(a.sku, "911");
  assert.equal(a.ten_chuan, "NOMA 911 - Dung dịch tẩy ố kính");
  assert.equal(a.can_doi_ten, true, "tên đang đảo ngược thứ tự — phải đổi");

  const b = d.items.find((x) => x.id === 2);
  assert.equal(b.ten_chuan, "NOMA 890 - Dung dịch xịt phủ bóng, làm mới sơn xe");
  assert.equal(b.can_doi_ten, true, "tên đang thiếu chữ 'phủ' — phải đổi");
});

test("lệch hoa/thường so với hồ sơ VẪN phải đổi — khớp từng ký tự", async () => {
  /* Tên sản phẩm là thứ khách đọc trên trang, trong giỏ hàng và trên hoá đơn. Chốt của
     chủ dự án là "thay đúng theo tên đặt trong brandcore" nên hoa/thường cũng tính. */
  const d = await quetTen();
  const c = d.items.find((x) => x.id === 3);   // "…vệ sinh đĩa phanh" thường
  assert.equal(c.ten_chuan, "NOMA 350 - Dung Dịch Vệ Sinh Đĩa Phanh");
  // Ở bộ dữ liệu này có tới hai bản ghi mã 350 nên cả hai bị chặn tự đổi — đúng thiết kế.
  assert.equal(c.trung_ma, true);
});

test("tên đã khớp từng ký tự thì để yên", async () => {
  const d = await quetTen();
  const dung = d.items.find((x) => x.id === 5);
  assert.equal(dung.can_doi_ten, false, "đúng y hồ sơ rồi mà vẫn rủ đổi là bấm mãi không hết việc");
  assert.equal(dung.trung_ma, true, "hai sản phẩm cùng mã 350 — phải cảnh báo trùng mã");
});

test("combo không dò ra mã NOMA → bỏ qua, không đoán bừa", async () => {
  const d = await quetTen();
  const combo = d.items.find((x) => x.id === 4);
  assert.equal(combo.sku, null);
  assert.equal(combo.chua_co_ho_so, true);
  assert.equal(combo.can_doi_ten, false);
  assert.equal(d.doi_ten_count, 2, "911 và 890 — hai bản ghi mã 350 bị loại vì trùng mã");
});

test("target product-name chỉ có mode list", async () => {
  const goc = globalThis.fetch;
  globalThis.fetch = gaWoo();
  try {
    const res = await scan({
      request: new Request("https://crm.test/api/products/brandcore-scan", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ site: "noma", target: "product-name", mode: "audit", ids: [1] }),
      }),
      env: ENV,
    });
    const d = await res.json();
    assert.equal(d.ok, false);
    assert.match(d.error, /chỉ có mode/);
  } finally { globalThis.fetch = goc; }
});

// ── Đường ghi ───────────────────────────────────────────────────────────────
const APPLY = readFileSync(new URL("../functions/api/products/brandcore-apply.js", import.meta.url), "utf8")
  .split("\r\n").join("\n");

test("đổi tên CHỈ gửi trường name — không đụng slug, giá, mô tả, ảnh", () => {
  /* Gửi kèm trường khác là có ngày WooCommerce sinh lại slug hoặc ghi đè mô tả vừa sửa
     ở tab bên cạnh. Đây cũng là lý do dám đổi tên hàng loạt: URL không gãy. */
  assert.match(APPLY, /await updateProduct\(c, id, \{ name: tenMoi \}\);/);
  const iBackup = APPLY.indexOf("KV_BACKUP_TEN(site, id, ts)");
  const iUpdate = APPLY.indexOf("await updateProduct(c, id, { name: tenMoi })");
  assert.ok(iBackup > 0 && iUpdate > iBackup, "phải sao lưu tên cũ TRƯỚC khi ghi đè");
});

test("backup tên sản phẩm có khoá riêng, không đè backup mô tả", () => {
  // Trùng khoá là hoàn tác tên lại lôi về mô tả cũ của chính sản phẩm đó.
  assert.match(APPLY, /bcbackup:\$\{site\}:ten:\$\{id\}/);
  assert.match(APPLY, /if \(typeof bak\.name !== "string" \|\| !bak\.name\)/,
    "hoàn tác phải kiểm backup có tên cũ thật, không ghi tên rỗng lên sản phẩm");
});

test("đường ghi mô tả sản phẩm và bài viết KHÔNG bị đụng", () => {
  assert.match(APPLY, /updateProduct\(c, id, \{ description: newDesc/);
  assert.match(APPLY, /await updatePost\(c, id, ghi\)/);
});
