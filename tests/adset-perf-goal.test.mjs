import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAdsetBase, isLifecycleUnsupported } from "../functions/api/create-campaign.js";
import { readFileSync } from "node:fs";

// YÊU CẦU 2026-08-05: ad set Doanh số hỗ trợ hai cài đặt mới của Meta —
//  · Mục tiêu hiệu quả "tối đa hoá GIÁ TRỊ lượt chuyển đổi" (optimization_goal=VALUE),
//    kèm sàn ROAS tuỳ chọn (bid_strategy=LOWEST_COST_WITH_MIN_ROAS + bid_constraints).
//  · Chiến lược vòng đời khách hàng (existing_customer_budget_percentage=0 = chỉ khách MỚI).
// Mặc định KHÔNG được đổi hành vi cũ: không gửi field nào trong hai cái trên.

const base = {
  optimization_goal: "OFFSITE_CONVERSIONS",
  billing_event: "IMPRESSIONS",
  pixel_id: "24397685376567889",
  promoted_event: "COMPLETE_REGISTRATION",
};

test("mặc định: giữ nguyên hành vi cũ, không gửi field mới", () => {
  const b = buildAdsetBase(base, "camp1", false, "PAUSED");
  assert.equal(b.bid_strategy, "LOWEST_COST_WITHOUT_CAP");
  assert.equal("bid_constraints" in b, false);
  assert.equal("existing_customer_budget_percentage" in b, false);
});

test("sàn ROAS đổi sang đơn vị 1/10000 của Meta", () => {
  const b = buildAdsetBase(
    { ...base, optimization_goal: "VALUE", bid_strategy: "LOWEST_COST_WITH_MIN_ROAS", roas_average_floor: 2.5 },
    "camp1", false, "PAUSED");
  assert.equal(b.optimization_goal, "VALUE");
  assert.equal(b.bid_strategy, "LOWEST_COST_WITH_MIN_ROAS");
  assert.deepEqual(b.bid_constraints, { roas_average_floor: 25000 });
});

test("không nhập sàn ROAS → không gửi bid_constraints", () => {
  const b = buildAdsetBase({ ...base, optimization_goal: "VALUE" }, "camp1", false, "PAUSED");
  assert.equal(b.optimization_goal, "VALUE");
  assert.equal(b.bid_strategy, "LOWEST_COST_WITHOUT_CAP");
  assert.equal("bid_constraints" in b, false);
});

test("chinh phục khách hàng mới = 0% ngân sách cho khách cũ", () => {
  const b = buildAdsetBase({ ...base, existing_customer_budget_percentage: 0 }, "camp1", false, "PAUSED");
  assert.equal(b.existing_customer_budget_percentage, 0);
});

test("phần trăm ngoài 0–100 bị kẹp lại, chuỗi rỗng thì bỏ qua", () => {
  assert.equal(buildAdsetBase({ ...base, existing_customer_budget_percentage: 150 }, "c", false, "PAUSED")
    .existing_customer_budget_percentage, 100);
  assert.equal(buildAdsetBase({ ...base, existing_customer_budget_percentage: -5 }, "c", false, "PAUSED")
    .existing_customer_budget_percentage, 0);
  assert.equal("existing_customer_budget_percentage" in
    buildAdsetBase({ ...base, existing_customer_budget_percentage: "" }, "c", false, "PAUSED"), false);
});

test("CBO vẫn KHÔNG gắn bid_strategy ở ad set", () => {
  const b = buildAdsetBase({ ...base, bid_strategy: "LOWEST_COST_WITH_MIN_ROAS" }, "camp1", true, "PAUSED");
  assert.equal("bid_strategy" in b, false);
  assert.equal("bid_constraints" in b, false);
});

// Field vòng đời chưa mở cho mọi tài khoản — nhận diện đúng lỗi đó để tạo lại
// KHÔNG kèm field, thay vì bỏ campaign trống giữa chừng.
test("nhận diện lỗi 'tài khoản chưa dùng được field vòng đời'", () => {
  assert.equal(isLifecycleUnsupported("(#100) Unknown parameter: existing_customer_budget_percentage"), true);
  assert.equal(isLifecycleUnsupported("Invalid parameter existing_customer_budget_percentage for this ad account"), true);
  assert.equal(isLifecycleUnsupported("existing_customer_budget_percentage is not supported"), true);
});

test("KHÔNG nuốt nhầm lỗi thật của field đó", () => {
  assert.equal(isLifecycleUnsupported("existing_customer_budget_percentage must be between 0 and 100"), false);
  assert.equal(isLifecycleUnsupported("(#100) Unknown parameter: bid_constraints"), false);
  assert.equal(isLifecycleUnsupported(""), false);
});

// 06/08/2026: Ads Manager hiện ô "Chiến lược vòng đời khách hàng" TRỐNG với ad set
// do API tạo, vì luồng tự động chỉ gửi field khi chọn "khách hàng mới". Nay LUÔN gửi:
// 0 = chỉ khách mới · 100 = tất cả đối tượng (không giới hạn).
test("luồng tự động LUÔN khai chiến lược vòng đời, không để trống", () => {
  const html = readFileSync(new URL("../ads-creator.html", import.meta.url), "utf8");
  assert.match(html, /existing_customer_budget_percentage: autoLifecycle === "new" \? 0 : 100/);
  assert.doesNotMatch(html, /\.\.\.\(autoLifecycle === "new" \? \{ existing_customer_budget_percentage/,
    "gửi có điều kiện là ô trong Trình quản lý QC lại bỏ trống");
});

test("cả hai giá trị 0 và 100 đều đi được xuống ad set", () => {
  assert.equal(buildAdsetBase({ ...base, existing_customer_budget_percentage: 100 }, "c", false, "PAUSED")
    .existing_customer_budget_percentage, 100);
  assert.equal(buildAdsetBase({ ...base, existing_customer_budget_percentage: 0 }, "c", false, "PAUSED")
    .existing_customer_budget_percentage, 0);
});
