// Gọi OpenAI Chat Completions cho pipeline nội dung GEO — DỰ PHÒNG khi Claude không dùng được.
//
// Vì sao có file này (19/08/2026): key Anthropic bị từ chối HTTP 403 "Request not allowed"
// (cả gọi thẳng lẫn qua AI Gateway, cả endpoint chỉ-đọc /v1/models), nên toàn bộ pipeline
// nội dung GEO đứng: mỗi lần bấm "Generate content" là 3 lượt gọi Claude fail rồi báo
// "Guardrail: bài không gắn sản phẩm thật". Key OpenAI vẫn sống → dùng làm đường lui để
// pipeline không phụ thuộc một nhà cung cấp.
//
// Trả về ĐÚNG hình dạng của callClaude() để chỗ gọi không phải biết đang chạy nhà nào.
//
// Route qua Cloudflare AI Gateway `doscom-erp` — BẮT BUỘC, không phải cho đẹp: gọi thẳng
// api.openai.com từ Cloudflare edge ở châu Á bị trả 403 "unsupported_country_region_territory"
// (đã ghi trong _utils/ai-engines/openai.js). Gateway proxy giải quyết.

import { extractJson } from "./claude.js";

// gpt-4o-mini: rẻ, đủ sức viết bài SEO tiếng Việt 2500 từ, và là model GEO đang dùng sẵn
// cho engine ChatGPT nên không phải xin quyền model mới. Đổi được qua env.
const DEFAULT_MODEL = "gpt-4o-mini";
const PRICING = {
  "gpt-4o-mini": { in: 0.15, out: 0.60 },
  "gpt-4o":      { in: 2.50, out: 10.00 },
};
const GATEWAY_ID = "doscom-erp";

function getBaseUrl(env) {
  if (env.CF_ACCOUNT_ID) {
    return `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/${GATEWAY_ID}/openai`;
  }
  return "https://api.openai.com/v1";
}

export async function callOpenAIChat(env, {
  systemPrompt,
  userPrompt,
  maxTokens = 4000,
  jsonOutput = false,
  model,
  minWords = 0,
}) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing in Cloudflare env");

  const modelId = model || env.OPENAI_CONTENT_MODEL || DEFAULT_MODEL;

  // JSON mode của OpenAI CHỈ bật được khi prompt có nhắc chữ "JSON" — thiếu là API trả 400.
  // System prompt của GEO vốn đã yêu cầu JSON, nhưng thêm câu này cho chắc, không thừa.
  const sys = jsonOutput
    ? `${systemPrompt}\n\nTrả lời DUY NHẤT bằng một object JSON hợp lệ, không kèm chữ nào khác.`
    : systemPrompt;

  /* Nhắc lại độ dài ở DÒNG CUỐI user prompt. Đo thật 19/08/2026: cùng prompt yêu cầu 2000 từ,
     Claude Haiku ra trung bình 1.872 từ (158 bài) còn GPT-4o/4o-mini chỉ ~700-800 từ — model
     OpenAI ở JSON mode có xu hướng nén nội dung. Câu chốt cuối prompt là chỗ model nghe rõ nhất. */
  const user = minWords
    ? `${userPrompt}

NHẮC LẠI YÊU CẦU BẮT BUỘC: trường content_markdown phải dài TỐI THIỂU ${minWords} từ. Viết đủ mọi mục trong dàn ý, mỗi mục khai triển trọn vẹn. KHÔNG tóm tắt, KHÔNG rút gọn. Nếu thấy chưa đủ ${minWords} từ thì viết tiếp cho đủ rồi mới đóng JSON.`
    : userPrompt;

  const body = {
    model: modelId,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
  };
  if (jsonOutput) body.response_format = { type: "json_object" };

  const res = await fetch(`${getBaseUrl(env)}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI ${modelId} ${res.status}: ${errText.slice(0, 400)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || "";
  if (!text) throw new Error(`OpenAI ${modelId} returned empty content`);

  const usage = data.usage || {};
  const tIn = usage.prompt_tokens || 0;
  const tOut = usage.completion_tokens || 0;
  const price = PRICING[modelId] || PRICING[DEFAULT_MODEL];
  const cost = (tIn * price.in + tOut * price.out) / 1_000_000;

  return {
    text,
    // Dùng CHUNG extractJson của claude.js: bộ vá JSON hỏng (control char trong string,
    // ```json fence, output bị cắt) đã được tôi luyện trên hàng trăm bài — đừng viết bản thứ hai.
    parsed: jsonOutput ? extractJson(text) : null,
    tokens_input: tIn,
    tokens_output: tOut,
    cost_usd: Number(cost.toFixed(6)),
    model: modelId,
    provider: "openai",
    raw_usage: usage,
  };
}
