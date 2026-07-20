// Test resolveTimeRange — helper khoảng thời gian dùng chung cho FB Ads
// (agent-fb-ai, các tool spend/revenue). Tách ra từ hermes.test.mjs khi gỡ Hermes:
// 2 case này KHÔNG liên quan Hermes nên giữ lại nguyên vẹn.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTimeRange } from "../functions/lib/fbAdsHelpers.js";

test("resolveTimeRange custom: trả đúng khoảng ngày user truyền (vd tuần trước nữa 15-21/6)", () => {
  const r = resolveTimeRange("custom", "2026-06-15", "2026-06-21");
  assert.equal(r.start, "2026-06-15");
  assert.equal(r.end, "2026-06-21");
  assert.equal(r.custom, true);
});

test("resolveTimeRange custom: thiếu start hoặc end → null (không bịa khoảng)", () => {
  assert.equal(resolveTimeRange("custom", "2026-06-15", null), null);
  assert.equal(resolveTimeRange("custom", null, "2026-06-21"), null);
});
