import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// LUẬT TÍNH DỮ LIỆU (QUYẾT 2026-07-15): Doanh thu & giá vốn theo nhân sự/nguồn
// tính GỘP mọi trạng thái (gồm returning/returned/canceled) để khớp "doanh số" Pancake POS.
// Test này trích thẳng EXCL + srcRevenue từ index.html (logic inline) và kiểm hành vi thật,
// để nếu ai lỡ thêm lại việc loại hoàn/huỷ vào EXCL thì test đỏ ngay.

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function grabLine(re, name) {
  const m = html.match(re);
  if (!m) throw new Error("Không trích được " + name + " từ index.html (cấu trúc đổi?)");
  return m[0].trim();
}

// Các hàm này đều nằm trên 1 dòng trong index.html
const exclSrc = grabLine(/^[ \t]*var EXCL=\{[^}]*\};/m, "EXCL");
const inRSrc = grabLine(/^[ \t]*function inR\(d\)\{.*\}$/m, "inR");
const sumByDateSrc = grabLine(/^[ \t]*function sumByDate\(obj\)\{.*\}$/m, "sumByDate");
const srcRevenueSrc = grabLine(/^[ \t]*function srcRevenue\(key\)\{.*\}$/m, "srcRevenue");

// Dựng sandbox với đúng nguồn trích ra; D và range truyền vào như biến ngoài
const build = new Function(
  "D",
  "range",
  `${exclSrc}\n${inRSrc}\n${sumByDateSrc}\n${srcRevenueSrc}\nreturn { srcRevenue, EXCL };`
);

const D = {
  revenue: {
    source_groups: {
      TEST: {
        order_revenue_by_status_by_date: {
          delivered: { "2026-07-05": 100 },
          canceled: { "2026-07-05": 30 },
          returning: { "2026-07-05": 20 },
          returned: { "2026-07-06": 10 },
          other: { "2026-07-05": 50 },
        },
      },
    },
  },
};
const range = { start: "2026-07-01", end: "2026-07-14" };
const { srcRevenue, EXCL } = build(D, range);

test("EXCL rỗng — không loại trạng thái nào (khớp Pancake)", () => {
  assert.deepEqual(EXCL, {}, "EXCL phải rỗng; nếu có returning/returned/canceled là quay lại lỗi cũ");
});

test("srcRevenue GỘP mọi trạng thái, gồm cả hoàn/huỷ", () => {
  // 100 (delivered) + 30 (canceled) + 20 (returning) + 10 (returned) + 50 (other) = 210
  assert.equal(srcRevenue("TEST"), 210);
});

test("srcRevenue KHÔNG trừ đơn hoàn/huỷ (nếu trừ sẽ ra 150)", () => {
  const grossOnlyDeliveredOther = 100 + 50; // = 150, con số nếu loại canceled/returning/returned
  assert.notEqual(srcRevenue("TEST"), grossOnlyDeliveredOther);
});

test("srcRevenue chỉ cộng ngày trong khoảng lọc", () => {
  const D2 = {
    revenue: {
      source_groups: {
        TEST: {
          order_revenue_by_status_by_date: {
            delivered: { "2026-07-05": 100, "2026-08-01": 999 },
          },
        },
      },
    },
  };
  const { srcRevenue: sr2 } = build(D2, range);
  assert.equal(sr2("TEST"), 100, "ngày 2026-08-01 ngoài khoảng, không được cộng");
});
