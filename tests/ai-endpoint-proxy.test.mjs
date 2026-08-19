import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { anthropicBase, googleAiBase, proxyHeaders, usingProxy } from "../functions/lib/ai-endpoint.js";

/* Bộ chọn đường ra cho lời gọi AI (19/08/2026).

   Gốc vấn đề: Anthropic và Google chặn theo VỊ TRÍ hạ tầng gọi tới. Người dùng Việt Nam bị
   Cloudflare định tuyến vào colo Hong Kong → Anthropic 403 "Request not allowed", Gemini 400
   "User location is not supported". Cùng key đó gọi từ máy ở Việt Nam thì 200.
   Chữa bằng worker `ai-proxy` chạy lời gọi bên trong Durable Object ghim ở 'enam'.

   Test canh 2 điều sống còn:
     1. Có cấu hình proxy thì PHẢI đi proxy (không thì lỗi cũ quay lại y nguyên).
     2. THIẾU cấu hình thì phải tự quay về AI Gateway, KHÔNG được chết — vì secret nạp thiếu
        một cái là mọi agent AI đứng hết. */

const FULL = { AI_PROXY_URL: "https://ai-proxy.doscom-vietnam.workers.dev", AI_PROXY_TOKEN: "tok", CF_ACCOUNT_ID: "acc1" };
const GW_ONLY = { CF_ACCOUNT_ID: "acc1" };

test("đủ cấu hình → đi proxy ghim vùng, kèm token", () => {
  assert.equal(anthropicBase(FULL), "https://ai-proxy.doscom-vietnam.workers.dev/anthropic");
  assert.equal(googleAiBase(FULL), "https://ai-proxy.doscom-vietnam.workers.dev/google-ai");
  assert.deepEqual(proxyHeaders(FULL), { "x-proxy-token": "tok" });
  assert.equal(usingProxy(FULL), true);
});

test("thiếu token (hoặc thiếu URL) → quay về AI Gateway, không gửi token rỗng", () => {
  for (const env of [{ ...FULL, AI_PROXY_TOKEN: "" }, { ...FULL, AI_PROXY_URL: "" }, GW_ONLY]) {
    assert.match(anthropicBase(env), /gateway\.ai\.cloudflare\.com\/v1\/acc1\/doscom-erp\/anthropic$/);
    assert.match(googleAiBase(env), /doscom-erp\/google-ai-studio$/);
    assert.deepEqual(proxyHeaders(env), {}, "không được gửi header token rỗng");
    assert.equal(usingProxy(env), false);
  }
});

test("không có gì cả → gọi thẳng nhà cung cấp (đường cuối, vẫn chạy được ở local)", () => {
  assert.equal(anthropicBase({}), "https://api.anthropic.com");
  assert.equal(googleAiBase({}), "https://generativelanguage.googleapis.com");
});

test("URL proxy thừa dấu / ở cuối vẫn ghép đúng", () => {
  const env = { ...FULL, AI_PROXY_URL: "https://ai-proxy.doscom-vietnam.workers.dev///" };
  assert.equal(anthropicBase(env), "https://ai-proxy.doscom-vietnam.workers.dev/anthropic");
});

test("mọi chỗ gọi Claude/Gemini đều đi qua bộ chọn đường, không ai còn hardcode gateway", () => {
  // Sót một file là file đó vẫn gọi từ Hong Kong và vẫn chết, rất khó nhận ra vì các
  // chức năng khác đã chạy lại bình thường.
  const files = [
    "../functions/api/geo/_utils/claude.js",
    "../functions/api/geo/_utils/ai-engines/gemini.js",
    "../functions/api/agent-fb-ai.js",
    "../functions/api/agent-google-ai.js",
    "../functions/api/generate-ad-copy.js",
    "../functions/api/weekly-ai.js",
    "../functions/api/clarity/optimize.js",
    "../functions/lib/keyHealth.js",
  ];
  for (const f of files) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.doesNotMatch(src, /gateway\.ai\.cloudflare\.com[^`"']*\/(anthropic|google-ai-studio)/,
      `${f} còn hardcode URL gateway cho Anthropic/Gemini`);
    assert.match(src, /anthropicBase\(env\)|googleAiBase\(env\)/, `${f} chưa dùng bộ chọn đường`);
    assert.match(src, /proxyHeaders\(env\)/, `${f} thiếu header xác thực proxy`);
  }
});
