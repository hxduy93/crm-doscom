import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

/* Doanh thu tách theo NGUỒN ĐƠN Pancake — aggregate_by_source() trong
   scripts/fetch_pancake_revenue.py (thêm 19/08/2026).

   Vì sao quan trọng: bảng "SP × nhân sự" lấy doanh thu từ đây. Nếu hàm này lệch với
   aggregate() (nguồn của cột Doanh thu ở bảng theo nhân sự) thì hai bảng cãi nhau mà
   không ai biết bên nào đúng. Test khoá đúng bất biến đó: cộng mọi nguồn = cộng mọi đơn,
   dùng CÙNG order_revenue() và CÙNG cách quy ngày giờ VN (+7).

   Chạy hàm Python thật — chép luật sang JS là có hai bản luật. */

const PY = process.env.PYTHON || "python";
const SCRIPT = "scripts/fetch_pancake_revenue.py";

let available = existsSync(SCRIPT);
if (available) {
  try { execFileSync(PY, ["--version"], { stdio: "ignore" }); }
  catch { available = false; }
}
const skip = !available && "không có python";

// 3 đơn: 2 nguồn khác nhau + 1 đơn hoàn, và 1 đơn đặt lúc 18:00 UTC (= hôm sau giờ VN).
const ORDERS = [
  { order_sources_name: "DUY - NOMA 230", status: 3, cod: 99000, inserted_at: "2026-07-05T03:00:00" },
  { order_sources_name: "DUY - NOMA 230", status: 5, cod: 99000, inserted_at: "2026-07-05T04:00:00" },
  { order_sources_name: "DUY - DR1", status: 3, cod: 1300000, inserted_at: "2026-07-05T18:00:00" },
  { order_sources_name: "", status: 3, cod: 50000, inserted_at: "2026-07-06T02:00:00" },
];

function runPy(snippet) {
  const code = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("f", ${JSON.stringify(SCRIPT)})
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
orders = json.loads(sys.stdin.read())
${snippet}
`;
  const out = execFileSync(PY, ["-c", code], {
    input: JSON.stringify(ORDERS),
    env: { ...process.env, PANCAKE_API_KEY: "dummy", PANCAKE_SHOP_ID: "0", PYTHONIOENCODING: "utf-8" },
    encoding: "utf-8",
  });
  return JSON.parse(out.trim().split("\n").pop());
}

test("tách đúng theo tên nguồn, đúng trạng thái, đúng ngày giờ VN", { skip }, () => {
  const got = runPy("print(json.dumps(m.aggregate_by_source(orders)))");

  assert.deepEqual(got["DUY - NOMA 230"].revenue_by_status_by_date, {
    delivered: { "2026-07-05": 99000 },
    returned: { "2026-07-05": 99000 },   // đơn hoàn KHÔNG bị bỏ, để UI tự lọc
  });
  // 18:00 UTC ngày 05 = 01:00 ngày 06 giờ VN — bucket phải là ngày 06, y như aggregate()
  assert.deepEqual(got["DUY - DR1"].revenue_by_status_by_date, { delivered: { "2026-07-06": 1300000 } });
  // Nguồn rỗng vẫn có chỗ đứng, không bị nuốt
  assert.ok(got["(không tên)"], "đơn không có tên nguồn bị bỏ rơi");
});

test("cộng mọi nguồn = cộng mọi đơn (khớp cột Doanh thu của bảng theo nhân sự)", { skip }, () => {
  const [bySource, byOrder] = runPy(`
src = m.aggregate_by_source(orders)
total_src = sum(v for e in src.values() for d in e["revenue_by_status_by_date"].values() for v in d.values())
res = m.aggregate(orders)
total_ord = sum(v for d in res[4].values() for v in d.values())
print(json.dumps([total_src, total_ord]))`);
  assert.equal(bySource, byOrder, "doanh thu theo nguồn lệch doanh thu theo đơn");
  assert.equal(bySource, 99000 + 99000 + 1300000 + 50000);
});
