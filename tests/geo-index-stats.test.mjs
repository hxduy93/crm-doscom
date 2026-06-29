import { test } from "node:test";
import assert from "node:assert/strict";
import { computeIndexStats } from "../functions/api/geo/index-stats.js";

// 4 bài published: a,b,c,d
const PUBLISHED = [
  { id: "a", url: "https://doscom.vn/a" },
  { id: "b", url: "https://doscom.vn/b" },
  { id: "c", url: "https://doscom.vn/c" },
  { id: "d", url: "https://doscom.vn/d" },
];

test("submit rate: any_ok đếm bài báo được ÍT NHẤT 1 engine, không double-count", () => {
  const logAgg = [
    { article_id: "a", google_ok: 1, indexnow_ok: 1 }, // cả 2
    { article_id: "b", google_ok: 1, indexnow_ok: 0 }, // chỉ google
    { article_id: "c", google_ok: 0, indexnow_ok: 1 }, // chỉ indexnow
    // d: không có log → chưa báo
  ];
  const s = computeIndexStats({ published: PUBLISHED, logAgg, statusAgg: [] });
  assert.equal(s.total_published, 4);
  assert.equal(s.submit.google_ok, 2);
  assert.equal(s.submit.indexnow_ok, 2);
  assert.equal(s.submit.any_ok, 3);          // a,b,c
  assert.equal(s.submit.rate, 0.75);         // 3/4
  assert.equal(s.submit.google_rate, 0.5);   // 2/4
});

test("indexed rate: mẫu = tổng published; coverage phản ánh đã kiểm bao nhiêu", () => {
  const statusAgg = [
    { article_id: "a", indexed: 1 },
    { article_id: "b", indexed: 0 },
    // c, d chưa kiểm
  ];
  const s = computeIndexStats({ published: PUBLISHED, logAgg: [], statusAgg });
  assert.equal(s.indexed.checked, 2);
  assert.equal(s.indexed.indexed, 1);
  assert.equal(s.indexed.rate, 0.25);     // 1/4 (chưa kiểm coi như chưa index)
  assert.equal(s.indexed.coverage, 0.5);  // 2/4 đã kiểm
});

test("chưa publish bài nào → rate null, không chia cho 0", () => {
  const s = computeIndexStats({ published: [], logAgg: [], statusAgg: [] });
  assert.equal(s.total_published, 0);
  assert.equal(s.submit.rate, null);
  assert.equal(s.indexed.rate, null);
  assert.equal(s.indexed.coverage, null);
});

test("log/status của article KHÔNG nằm trong published thì bị bỏ qua", () => {
  const logAgg = [{ article_id: "zzz", google_ok: 1, indexnow_ok: 1 }];
  const statusAgg = [{ article_id: "zzz", indexed: 1 }];
  const s = computeIndexStats({ published: PUBLISHED, logAgg, statusAgg });
  assert.equal(s.submit.any_ok, 0);
  assert.equal(s.indexed.indexed, 0);
  assert.equal(s.indexed.checked, 0);
});
