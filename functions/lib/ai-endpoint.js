/* Chọn đường ra cho lời gọi AI: qua PROXY GHIM VÙNG nếu có, không thì đi thẳng AI Gateway.
 *
 * VÌ SAO (19/08/2026): Anthropic và Google chặn theo VỊ TRÍ hạ tầng gọi tới. Cloudflare
 * định tuyến người dùng Việt Nam vào colo Hong Kong, nên Pages Functions gọi đi từ HKG bị:
 *   - Anthropic : 403 "Request not allowed"
 *   - Gemini    : 400 "User location is not supported"
 * Cùng key đó gọi từ máy ở Việt Nam thì 200 — không phải key hỏng. Worker KHÔNG ghim được
 * vùng, chỉ Durable Object mới ghim được, nên có worker riêng `ai-proxy` chạy lời gọi bên
 * trong một DO đặt ở 'enam' (xem repo jarvis-1/ai-proxy).
 *
 * Cấu hình (thiếu bất kỳ cái nào thì tự động quay về AI Gateway như cũ — KHÔNG chết):
 *   AI_PROXY_URL   var    https://ai-proxy.doscom-vietnam.workers.dev
 *   AI_PROXY_TOKEN secret khớp PROXY_TOKEN của worker ai-proxy
 */

function proxyBase(env) {
  const url = String(env.AI_PROXY_URL || "").replace(/\/+$/, "");
  return url && env.AI_PROXY_TOKEN ? url : "";
}

/** Gốc URL cho Anthropic — proxy > AI Gateway > gọi thẳng. */
export function anthropicBase(env) {
  const p = proxyBase(env);
  if (p) return `${p}/anthropic`;
  if (env.CF_ACCOUNT_ID) return `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/doscom-erp/anthropic`;
  return "https://api.anthropic.com";
}

/** Gốc URL cho Google AI Studio (Gemini) — proxy > AI Gateway > gọi thẳng. */
export function googleAiBase(env) {
  const p = proxyBase(env);
  if (p) return `${p}/google-ai`;
  if (env.CF_ACCOUNT_ID) return `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/doscom-erp/google-ai-studio`;
  return "https://generativelanguage.googleapis.com";
}

/** Header xác thực với proxy. Rỗng khi không dùng proxy — gộp thẳng vào headers là xong. */
export function proxyHeaders(env) {
  return proxyBase(env) ? { "x-proxy-token": env.AI_PROXY_TOKEN } : {};
}

/** true khi đang đi vòng qua proxy — để log/health nói rõ đường nào đang chạy. */
export function usingProxy(env) {
  return Boolean(proxyBase(env));
}
