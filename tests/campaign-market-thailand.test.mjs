import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

/* Canh việc nhận diện campaign chạy THỊ TRƯỜNG THÁI LAN trong
   scripts/build_dashboard_data.py.

   Vì sao bộ test này quan trọng hơn vẻ ngoài của nó:
   Tài khoản quảng cáo đang chạy CÓ SẴN 4 campaign Việt Nam tên "Noma911 - Thái Vũ
   BlackBi" / "...-Phương Nam-Thaivu" — "Thái Vũ" là TÊN NGƯỜI. Nếu ai đó nới bộ dò
   thành bắt mỗi chữ "thai" thì 4 campaign đó bị xếp sang thị trường Thái, chi tiêu của
   chúng biến mất khỏi dashboard Việt Nam mà không có cảnh báo nào — đúng vết xe đã ngã
   của bộ lọc nguồn Pancake (mất 21 đơn / 28,5tr trong im lặng).

   Chạy hàm Python thật thay vì chép lại logic sang JS: chép lại là hai bản luật, sửa một
   bên quên bên kia thì test vẫn xanh trong khi thực tế đã sai. */

const PY = process.env.PYTHON || "python";
const SCRIPT = "scripts/build_dashboard_data.py";

// Import module cần FB_ACCESS_TOKEN ở cấp module -> đưa giá trị giả, chỉ để nạp hàm.
function detectMany(names) {
  const code = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("b", ${JSON.stringify(SCRIPT)})
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
names = json.loads(sys.stdin.read())
print(json.dumps([[m.detect_market(n), m.detect_profit_product(n)] for n in names]))
`;
  const out = execFileSync(PY, ["-c", code], {
    input: JSON.stringify(names),
    env: { ...process.env, FB_ACCESS_TOKEN: "dummy", PYTHONIOENCODING: "utf-8" },
    encoding: "utf-8",
  });
  return JSON.parse(out.trim().split("\n").pop());
}

let available = existsSync(SCRIPT);
if (available) {
  try { execFileSync(PY, ["--version"], { stdio: "ignore" }); }
  catch { available = false; }
}

test("KHÔNG xếp nhầm campaign Việt Nam sang thị trường Thái", { skip: !available && "không có python" }, () => {
  const vn = [
    "Doscom-Nomavietnam-Noma911-15/7-Phương Nam-Thaivu",  // tên người, đang chạy thật
    "5/6 - Noma911 - Thái Vũ BlackBi",                    // tên người, đang chạy thật
    "16/7 - Noma911 - Thái Vũ Blackbi",
    "4/8 - Noma911 - Thái Vũ BlackBi",
    "D1 - Thái Nguyên",                                   // tên tỉnh
    "D1 - Thái Bình",                                     // tên tỉnh
    "Thái Lâm - D1",                                      // gần giống nhưng KHÁC
    "Noma911 - Duy",
  ];
  const got = detectMany(vn);
  got.forEach(([market], i) => {
    assert.equal(market, "vn", `"${vn[i]}" phải là thị trường vn, đang ra ${market}`);
  });
});

test("Nhận đúng campaign Thái Lan ở mọi cách gõ", { skip: !available && "không có python" }, () => {
  const th = [
    "Thái Lan - D1",
    "THAI LAN - D1",
    "thai lan - d1",
    "D1 Thái Lan - test",
    "12/8 - D1 - Thailand",
    "D1 - Thai  Lan",        // gõ thừa khoảng trắng
    "D1_Thai_Lan_08",        // gạch dưới
  ];
  const got = detectMany(th);
  got.forEach(([market], i) => {
    assert.equal(market, "th", `"${th[i]}" phải là thị trường th, đang ra ${market}`);
  });
});

test("Campaign Thái vẫn nhận ra đúng tên sản phẩm để tách chi phí theo SP", { skip: !available && "không có python" }, () => {
  const rows = detectMany(["Thái Lan - D1", "Thailand - DR1", "Thái Lan - Noma 911"]);
  assert.deepEqual(rows[0], ["th", "D1"]);
  assert.deepEqual(rows[1], ["th", "DR1"]);
  assert.deepEqual(rows[2], ["th", "Noma 911"]);
});

test("Tên rỗng / thiếu không được thành Thái", { skip: !available && "không có python" }, () => {
  const rows = detectMany(["", "   ", "New folder #1"]);
  rows.forEach(([market]) => assert.equal(market, "vn"));
});
