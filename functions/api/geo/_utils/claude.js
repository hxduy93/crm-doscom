// Shared Claude helper cho GEO Content Pipeline.
// Gọi Anthropic API qua Cloudflare AI Gateway 'doscom-erp' (cùng pattern agent-fb-ai.js).
//
// Pricing (5/2026):
//   Haiku 4.5:   input $1/1M, output $5/1M    → ~$0.03/bài 2500 từ
//   Sonnet 4.6:  input $3/1M, output $15/1M   → ~$0.09/bài 2500 từ

// 2026-05-27: cả "haiku" và "sonnet" map đều trỏ về Haiku 4.5 để cắt cost.
// Code cũ gọi model:"sonnet" vẫn chạy, chỉ là không thực sự dùng Sonnet nữa.
// Đổi lại nếu cần: sonnet: "claude-sonnet-4-6"
export const CLAUDE_MODELS = {
  haiku:  "claude-haiku-4-5",
  sonnet: "claude-haiku-4-5",
};

const PRICING = {
  "claude-haiku-4-5":  { in: 1,  out: 5  },
  "claude-sonnet-4-6": { in: 3,  out: 15 },  // giữ pricing để code legacy không break
};

export async function callClaude(env, {
  model = "haiku",
  systemPrompt,
  userPrompt,
  maxTokens = 4000,
  jsonOutput = false,
  cacheSystem = true,
}) {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing in Cloudflare env");
  if (!env.CF_ACCOUNT_ID)     throw new Error("CF_ACCOUNT_ID missing in Cloudflare env");

  const modelId = CLAUDE_MODELS[model] || model;
  const url = `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/doscom-erp/anthropic/v1/messages`;

  const systemBlock = cacheSystem
    ? [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }]
    : [{ type: "text", text: systemPrompt }];

  const body = {
    model: modelId,
    max_tokens: maxTokens,
    system: systemBlock,
    messages: [{ role: "user", content: userPrompt }],
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
    const errText = await res.text().catch(() => "");
    throw new Error(`Claude ${modelId} ${res.status}: ${errText.slice(0, 400)}`);
  }

  const data = await res.json();
  const textBlock = (data.content || []).find(b => b.type === "text");
  if (!textBlock?.text) throw new Error(`Claude ${modelId} returned empty content`);

  const usage = data.usage || {};
  const tIn  = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0);
  const tOut = usage.output_tokens || 0;
  const price = PRICING[modelId] || PRICING["claude-haiku-4-5"];
  const cost = (tIn * price.in + tOut * price.out) / 1_000_000;

  let parsed = null;
  if (jsonOutput) {
    parsed = extractJson(textBlock.text);
  }

  return {
    text: textBlock.text,
    parsed,
    tokens_input: tIn,
    tokens_output: tOut,
    cost_usd: Number(cost.toFixed(6)),
    model: modelId,
    raw_usage: usage,
  };
}

function extractJson(text) {
  // Cố parse JSON nguyên text. Nếu fail, thử nhiều chiến lược recovery
  // (strip ```json fence, balance braces walking, completion of truncated output).
  let t = String(text || "").trim();
  try { return JSON.parse(t); } catch {}

  // Bóc ```json ... ``` (cả fence đóng và fence mở-không-đóng do output truncate)
  const fenceMatch = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1]); } catch {}
  }
  const openFence = t.match(/^```(?:json)?\s*([\s\S]*)$/);
  if (openFence) {
    let inner = openFence[1].replace(/```\s*$/, "").trim();
    try { return JSON.parse(inner); } catch {
      const r = tryBalanceJson(inner);
      if (r !== undefined) return r;
    }
  }

  // Balance braces từ vị trí { đầu tiên (xử lý JSON bị truncate)
  const firstBrace = t.indexOf("{");
  if (firstBrace >= 0) {
    const r = tryBalanceJson(t.slice(firstBrace));
    if (r !== undefined) return r;
  }

  // Array fallback
  const firstBracket = t.indexOf("[");
  const lastBracket  = t.lastIndexOf("]");
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    try { return JSON.parse(t.slice(firstBracket, lastBracket + 1)); } catch {}
  }

  throw new Error(`Claude output không parse được JSON. First 200 chars: ${t.slice(0, 200)}`);
}

// Cố gắng parse JSON object có thể bị truncate: walking từ đầu, đếm depth, khi gặp depth=0 thì cắt;
// nếu chạy hết text mà depth>0, thử đóng các dấu { và " còn thiếu để recover một phần.
function tryBalanceJson(s) {
  let depth = 0;
  let inStr = false;
  let escape = false;
  let lastValidEnd = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (inStr) {
      if (ch === "\\") escape = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) lastValidEnd = i;
    }
  }
  if (lastValidEnd > 0) {
    try { return JSON.parse(s.slice(0, lastValidEnd + 1)); } catch {}
  }
  // Truncate: thử đóng string còn dở, cắt đến dấu , hoặc " gần nhất, rồi đóng braces còn thiếu
  if (depth > 0) {
    let trimmed = s;
    if (inStr) {
      // Cắt về trước dấu " cuối cùng (kết thúc một string value)
      const lastQuote = trimmed.lastIndexOf('"');
      if (lastQuote > 0) trimmed = trimmed.slice(0, lastQuote + 1);
    }
    // Cắt về trước dấu , hoặc } cuối cùng
    const lastComma = trimmed.lastIndexOf(",");
    const lastClose = trimmed.lastIndexOf("}");
    const cutAt = Math.max(lastComma, lastClose);
    if (cutAt > 0) trimmed = trimmed.slice(0, cutAt);
    // Đóng braces
    trimmed = trimmed.replace(/,\s*$/, "");
    trimmed += "}".repeat(depth);
    try { return JSON.parse(trimmed); } catch {}
  }
  return undefined;
}
