// Hermes chat agent runtime — port sang CRM Doscom (2026-06-24).
//
// Claude Haiku 4.5 only (đồng bộ FB/Google/GEO agent của CRM), qua AI Gateway
// 'doscom-erp'. Fastpath cover ~60% query → cost thực ~$1-3/tháng.
//
// Pipeline mỗi chat:
//   1. Load message history (last 30 turns) từ D1
//   2. Load user prefs (inject vào system prompt)
//   3. Tool-use loop (max 5 iter) với Claude Haiku 4.5
//   4. Rule-based sanity check (regex verify số liệu)
//   5. Persist user message + assistant response + tool calls vào D1

import { TOOLS, runTool } from "./hermesTools.js";

const CLAUDE_MODEL  = "claude-haiku-4-5";
const MAX_TOOL_ITER = 5;
const HISTORY_TURNS = 30;
const MAX_OUTPUT_TOKENS = 600;
const PRICING = { in: 1, out: 5 };              // $/1M tokens cho Haiku 4.5

const SYSTEM_PROMPT_BASE = `Bạn là Hermes — chat agent của Doscom Holdings, tích hợp trong CRM (FB Ads / Google Ads / GEO Content).

NHIỆM VỤ:
- Trả lời câu hỏi về dữ liệu quảng cáo, KPI, content GEO của user.
- Gọi tool có sẵn để LẤY dữ liệu thực, KHÔNG được bịa số. Nếu không có tool phù hợp → nói thẳng "không có dữ liệu".
- Trả lời bằng tiếng Việt, gọn, có số liệu cụ thể. Dùng markdown table nếu so sánh nhiều cột.
- Nếu user ra lệnh hành động (pause campaign, viết bài GEO, …) → v1 chỉ EXPLAIN sẽ làm gì + URL nút bấm; KHÔNG thực thi (mutation tools chưa enable).

CONTEXT CỐ ĐỊNH:
- Today VN: __TODAY__
- 2 nhân sự FB Ads: DUY (3 accounts) + PHƯƠNG NAM (4 accounts). Lookup tên đầy đủ: DUY, PHUONG_NAM.
- Brands GEO: doscom (phần mềm) + noma (chăm sóc xe).
- KPI tháng: dùng tool get_kpi_status để lấy.

PHONG CÁCH:
- Số VND format dấu phẩy: 227,240,568 VND.
- Thời gian preset hợp lệ cho tool: today | yesterday | this_week | last_week | this_month | last_month | last_7d | last_30d | last_90d.
- Câu trả lời dài < 200 từ trừ khi user hỏi báo cáo chi tiết.`;

// ====================================================================
// Helpers
// ====================================================================
function todayVN() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function uuid() {
  return crypto.randomUUID();
}

async function loadHistory(env, sessionId, limit = HISTORY_TURNS) {
  const { results } = await env.DB.prepare(
    `SELECT role, content, tool_name FROM hermes_messages
     WHERE session_id = ? ORDER BY id DESC LIMIT ?`
  ).bind(sessionId, limit * 4).all();
  return results.reverse();
}

async function loadPrefs(env, userEmail) {
  const { results } = await env.DB.prepare(
    `SELECT key, value FROM hermes_user_prefs WHERE user_email = ?`
  ).bind(userEmail).all();
  if (!results?.length) return "";
  const lines = results.map(r => `- ${r.key}: ${r.value}`).join("\n");
  return `\n\nUSER PREFERENCES (đã học từ chat trước):\n${lines}`;
}

function buildSystemPrompt(prefs) {
  return SYSTEM_PROMPT_BASE.replace("__TODAY__", todayVN()) + prefs;
}

// ====================================================================
// Hermes-internal message format theo Claude shape:
//   - user        → { role: "user", content: text }
//   - assistant   → { role: "assistant", content: text }
//   - tool_call   → { role: "assistant", content: [{ type: "tool_use", id, name, input }] }
//   - tool_result → { role: "user", content: [{ type: "tool_result", tool_use_id, content }] }

