import { test } from "node:test";
import assert from "node:assert/strict";

import { onRequestPost as post, onRequestGet as get } from "../functions/api/products/names-en.js";

/* ══════════════════════════════════════════════════════════════════════════════
   BẢNG TÊN TIẾNG ANH cho nomaauto.us (/api/products/names-en).

   Bảng này là thứ quyết định tên sản phẩm và tiêu đề bài hiển thị trên trang bán hàng
   Mỹ, nên hai rủi ro phải canh:
     1. Dịch đè lên tên NGƯỜI ĐÃ DUYỆT đang chạy trên web → đổi tên hàng loạt sản phẩm
        đang chạy quảng cáo mà chẳng được gì. Vì vậy thứ tự ưu tiên là
        bảng đang có → tên sẵn trên web US → AI dịch.
     2. Ghi mà không có đường lùi. Vì vậy save phải cất bản cũ ở …:prev.
   ══════════════════════════════════════════════════════════════════════════════ */

const HO_SO = {
  "911": { ten: "NOMA 911 - Dung dịch tẩy ố kính" },
  "998": { ten: "Noma 998 – Dung Dịch Vá & Bơm Lốp Khẩn Cấp" },
};

const SP_US = [
  { id: 1, name: "Noma 998 – Emergency Tire Plug & Inflator Solution", permalink: "https://nomaauto.us/p1", status: "publish", description: "", short_description: "" },
];

function dungKV(khoiDau = {}) {
  const kho = { ...khoiDau };
  return {
    kho,
    get: async (k) => (k in kho ? kho[k] : null),
    put: async (k, v) => { kho[k] = v; },
    delete: async (k) => { delete kho[k]; },
  };
}

function dungEnv(kv, { claude } = {}) {
  return {
    WC_NOMAAUTO_USER: "u", WC_NOMAAUTO_APP_PWD: "p", WC_NOMAAUTO_CK: "ck", WC_NOMAAUTO_CS: "cs",
    ANTHROPIC_API_KEY: "k", CF_ACCOUNT_ID: "acc",
    INVENTORY: kv,
    PRODUCTS_TOKEN: "bimat",
    __claude: claude,
  };
}

