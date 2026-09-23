import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAdsetBase, normalizeBidStrategy, needsBidAmount, parseBidAmount, BID_STRATEGIES,
} from "../functions/api/create-campaign.js";
import { readFileSync } from "node:fs";

// YÊU CẦU 2026-09-23: luồng tạo ads TỰ ĐỘNG phải đặt được ô "Chiến lược giá thầu" của
// Meta khi tối đa hoá SỐ LƯỢT chuyển đổi:
//   COST_CAP                 = "Mục tiêu chi phí trên mỗi kết quả" (ảnh mẫu: 50.000đ)
//   LOWEST_COST_WITH_BID_CAP = "Giới hạn giá thầu"
// Mặc định (không chọn gì) KHÔNG được đổi hành vi cũ.

const base = {
  optimization_goal: "OFFSITE_CONVERSIONS",
  billing_event: "IMPRESSIONS",
  pixel_id: "24397685376567889",
  promoted_event: "COMPLETE_REGISTRATION",
};

test("mặc định vẫn là chi phí thấp nhất, không gửi bid_amount", () => {
  const b = buildAdsetBase(base, "camp1", false, "PAUSED");
  assert.equal(b.bid_strategy, "LOWEST_COST_WITHOUT_CAP");
  assert.equal("bid_amount" in b, false);
});

test("COST_CAP đi kèm bid_amount, VND giữ NGUYÊN số (không nhân 100)", () => {
  const b = buildAdsetBase({ ...base, bid_strategy: "COST_CAP", bid_amount: 50000 }, "camp1", false, "PAUSED");
  assert.equal(b.optimization_goal, "OFFSITE_CONVERSIONS");
  assert.equal(b.bid_strategy, "COST_CAP");
  // 50.000đ trong Trình quản lý QC = 50000 ở API. Nhân 100 là đặt thầu gấp 100 lần.
  assert.equal(b.bid_amount, 50000);
  assert.equal("bid_constraints" in b, false);
});

test("Giới hạn giá thầu cũng gắn bid_amount", () => {
  const b = buildAdsetBase(
    { ...base, bid_strategy: "LOWEST_COST_WITH_BID_CAP", bid_amount: "35000" }, "camp1", false, "PAUSED");
  assert.equal(b.bid_strategy, "LOWEST_COST_WITH_BID_CAP");
  assert.equal(b.bid_amount, 35000);
});

test("chọn giá thầu mà quên số tiền → ném lỗi, KHÔNG tạo ad set câm", () => {
  for (const bad of [undefined, "", 0, -1, "abc"]) {
    assert.throws(
      () => buildAdsetBase({ ...base, bid_strategy: "COST_CAP", bid_amount: bad }, "c", false, "PAUSED"),
      /bid_amount/,
      `bid_amount = ${JSON.stringify(bad)} phải bị chặn`);
  }
});

// CBO đẩy bid_strategy lên campaign, nhưng SỐ TIỀN vẫn nằm ở ad set — bỏ sót chỗ này là
// campaign có chiến lược mà ad set không có giá thầu.
test("CBO: ad set không mang bid_strategy nhưng VẪN mang bid_amount", () => {
  const b = buildAdsetBase({ ...base, bid_strategy: "COST_CAP", bid_amount: 50000 }, "camp1", true, "PAUSED");
  assert.equal("bid_strategy" in b, false);
  assert.equal(b.bid_amount, 50000);
});

test("sàn ROAS không bị kéo theo bid_amount", () => {
  const b = buildAdsetBase(
    { ...base, optimization_goal: "VALUE", bid_strategy: "LOWEST_COST_WITH_MIN_ROAS", roas_average_floor: 2.5 },
    "camp1", false, "PAUSED");
  assert.deepEqual(b.bid_constraints, { roas_average_floor: 25000 });
  assert.equal("bid_amount" in b, false);
});

test("chuỗi lạ rơi về chi phí thấp nhất thay vì gửi rác sang Meta", () => {
  assert.equal(normalizeBidStrategy("COST_CAP_XYZ"), "LOWEST_COST_WITHOUT_CAP");
  assert.equal(normalizeBidStrategy(""), "LOWEST_COST_WITHOUT_CAP");
  assert.equal(normalizeBidStrategy(null), "LOWEST_COST_WITHOUT_CAP");
  assert.equal(normalizeBidStrategy("cost_cap"), "COST_CAP"); // chấp nhận chữ thường
  assert.deepEqual(BID_STRATEGIES.includes("COST_CAP"), true);
});

test("needsBidAmount chỉ đúng với hai chiến lược có tiền", () => {
  assert.equal(needsBidAmount("COST_CAP"), true);
  assert.equal(needsBidAmount("LOWEST_COST_WITH_BID_CAP"), true);
  assert.equal(needsBidAmount("LOWEST_COST_WITHOUT_CAP"), false);
  assert.equal(needsBidAmount("LOWEST_COST_WITH_MIN_ROAS"), false);
  assert.equal(needsBidAmount(undefined), false);
});

test("parseBidAmount: làm tròn số nguyên, loại giá trị vô nghĩa", () => {
  assert.equal(parseBidAmount("50000"), 50000);
  assert.equal(parseBidAmount(49999.6), 50000);
  assert.equal(parseBidAmount(""), null);
  assert.equal(parseBidAmount(null), null);
  assert.equal(parseBidAmount(0), null);
  assert.equal(parseBidAmount(-5), null);
  assert.equal(parseBidAmount("mười nghìn"), null);
});

// ───────── luồng tự động (ads-creator.html) ─────────
const html = readFileSync(new URL("../ads-creator.html", import.meta.url), "utf8");

test("giao diện tự động có đủ 3 lựa chọn giá thầu", () => {
  assert.match(html, /cost:\s*"COST_CAP"/);
  assert.match(html, /bidcap:\s*"LOWEST_COST_WITH_BID_CAP"/);
  assert.match(html, /Mục tiêu chi phí trên mỗi kết quả/);
  assert.match(html, /Giới hạn giá thầu/);
});

test("chỉ gửi bid_strategy khi KHÔNG phải chi phí thấp nhất", () => {
  assert.match(html, /autoBidMode !== "lowest"/);
  assert.match(html, /bid_amount: Number\(autoBidAmount\)/);
});

test("giá thầu bằng tiền không áp cho mục tiêu GIÁ TRỊ (chỗ đó dùng sàn ROAS)", () => {
  assert.match(html, /autoBidActive = autoPerfGoal !== "value" && autoBidMode !== "lowest"/);
});

test("chặn chạy khi chọn giá thầu mà bỏ trống số tiền", () => {
  assert.match(html, /autoBidActive && !\(Number\(autoBidAmount\) > 0\)/);
});

test("hộp đang chạy chỉ bị ghi đè giá thầu khi người chạy tick", () => {
  assert.match(html, /apply_bid_to_existing: autoBidToExisting === true/);
  const api = readFileSync(new URL("../functions/api/create-campaign.js", import.meta.url), "utf8");
  assert.match(api, /cfg\.apply_bid_to_existing === true/);
  // Không tick mà vẫn chọn giá thầu thì phải cảnh báo, đừng im lặng bỏ qua.
  assert.match(api, /KHÔNG được áp/);
});
