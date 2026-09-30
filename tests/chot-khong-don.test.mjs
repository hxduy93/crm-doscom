import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { locDong, giaTri, tongHop, xuatCsv } from "../functions/lib/chot-khong-don.js";

// Menu "Chốt chưa lên đơn" (30/09/2026). Canh:
//   1. lọc đúng theo loại / tháng tạo contact / sale / người chạy QC / ô tìm;
//   2. tổng hợp tách "chưa có đơn" và "chỉ có đơn huỷ";
//   3. CSV giữ số 0 đầu SĐT khi mở bằng Excel;
//   4. trang + menu + build-dist + workflow được nối đủ (thiếu một chỗ là trang biến mất).

const rows = [
  { phone: "0901234567", name: "Anh Minh", created: "2026-09-28", sale: "Sale - A", runner: "NOMA 911 - DUY", note: "Gói: 2 chai", kind: "none", orders: [] },
  { phone: "0912345678", name: "Chị Lan", created: "2026-09-02", sale: "Sale - B", runner: "", note: "", kind: "cancel_only", orders: [{ id: "111", status: 6, date: "2026-09-03" }] },
  { phone: "0987654321", name: "Đức", created: "2026-08-15", sale: "Sale - A", runner: "DT2 - DUY", note: "", kind: "none", orders: [] },
];

test("lọc theo loại, tháng, sale, người chạy QC", () => {
  assert.equal(locDong(rows, { kind: "none" }).length, 2);
  assert.equal(locDong(rows, { month: "2026-09" }).length, 2);
  assert.equal(locDong(rows, { sale: "Sale - A" }).length, 2);
  assert.equal(locDong(rows, { runner: "(trống)" })[0].phone, "0912345678");
  assert.equal(locDong(rows, { kind: "none", month: "2026-09", sale: "Sale - A" }).length, 1);
  assert.equal(locDong(rows, {}).length, 3);
});

test("ô tìm khớp SĐT và chữ không dấu", () => {
  assert.equal(locDong(rows, { q: "4567" })[0].name, "Anh Minh");
  assert.equal(locDong(rows, { q: "duc" })[0].phone, "0987654321");
  assert.equal(locDong(rows, { q: "2 CHAI" }).length, 1);
  assert.equal(locDong(rows, { q: "không-ai" }).length, 0);
});

test("tổng hợp tách hai loại, tháng mới nhất lên đầu", () => {
  const s = tongHop(rows, "sale");
  assert.deepEqual(s[0], { key: "Sale - A", none: 2, cancel_only: 0, total: 2 });
  assert.deepEqual(s[1], { key: "Sale - B", none: 0, cancel_only: 1, total: 1 });
  assert.deepEqual(tongHop(rows, "month").map((x) => x.key), ["2026-09", "2026-08"]);
  assert.deepEqual(giaTri(rows, "month").map((x) => x.v), ["2026-09", "2026-08"]);
  assert.equal(giaTri(rows, "sale")[0].v, "Sale - A");
});

test("CSV có BOM, giữ số 0 đầu, bọc ô có dấu phẩy", () => {
  const csv = xuatCsv([{ ...rows[1], note: "Gói: 1, quà: có" }]);
  assert.ok(csv.startsWith("﻿"));
  const line = csv.split("\r\n")[1];
  assert.ok(line.startsWith('="0912345678"'));
  assert.match(line, /"Gói: 1, quà: có"/);
  assert.match(line, /111 \(2026-09-03\)/);
  assert.match(line, /Chỉ có đơn huỷ/);
});

test("trang được nối đủ vào CRM, build-dist và workflow", () => {
  const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
  const idx = read("index.html");
  assert.match(idx, /data-view="chot-khong-don"/);
  assert.match(idx, /id="view-chot-khong-don"/);
  assert.match(idx, /lazyFrame\('chot-khong-don',\s*'ckd-frame',\s*'\/chot-khong-don'\)/);
  const sh = read("scripts/build-dist.sh");
  assert.match(sh, /chot-khong-don\.html/);
  assert.match(sh, /functions\/lib\/chot-khong-don\.js/);
  // Cache tra đơn chứa 24k SĐT khách và chỉ dùng lúc dựng → không đẩy lên web.
  assert.match(sh, /rm -f dist\/data\/chot-khong-don-cache\.json/);
  const page = read("chot-khong-don.html");
  assert.match(page, /\.\/js\/chot-khong-don\.js/);
  assert.match(page, /\/data\/chot-khong-don\.json/);
  const wf = read(".github/workflows/build-chot-khong-don.yml");
  assert.match(wf, /python scripts\/build_chot_khong_don\.py/);
  assert.match(wf, /PANCAKE_CRM_API_KEY/);
  assert.match(wf, /PANCAKE_API_KEY/);
});
