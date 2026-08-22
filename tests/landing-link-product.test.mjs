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

test("noma120.asia: path /d và /tpn là NOMA 120, phần gốc là Noma 911 Thái", { skip }, () => {
  /* Chủ dự án chốt 22/08/2026: vẫn ghi nhận NOMA 120 qua hai đường dẫn của nhân sự,
     dù gốc tên miền đã giao cho landing NOMA 911 tiếng Thái. Path phải THẮNG domain —
     nếu domain thắng thì toàn bộ chi phí NOMA 120 bị đọc thành Noma 911. */
  assert.deepEqual(
    call("_product_from_link", [
      "https://noma120.asia/d", "https://noma120.asia/tpn",
      "https://noma120.asia/", "https://noma120.asia/911th",
    ]),
    ["Noma 120", "Noma 120", "Noma 911", "Noma 911"],
  );
});

test("landing theo nhân sự của 230/350/680 khai TƯỜNG MINH theo path", { skip }, () => {
  /* Trước đây ba sản phẩm này chỉ khai theo TÊN MIỀN. Vẫn ra đúng SP, nhưng luật đó
     sập ngay khi domain đổi chủ — đúng chuyện đã xảy ra với noma120.asia. */
  assert.deepEqual(
    call("_product_from_link", [
      "https://noma620.click/nm230d", "https://noma620.click/nm230tpn",
      "https://noma890.click/nm350d", "https://noma890.click/nm350tpn",
      "https://nomaautocares.cloud/nm680d", "https://nomaautocares.cloud/nm680tpn",
    ]),
    ["Noma 230", "Noma 230", "Noma 350", "Noma 350", "Noma 680", "Noma 680"],
  );
  const src = readFileSync(SCRIPT, "utf8");
  for (const p of ["noma620.click/nm230d", "noma890.click/nm350d", "nomaautocares.cloud/nm680d",
                   "noma120.asia/d"]) {
    assert.ok(src.includes(`"${p}"`), `phải khai tường minh path ${p}, đừng chỉ dựa vào luật tên miền`);
  }
});

test("đọc được link của QUẢNG CÁO TỪ BÀI ĐĂNG — link nằm ở url_tags", { skip }, () => {
  /* Ad chạy từ bài đăng có sẵn trên Page (effective_object_story_id) KHÔNG có
     object_story_spec.link_data.link. Team đặt link đích ở `url_tags`.
     22/08/2026: bỏ sót chỗ này làm 8 campaign (26,5tr kỳ 01→21/08) bị coi là "không có
     link" rồi loại khỏi chi phí — riêng 3 campaign Noma 911 của Phương Nam là 23,3tr. */
  const [postAd] = call("_links_of_creative", [{
    url_tags: "https://www.noma.io.vn/911tpn?utm_source=14%2F8-Noma911&utm_medium=x",
    asset_feed_spec: { call_ads_configuration: {} },
  }]);
  assert.deepEqual(postAd, ["https://www.noma.io.vn/911tpn?utm_source=14%2F8-Noma911"]);
  assert.deepEqual(call("_product_from_link", postAd), ["Noma 911"]);
});

test("url_tags CHỈ là dự phòng — nút bấm luôn thắng khi hai bên lệch nhau", { skip }, () => {
  /* Campaign "1/8 - Doscom - D1 - Nam - 3vid": nút bấm trỏ doscom.click/d1tpn (D1)
     nhưng url_tags ghi senso.io.vn/dr1tpn (DR1) — dán nhầm khi sao chép ad.
     Đọc ngang hàng thì thành "link mâu thuẫn" và CẢ campaign bị loại oan. Khách bấm
     vào nút, nên nút là đích thật. */
  const [links] = call("_links_of_creative", [{
    object_story_spec: { link_data: { link: "https://www.doscom.click/d1tpn" } },
    url_tags: "https://www.senso.io.vn/dr1tpn?utm_source=1%2F8-D1-AI",
  }]);
  assert.deepEqual(links, ["https://www.doscom.click/d1tpn"], "chỉ được lấy link ở nút bấm");
});

test("url_tags chỉ có chuỗi UTM thuần thì bỏ qua, KHÔNG đoán bừa", { skip }, () => {
  const [links] = call("_links_of_creative", [{ url_tags: "utm_source=abc&utm_medium=def" }]);
  assert.deepEqual(links, []);
});

test("chi tiêu KHÔNG đọc được link thì KHÔNG vào bảng chi phí sản phẩm", { skip }, () => {
  /* Chủ dự án chốt 22/08/2026. Trước đây gom vào rổ "(không đọc được link)" và vẫn
     tính — mà giao diện xếp mọi thứ không bắt đầu bằng "Noma" vào Doscom, nên 44,8tr
     của Phương Nam (30% cột chi phí Doscom kỳ 01→21/08) rơi nhầm chỗ. */
  const src = readFileSync(SCRIPT, "utf8");
  assert.ok(!/prod\s*=\s*NO_LINK_BUCKET/.test(src),
    "luật cũ quay lại: campaign không link lại được gán thành một 'sản phẩm'");
  assert.match(src, /ad_spend_excluded/,
    "tiền không quy được vẫn phải giữ ở ad_spend_excluded để đối chiếu Ads Manager");
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

test("chi phí không đọc được link vẫn phải ĐẾM ĐƯỢC ở nơi khác, không bốc hơi", { skip }, () => {
  /* Luật ĐỔI 22/08/2026: chi tiêu không đọc được link KHÔNG còn vào bảng chi phí sản
     phẩm (trước đây gom vào rổ "(không đọc được link)" rồi bị giao diện xếp nhầm hết
     sang Doscom — 44,8tr của Phương Nam kỳ 01→21/08).

     NHƯNG tiền đó vẫn tiêu thật. Nó phải nằm ở `ad_spend_excluded` để còn đối chiếu
     với Trình quản lý quảng cáo — bỏ hẳn thì tổng chi trên dashboard thấp hơn thực tế
     mà không ai giải thích được vì sao. Test này canh đúng chỗ đó. */
  const src = readFileSync(SCRIPT, "utf8");
  assert.match(src, /data\["ad_spend_excluded"\] = excluded/, "mất rổ chi phí bị loại");
  assert.match(src, /bucket = excluded\[staff\]/, "chi phí không gán được SP phải chảy vào rổ excluded");
  assert.ok(!/prod = NO_LINK_BUCKET/.test(src),
    "luật cũ quay lại: campaign không link lại được tính như một sản phẩm");
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
