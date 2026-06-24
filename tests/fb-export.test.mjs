import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRows } from "../functions/api/export/fb-ad-spend.js";

const SAMPLE = {
  currency: "VND",
  generated_at: "2026-06-24 16:56",
  accounts: [
    {
      account_id: "111",
      account_name: "Acc A",
      campaigns: [
        { campaign_id: "c1", campaign_name: "C1", by_date: {
          "2026-06-01": { spend: 1000, impressions: 10, clicks: 2 },
          "2026-06-02": { spend: 2000, impressions: 20, clicks: 3 },
          "2026-05-31": { spend: 9999, impressions: 99, clicks: 9 }, // ngoài range
        } },
        { campaign_id: "c2", campaign_name: "C2", by_date: {
          "2026-06-01": { spend: 500, impressions: 5, clicks: 1 },
        } },
      ],
    },
    {
      account_id: "act_222", // có prefix act_ → phải strip
      account_name: "Acc B",
      campaigns: [
        { campaign_id: "c3", campaign_name: "C3", by_date: {
          "2026-06-02": { spend: 700.6, impressions: 7, clicks: 1 }, // làm tròn spend
        } },
      ],
    },
  ],
};

test("account×date: gộp đúng spend nhiều campaign cùng ngày, lọc range, strip act_", () => {
  const { rows, currency } = buildRows(SAMPLE, "2026-06-01", "2026-06-02", "account");
  assert.equal(currency, "VND");
  // Acc A: 2026-06-01 = 1000+500=1500 ; 2026-06-02 = 2000 ; Acc B: 2026-06-02 = 701
  const map = Object.fromEntries(rows.map((r) => [r.unique_key, r]));
  assert.equal(map["2026-06-01_111"].spend, 1500);
  assert.equal(map["2026-06-01_111"].impressions, 15);
  assert.equal(map["2026-06-02_111"].spend, 2000);
  assert.equal(map["2026-06-02_222"].account_id, "222"); // act_ đã strip
  assert.equal(map["2026-06-02_222"].spend, 701); // 700.6 → làm tròn
  // ngày 2026-05-31 ngoài range KHÔNG xuất hiện
  assert.ok(!rows.some((r) => r.date === "2026-05-31"));
});

test("range filter: chỉ 1 ngày", () => {
  const { rows } = buildRows(SAMPLE, "2026-06-02", "2026-06-02", "account");
  assert.ok(rows.every((r) => r.date === "2026-06-02"));
  assert.equal(rows.length, 2); // Acc A + Acc B
});

test("level=campaign: mỗi campaign×ngày 1 dòng + unique_key theo campaign", () => {
  const { rows } = buildRows(SAMPLE, "2026-06-01", "2026-06-02", "campaign");
  const keys = rows.map((r) => r.unique_key).sort();
  assert.deepEqual(keys, ["2026-06-01_c1", "2026-06-01_c2", "2026-06-02_c1", "2026-06-02_c3"]);
  const c1d1 = rows.find((r) => r.unique_key === "2026-06-01_c1");
  assert.equal(c1d1.spend, 1000);
  assert.equal(c1d1.campaign_name, "C1");
});

test("rows sắp xếp theo ngày tăng dần", () => {
  const { rows } = buildRows(SAMPLE, "2026-06-01", "2026-06-02", "account");
  const dates = rows.map((r) => r.date);
  assert.deepEqual(dates, [...dates].sort());
});
