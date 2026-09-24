// 4 NHÀ CUNG CẤP AI viết content ads — cùng một hình dạng gọi: (env, system, user) → text.
//
// Thứ tự dự phòng (24/09/2026): Claude → Gemini → OpenAI → Workers AI.
//   • Claude Sonnet 5  — chất lượng tốt nhất, 22/22 bài đạt ở vòng duyệt 4.
//   • Gemini 2.5 Flash — tiếng Việt tốt, rẻ; key GEMINI_API_KEY dùng chung với GEO.
//   • OpenAI gpt-4o    — key OPENAI_API_KEY dùng chung với GEO (đi qua AI Gateway).
//   • Workers AI       — chạy ngay trong Cloudflare, KHÔNG cần key → tầng cuối gần như
//     luôn chạy được. Yếu nhất; bộ kiểm tra cấu trúc (ad-copy-validate.js) chặn bài hỏng.
// Đổi model từng tầng qua env mà không sửa code:
//   GEMINI_COPY_MODEL, OPENAI_COPY_MODEL, WORKERS_AI_COPY_MODEL
// Đổi/bớt thứ tự qua env AD_COPY_CHAIN="anthropic,gemini,openai,workers".

import { anthropicBase, googleAiBase, proxyHeaders } from "./ai-endpoint.js";
import { callOpenAIChat } from "../api/geo/_utils/openai-chat.js";

export const CLAUDE_MODEL = "claude-sonnet-5";

async function callAnthropic(env, systemPrompt, userPrompt) {
  const r = await fetch(`${anthropicBase(env)}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      ...proxyHeaders(env),
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      // Sonnet 5 không nhận `temperature` (API trả 400 "deprecated for this model").
      // Để mặc định (effort high) thì có lượt nó dùng hết 8.192 token vào phần suy nghĩ,
      // không còn chữ nào trả về, mất ~75 giây. effort "low": ~20 giây, đủ bài (đo 24/09/2026).
      output_config: { effort: "low" },
      max_tokens: 16000,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userPrompt }],
    }),
    // Sonnet viết 3 bài mất ~40-70 giây, 60s cũ dễ hụt.
    signal: AbortSignal.timeout(120000),
  });
  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    throw new Error(`Claude API ${r.status}: ${errText.slice(0, 300)}`);
  }
  const data = await r.json();
  const textBlock = (data.content || []).find((b) => b.type === "text");
  if (!textBlock?.text) {
    throw new Error(data.stop_reason === "max_tokens"
      ? "Claude dùng hết token vào phần suy nghĩ, chưa kịp viết bài"
      : `Claude trả empty content (stop_reason: ${data.stop_reason || "?"})`);
  }
  return { text: textBlock.text, model: CLAUDE_MODEL };
}

async function callGemini(env, systemPrompt, userPrompt) {
  const model = env.GEMINI_COPY_MODEL || "gemini-2.5-flash";
  const r = await fetch(`${googleAiBase(env)}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...proxyHeaders(env) },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: 12000,
        // 2.5 Flash tự suy nghĩ; chặn trần để không ăn hết phần viết bài (bẫy giống Sonnet 5).
        thinkingConfig: { thinkingBudget: 1024 },
      },
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!r.ok) throw new Error(`Gemini ${model} ${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}`);
  const data = await r.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p?.text).filter(Boolean).join("");
  if (!text) throw new Error(`Gemini ${model} trả rỗng (finishReason: ${data.candidates?.[0]?.finishReason || "?"})`);
  return { text, model };
}

async function callOpenAI(env, systemPrompt, userPrompt) {
  const model = env.OPENAI_COPY_MODEL || "gpt-4o";
  const r = await callOpenAIChat(env, { systemPrompt, userPrompt, maxTokens: 6000, jsonOutput: true, model });
  return { text: r.text, model: r.model };
}

async function callWorkersAI(env, systemPrompt, userPrompt) {
  // Llama 3.3 70B đã chạy thật trong crm (agent FB/Google). Đổi sang model mạnh hơn
  // (vd @cf/openai/gpt-oss-120b) qua WORKERS_AI_COPY_MODEL khi đã thử được.
  const model = env.WORKERS_AI_COPY_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  const res = await env.AI.run(model, {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 6000,
  });
  const out = res?.response;
  const text = typeof out === "string" ? out : out ? JSON.stringify(out) : "";
  if (!text) throw new Error(`Workers AI ${model} trả rỗng`);
  return { text, model };
}

// id → { tên hiển thị, có dùng được không (đủ cấu hình), hàm gọi }
export const PROVIDERS = {
  anthropic: { label: "Claude", ready: (env) => !!env.ANTHROPIC_API_KEY, call: callAnthropic },
  gemini: { label: "Gemini", ready: (env) => !!env.GEMINI_API_KEY, call: callGemini },
  openai: { label: "OpenAI", ready: (env) => !!env.OPENAI_API_KEY, call: callOpenAI },
  workers: { label: "Workers AI", ready: (env) => !!env.AI?.run, call: callWorkersAI },
};

export const DEFAULT_CHAIN = ["anthropic", "gemini", "openai", "workers"];

/** Chuỗi dự phòng thực dùng: theo env AD_COPY_CHAIN nếu có, bỏ tầng chưa cấu hình. */
export function chuoiDuPhong(env) {
  const wanted = String(env.AD_COPY_CHAIN || "").split(",").map((s) => s.trim()).filter(Boolean);
  return (wanted.length ? wanted : DEFAULT_CHAIN).filter((id) => PROVIDERS[id] && PROVIDERS[id].ready(env));
}
