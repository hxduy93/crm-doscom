import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

/* Doanh số 1 đơn = COD + TIỀN TRẢ TRƯỚC (20/11/2026). Trước đó chỉ lấy cod nên đơn khách
   chuyển khoản trước bị tính 0đ: Hotline #198228 trả trước 8.000.000đ, Page #193013
   trả trước 416.000đ. Chạy hàm Python THẬT của scripts/fetch_pancake_revenue.py. */
const PY = process.env.PYTHON || "python";
let skip = false;
try { execFileSync(PY, ["--version"], { stdio: "ignore" }); } catch { skip = "không có python"; }

function rev(orders) {
  const code = `
import json, sys
sys.path.insert(0, "scripts")
import fetch_pancake_revenue as P
print(json.dumps([P.order_revenue(o) for o in json.loads(sys.stdin.read())]))
`;
  const out = execFileSync(PY, ["-c", code], {
    input: JSON.stringify(orders), encoding: "utf-8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8", PANCAKE_API_KEY: "x", PANCAKE_SHOP_ID: "x" },
  });
  return JSON.parse(out.trim().split("\n").pop());
}

test("đơn trả trước toàn bộ: doanh số = tiền trả trước, không phải 0", { skip }, () => {
  // prepaid và transfer_money là CÙNG một khoản trên POS — chỉ được cộng một lần.
  assert.deepEqual(rev([{ cod: 0, prepaid: 8000000, transfer_money: 8000000 }]), [8000000]);
});

test("đơn cọc một phần: COD + phần đã cọc", { skip }, () => {
  assert.deepEqual(rev([{ cod: 500000, prepaid: 200000, transfer_money: 200000 }]), [700000]);
});

test("đơn COD thường giữ nguyên; đơn 0đ không bị thổi lên total_price", { skip }, () => {
  assert.deepEqual(rev([{ cod: 253000, prepaid: 0 }, { cod: 0, total_price: 497000 }, { cod: 134000 }]),
    [253000, 0, 134000]);
});
