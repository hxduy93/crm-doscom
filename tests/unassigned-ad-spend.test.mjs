import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Campaign đặt tên không chứa tên SP (vd "New folder #1", "Toản mán shop") trước đây bị
// nguồn dữ liệu BỎ HẲN khỏi ad_spend_by_staff → 27,3tr của Duy biến mất khỏi mọi bảng,
// lợi nhuận bị thổi lên. Nguồn nay gom vào rổ "(chưa gán SP)" (tiền tố "Noma " nếu tài
// khoản thuộc nhóm NOMA để xếp đúng cột brand).
// Test này canh phía UI: staffSpend PHẢI cộng cả rổ đó, và staffUnassigned phải bóc đúng
// phần chưa gán để hiện tooltip — không được để tiền biến mất lần nữa.

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
  grabLine(/^[ \t]*function staffUnassigned\(ad\)\{.*\}$/m, "staffUnassigned"),
].join("\n");
const build = new Function("D", "range", `${src}\nreturn { staffSpend, staffUnassigned };`);

const range = { start: "2026-07-01", end: "2026-07-31" };
const D = {
  ad_spend_by_staff: {
    DUY: {
      "Noma 911": { by_date: { "2026-07-05": 100 } },
      DR1: { by_date: { "2026-07-06": 50 } },
      "Noma (chưa gán SP)": { by_date: { "2026-07-07": 27, "2026-08-20": 999 } },
    },
    PHUONG_NAM: {
      "Noma 911": { by_date: { "2026-07-05": 80 } },
      "(chưa gán SP)": { by_date: { "2026-07-09": 12 } },
    },
  },
};
const { staffSpend, staffUnassigned } = build(D, range);

test("chi phí nhân sự CỘNG CẢ phần chưa gán sản phẩm", () => {
  assert.equal(staffSpend({ ad: "DUY" }), 177, "100 + 50 + 27 — bỏ rổ chưa gán là quay lại lỗi cũ");
  assert.equal(staffSpend({ ad: "PHUONG_NAM" }), 92, "80 + 12");
});

test("staffUnassigned bóc đúng phần chưa gán, cả 2 dạng nhãn", () => {
  assert.equal(staffUnassigned("DUY"), 27, 'nhãn có tiền tố brand "Noma (chưa gán SP)"');
  assert.equal(staffUnassigned("PHUONG_NAM"), 12, 'nhãn trơn "(chưa gán SP)"');
});

test("chỉ cộng ngày trong khoảng lọc", () => {
  // 2026-08-20 nằm ngoài range nên không được tính vào cả 2 hàm
  assert.equal(staffUnassigned("DUY"), 27);
  assert.ok(staffSpend({ ad: "DUY" }) < 999);
});

test("không có rổ chưa gán → 0, không nổ (dữ liệu cũ chưa có trường này)", () => {
  const { staffUnassigned: f } = build(
    { ad_spend_by_staff: { DUY: { "Noma 911": { by_date: { "2026-07-05": 100 } } } } },
    range
  );
  assert.equal(f("DUY"), 0);
  assert.equal(f("KHONG_CO"), 0);
  assert.equal(f(null), 0);
  assert.equal(f("GOOGLE"), 0, "Google lấy chi phí từ by_category, không có rổ này");
});

test("sản phẩm thật có chữ 'gán' trong tên không bị nhận nhầm", () => {
  const { staffUnassigned: f } = build(
    { ad_spend_by_staff: { DUY: { "Máy gắn biển": { by_date: { "2026-07-05": 100 } } } } },
    range
  );
  assert.equal(f("DUY"), 0, "chỉ nhãn chứa đúng cụm '(chưa gán SP)' mới tính");
});

test("bảng nhân sự có gắn tooltip + dấu * cho phần chưa gán", () => {
  assert.match(html, /var unas=staffUnassigned\(s\.ad\); tUnas\+=unas;/, "thiếu tính unas mỗi hàng");
  assert.match(html, /chưa gán được sản phẩm[^"]*vẫn tính đủ vào chi phí/, "thiếu tooltip giải thích");
  assert.match(html, /tUnas>0\?' title="Trong đó '\+vnd\(tUnas\)/, "hàng Tổng thiếu tooltip");
});
