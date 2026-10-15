// Chạy THẬT /api/video-unavailable trên SQLite (shim D1) + đúng các file migration.
// 15/10/2026: video TikTok không lấy được link → ghi sổ, menu TikTok Shop tự loại, và
// lượt nhận của video đó được gỡ (trừ video đã lên camp).
//
// node:sqlite chỉ có từ Node 22 → CI (Node 20) tự BỎ QUA.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { onRequestGet, onRequestPost } from "../functions/api/video-unavailable.js";
import { onRequestPost as nhan, onRequestGet as dsNhan } from "../functions/api/video-claims.js";

let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* Node < 22 */ }
const skip = DatabaseSync ? false : "cần node:sqlite (Node >= 22)";

const MIG = ["0007_uploaded_videos.sql", "0012_video_claims.sql", "0030_video_unavailable.sql"]
  .map((f) => new URL(`../migrations/${f}`, import.meta.url));
const L = (id) => `tiktok.com/@toanmanshop/video/${id}`;   // đúng dạng link Lark (thiếu https://)
const TOKEN = "secret";

function fakeD1() {
  const db = new DatabaseSync(":memory:");
  for (const m of MIG) db.exec(fs.readFileSync(m, "utf8"));
  const mk = (sql, args) => ({
    bind: (...a) => mk(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => db.prepare(sql).run(...args),
  });
  return { raw: db, prepare: (sql) => mk(sql, []), batch: async (s) => { for (const x of s) await x.run(); } };
}

function harness() {
  const env = { DB: fakeD1(), OPTIMIZER_TOKEN: TOKEN };
  const call = async (fn, method, body, token = TOKEN) => {
    const request = new Request("https://x/api", {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers: { "content-type": "application/json", ...(token ? { "X-Optimizer-Token": token } : {}) },
    });
    const res = await fn({ env, request });
    return { status: res.status, body: await res.json() };
  };
  return {
    env,
    mark: (ids, token) => call(onRequestPost, "POST", { videos: ids.map((i) => ({ link: L(i), reason: "Url parsing is failed" })) }, token),
    list: () => call(onRequestGet, "GET"),
    claim: (ids) => call(nhan, "POST", { staff: "DUY", videos: ids.map((i) => ({ link: L(i) })) }),
    claims: () => call(dsNhan, "GET"),
  };
}

test("không có mã CRM thì không ghi được", { skip }, async () => {
  const h = harness();
  assert.equal((await h.mark(["7679112123611647253"], null)).status, 401);
  assert.equal((await h.list()).body.videos.length, 0);
});

test("ghi video lỗi → GET trả về, ghi lại lần nữa không nhân đôi", { skip }, async () => {
  const h = harness();
  await h.mark(["7679112123611647253", "7664898767031782677"]);
  await h.mark(["7679112123611647253"]);
  const ds = (await h.list()).body.videos.map((v) => v.video_key).sort();
  assert.deepEqual(ds, ["7664898767031782677", "7679112123611647253"]);
});

test("gỡ nhận video lỗi, NHƯNG giữ nhận video đã lên camp", { skip }, async () => {
  const h = harness();
  await h.claim(["111", "222"]);
  h.env.DB.raw.prepare(
    "INSERT INTO uploaded_videos (account_id, filename, created_at) VALUES ('1', '222.mp4', 0)"
  ).run();
  const r = await h.mark(["111", "222"]);
  assert.deepEqual(r.body.released, ["111"]);
  const con = (await h.claims()).body.claims.map((c) => c.video_key);
  assert.deepEqual(con, ["222"]);
});

test("quá 3 ngày thì không còn bị loại (video đang duyệt có thể mở lại)", { skip }, async () => {
  const h = harness();
  await h.mark(["333"]);
  h.env.DB.raw.prepare("UPDATE video_unavailable SET marked_at = marked_at - 4 * 86400").run();
  assert.equal((await h.list()).body.videos.length, 0);
});
