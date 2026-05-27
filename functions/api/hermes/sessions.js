// GET  /api/hermes/sessions       → list sessions của user (20 mới nhất)
// DELETE /api/hermes/sessions?id=  → xóa 1 session (CASCADE messages)

import { verifySession, hasTestBypass } from "../../_middleware.js";

const SESSION_COOKIE = "doscom_session";

function getCookie(request, name) {
  const c = request.headers.get("Cookie") || "";
  const m = c.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function authUser(request, env) {
  const sessionCookie = getCookie(request, SESSION_COOKIE);
  const session = await verifySession(sessionCookie, env.SESSION_SECRET);
  const bypass = hasTestBypass(request, env);
  if (!session && !bypass) return null;
  return session?.email || "test@bypass";
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) return json({ error: "D1 binding 'DB' missing" }, 500);

  const userEmail = await authUser(request, env);
  if (!userEmail) return json({ error: "Unauthorized" }, 401);

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);

  const { results } = await env.DB.prepare(
    `SELECT id, title, created_at, updated_at, message_count, tokens_in, tokens_out, cost_usd_e6
     FROM hermes_sessions
     WHERE user_email = ?
     ORDER BY updated_at DESC LIMIT ?`
  ).bind(userEmail, limit).all();

  return json({
    ok: true,
    sessions: (results || []).map(s => ({
      id: s.id,
      title: s.title || "(không có tiêu đề)",
      created_at: s.created_at,
      updated_at: s.updated_at,
      message_count: s.message_count,
      cost_usd: Number(((s.cost_usd_e6 || 0) / 1_000_000).toFixed(4)),
    })),
  });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  if (!env.DB) return json({ error: "D1 binding 'DB' missing" }, 500);

  const userEmail = await authUser(request, env);
  if (!userEmail) return json({ error: "Unauthorized" }, 401);

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "Cần ?id=<session_id>" }, 400);

  // Verify ownership
  const row = await env.DB.prepare(
    `SELECT user_email FROM hermes_sessions WHERE id = ?`
  ).bind(id).first();
  if (!row) return json({ error: "Session không tồn tại" }, 404);
  if (row.user_email !== userEmail) return json({ error: "Forbidden" }, 403);

  // Delete (CASCADE messages do FK)
  await env.DB.prepare(`DELETE FROM hermes_messages WHERE session_id = ?`).bind(id).run();
  await env.DB.prepare(`DELETE FROM hermes_sessions WHERE id = ?`).bind(id).run();

  return json({ ok: true, deleted: id });
}
