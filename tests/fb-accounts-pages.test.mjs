// Test /api/fb-accounts-pages — hai đường lấy tài khoản QC (không gọi Meta thật).
//   - Token User        → /me/adaccounts chạy được, source="me"
//   - Token System User → /me lỗi 100/33 → rẽ sang batch /act_{id}, source="batch"
// Lỗi "Object with ID 'me' does not exist" là lý do có đường batch: token System User
// không có ngữ cảnh "me" nên /me/adaccounts luôn hỏng dù token vẫn đọc được act_{id}.
import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequestGet } from "../functions/api/fb-accounts-pages.js";

const ENV = { FB_ACCESS_TOKEN: "tok" };
const ME_ERROR = "Unsupported get request. Object with ID 'me' does not exist, cannot be loaded due to missing permissions, or does not support this operation.";

// Một tài khoản QC như Graph trả về.
const acct = (id, name) => ({
  account_id: id,
  name,
  account_status: 1,
  promote_pages: { data: [{ id: "681202051750505", name: "Noma Việt Nam" }] },
  adspixels: { data: [{ id: "283066540825683", name: "D1 CHUẨN" }] },
});

// handler(url, {method, body}) → { json, status }
function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    let body = init.body;
    if (body instanceof URLSearchParams) body = Object.fromEntries(body);
    calls.push({ url: String(url), method: init.method || "GET", body });
    const res = handler(String(url), calls[calls.length - 1]);
    return new Response(JSON.stringify(res.json), {
      status: res.status || 200,
      headers: { "content-type": "application/json" },
    });
  };
  return calls;
}

// Không có header Cf-Access → getIdentity trả role "open", all=true (mọi TK active).
const get = () =>
  onRequestGet({ env: ENV, request: new Request("https://x/api/fb-accounts-pages") });

test("token User: /me/adaccounts chạy được → source=me, không gọi batch", async () => {
  const calls = stubFetch(() => ({ json: { data: [acct("764394829882083", "Doscom - Noma.vn")] } }));

  const d = await (await get()).json();
  assert.equal(d.ok, true);
  assert.equal(d.source, "me");
  assert.equal(d.count, 1);
  assert.equal(d.accounts[0].id, "764394829882083");
  assert.equal(d.accounts[0].can_use, true);
  assert.equal(calls.length, 1, "chỉ 1 call, không rơi xuống batch");
});

test("token System User: /me lỗi → batch act_{id} cứu được danh sách", async () => {
  const calls = stubFetch((url, call) => {
    if (url.includes("/me/adaccounts")) return { status: 400, json: { error: { message: ME_ERROR, code: 100, error_subcode: 33 } } };
    // Batch: trả đúng số phần tử đã hỏi, thứ tự giữ nguyên.
    const reqs = JSON.parse(call.body.batch);
    return {
      json: reqs.map((r) => {
        const id = r.relative_url.match(/^act_(\d+)/)[1];
        return { code: 200, body: JSON.stringify(acct(id, `TK ${id}`)) };
      }),
    };
  });

  const d = await (await get()).json();
  assert.equal(d.ok, true);
  assert.equal(d.source, "batch");
  assert.equal(d.count, 6, "6 tài khoản active trong lib/access.js");
  assert.match(d.note, /Object with ID 'me'/, "giữ lý do rẽ nhánh để chẩn đoán token");
  assert.equal(calls.length, 2, "1 call /me hỏng + 1 call batch");
  assert.equal(calls[1].method, "POST");
});

test("batch: tài khoản lỗi bị bỏ qua, phần còn lại vẫn trả về", async () => {
  stubFetch((url, call) => {
    if (url.includes("/me/adaccounts")) return { status: 400, json: { error: { message: ME_ERROR } } };
    const reqs = JSON.parse(call.body.batch);
    return {
      json: reqs.map((r, i) => {
        const id = r.relative_url.match(/^act_(\d+)/)[1];
        if (i === 0) return { code: 403, body: JSON.stringify({ error: { message: "No permission" } }) };
        return { code: 200, body: JSON.stringify(acct(id, `TK ${id}`)) };
      }),
    };
  });

  const d = await (await get()).json();
  assert.equal(d.ok, true);
  assert.equal(d.count, 5, "1 TK mất quyền không được làm hỏng 5 TK còn lại");
});

test("cả hai đường hỏng → 502 kèm lý do của /me", async () => {
  stubFetch((url) => {
    if (url.includes("/me/adaccounts")) return { status: 400, json: { error: { message: ME_ERROR } } };
    return { status: 400, json: { error: { message: "Invalid OAuth access token" } } };
  });

  const r = await get();
  const d = await r.json();
  assert.equal(r.status, 502);
  assert.equal(d.ok, false);
  assert.match(d.error, /Invalid OAuth access token/);
  assert.match(d.error, /Object with ID 'me'/, "kèm lỗi /me để biết token thuộc loại nào");
});

test("/me trả 0 tài khoản (không ném lỗi) vẫn rẽ sang batch", async () => {
  stubFetch((url, call) => {
    if (url.includes("/me/adaccounts")) return { json: { data: [] } };
    const reqs = JSON.parse(call.body.batch);
    return { json: reqs.map((r) => ({ code: 200, body: JSON.stringify(acct(r.relative_url.match(/^act_(\d+)/)[1], "TK")) })) };
  });

  const d = await (await get()).json();
  assert.equal(d.source, "batch");
  assert.equal(d.count, 6);
});

test("thiếu FB_ACCESS_TOKEN → 500, không gọi Meta", async () => {
  const calls = stubFetch(() => ({ json: {} }));
  const r = await onRequestGet({ env: {}, request: new Request("https://x/api/fb-accounts-pages") });
  assert.equal(r.status, 500);
  assert.equal(calls.length, 0);
});
