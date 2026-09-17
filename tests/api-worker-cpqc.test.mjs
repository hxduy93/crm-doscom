import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCpqc, parseQuery } from "../api-worker/src/cpqc.js";

// API CPQC cho đồng nghiệp (api-worker/, 17/09/2026). Số API trả ra PHẢI khớp số CRM
// hiển thị — cùng đọc dashboard-data.json, không được tự tính/nhận diện sản phẩm lại.

const D = {
  generated_at: "2026-09-17 17:24",
  accounts: [{ id: "111", name: "TK Duy" }, { id: "222", name: "TK Nam" }],
  ad_spend_by_staff: {
    DUY: { "Noma 911": { by_date: { "2026-09-01": 100, "2026-09-02": 50, "2026-08-31": 999 } } },
    PHUONG_NAM: { "Noma 230": { by_date: { "2026-09-02": 30 } } },
  },
  ad_spend_excluded: { DUY: { by_date: { "2026-09-01": 7 } }, PHUONG_NAM: { by_date: {} } },
  ad_spend_thailand: { by_product: { D1: { by_date: { "2026-09-01": 40 } } } },
  google_ads: { by_category: { MAYDO: { by_date: { "2026-09-01": 20 } } } },
  campaigns: [
    { id: "c1", name: "Doscom-11/9-Noma230-PhươngNam-ghep", account_id: "act_222", market: "vn",
      staff: "PHUONG_NAM", cpqc_product: "Noma 230", cpqc_source: "name",
      daily: [{ date: "2026-09-02", spend: 30, impressions: 5, clicks: 1, registrations: 0 }] },
  ],
};
const q = (s) => ({ ...parseQuery(new URLSearchParams(s)) });

test("mặc định: từ đầu tháng tới hôm nay, nhóm theo nhân sự × sản phẩm", () => {
  const p = parseQuery(new URLSearchParams(""), Date.parse("2026-09-17T03:00:00Z"));
  assert.equal(p.from, "2026-09-01");
  assert.equal(p.to, "2026-09-17");
  assert.equal(p.group, "staff_product");
  assert.deepEqual(p.errors, []);
});

test("tham số sai báo lỗi rõ, không trả số rỗng im lặng", () => {
  assert.ok(parseQuery(new URLSearchParams("group=abc")).errors.length);
  assert.ok(parseQuery(new URLSearchParams("from=17/09/2026")).errors.length);
  assert.ok(parseQuery(new URLSearchParams("from=2026-09-10&to=2026-09-01")).errors.length);
});

test("staff_product: đúng khoảng ngày, tiền không gán SP có product=null", () => {
  const { totals, rows } = buildCpqc(D, q("from=2026-09-01&to=2026-09-30"));
  const find = (ch, st, sp) => rows.find((r) => r.channel === ch && r.staff === st && r.product === sp);
  assert.equal(find("facebook", "DUY", "Noma 911").spend, 150, "không được cộng ngày 31/08");
  assert.equal(find("facebook", "PHUONG_NAM", "Noma 230").spend, 30);
  assert.equal(find("facebook", "DUY", null).spend, 7);
  assert.equal(find("facebook", "DUY", "Noma 911").staff_label, "Duy");
  assert.deepEqual(totals, { all: 207, facebook: 187, google: 20, facebook_unassigned: 7 },
    "market mặc định vn: không cộng 40 của Thái");
});

test("lọc kênh và thị trường", () => {
  assert.equal(buildCpqc(D, q("channel=google")).totals.all, 20);
  assert.equal(buildCpqc(D, q("channel=facebook&market=th")).totals.all, 40);
  assert.equal(buildCpqc(D, q("market=all")).totals.all, 247);
});

test("group=campaign trả sản phẩm CRM đã gán + nguồn gán (link/tên)", () => {
  const { rows } = buildCpqc(D, q("group=campaign&from=2026-09-01&to=2026-09-30"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].product, "Noma 230");
  assert.equal(rows[0].product_source, "name");
  assert.equal(rows[0].account_name, "TK Nam");
  assert.equal(rows[0].staff_label, "Phương Nam");
});

test("chạy được trên dashboard-data.json thật, tổng FB VN = gán SP + không gán", () => {
  const real = JSON.parse(readFileSync(new URL("../data/dashboard-data.json", import.meta.url), "utf8"));
  const { totals, rows } = buildCpqc(real, q("from=2026-09-01&to=2026-09-17&channel=facebook"));
  const sum = rows.reduce((t, r) => t + r.spend, 0);
  assert.ok(Math.abs(sum - totals.facebook) <= rows.length, "tổng dòng lệch tổng chung quá sai số làm tròn");
});
