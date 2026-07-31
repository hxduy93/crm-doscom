import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// QUYẾT 2026-07-31 — gán sản phẩm cho chi phí QC theo thứ tự: TÊN campaign → LINK landing
// → nếu cả hai chịu thì đó là bài tương tác chạy hộ team content, KHÔNG TÍNH vào chi phí.
//
// Đo trên 90 ngày trước khi chốt thứ tự này:
//   85,5% chi tiêu tên và link khớp nhau · 12,2% CHỈ tên gán được (ad Messenger, không có link)
//   1,9% CHỈ link gán được · 0,2% cả hai chịu (bài tương tác)
// => KHÔNG được thay tên bằng link (mất 12,2%), và link không đáng tin hơn tên
//    (đã gặp campaign "Thiet Bi Ghi Am DR1" trỏ nhầm về nm911d).
//
// Tiền bị loại đi vào ad_spend_excluded (có by_date) chứ KHÔNG bỏ im lặng — lỗi cũ là
// bỏ im lặng làm 27,3tr của Duy biến mất khỏi mọi bảng.

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function grabLine(re, name) {
  const m = html.match(re);
  if (!m) throw new Error("Không trích được " + name + " từ index.html (cấu trúc đổi?)");
  return m[0].trim();
}

const src = [
  grabLine(/^[ \t]*function inR\(d\)\{.*\}$/m, "inR"),
  grabLine(/^[ \t]*function sumByDate\(obj\)\{.*\}$/m, "sumByDate"),
  grabLine(/^[ \t]*function ggSpend\(\)\{.*\}$/m, "ggSpend"),
  grabLine(/^[ \t]*function staffSpend\(s\)\{.*\}$/m, "staffSpend"),
  grabLine(/^[ \t]*function staffExcluded\(ad\)\{.*\}$/m, "staffExcluded"),
].join("\n");
const build = new Function("D", "range", `${src}\nreturn { staffSpend, staffExcluded };`);

const range = { start: "2026-07-01", end: "2026-07-31" };
const D = {
  ad_spend_by_staff: {
    DUY: {
      "Noma 911": { by_date: { "2026-07-05": 100 } },
      DR1: { by_date: { "2026-07-06": 50 } },
    },
    PHUONG_NAM: { "Noma 911": { by_date: { "2026-07-05": 80 } } },
  },
  ad_spend_excluded: {
    DUY: { _total: 1027, by_date: { "2026-07-07": 27, "2026-08-20": 1000 } },
    PHUONG_NAM: { _total: 0, by_date: {} },
  },
};
const { staffSpend, staffExcluded } = build(D, range);

test("tiền bị loại KHÔNG được cộng vào chi phí nhân sự", () => {
  assert.equal(staffSpend({ ad: "DUY" }), 150, "chỉ 100 + 50; cộng thêm 27 là sai quyết định");
  assert.equal(staffSpend({ ad: "PHUONG_NAM" }), 80);
});

test("staffExcluded đọc đúng số đã loại, lọc theo khoảng ngày", () => {
  assert.equal(staffExcluded("DUY"), 27, "ngày 2026-08-20 ngoài kỳ, không được tính");
  assert.equal(staffExcluded("PHUONG_NAM"), 0);
});

test("dữ liệu cũ chưa có ad_spend_excluded → 0, không nổ", () => {
  const { staffExcluded: f } = build({ ad_spend_by_staff: { DUY: {} } }, range);
  assert.equal(f("DUY"), 0);
  assert.equal(f("KHONG_CO"), 0);
  assert.equal(f(null), 0);
  assert.equal(f("GOOGLE"), 0, "Google lấy chi phí từ by_category, không có rổ này");
});

test("KHÔNG còn rổ '(chưa gán SP)' trong chi phí — nó đã bị loại hẳn", () => {
  assert.doesNotMatch(html, /staffUnassigned/, "hàm cũ phải bị thay bằng staffExcluded");
  const staffFn = html.match(/function staffSpend\(s\)\{.*\}/)[0];
  assert.doesNotMatch(staffFn, /chưa gán/, "staffSpend không được lọc theo nhãn rổ nữa");
});

test("giao diện nói rõ tiền bị LOẠI, không phải 'vẫn tính đủ'", () => {
  assert.match(html, /Đã LOẠI/, "tooltip phải nói là đã loại");
  assert.match(html, /chạy hộ team content/, "phải nêu lý do loại");
  assert.doesNotMatch(html, /vẫn tính đủ vào chi phí/, "câu cũ mâu thuẫn với quyết định mới");
});