// Giả lập mạng: WooCommerce của nomaauto.us + AI Gateway (Claude).
function gaMang({ spUs = SP_US, dich = null, loiClaude = false } = {}) {
  return async (url, opt) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith("/wp-json/wc/v3/products")) {
      return new Response(JSON.stringify(spUs), {
        status: 200,
        headers: { "content-type": "application/json", "X-WP-TotalPages": "1", "X-WP-Total": String(spUs.length) },
      });
    }
    if (/anthropic|gateway/i.test(u.hostname + u.pathname)) {
      if (loiClaude) return new Response("boom", { status: 500 });
      return new Response(JSON.stringify({
        content: [{ type: "text", text: JSON.stringify(dich || {}) }],
        usage: { input_tokens: 10, output_tokens: 10 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error("gọi ra ngoài ngoài dự kiến: " + u.href);
  };
}

/* Access tắt (role "open") nên MỌI lời gọi phải kèm token — kể cả mode "draft" (nó tốn
   tiền AI). Test dưới đây gửi kèm token; test riêng ở cuối canh việc thiếu token bị chặn. */
function ctx(env, body) {
  return {
    request: new Request("https://crm.test/api/products/names-en", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Products-Token": "bimat" },
      body: JSON.stringify(body),
    }),
    env,
  };
}

const KV_HO_SO = { "noma_sku_specs:v2": JSON.stringify({ specs: HO_SO }) };

async function goi(env, body, mang) {
  const goc = globalThis.fetch;
  globalThis.fetch = mang || gaMang();
  try { return await (await post(ctx(env, body))).json(); }
  finally { globalThis.fetch = goc; }
}

test("soạn: ưu tiên tên SẴN trên nomaauto.us, chỉ dịch mã còn thiếu", async () => {
  const kv = dungKV({ ...KV_HO_SO });
  const j = await goi(dungEnv(kv), { mode: "draft" },
    gaMang({ dich: { "911": "NOMA 911 - Deep Glass Water Spot Remover" } }));

  assert.ok(j.ok, j.error);
  const m998 = j.data.items.find((x) => x.ma === "998");
  assert.equal(m998.nguon, "web_us", "sản phẩm đã có tên tiếng Anh trên web thì đừng dịch lại");
  // Vẫn nắn khuôn: "Noma 998 –" → "NOMA 998 - ".
  assert.equal(m998.de_xuat, "NOMA 998 - Emergency Tire Plug & Inflator Solution");

  const m911 = j.data.items.find((x) => x.ma === "911");
  assert.equal(m911.nguon, "dich");
  assert.equal(m911.de_xuat, "NOMA 911 - Deep Glass Water Spot Remover");
  assert.equal(j.data.so_dich, 1, "chỉ được dịch đúng mã còn thiếu");
});

test("soạn: KHÔNG ghi gì vào KV — đây mới là nấc xem trước", async () => {
  const kv = dungKV({ ...KV_HO_SO });
  await goi(dungEnv(kv), { mode: "draft" }, gaMang({ dich: { "911": "NOMA 911 - Glass Cleaner" } }));
  assert.equal(kv.kho["noma_sku_names:en:v1"], undefined,
    "soạn mà ghi luôn thì tên do AI dịch lên thẳng trang bán hàng, không ai kịp đọc");
});

test("dịch hỏng → báo lý do, KHÔNG bịa tên", async () => {
  const kv = dungKV({ ...KV_HO_SO });
  const j = await goi(dungEnv(kv), { mode: "draft" }, gaMang({ loiClaude: true }));
  assert.ok(j.ok, j.error);
  const m911 = j.data.items.find((x) => x.ma === "911");
  assert.equal(m911.de_xuat, null);
  assert.equal(m911.nguon, "chua_co");
  assert.ok(j.data.canh_bao.length, "hỏng mà im lặng là người dùng tưởng mã đó vốn không có tên");
});

test("lưu: chuẩn hoá lần cuối rồi mới ghi, có bản …:prev để hoàn tác", async () => {
  const kv = dungKV({ ...KV_HO_SO });
  const env = dungEnv(kv);

  let j = await goi(env, { mode: "save", names: { "911": "noma 911 – deep glass water spot remover" } });
  assert.ok(j.ok, j.error);
  let luu = JSON.parse(kv.kho["noma_sku_names:en:v1"]);
  assert.equal(luu.names["911"], "NOMA 911 - Deep Glass Water Spot Remover",
    "người dùng gõ tay trong ô nhập vẫn phải qua luật đặt tên");
  assert.equal(kv.kho["noma_sku_names:en:v1:prev"], undefined, "lần đầu chưa có bản cũ để cất");

  j = await goi(env, { mode: "save", names: { "911": "NOMA 911 - Glass Stain Remover" } });
  assert.ok(j.ok, j.error);
  assert.ok(kv.kho["noma_sku_names:en:v1:prev"], "ghi đè phải cất bản cũ");

  j = await goi(env, { mode: "revert" });
  assert.ok(j.ok, j.error);
  luu = JSON.parse(kv.kho["noma_sku_names:en:v1"]);
  assert.equal(luu.names["911"], "NOMA 911 - Deep Glass Water Spot Remover");
});

test("lưu tên rỗng bị từ chối — bảng trống là mất luôn tên chuẩn của web Mỹ", async () => {
  const kv = dungKV({ ...KV_HO_SO });
  const j = await goi(dungEnv(kv), { mode: "save", names: { "911": "   " } });
  assert.equal(j.ok, false);
  assert.equal(kv.kho["noma_sku_names:en:v1"], undefined);
});

test("endpoint GHI phải có token khi Access tắt (role open)", async () => {
  /* Red line của dự án: endpoint ghi luôn có token. Đây là bảng quyết định tên hiển thị
     trên trang bán hàng nên không được hở. */
  const kv = dungKV({ ...KV_HO_SO });
  const env = dungEnv(kv);
  const r = await post({
    request: new Request("https://crm.test/api/products/names-en", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "save", names: { "911": "NOMA 911 - X" } }),
    }),
    env,
  });
  assert.equal(r.status, 401);
  assert.equal(kv.kho["noma_sku_names:en:v1"], undefined);
});

test("GET nói rõ mã nào CHƯA có tên tiếng Anh", async () => {
  const kv = dungKV({
    ...KV_HO_SO,
    "noma_sku_names:en:v1": JSON.stringify({ names: { "911": "NOMA 911 - Glass Cleaner" } }),
  });
  const j = await (await get({ env: dungEnv(kv) })).json();
  assert.ok(j.ok, j.error);
  assert.deepEqual(j.data.thieu, ["998"]);
  assert.equal(j.data.so_ten, 1);
});
