import { test } from "node:test";
import assert from "node:assert/strict";
import { compactContext, scanRedLines } from "../functions/api/agent-google-ai.js";

// Mẫu rút gọn theo đúng shape google-ads-context.json thật.
const CTX = {
  source_data_date_range: { start_30d: "2026-05-15", end: "2026-06-13" },
  ctr_thresholds_by_channel: {
    SEARCH: { low_ctr: 0.05, very_low_ctr: 0.02 },
    DISPLAY_RMK: { low_ctr: 0.005, very_low_ctr: 0.003 },
  },
  roas_proxy: { roas_overall: 2.7, target_roas: 3.0, status: "borderline" },
  website_revenue_pancake: { total_30d: 172215500, orders_30d: 75, by_status: {}, note: "Pancake 3 nguồn" },
  per_category: {
    MAY_DO: { spend_30d: 12961133.4, clicks_30d: 6787, impressions_30d: 743055, ctr_30d: 0.0091, cpc_30d: 1910.2, campaign_count: 2 },
    GHI_AM: { spend_30d: 11270471, clicks_30d: 2371, impressions_30d: 116308, ctr_30d: 0.0204, cpc_30d: 4753, campaign_count: 3 },
  },
  per_campaign: {
    "RMK - Máy dò - 2024 - nmt": {
      category: "MAY_DO", channel: "DISPLAY_RMK", ctr_low_threshold: 0.005, ctr_critical_threshold: 0.003,
      spend_30d: 9672046.4, clicks_30d: 5915, impressions_30d: 738287, ctr_30d: 0.008, cpc_30d: 1635.3,
      ctr_trend_pct: -8.2, spend_trend_pct: 7.7, active_days_30d: 30, flags: [],
    },
    "8/5/2025 Search - TB Ghi Âm": {
      category: "GHI_AM", channel: "SEARCH", ctr_low_threshold: 0.05, ctr_critical_threshold: 0.02,
      spend_30d: 8714731.5, clicks_30d: 1342, impressions_30d: 9641, ctr_30d: 0.1392, cpc_30d: 6493,
      ctr_trend_pct: 1.1, spend_trend_pct: 3.2, active_days_30d: 30, flags: [],
      conversions_30d: 14.99, cost_per_conversion: 581374, // campaign này upstream ĐÃ có conv
    },
  },
  waste_estimate: { total_wasted_30d_vnd: 0, items: [] },
};

test("compactContext ALL: truyền đủ channel + ngưỡng CTR + Pancake (data prompt vốn yêu cầu)", () => {
  const c = compactContext(CTX, "ALL");
  assert.equal(c.total_campaigns, 2);
  assert.equal(Object.keys(c.per_campaign).length, 2);
  // Channel + ngưỡng theo kênh PHẢI đến tay LLM (đây là gốc Lỗi 3/4)
  const md = c.per_campaign["RMK - Máy dò - 2024 - nmt"];
  assert.equal(md.channel, "DISPLAY_RMK");
  assert.equal(md.ctr_low_threshold, 0.005);
  assert.equal(c.ctr_thresholds_by_channel.DISPLAY_RMK.low_ctr, 0.005);
  // Tín hiệu Pancake/profit (Doscom KHÔNG dùng ROAS Google) phải còn
  assert.equal(c.roas_proxy.roas_overall, 2.7);
  assert.equal(c.website_revenue_pancake.orders_30d, 75);
  assert.equal(c.website_revenue_pancake.total_30d, 172215500);
});

test("compactContext lọc theo nhóm: chỉ campaign + category đúng nhóm", () => {
  const c = compactContext(CTX, "MAY_DO");
  assert.deepEqual(Object.keys(c.per_campaign), ["RMK - Máy dò - 2024 - nmt"]);
  assert.deepEqual(Object.keys(c.per_category), ["MAY_DO"]);
  assert.equal(c.group_filter, "MAY_DO");
  // total_campaigns đếm TOÀN account (không phải sau lọc) để LLM biết bối cảnh
  assert.equal(c.total_campaigns, 2);
});

test("compactContext KHÔNG fake conversions=0 khi upstream thiếu (tránh LLM kết luận '0 đơn')", () => {
  const c = compactContext(CTX, "ALL");
  // Máy dò: upstream chưa có conv → phải là null, KHÔNG phải 0
  assert.equal(c.per_campaign["RMK - Máy dò - 2024 - nmt"].conversions_30d, null);
  assert.equal(c.per_campaign["RMK - Máy dò - 2024 - nmt"].cost_per_conversion, null);
  // Ghi Âm: upstream đã có conv → truyền thẳng
  assert.equal(c.per_campaign["8/5/2025 Search - TB Ghi Âm"].conversions_30d, 14.99);
  assert.equal(c.per_campaign["8/5/2025 Search - TB Ghi Âm"].cost_per_conversion, 581374);
});

test("compactContext null-safe khi thiếu file/section", () => {
  assert.equal(compactContext(null, "ALL"), null);
  const empty = compactContext({}, "ALL");
  assert.equal(empty.total_campaigns, 0);
  assert.deepEqual(empty.per_campaign, {});
  assert.equal(empty.roas_proxy, null);
});

test("scanRedLines bắt cụm copy cấm của Doscom", () => {
  assert.deepEqual(scanRedLines("Máy dò Phát hiện 100% thiết bị quay lén"), ["phát hiện 100", "100%"]);
  assert.deepEqual(scanRedLines("Camera giấu tốt nhất thị trường"), ["tốt nhất"]);
  assert.deepEqual(scanRedLines("Cam kết hoàn tiền 100% trọn đời"), ["100%", "hoàn tiền 100", "trọn đời"]);
});

test("scanRedLines bỏ qua copy sạch + input rỗng", () => {
  assert.deepEqual(scanRedLines("Máy dò sóng nghe lén, pin 8 giờ, bảo hành 12 tháng"), []);
  assert.deepEqual(scanRedLines(""), []);
  assert.deepEqual(scanRedLines(null), []);
});
