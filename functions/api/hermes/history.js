// GET /api/hermes/history?session_id=xxx
// Trả về toàn bộ message của 1 session (user + assistant; bỏ qua tool_call/tool_result để UI gọn).

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

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) return json({ error: "D1 binding 'DB' missing" }, 500);

  const sessionCookie = getCookie(request, SESSION_COOKIE);
  const session = await verifySession(sessionCookie, env.SESSION_SECRET);
  const bypass = hasTestBypass(request, env);
  if (!session && !bypass) return json({ error: "Unauthorized" }, 401);
  const userEmail = session?.email || "test@bypass";

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");
  const includeTools = url.searchParams.get("include_tools") === "1";
  if (!sessionId) return json({ error: "Cần ?session_id=" }, 400);

  // Verify ownership
  const sess = await env.DB.prepare(
    `SELECT user_email, title FROM hermes_sessions WHERE id = ?`
  ).bind(sessionId).first();
  if (!sess) return json({ error: "Session không tồn tại" }, 404);
  if (sess.user_email !== userEmail) return json({ error: "Forbidden" }, 403);

  const rolesFilter = includeTools
    ? `('user','assistant','tool_call','tool_result')`
    : `('user','assistant')`;
  const { results } = await env.DB.prepare(
    `SELECT id, role, content, tool_name, created_at
     FROM hermes_messages
     WHERE session_id = ? AND role IN ${rolesFilter}
     ORDER BY id ASC`
  ).bind(sessionId).all();

  return json({
    ok: true,
    session: { id: sessionId, title: sess.title },
    messages: (results || []).map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      tool_name: m.tool_name,
      created_at: m.created_at,
    })),
  });
}
