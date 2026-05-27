// Hermes-inspired chat agent runtime cho Doscom dashboard.
//
// Hybrid LLM strategy (cost-saving theo phương án C của user):
//   1. Default: Gemini 2.5 Flash via AI Gateway (FREE 1,500 req/ngày)
//   2. Fallback: Claude Haiku 4.5 nếu Gemini rate limit hoặc fail
//
// Pipeline mỗi chat:
//   1. Load message history (last 30 turns) từ D1
//   2. Load user prefs (inject vào system prompt)
//   3. Tool-use loop (max 5 iter) với LLM hybrid
//   4. Rule-based sanity check (regex verify số liệu)
//   5. Persist user message + assistant response + tool calls vào D1

import { TOOLS, runTool } from "./hermesTools.js";

const GEMINI_MODEL  = "gemini-2.5-flash";       // free tier 1,500 RPD, 10 RPM
const CLAUDE_MODEL  = "claude-haiku-4-5";       // fallback paid
const MAX_TOOL_ITER = 5;
const HISTORY_TURNS = 30;
const MAX_OUTPUT_TOKENS = 600;                  // cap theo style Doscom Ops Agent

// Pricing per 1M tokens
const PRICING = {
  gemini: { in: 0,   out: 0   },                // free tier
  claude: { in: 1,   out: 5   },                // Haiku 4.5
};

const SYSTEM_PROMPT_BASE = `Bạn là Hermes — chat agent của Doscom Holdings, tích hợp trong dashboard FB Ads / Google Ads / GEO Content.

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
// Claude format ↔ Gemini format translation
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

// Convert Claude-shape messages → Gemini contents.
function claudeMessagesToGemini(messages) {
  const contents = [];
  for (const m of messages) {
    const role = m.role === "assistant" ? "model" : "user";
    if (typeof m.content === "string") {
      contents.push({ role, parts: [{ text: m.content }] });
    } else if (Array.isArray(m.content)) {
      const parts = [];
      for (const block of m.content) {
        if (block.type === "text") parts.push({ text: block.text });
        else if (block.type === "tool_use") {
          parts.push({ functionCall: { name: block.name, args: block.input || {} } });
        } else if (block.type === "tool_result") {
          // tool_result content can be string or block array — flatten to string
          let txt = block.content;
          if (Array.isArray(txt)) txt = txt.map(b => b.text || "").join("\n");
          // Gemini's functionResponse needs a name — we lose tool_use_id but reuse last name via map
          parts.push({ functionResponse: { name: block._tool_name || "unknown", response: { result: txt } } });
        }
      }
      if (parts.length) contents.push({ role, parts });
    }
  }
  return contents;
}

// Convert Claude tool schema → Gemini functionDeclarations
function claudeToolsToGemini(tools) {
  return [{
    functionDeclarations: tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    })),
  }];
}

// Convert Gemini response → Claude-shape response (so agent loop code chung)
function geminiResponseToClaude(data) {
  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const content = [];
  for (const p of parts) {
    if (p.text) content.push({ type: "text", text: p.text });
    if (p.functionCall) {
      content.push({
        type: "tool_use",
        id: "gemini_call_" + uuid().slice(0, 8),
        name: p.functionCall.name,
        input: p.functionCall.args || {},
      });
    }
  }
  const hasToolUse = content.some(c => c.type === "tool_use");
  return {
    content,
    stop_reason: hasToolUse ? "tool_use" : "end_turn",
    usage: {
      input_tokens: data.usageMetadata?.promptTokenCount || 0,
      output_tokens: data.usageMetadata?.candidatesTokenCount || 0,
      cache_read_input_tokens: 0,
    },
    _provider: "gemini",
  };
}

// ====================================================================
// LLM calls
// ====================================================================
async function callGemini(env, systemPrompt, messages, tools) {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");
  const baseUrl = env.CF_ACCOUNT_ID
    ? `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/doscom-erp/google-ai-studio/v1beta`
    : "https://generativelanguage.googleapis.com/v1beta";
  const url = `${baseUrl}/models/${GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;

  // Inject tool_name into tool_result blocks (Gemini cần name trong functionResponse)
  // Tracking: tool_use id → name map cho turn này
  const idToName = {};
  for (const m of messages) {
    if (Array.isArray(m.content)) {
      for (const b of m.content) {
        if (b.type === "tool_use") idToName[b.id] = b.name;
        if (b.type === "tool_result" && idToName[b.tool_use_id]) b._tool_name = idToName[b.tool_use_id];
      }
    }
  }

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: claudeMessagesToGemini(messages),
    tools: claudeToolsToGemini(tools),
    generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0.4 },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    const e = new Error(`Gemini ${res.status}: ${err.slice(0, 300)}`);
    e.status = res.status;
    e.rateLimited = res.status === 429 || /quota|rate/i.test(err);
    throw e;
  }
  const data = await res.json();
  return geminiResponseToClaude(data);
}

async function callClaude(env, systemPrompt, messages, tools) {
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

// Hybrid: try Gemini free first, fallback Claude Haiku on rate limit/quota
async function callLLM(env, systemPrompt, messages, tools) {
  if (env.GEMINI_API_KEY) {
    try {
      return await callGemini(env, systemPrompt, messages, tools);
    } catch (e) {
      if (e.rateLimited) {
        console.warn("Gemini rate limited, fallback Claude:", e.message);
      } else if (env.ANTHROPIC_API_KEY) {
        console.warn("Gemini failed, fallback Claude:", e.message);
      } else {
        throw e;
      }
    }
  }
  return await callClaude(env, systemPrompt, messages, tools);
}

function calcCost(usage, provider) {
  const p = PRICING[provider] || PRICING.claude;
  const tIn  = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0);
  const tOut = usage.output_tokens || 0;
  return Math.round(tIn * p.in + tOut * p.out);  // micro-dollars (×1M token đã chia trước)
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
  let providerUsed = "gemini";

  for (let iter = 0; iter < MAX_TOOL_ITER; iter++) {
    const resp = await callLLM(env, systemPrompt, messages, TOOLS);
    providerUsed = resp._provider || providerUsed;
    const usage = resp.usage || {};
    const tIn = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0);
    const tOut = usage.output_tokens || 0;
    totalTokIn += tIn;
    totalTokOut += tOut;
    totalCostE6 += calcCost(usage, providerUsed);

    const blocks = resp.content || [];
    const textBlocks = blocks.filter(b => b.type === "text").map(b => b.text).join("\n");
    const toolUses = blocks.filter(b => b.type === "tool_use");

    if (toolUses.length === 0) {
      finalText = textBlocks || "(no text)";
      // Sanity check
      const sc = sanityCheck(finalText, allToolResults);
      if (!sc.ok) {
        finalText += `\n\n⚠ *Sanity check: số ${sc.suspicious_numbers.join(", ")} có thể không khớp tool result — verify lại.*`;
      }
      await persistMessage(env, sid, "assistant", finalText, {
        tokens_in: tIn, tokens_out: tOut, cost_usd_e6: calcCost(usage, providerUsed),
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
    provider: providerUsed,
  };
}
