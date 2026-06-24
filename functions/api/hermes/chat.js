// POST /api/hermes/chat
// Body: { session_id?: string, message: string, force_llm?: boolean }
// Response: { ok, session_id, response, tools_used, tokens_in, tokens_out, cost_usd, provider, fastpath? }
//
// Flow:
//   1. Auth qua getIdentity() (Cloudflare Access — CRM hiện public → userEmail "public@crm-doscom")
//   2. Try fastpath (regex match → tool direct, SKIP LLM, $0)
//   3. Nếu không match → runHermesAgent (Claude Haiku 4.5 qua gateway doscom-erp)
//
// `force_llm: true` → bypass fastpath, dùng LLM (debug).
// Kill switch: env.USE_CLAUDE === "false" → tắt nhánh LLM, chỉ giữ fastpath ($0).

import { getIdentity } from "../../lib/access.js";
import { runHermesAgent } from "../../lib/hermesAgent.js";
import { tryFastpath } from "../../lib/hermesFastpath.js";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function uuid() {
  return crypto.randomUUID();
}

// Helper: tạo/lookup session + persist user message + assistant message khi fastpath match
async function persistFastpathTurn(env, sessionId, userEmail, userMessage, response, fastpathName) {
  let sid = sessionId;
  if (!sid) {
    sid = uuid();
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO hermes_sessions (id, user_email, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(sid, userEmail, userMessage.slice(0, 80), now, now).run();
  }
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO hermes_messages (session_id, role, content, tool_name, created_at)
     VALUES (?, 'user', ?, NULL, ?)`
  ).bind(sid, userMessage, now).run();
  await env.DB.prepare(
    `INSERT INTO hermes_messages (session_id, role, content, tool_name, created_at)
     VALUES (?, 'assistant', ?, ?, ?)`
  ).bind(sid, response, `fastpath:${fastpathName}`, now + 1).run();
  await env.DB.prepare(
    `UPDATE hermes_sessions SET updated_at = ?, message_count = message_count + 1 WHERE id = ?`
  ).bind(now, sid).run();
  return sid;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return json({ error: "D1 binding 'DB' missing" }, 500);

  // Auth: dùng cơ chế Access của CRM. Public phase → email null → khoá chung "public@crm-doscom".
  // Khi bật Cloudflare Access sau này, getIdentity trả email thật → tự tách session theo user.
  const identity = await getIdentity(context);
  const userEmail = identity.email || "public@crm-doscom";

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const { session_id, message, force_llm } = body || {};
  if (!message || typeof message !== "string") return json({ error: "Body cần field 'message' (string)" }, 400);
  if (message.length > 4000) return json({ error: "Message quá dài (>4000 chars)" }, 400);

  // Verify session ownership nếu user truyền session_id
  if (session_id) {
    const row = await env.DB.prepare(
      `SELECT user_email FROM hermes_sessions WHERE id = ?`
    ).bind(session_id).first();
    if (row && row.user_email !== userEmail) return json({ error: "Session không thuộc user này" }, 403);
  }

  const origin = new URL(request.url).origin;
  const cookieHeader = request.headers.get("Cookie") || "";

  // 1. Fastpath thử trước (skip LLM nếu match) — chạy được kể cả khi USE_CLAUDE=false
  if (!force_llm) {
    try {
      const fp = await tryFastpath(message, { env, origin, cookieHeader, userEmail });
      if (fp) {
        const sid = await persistFastpathTurn(env, session_id, userEmail, message, fp.response, fp.matched);
        return json({
          ok: true,
          session_id: sid,
          response: fp.response,
          tools_used: [{ name: fp.matched, input: fp.match_input }],
          tokens_in: 0, tokens_out: 0, cost_usd: 0,
          provider: "fastpath",
          fastpath: fp.matched,
        });
      }
    } catch (e) {
      console.warn("Fastpath error, fallthrough to LLM:", e.message);
    }
  }

  // Kill switch (RED LINE CRM): USE_CLAUDE=false → không gọi Claude.
  if (env.USE_CLAUDE === "false") {
    return json({
      ok: true,
      session_id: session_id || null,
      response: "⚠ Hermes LLM đang tắt (USE_CLAUDE=false). Chỉ câu fastpath (spend/KPI/GEO đơn giản) hoạt động — hãy hỏi cụ thể hơn.",
      tools_used: [], tokens_in: 0, tokens_out: 0, cost_usd: 0,
      provider: "disabled",
    });
  }

  // 2. LLM agent loop (Claude Haiku 4.5)
  try {
    const result = await runHermesAgent(context, {
      sessionId: session_id || null,
      userMessage: message,
      userEmail,
    });
    return json({ ok: true, ...result });
  } catch (e) {
    return json({ ok: false, error: e.message || String(e) }, 500);
  }
}
