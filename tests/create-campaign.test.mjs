// Test cấu trúc ad set cho luồng "1 creative = 1 ad set" (adset_per_ad).
// Chỉ test 2 helper thuần buildAdsetBase / withAdsetBudget — không gọi Meta API.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAdsetBase, withAdsetBudget } from "../functions/api/create-campaign.js";

const baseCfg = {
  optimization_goal: "OFFSITE_CONVERSIONS",
  billing_event: "IMPRESSIONS",
  destination_type: "WEBSITE",
  pixel_id: "123",
  objective: "OUTCOME_SALES",
  promoted_event: "COMPLETE_REGISTRATION",
  pacing_type: "standard",
  budget_type: "daily",
  budget_amount: 100000,
  targeting: { geo_locations: { countries: ["VN"] }, age_min: 18, age_max: 65 },
};

test("ABO ad set nhận TRỌN budget_amount (không chia)", () => {
  const body = buildAdsetBase(baseCfg, "camp_1", false, "PAUSED");
  withAdsetBudget(body, baseCfg, baseCfg.budget_amount);
  assert.equal(body.daily_budget, 100000, "mỗi ad set phải là 100k, không phải tổng/N");
  assert.equal(body.lifetime_budget, undefined);
  assert.equal(body.campaign_id, "camp_1");
  assert.equal(body.status, "PAUSED");
  assert.equal(body.bid_strategy, "LOWEST_COST_WITHOUT_CAP", "ABO: bid_strategy ở ad set");
});

test("lifetime budget đi vào lifetime_budget", () => {
  const cfg = { ...baseCfg, budget_type: "lifetime" };
  const body = withAdsetBudget({}, cfg, 500000);
  assert.equal(body.lifetime_budget, 500000);
  assert.equal(body.daily_budget, undefined);
});

test("buildAdsetBase giữ promoted_object + targeting + pacing", () => {
  const body = buildAdsetBase(baseCfg, "camp_1", false, "ACTIVE");
  assert.deepEqual(body.promoted_object, { pixel_id: "123", custom_event_type: "COMPLETE_REGISTRATION" });
  assert.deepEqual(body.targeting.geo_locations.countries, ["VN"]);
  assert.deepEqual(body.pacing_type, ["standard"]);
});

test("CBO: KHÔNG gắn bid_strategy ở ad set (nằm ở campaign)", () => {
  const body = buildAdsetBase(baseCfg, "camp_1", true, "PAUSED");
  assert.equal(body.bid_strategy, undefined);
});

test("3 creative → 3 ad set, tổng = 3 × budget_amount", () => {
  const n = 3;
  const bodies = Array.from({ length: n }, (_, i) => {
    const b = buildAdsetBase(baseCfg, "camp_1", false, "PAUSED");
    b.name = `SP #${i + 1}`;
    return withAdsetBudget(b, baseCfg, baseCfg.budget_amount);
  });
  const total = bodies.reduce((s, b) => s + b.daily_budget, 0);
  assert.equal(bodies.length, 3);
  assert.equal(total, 300000, "3 ad set × 100k = 300k/ngày/campaign");
  assert.deepEqual(bodies.map((b) => b.name), ["SP #1", "SP #2", "SP #3"]);
});
