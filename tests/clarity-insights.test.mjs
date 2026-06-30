import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeUrl, aggregateMetrics } from "../functions/api/clarity/insights.js";

// ---- normalizeUrl: bỏ query, GIỮ hash ----
test("normalizeUrl bỏ query string (fbclid/utm) — nhiễu nguồn quảng cáo", () => {
  assert.equal(
    normalizeUrl("https://www.noma.io.vn/911tpn?fbclid=abc&utm_source=x"),
    "https://www.noma.io.vn/911tpn"
  );
  // gunk URL lồng URL (landing redirect) -> cắt từ '?' đầu tiên
  assert.equal(
    normalizeUrl("https://www.noma.io.vn/911tpn?https%3A%2F%2Fwww.noma.io.vn%2F911tpn?utm_source=y"),
    "https://www.noma.io.vn/911tpn"
  );
});

test("normalizeUrl GIỮ hash vì #anchor chính là section", () => {
  assert.equal(normalizeUrl("https://x.pages.dev/#san-pham-kem"), "https://x.pages.dev/#san-pham-kem");
  // có cả query lẫn hash -> bỏ query, giữ hash
  assert.equal(normalizeUrl("https://x.pages.dev/?fbclid=z#noma922"), "https://x.pages.dev/#noma922");
});

test("normalizeUrl giữ null (gom nhóm 'không rõ')", () => {
  assert.equal(normalizeUrl(null), null);
});

// ---- aggregateMetrics: mẫu THẬT từ Clarity (scratchpad/clarity.json) ----
const SAMPLE = [
  { metricName: "ScrollDepth", information: [
    { averageScrollDepth: 56, Url: "https://noma911-lp-duy.pages.dev/" },
    { averageScrollDepth: 59, Url: "https://noma911-lp-duy.pages.dev/#san-pham-kem" },
    { averageScrollDepth: 75, Url: "https://noma911-lp-duy.pages.dev/#noma922" },
    { averageScrollDepth: 8,  Url: "https://noma911-lp-tpn.pages.dev/" },
  ]},
  { metricName: "Traffic", information: [
    { totalSessionCount: "0", totalBotSessionCount: "0", distinctUserCount: "1", pagesPerSessionPercentage: 1, Url: null },
    { totalSessionCount: "2", totalBotSessionCount: "3", distinctUserCount: "6", pagesPerSessionPercentage: 1.1666666666666667, Url: "https://noma911-lp-duy.pages.dev/" },
    { totalSessionCount: "1", totalBotSessionCount: "0", distinctUserCount: "1", pagesPerSessionPercentage: 2, Url: "https://noma911-lp-duy.pages.dev/#san-pham-kem" },
    { totalSessionCount: "1", totalBotSessionCount: "0", distinctUserCount: "1", pagesPerSessionPercentage: 1, Url: "https://noma911-lp-duy.pages.dev/#noma922" },
    { totalSessionCount: "3", totalBotSessionCount: "7", distinctUserCount: "11", pagesPerSessionPercentage: 1, Url: "https://noma911-lp-tpn.pages.dev/" },
    { totalSessionCount: "0", totalBotSessionCount: "1", distinctUserCount: "1", pagesPerSessionPercentage: 1, Url: "https://noma911-lp-duy.pages.dev/?fbclid=IwZXh0bgNhZW0_aem_x" },
  ]},
  { metricName: "EngagementTime", information: [
    { totalTime: "466", activeTime: "71",  Url: "https://noma911-lp-duy.pages.dev/" },
    { totalTime: "399", activeTime: "393", Url: "https://noma911-lp-duy.pages.dev/#san-pham-kem" },
    { totalTime: "785", activeTime: "192", Url: "https://noma911-lp-duy.pages.dev/#noma922" },
    { totalTime: "4",   activeTime: "4",   Url: "https://noma911-lp-tpn.pages.dev/" },
  ]},
];