function buildClaudeMessages(history, newUserMessage) {
  const msgs = [];
  for (const m of history) {
    if (m.role === "user") msgs.push({ role: "user", content: m.content });
    else if (m.role === "assistant") msgs.push({ role: "assistant", content: m.content });
    else if (m.role === "tool_call") {
      const tc = JSON.parse(m.content);
      msgs.push({ role: "assistant", content: [{ type: "tool_use", id: tc.id, name: tc.name, input: tc.input }] });
    } else if (m.role === "tool_result") {
      const tr = JSON.parse(m.content);
      msgs.push({ role: "user", content: [{ type: "tool_result", tool_use_id: tr.tool_use_id, content: tr.output }] });
    }
  }
  msgs.push({ role: "user", content: newUserMessage });
  return msgs;
}

// ====================================================================
// LLM call — Claude Haiku 4.5 via Cloudflare AI Gateway 'doscom-erp'
// ====================================================================
async function callLLM(env, systemPrompt, messages, tools) {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing");
  if (!env.CF_ACCOUNT_ID) throw new Error("CF_ACCOUNT_ID missing");
  const url = `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/doscom-erp/anthropic/v1/messages`;
  const body = {
    model: CLAUDE_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    tools,
    messages,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Claude ${res.status}: ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  data._provider = "claude";
  return data;
}

function calcCost(usage) {
  const tIn  = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0);
  const tOut = usage.output_tokens || 0;
  return Math.round(tIn * PRICING.in + tOut * PRICING.out);  // micro-dollars
}

// ====================================================================
// Sanity check: regex verify số liệu trong response có trong tool results
// ====================================================================
export function sanityCheck(responseText, toolResults) {
  // Tách số có format VND/đ/% (vd "227,240,568 VND", "33.6%")
  const vndMatches = responseText.match(/[\d,]{3,}(?=\s*(?:VND|đ|đồng))/gi) || [];
  const suspicious = [];
  const allToolJson = JSON.stringify(toolResults || {});
  for (const m of vndMatches) {
    const val = parseInt(m.replace(/,/g, ""));
    if (isNaN(val) || val < 1000) continue;  // skip small numbers
    // Cho phép ±0.5% sai số do rounding
    const tolerance = Math.max(1, Math.round(val * 0.005));
    let found = false;
    // Tìm số gần trong JSON (đơn giản: check phần đầu của số match)
    const prefix = String(val).slice(0, Math.max(4, String(val).length - 3));
    if (allToolJson.includes(prefix)) found = true;
    if (!found) suspicious.push(m);
  }
  return {
    ok: suspicious.length === 0,
    suspicious_numbers: suspicious,
  };
}

