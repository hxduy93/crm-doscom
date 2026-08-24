// GET  /api/thai-social/pages  — danh sách fanpage Thái (KHÔNG bao giờ trả page_token)
// POST /api/thai-social/pages  — thêm/sửa fanpage (cần header X-Thai-Token)

import { ok, fail, requireToken, requireDB, nowSec, clip, publicPage, parseWeekdays } from "./_lib.js";
import { verifyPageToken } from "./_graph.js";

export async function onRequestGet({ env }) {
  const bad = requireDB(env);
  if (bad) return bad;

  const { results } = await env.DB.prepare(
    `SELECT * FROM thai_pages ORDER BY name`
  ).all();

  const at = nowSec();
  return ok((results || []).map((r) => publicPage(r, at)));
}

export async function onRequestPost({ request, env }) {
  const bad = requireDB(env) || requireToken(request, env);
  if (bad) return bad;

  let b;
  try { b = await request.json(); } catch { return fail("invalid_json"); }

  const pageId = clip(b.page_id, 40);
  if (!pageId) return fail("missing_page_id");
  const name = clip(b.name, 120);
  if (!name) return fail("missing_name");

  const hour = Number.isInteger(b.post_hour_vn) ? b.post_hour_vn : 8;
  if (hour < 0 || hour > 23) return fail("invalid_post_hour_vn");

  const weekdays = parseWeekdays(Array.isArray(b.weekdays) ? b.weekdays.join(",") : b.weekdays);
  if (!weekdays.length) return fail("invalid_weekdays");

  // Token mới thì kiểm luôn với Facebook. Lưu một token sai rồi để user phát hiện lúc
  // bấm Đăng là kiểu hỏng đắt nhất — đúng bài học lệch NOMA911_INGEST_TOKEN.
  let tokenSql = "";
  const tokenArgs = [];
  if (typeof b.page_token === "string" && b.page_token.trim()) {
    const v = await verifyPageToken(pageId, b.page_token.trim());
    if (!v.ok) return fail("page_token_invalid", 400, { detail: v.message, kind: v.kind });
    tokenSql = ", page_token = ?, token_expires_at = ?";
    tokenArgs.push(b.page_token.trim(), Number(b.token_expires_at) || 0);
  }

  const now = nowSec();
  const existing = await env.DB.prepare(`SELECT page_id FROM thai_pages WHERE page_id = ?`).bind(pageId).first();

  if (existing) {
    await env.DB.prepare(
      `UPDATE thai_pages SET name = ?, active = ?, post_hour_vn = ?, weekdays = ?,
              default_sku_main = ?, default_sku_addon = ?, updated_at = ?${tokenSql}
       WHERE page_id = ?`
    ).bind(
      name, b.active === false ? 0 : 1, hour, weekdays.join(","),
      clip(b.default_sku_main, 20) || null, clip(b.default_sku_addon, 20) || null, now,
      ...tokenArgs, pageId
    ).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO thai_pages (page_id, name, page_token, token_expires_at, active, post_hour_vn,
                               weekdays, default_sku_main, default_sku_addon, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      pageId, name,
      tokenArgs.length ? tokenArgs[0] : null,
      tokenArgs.length ? tokenArgs[1] : 0,
      b.active === false ? 0 : 1, hour, weekdays.join(","),
      clip(b.default_sku_main, 20) || null, clip(b.default_sku_addon, 20) || null, now, now
    ).run();
  }

  const row = await env.DB.prepare(`SELECT * FROM thai_pages WHERE page_id = ?`).bind(pageId).first();
  return ok(publicPage(row, now));
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Thai-Token",
    },
  });
}
