import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

/* Gán CHI PHÍ QUẢNG CÁO về đúng sản phẩm bằng LINK LANDING (QUYẾT 19/08/2026).

   Vì sao cần canh: mỗi landing trên Cloudflare doscom.vietnam bán đúng 1 sản phẩm, nên
   link đích của quảng cáo là bằng chứng chắc nhất. Trước đó gán bằng TÊN campaign, mà
   nhánh fallback "có chữ noma" dồn hết về Noma 911 — 01→18/08/2026 có 29,9tr của
   NOMA 230/350/680/120 nằm trong bucket Noma 911, làm CIR của 911 (Duy) đội từ 72% lên
   131%. Mở landing mới mà quên thêm vào bảng map là lỗi đó quay lại y nguyên.

   Chạy hàm Python THẬT thay vì chép luật sang JS — chép là có hai bản luật. */

const PY = process.env.PYTHON || "python";
const SCRIPT = "scripts/build_dashboard_data.py";

function call(fn, args) {
  const code = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("b", ${JSON.stringify(SCRIPT)})
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
args = json.loads(sys.stdin.read())
print(json.dumps([getattr(m, ${JSON.stringify(fn)})(a) for a in args]))
`;
  const out = execFileSync(PY, ["-c", code], {
    input: JSON.stringify(args),
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
const skip = !available && "không có python";

test("mọi landing đang chạy đều suy ra đúng sản phẩm từ link", { skip }, () => {
  const cases = [
    ["https://www.noma.io.vn/nm911d#dat-hang", "Noma 911"],
    ["https://noma.io.vn/911tpn?utm_source=fb", "Noma 911"],
    ["https://www.doscom.click/d1cb", "D1"],
    ["https://www.doscom.click/d1tpn?fbclid=abc", "D1"],
    ["https://www.senso.io.vn/dr1lad", "DR1"],
    ["https://www.senso.io.vn/dr1tpn", "DR1"],
    // Dòng NOMA chăm xe: tên miền KHÔNG trùng số sản phẩm, phải tra bảng mới ra đúng
    ["https://www.noma620.click/", "Noma 230"],
    ["https://www.noma620.click/nm230d", "Noma 230"],
    ["https://www.noma890.click/350pn", "Noma 350"],
    ["https://www.nomaautocares.cloud/nm680tpn", "Noma 680"],
    ["https://noma120-landing.pages.dev/tpn", "Noma 120"],
    // Bản pages.dev (ad hay dán lúc test)
    ["https://noma-landings.pages.dev/nm911d", "Noma 911"],
    ["https://dr1-lp.pages.dev/dr1lad", "DR1"],
    // Ngoài hệ thống → không đoán bừa
    ["https://shopee.vn/product/123", null],
    ["", null],
  ];
  const got = call("_product_from_link", cases.map((c) => c[0]));
  cases.forEach(([url, want], i) => assert.equal(got[i], want, url));
});

test("noma120.asia: chỉ path /d (bản Việt) là Noma 120, phần Thái không ghi nhận", { skip }, () => {
  // Domain này đổi sản phẩm 18/08/2026: "/" nay là landing NOMA 911 tiếng Thái, còn ad
  // NOMA 120 bản Việt vẫn trỏ /d. Khai cả domain là gán nhầm doanh số Thái sang SP Việt.
  assert.deepEqual(
    call("_product_from_link", ["https://noma120.asia/d", "https://noma120.asia/", "https://noma120.asia/911th"]),
    ["Noma 120", null, null],
  );
  assert.match(readFileSync(SCRIPT, "utf8"), /phần Thái[\s\S]{0,20}KHÔNG ghi nhận/,
    "mất lý do vì sao chỉ khai path /d — người sau sẽ 'sửa' bằng cách khai cả domain");
});

test("tên campaign nhận đủ model NOMA, không dồn hết về 911", { skip }, () => {
  const names = [
    "NOMA 230 · Chai Xit Duong & Danh Bon… - TEST",
    "2/8 - Noma 680 - 4 vid",
    "NOMA 350 · Chai Xit Ve Sinh Phanh Dia - TEST",
    "NOMA 120 · Dung Dich Suc Rua Binh Xa… - TEST",
    "Doscom-27/7-Noma911-Phương Nam",
    "Doscom-NomaVietNam-17/7-Phương Nam",   // generic, không kèm model → 911 như cũ
    "NOMA 230 + NOMA 911 combo",            // nhắc 2 model → lấy model đứng TRƯỚC
  ];
  assert.deepEqual(call("detect_profit_product", names), [
    "Noma 230", "Noma 680", "Noma 350", "Noma 120", "Noma 911", "Noma 911", "Noma 230",
  ]);
});

test("CHỈ link gán sản phẩm — tên campaign không còn quyền đó", { skip }, () => {
  // Chủ dự án chốt 19/08/2026: bỏ tên, chỉ theo link quảng cáo.
  const src = readFileSync(SCRIPT, "utf8");
  assert.ok(src.includes("            prod = by_link"), "tên campaign lại được gán sản phẩm");
  assert.ok(!src.includes("prod = by_link or by_name\n        if not prod"),
    "vẫn còn fallback theo tên cho campaign Việt");
  assert.match(src, /conflicts\.append/, "mất phần in cảnh báo vênh tên↔link");
});

test("chi phí không đọc được link KHÔNG bị bốc hơi — có rổ riêng", { skip }, () => {
  // 01→19/08/2026 có 25,5tr ad Messenger/inbox không đọc được link. Nếu để rơi vào rổ
  // "chạy hộ team content" (không tính chi phí) thì lợi nhuận bị thổi lên đúng số đó.
  const src = readFileSync(SCRIPT, "utf8");
  assert.match(src, /NO_LINK_BUCKET = "\(không đọc được link\)"/, "mất rổ chi phí chưa gán được SP");
  assert.match(src, /prod = NO_LINK_BUCKET/, "chi phí không có link không còn được giữ lại");
});

test("đọc link hỏng giữa chừng thì GIỮ phần đã đọc, không trả rỗng", { skip }, () => {
  // Bản cũ `return {}` khi gặp HTTP 500 ở trang thứ n → mất sạch link của tài khoản
  // act_764394829882083 (nhiều ad nhất), 94,6tr chi tiêu phải đoán bằng tên.
  const src = readFileSync(SCRIPT, "utf8");
  const from = src.indexOf("def fetch_campaign_products_from_links");
  const fn = src.slice(from, src.indexOf(String.fromCharCode(10) + "def ", from + 10));
  // So theo DÒNG CODE, không so cả đoạn: docstring của hàm có nhắc chữ "return {}" khi
  // kể lại lỗi cũ — so cả đoạn là test đỏ oan.
  const codeLines = fn.split(String.fromCharCode(10)).map((l) => l.trim());
  assert.ok(!codeLines.includes("return {}"), "vẫn còn nhánh vứt sạch kết quả đã đọc");
  assert.match(fn, /giữ \{len\(found\)\} campaign đã đọc được/, "mất log cho biết đã đọc được bao nhiêu");
});
