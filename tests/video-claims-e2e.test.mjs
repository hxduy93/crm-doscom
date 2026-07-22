// Chạy THẬT 3 handler của /api/video-claims trên SQLite (shim D1) + đúng file
// migrations/0012_video_claims.sql. Bắt được lỗi mà test logic thuần không thấy:
// SQL sai, khoá bị chuẩn hoá hụt, dòng đã gỡ chặn mất lượt nhận sau.
//
// node:sqlite chỉ có từ Node 22 → CI (Node 20) tự BỎ QUA, không làm đỏ pipeline.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { onRequestGet, onRequestPost, onRequestDelete } from "../functions/api/video-claims.js";

let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* Node < 22 */ }
const skip = DatabaseSync ? false : "cần node:sqlite (Node >= 22)";

const MIGRATION = new URL("../migrations/0012_video_claims.sql", import.meta.url);
const L = (id) => `https://www.tiktok.com/@shop/video/${id}`;
const TOKEN = "secret";

// D1 chỉ dùng prepare/bind/all/run/batch → shim đúng bấy nhiêu là đủ.
function fakeD1() {
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(MIGRATION, "utf8"));
  const mk = (sql, args) => ({
    bind: (...a) => mk(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => db.prepare(sql).run(...args),
  });
  return {
    prepare: (sql) => mk(sql, []),
    batch: async (stmts) => { for (const s of stmts) await s.run(); },
  };
}

function harness() {
  const env = { DB: fakeD1(), OPTIMIZER_TOKEN: TOKEN };
  const call = async (fn, method, body, token = TOKEN) => {
    const request = new Request("https://x/api/video-claims", {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers: { "content-type": "application/json", ...(token ? { "X-Optimizer-Token": token } : {}) },
    });
    const res = await fn({ env, request });
    return { status: res.status, body: await res.json() };
  };
  return {
    claim: (staff, ids, token) => call(onRequestPost, "POST", { staff, videos: ids.map((i) => ({ link: L(i) })) }, token),
    release: (staff, keys) => call(onRequestDelete, "DELETE", { staff, keys }),
    list: () => call(onRequestGet, "GET"),
  };
}

test("không có mã CRM thì KHÔNG ghi được sổ (endpoint ghi phải có token)", { skip }, async () => {
  const h = harness();
  const r = await h.claim("DUY", ["7106594312292453675"], null);
  assert.equal(r.status, 401);
  assert.equal((await h.list()).body.count, 0, "từ chối rồi thì không được ghi gì cả");
});

test("Duy nhận trước → Nam xin cùng video bị chặn, video còn lại vẫn nhận được", { skip }, async () => {
  const h = harness();
  await h.claim("DUY", ["111", "222"]);
  const nam = await h.claim("PHUONG_NAM", ["222", "333"]);
  assert.deepEqual(nam.body.claimed, ["333"], "video trống vẫn nhận bình thường");
  assert.deepEqual(nam.body.conflicts, [{ key: "222", staff: "DUY", staff_name: "Duy" }]);

  const owner = new Map((await h.list()).body.claims.map((c) => [c.video_key, c.staff]));
  assert.equal(owner.get("222"), "DUY", "xin trùng KHÔNG được ghi đè người đang giữ");
  assert.equal(owner.get("333"), "PHUONG_NAM");
});

test("gỡ nhận: người khác không gỡ hộ được, chính chủ gỡ xong người kia nhận lại được", { skip }, async () => {
  const h = harness();
  await h.claim("DUY", ["222"]);

  const hộ = await h.release("PHUONG_NAM", ["222"]);
  assert.deepEqual(hộ.body.released, []);
  assert.match(hộ.body.denied[0].reason, /Duy/);

  const tự = await h.release("DUY", ["222"]);
  assert.deepEqual(tự.body.released, ["222"]);
  assert.equal((await h.list()).body.count, 0, "gỡ xong sổ phải trống");

  const lại = await h.claim("PHUONG_NAM", ["222"]);
  assert.deepEqual(lại.body.claimed, ["222"], "dòng đã gỡ KHÔNG được chặn lượt nhận sau");
  assert.equal((await h.list()).body.claims[0].staff, "PHUONG_NAM");
});

test("GET trả kèm hạn gỡ để UI đếm ngược đúng", { skip }, async () => {
  const h = harness();
  await h.claim("DUY", ["111"]);
  const j = (await h.list()).body;
  assert.equal(j.release_window_s, 60);
  const c = j.claims[0];
  assert.equal(c.staff_name, "Duy");
  assert.equal(c.releasable_until, c.claimed_at + 60);
});
