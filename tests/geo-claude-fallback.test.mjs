import { test } from "node:test";
import assert from "node:assert/strict";
import { callClaude } from "../functions/api/geo/_utils/claude.js";

/* Đường lui OpenAI khi Claude không gọi được (19/08/2026).

   Bối cảnh: key Anthropic bị từ chối HTTP 403 "Request not allowed" (cả gọi thẳng lẫn qua AI
   Gateway, cả trên endpoint chỉ-đọc /v1/models) → toàn bộ pipeline nội dung GEO đứng, mỗi lần
   bấm "Generate content" là 3 lượt fail rồi báo nhầm thành "Guardrail: bài không gắn sản phẩm".

   Test chạy callClaude THẬT với fetch giả — không phải so chuỗi trong source. */

const OPENAI_OK = {
  choices: [{ message: { content: '{"content_markdown":"xin chào"}' } }],
  usage: { prompt_tokens: 1000, completion_tokens: 2000 },
};

function stubFetch(handlers) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    calls.push({ url: u, body: init?.body ? JSON.parse(init.body) : null });
    const h = handlers.find((x) => u.includes(x.match));
    if (!h) throw new Error("fetch không mong đợi: " + u);
    return {
      ok: h.status === 200,
      status: h.status,
      text: async () => JSON.stringify(h.body),
      json: async () => h.body,
    };
  };
  return calls;
}

const ENV = {
  ANTHROPIC_API_KEY: "sk-ant-x",
  OPENAI_API_KEY: "sk-oa-x",
  CF_ACCOUNT_ID: "acc123",
};
const ARGS = {
  model: "haiku",
  systemPrompt: "bạn là biên tập viên",
  userPrompt: "viết bài",
  maxTokens: 16000,
  jsonOutput: true,
  minWords: 2000,
};

test("Claude 403 → tự chuyển sang OpenAI, không để pipeline đứng", async () => {
  const calls = stubFetch([
    { match: "/anthropic/", status: 403, body: { error: { type: "forbidden", message: "Request not allowed" } } },
    { match: "/openai/", status: 200, body: OPENAI_OK },
  ]);

  const out = await callClaude(ENV, ARGS);

  assert.equal(out.provider, "openai");
  assert.equal(out.parsed.content_markdown, "xin chào");
  assert.match(out.fallback_from, /403/, "phải ghi lại vì sao đi đường vòng");
  assert.equal(calls.length, 2, "phải thử Claude trước rồi mới sang OpenAI");
  assert.match(calls[1].url, /gateway\.ai\.cloudflare\.com/, "OpenAI phải đi qua AI Gateway (né chặn vùng)");
});

test("KHÔNG ném alias model của Anthropic sang OpenAI", async () => {
  // Lỗi thật gặp lúc triển khai: opts.model = "haiku" đi thẳng sang OpenAI →
  // 404 "The model `haiku` does not exist".
  const calls = stubFetch([
    { match: "/anthropic/", status: 403, body: { error: {} } },
    { match: "/openai/", status: 200, body: OPENAI_OK },
  ]);
  await callClaude(ENV, ARGS);
  assert.equal(calls[1].body.model, "gpt-4o-mini", "model gửi sang OpenAI phải là model OpenAI");
});

test("bật JSON mode và nhắc lại độ dài ở cuối prompt", async () => {
  const calls = stubFetch([
    { match: "/anthropic/", status: 403, body: { error: {} } },
    { match: "/openai/", status: 200, body: OPENAI_OK },
  ]);
  await callClaude(ENV, ARGS);
  const body = calls[1].body;
  assert.deepEqual(body.response_format, { type: "json_object" });
  const user = body.messages.find((m) => m.role === "user").content;
  assert.match(user, /TỐI THIỂU 2000 từ/, "thiếu câu nhắc độ dài → model OpenAI viết ngắn còn ~1/3");
});

test("USE_CLAUDE=false → đi thẳng OpenAI, không gọi Anthropic lần nào", async () => {
  const calls = stubFetch([{ match: "/openai/", status: 200, body: OPENAI_OK }]);
  const out = await callClaude({ ...ENV, USE_CLAUDE: "false" }, ARGS);
  assert.equal(out.provider, "openai");
  assert.equal(calls.length, 1);
  assert.match(out.fallback_from, /USE_CLAUDE/);
});

test("không có key OpenAI thì KHÔNG nuốt lỗi Claude", async () => {
  stubFetch([{ match: "/anthropic/", status: 403, body: { error: { message: "Request not allowed" } } }]);
  await assert.rejects(
    () => callClaude({ ...ENV, OPENAI_API_KEY: "" }, ARGS),
    /403/,
    "phải ném nguyên lỗi Claude để còn debug, đừng đổi thành lỗi khác",
  );
});

test("Claude chạy được thì vẫn dùng Claude", async () => {
  const calls = stubFetch([
    {
      match: "/anthropic/",
      status: 200,
      body: {
        content: [{ type: "text", text: '{"content_markdown":"bản Claude"}' }],
        usage: { input_tokens: 100, output_tokens: 200 },
      },
    },
  ]);
  const out = await callClaude(ENV, ARGS);
  assert.equal(out.provider, "anthropic");
  assert.equal(out.parsed.content_markdown, "bản Claude");
  assert.equal(calls.length, 1, "Claude ok mà vẫn gọi OpenAI là đốt tiền hai lần");
});
