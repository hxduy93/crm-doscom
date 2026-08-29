// Test /api/fb-accounts-pages — hai đường lấy tài khoản QC (không gọi Meta thật).
//   - Token User        → /me/adaccounts chạy được, source="me"
//   - Token System User → /me lỗi 100/33 → rẽ sang batch /act_{id}, source="batch"
// Lỗi "Object with ID 'me' does not exist" là lý do có đường batch: token System User
// không có ngữ cảnh "me" nên /me/adaccounts luôn hỏng dù token vẫn đọc được act_{id}.
import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequestGet } from "../functions/api/fb-accounts-pages.js";
import { getIdentity } from "../functions/lib/access.js";

const ENV = { FB_ACCESS_TOKEN: "tok" };
// Số TK active đọc thẳng từ sổ đăng ký (lib/access.js) — thêm/bớt tkqc không làm vỡ test.
const ACTIVE_COUNT = (
  await getIdentity({ env: {}, request: new Request("https://x/api/fb-accounts-pages") })
).accounts.length;
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
  assert.equal(calls.filter((c) => c.method === "POST").length, 0, "không rơi xuống batch");
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
  assert.equal(d.count, ACTIVE_COUNT, "đủ số tài khoản active trong lib/access.js");
  assert.match(d.note, /Object with ID 'me'/, "giữ lý do rẽ nhánh để chẩn đoán token");
  assert.equal(calls.filter((c) => c.method === "POST").length, 1, "đúng 1 call batch act_{id}");
  assert.equal(calls[1].method, "POST", "batch chạy ngay sau khi /me hỏng");
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
  assert.equal(d.count, ACTIVE_COUNT - 1, "1 TK mất quyền không được làm hỏng các TK còn lại");
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
  assert.equal(d.count, ACTIVE_COUNT);
});

test("thiếu FB_ACCESS_TOKEN → 500, không gọi Meta", async () => {
  const calls = stubFetch(() => ({ json: {} }));
  const r = await onRequestGet({ env: {}, request: new Request("https://x/api/fb-accounts-pages") });
  assert.equal(r.status, 500);
  assert.equal(calls.length, 0);
});

// ── MỞ HẾT TRANG (29/08/2026) ────────────────────────────────────────────────
// Tkqc CÔNG TY CP DOSCOM trả promote_pages RỖNG (token không có vai trò trên trang)
// → dropdown Page trống trơn, không chọn nổi trang tích xanh dù tkqc chạy được nó.
// Nay gom thêm trang của BM (owned + client) và trang token quản lý, ghi rõ `nguon`.

// Tài khoản có khai BM + tuỳ biến được promote_pages.
const acctBiz = (id, name, promotePages, bizId = "1418124406240173") => ({
  account_id: id,
  name,
  account_status: 1,
  business: { id: bizId, name: "Yoday Media Retail" },
  promote_pages: { data: promotePages },
  adspixels: { data: [{ id: "811464414891137", name: "WINKI A100" }] },
});

// Stub đủ 3 nguồn: /me/adaccounts · batch BM · /me/accounts
const stubBaNguon = ({ promotePages, owned = [], client = [], mePages = [], bizLoi = false }) =>
  stubFetch((url, call) => {
    if (url.includes("/me/adaccounts")) {
      return { json: { data: [acctBiz("1254151326914021", "CÔNG TY CP DOSCOM", promotePages)] } };
    }
    if (url.includes("/me/accounts")) return { json: { data: mePages } };
    // Còn lại là batch BM (POST /)
    if (bizLoi) return { status: 400, json: { error: { message: "requires business_management permission" } } };
    const reqs = JSON.parse(call.body.batch);
    return {
      json: reqs.map((r) => ({
        code: 200,
        body: JSON.stringify({
          id: r.relative_url.split("?")[0],
          owned_pages: { data: owned },
          client_pages: { data: client },
        }),
      })),
    };
  });

const TICH_XANH = { id: "1101583133049069", name: "Noma Việt Nam" };

test("promote_pages rỗng → vẫn thấy trang của BM, đánh dấu nguồn business", async () => {
  stubBaNguon({ promotePages: [], owned: [TICH_XANH], client: [{ id: "681202051750505", name: "Noma Việt Nam" }] });

  const d = await (await get()).json();
  const acc = d.accounts[0];
  assert.equal(acc.promote_count, 0);
  assert.equal(acc.can_use, false, "Meta chưa xác nhận trang nào → không tô 'dùng được'");
  assert.deepEqual(acc.pages.map((p) => p.id), ["1101583133049069", "681202051750505"]);
  assert.equal(acc.pages.every((p) => p.nguon === "business" && p.promote === false), true);
});

test("trang promote đứng TRƯỚC và được đánh dấu promote=true, không trùng lặp", async () => {
  stubBaNguon({
    promotePages: [TICH_XANH],
    owned: [TICH_XANH, { id: "110312205647152", name: "Doscom" }],
    mePages: [TICH_XANH, { id: "106867030884191", name: "Noma USA" }],
  });

  const d = await (await get()).json();
  const acc = d.accounts[0];
  assert.deepEqual(acc.pages.map((p) => p.id), ["1101583133049069", "110312205647152", "106867030884191"]);
  assert.deepEqual(acc.pages.map((p) => p.nguon), ["promote", "business", "token"]);
  assert.equal(acc.promote_count, 1);
  assert.equal(acc.can_use, true);
});

test("token thiếu quyền đọc BM → vẫn trả trang promote + trang token, kèm note lý do", async () => {
  stubBaNguon({ promotePages: [TICH_XANH], mePages: [{ id: "110312205647152", name: "Doscom" }], bizLoi: true });

  const d = await (await get()).json();
  assert.equal(d.ok, true, "BM hỏng KHÔNG được làm sập cả danh sách");
  assert.deepEqual(d.accounts[0].pages.map((p) => p.nguon), ["promote", "token"]);
  assert.match(d.note, /Không đọc được trang của BM/);
});

test("tkqc ra 0 trang → trả về đếm theo TỪNG nguồn + note nói rõ tắc ở đâu", async () => {
  // Đúng cảnh chụp màn hình 29/08/2026: dropdown Page trống trơn. Không có ba con số
  // này thì không biết tắc ở promote_pages, ở BM hay ở token — phải đoán mò.
  stubBaNguon({ promotePages: [], mePages: [], bizLoi: true });

  const d = await (await get()).json();
  const acc = d.accounts[0];
  assert.deepEqual(acc.pages, []);
  assert.deepEqual(acc.page_sources, { promote: 0, business: 0, token: 0 });
  assert.match(d.note, /Không đọc được trang của BM/);
  assert.match(d.note, /me\/accounts trả 0 trang/);
});

test("đếm nguồn khớp số trang thật của từng nguồn", async () => {
  stubBaNguon({
    promotePages: [TICH_XANH],
    owned: [{ id: "110312205647152", name: "Doscom" }],
    client: [{ id: "107655065621691", name: "Doscom Asia" }],
    mePages: [{ id: "106867030884191", name: "Noma USA" }],
  });

  const acc = (await (await get()).json()).accounts[0];
  assert.deepEqual(acc.page_sources, { promote: 1, business: 2, token: 1 });
  assert.equal(acc.pages.length, 4);
});