function metric(out, name) { return out.find((m) => m.metricName === name); }
function rowByUrl(info, url) { return info.find((r) => r.Url === url); }

test("Traffic: biến thể ?fbclid gộp vào trang gốc; section #hash giữ riêng", () => {
  const out = aggregateMetrics(SAMPLE);
  const tr = metric(out, "Traffic").information;
  // gốc + biến thể fbclid -> 1 dòng; null, gốc-duy, #san-pham-kem, #noma922, tpn = 5 dòng (6 -> 5)
  assert.equal(tr.length, 5);
  const root = rowByUrl(tr, "https://noma911-lp-duy.pages.dev/");
  assert.ok(root, "phải còn dòng trang gốc duy");
  // CỘNG DỒN đếm số
  assert.equal(root.totalSessionCount, 2);            // 2 + 0
  assert.equal(root.totalBotSessionCount, 4);         // 3 + 1
  assert.equal(root.distinctUserCount, 7);            // 6 + 1
  // pagesPerSessionPercentage = trung bình CÓ TRỌNG SỐ theo totalSessionCount: (1.1667*2 + 1*0)/2
  assert.equal(root.pagesPerSessionPercentage, 1.17);
  // section vẫn tách
  assert.ok(rowByUrl(tr, "https://noma911-lp-duy.pages.dev/#san-pham-kem"));
  assert.ok(rowByUrl(tr, "https://noma911-lp-duy.pages.dev/#noma922"));
});

test("Dòng đơn không có biến thể -> giữ NGUYÊN giá trị (không phát sinh sai số)", () => {
  const out = aggregateMetrics(SAMPLE);
  const sd = metric(out, "ScrollDepth").information;
  assert.equal(sd.length, 4);
  assert.equal(rowByUrl(sd, "https://noma911-lp-duy.pages.dev/").averageScrollDepth, 56);
  assert.equal(rowByUrl(sd, "https://noma911-lp-duy.pages.dev/#noma922").averageScrollDepth, 75);
  const et = metric(out, "EngagementTime").information;
  assert.equal(rowByUrl(et, "https://noma911-lp-duy.pages.dev/#noma922").totalTime, 785);
});

test("Trung bình có trọng số theo phiên (sessionsWithMetricPercentage)", () => {
  // 2 biến thể cùng trang: 80% (3 phiên) và 0% (1 phiên) -> (80*3 + 0*1)/4 = 60
  const sample = [{ metricName: "RageClickCount", information: [
    { sessionsCount: "3", sessionsWithMetricPercentage: 80, sessionsWithoutMetricPercentage: 20, subTotal: "5", pagesViews: "3", Url: "https://x.dev/?utm=a" },
    { sessionsCount: "1", sessionsWithMetricPercentage: 0,  sessionsWithoutMetricPercentage: 100, subTotal: "0", pagesViews: "0", Url: "https://x.dev/?utm=b" },
  ]}];
  const r = aggregateMetrics(sample)[0].information;
  assert.equal(r.length, 1);
  assert.equal(r[0].sessionsCount, 4);     // 3 + 1
  assert.equal(r[0].subTotal, 5);          // 5 + 0
  assert.equal(r[0].sessionsWithMetricPercentage, 60);
  assert.equal(r[0].sessionsWithoutMetricPercentage, 40);
});

test("aggregateMetrics IDEMPOTENT — chạy 2 lần = 1 lần (an toàn khi gộp ở read cache)", () => {
  const once = aggregateMetrics(SAMPLE);
  const twice = aggregateMetrics(once);
  assert.deepEqual(twice, once);
});

test("aggregateMetrics an toàn với input rỗng/sai kiểu", () => {
  assert.deepEqual(aggregateMetrics([]), []);
  assert.equal(aggregateMetrics(null), null);
  assert.deepEqual(aggregateMetrics([{ metricName: "X", information: [] }]), [{ metricName: "X", information: [] }]);
});
