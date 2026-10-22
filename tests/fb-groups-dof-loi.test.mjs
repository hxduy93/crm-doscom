import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequestGet } from "../functions/api/fb-groups.js";

// 22/10/2026: 1 creative hỏng (subcode 2446211, asset_feed_spec lệch object_story_spec)
// làm Meta từ chối cả trang khi hỏi object_story_spec → bảng TEST→SCALE sập cả tkqc.
// Phải đọc lại không kèm object_story_spec và vẫn trả bảng.
test("lỗi Dof 2446211 → đọc lại không kèm object_story_spec, bảng vẫn ra", async () => {
  const goi = [];
  const fetchCu = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url); goi.push(u);
    if (u.includes("/ads?") && u.includes("object_story_spec")) {
      return new Response(JSON.stringify({ error: { message: "Invalid parameter", code: 100, error_subcode: 2446211,
        error_user_title: "Giá trị Dof đầu tiên phải khớp với trường Object Story Spec" } }), { status: 400 });
    }
    if (u.includes("/ads?")) {
      return new Response(JSON.stringify({ data: [{
        id: "1", name: "Noma 922 - A", status: "ACTIVE", effective_status: "ACTIVE", created_time: "2026-10-20T00:00:00+0000",
        adset: { id: "s1", name: "x", status: "ACTIVE", effective_status: "ACTIVE", daily_budget: "300000" },
        campaign: { id: "c1", name: "20/10 - Noma922 - Tổng hợp 2 clip ngon", status: "ACTIVE", effective_status: "ACTIVE" },
        creative: { id: "cr1", video_id: "v1" },
      }] }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };
  try {
    const db = { prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }), first: async () => null }), all: async () => ({ results: [] }) }) };
    const res = await onRequestGet({
      request: new Request("https://x/api/fb-groups?account_id=927390616363424", { headers: { "X-Internal-Token": "t" } }),
      env: { FB_ACCESS_TOKEN: "tok", OPTIMIZER_TOKEN: "t", DB: db },
    });
    const d = await res.json();
    assert.equal(d.ok, true, JSON.stringify(d).slice(0, 300));
    assert.ok(goi.some((u) => u.includes("/ads?") && !u.includes("object_story_spec")), "phải đọc lại không kèm object_story_spec");
  } finally { globalThis.fetch = fetchCu; }
});
