import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJson } from "../functions/api/geo/_utils/claude.js";

test("extractJson: JSON hợp lệ nguyên bản", () => {
  const o = extractJson('{"a":1,"b":"x"}');
  assert.deepEqual(o, { a: 1, b: "x" });
});

test("extractJson: bóc ```json fence đóng đầy đủ", () => {
  const o = extractJson('```json\n{"title":"Bài viết","n":2}\n```');
  assert.equal(o.title, "Bài viết");
  assert.equal(o.n, 2);
});

test("extractJson: RECOVER xuống dòng THẬT chưa escape trong string (lỗi phổ biến nhất)", () => {
  // content_markdown có \n thật (không phải \\n) → JSON.parse thường fail, extractJson phải cứu.
  const bad = '{"content_markdown":"# Tiêu đề\n\nĐoạn 1 nói về Doscom D1.\nĐoạn 2."}';
  assert.throws(() => JSON.parse(bad)); // xác nhận vanilla parse fail
  const o = extractJson(bad);
  assert.match(o.content_markdown, /Doscom D1/);
  assert.match(o.content_markdown, /Đoạn 2/);
});

test("extractJson: recover xuống dòng thật BÊN TRONG fence ```json", () => {
  const bad = '```json\n{"k":"dòng một\ndòng hai","ok":true}\n```';
  const o = extractJson(bad);
  assert.equal(o.ok, true);
  assert.match(o.k, /dòng hai/);
});

test("extractJson: JSON bị truncate (fence mở không đóng) vẫn recover phần hợp lệ", () => {
  const truncated = '```json\n{"title":"X","body":"đang viết dở';
  const o = extractJson(truncated);
  assert.equal(o.title, "X");
});

test("extractJson: rác hoàn toàn → throw", () => {
  assert.throws(() => extractJson("không có json ở đây cả"), /không parse được JSON/);
});