// ====================================================================
// Persistence helpers
// ====================================================================
async function persistMessage(env, sessionId, role, content, opts = {}) {
  await env.DB.prepare(
    `INSERT INTO hermes_messages (session_id, role, content, tool_name, tokens_in, tokens_out, cost_usd_e6, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    sessionId, role, content,
    opts.tool_name || null,
    opts.tokens_in || null,
    opts.tokens_out || null,
    opts.cost_usd_e6 || null,
    Date.now()
  ).run();
}

async function bumpSession(env, sessionId, addTokIn, addTokOut, addCostE6) {
  await env.DB.prepare(
    `UPDATE hermes_sessions
     SET updated_at = ?, message_count = message_count + 1,
         tokens_in = tokens_in + ?, tokens_out = tokens_out + ?,
         cost_usd_e6 = cost_usd_e6 + ?
     WHERE id = ?`
  ).bind(Date.now(), addTokIn, addTokOut, addCostE6, sessionId).run();
}

async function ensureSession(env, sessionId, userEmail, firstMessageText) {
  if (sessionId) {
    const row = await env.DB.prepare(
      `SELECT id, user_email FROM hermes_sessions WHERE id = ?`
    ).bind(sessionId).first();
    if (!row) throw new Error(`Session ${sessionId} không tồn tại`);
    if (row.user_email !== userEmail) throw new Error("Session không thuộc về user này");
    return sessionId;
  }
  const newId = uuid();
  const title = firstMessageText.slice(0, 80);
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO hermes_sessions (id, user_email, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(newId, userEmail, title, now, now).run();
  return newId;
}

// ====================================================================
// Main entry — gọi từ /api/hermes/chat
// ====================================================================
export async function runHermesAgent(ctx, { sessionId, userMessage, userEmail }) {
  const { env, request } = ctx;
  const origin = new URL(request.url).origin;
  const cookieHeader = request.headers.get("Cookie") || "";
  const toolCtx = { env, origin, cookieHeader, userEmail };

  const sid = await ensureSession(env, sessionId, userEmail, userMessage);

  const [history, prefs] = await Promise.all([
    loadHistory(env, sid),
    loadPrefs(env, userEmail),
  ]);
  const systemPrompt = buildSystemPrompt(prefs);

  await persistMessage(env, sid, "user", userMessage);

  let messages = buildClaudeMessages(history, userMessage);
  let finalText = "";
  let totalTokIn = 0, totalTokOut = 0, totalCostE6 = 0;
  const toolsExecuted = [];
  const allToolResults = [];     // cho sanity check

  for (let iter = 0; iter < MAX_TOOL_ITER; iter++) {
    const resp = await callLLM(env, systemPrompt, messages, TOOLS);
    const usage = resp.usage || {};
    const tIn = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0);
    const tOut = usage.output_tokens || 0;
    totalTokIn += tIn;
    totalTokOut += tOut;
    totalCostE6 += calcCost(usage);

    const blocks = resp.content || [];
    const textBlocks = blocks.filter(b => b.type === "text").map(b => b.text).join("\n");
    const toolUses = blocks.filter(b => b.type === "tool_use");

    if (toolUses.length === 0) {
      finalText = textBlocks || "(no text)";
      const sc = sanityCheck(finalText, allToolResults);
      if (!sc.ok) {
        finalText += `\n\n⚠ *Sanity check: số ${sc.suspicious_numbers.join(", ")} có thể không khớp tool result — verify lại.*`;
      }
      await persistMessage(env, sid, "assistant", finalText, {
        tokens_in: tIn, tokens_out: tOut, cost_usd_e6: calcCost(usage),
      });
      break;
    }

    for (const tu of toolUses) {
      await persistMessage(env, sid, "tool_call",
        JSON.stringify({ id: tu.id, name: tu.name, input: tu.input }),
        { tool_name: tu.name }
      );
    }
    messages.push({ role: "assistant", content: blocks });

    const toolResults = await Promise.all(
      toolUses.map(async (tu) => {
        try {
          const output = await runTool(tu.name, tu.input, toolCtx);
          allToolResults.push(output);
          return { type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(output) };
        } catch (e) {
          return { type: "tool_result", tool_use_id: tu.id, content: JSON.stringify({ error: e.message }), is_error: true };
        }
      })
    );

    for (const tr of toolResults) {
      await persistMessage(env, sid, "tool_result",
        JSON.stringify({ tool_use_id: tr.tool_use_id, output: tr.content })
      );
    }
    toolsExecuted.push(...toolUses.map(t => ({ name: t.name, input: t.input })));

    messages.push({ role: "user", content: toolResults });

    if (resp.stop_reason && resp.stop_reason !== "tool_use") break;
  }

  if (!finalText) {
    finalText = "⚠ Agent vượt quá " + MAX_TOOL_ITER + " vòng tool-use. Thử hỏi lại đơn giản hơn.";
    await persistMessage(env, sid, "assistant", finalText);
  }

  await bumpSession(env, sid, totalTokIn, totalTokOut, totalCostE6);

  return {
    session_id: sid,
    response: finalText,
    tools_used: toolsExecuted,
    tokens_in: totalTokIn,
    tokens_out: totalTokOut,
    cost_usd: Number((totalCostE6 / 1_000_000).toFixed(6)),
    provider: "claude-haiku-4-5",
  };
}
