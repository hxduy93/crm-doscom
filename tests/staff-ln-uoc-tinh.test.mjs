import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* YÊU CẦU 24/09/2026 (chủ dự án): bảng "Chi phí & doanh thu theo nhân sự" thêm cột
   "Lợi nhuận ước tính với tỉ lệ hoàn tháng trước".

   VÌ SAO CẦN. Đơn của tháng đang xem chưa đi hết vòng hoàn — đo trên snapshot thật:
   tỉ lệ hoàn tháng 9 mới 6,5% (Duy) trong khi tháng 8 đã chốt ở 18,1%. Nên cột
   "LN sau hoàn" của kỳ đang chạy luôn lạc quan hơn sự thật. Cột mới áp tỉ lệ hoàn ĐÃ
   CHỐT của tháng trước để ước tính lãi khi hoàn ngấm đủ. */

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

// Lấy nguyên hàm trong HTML ra để CHẠY THẬT, không chỉ so chuỗi.
// Đếm ngoặc nhọn để cắt đúng thân hàm — hàm một dòng (sumByMonth) không có "\n  }".
function layHam(ten) {
  const i = html.indexOf(`function ${ten}(`);
  assert.ok(i > 0, `không tìm thấy hàm ${ten}()`);
  const mo = html.indexOf("{", i);
  let sau = 0;
  for (let k = mo; k < html.length; k++) {
    if (html[k] === "{") sau++;
    else if (html[k] === "}" && --sau === 0) return html.slice(i, k + 1);
  }
  throw new Error(`không cắt được thân hàm ${ten}()`);
}

test("thangTruoc() neo vào ngày BẮT ĐẦU của khoảng lọc", () => {
  const f = new Function("range", layHam("thangTruoc") + " return thangTruoc();");
  assert.equal(f({ start: "2026-09-01", end: "2026-09-24" }), "2026-08");
  // Khoảng vắt qua hai tháng: neo vào ngày kết thúc sẽ lấy nhầm chính tháng đang xem.
  assert.equal(f({ start: "2026-08-15", end: "2026-09-15" }), "2026-07");
});

test("thangTruoc() lùi đúng năm khi đang ở tháng 1", () => {
  const f = new Function("range", layHam("thangTruoc") + " return thangTruoc();");
  assert.equal(f({ start: "2026-01-05", end: "2026-01-31" }), "2025-12");
});

test("nhãn cột hiện đúng tháng đang lấy làm cơ sở", () => {
  const f = new Function("range", layHam("thangTruoc") + layHam("nhanThangTruoc") + " return nhanThangTruoc();");
  assert.equal(f({ start: "2026-09-01", end: "2026-09-24" }), "T8/2026");
  assert.equal(f({ start: "2026-01-01", end: "2026-01-31" }), "T12/2025");
  assert.match(html, /thU\.textContent='LN ước tính \(hoàn '\+nhanThangTruoc\(\)\+'\)'/);
});

test("sumByMonth() cộng theo tháng, KHÔNG dính khoảng ngày đang lọc", () => {
  const g = new Function(layHam("sumByMonth") + " return sumByMonth;")();
  const bd = { "2026-08-01": 10, "2026-08-31": 5, "2026-09-01": 100 };
  assert.equal(g(bd, "2026-08"), 15);
  assert.equal(g(bd, "2026-09"), 100);
  assert.equal(g(null, "2026-08"), 0);
});

test("công thức: chỉ doanh thu và giá vốn co lại, CHI PHÍ QC thì không", () => {
  // Tiền quảng cáo đã tiêu thì không lấy lại được khi khách trả hàng — nhân nó với
  // (1−r) là tự thổi lãi lên.
  assert.match(html, /var lnU=rPrev===null\?null:\(\(rv-cg\)\*\(1-rPrev\)-sp\);/);
});

test("hàng Tổng cộng ước tính TỪNG nhóm, không áp một tỉ lệ bình quân", () => {
  // T8/2026 đo được: Duy 18,1% · Phương Nam 19,8% · Website/Hotline 10,0% ·
  // Page Facebook 26,7%. Áp tỉ lệ bình quân lên tổng sẽ sai ở cả hai đầu.
  const khoi = html.slice(html.indexOf("var tLnU=0"), html.indexOf("rows+='<tr class=\"tot\">"));
  assert.match(khoi, /STAFF_GROUPS\.forEach/);
  assert.match(khoi, /tLnU\+=\(rv2-cg2\)\*\(1-r\)-staffSpend/);
});

test("tháng trước không có doanh thu thì để trống, KHÔNG coi là hoàn 0%", () => {
  assert.match(html, /return tong>0 \? hoan\/tong : null;/);
  assert.match(html, /if\(lnU===null\) return[\s\S]{0,160}không có doanh thu ở nguồn này/);
});

test("dùng đúng định nghĩa hoàn của dashboard: đang hoàn + đã hoàn, đơn huỷ không tính", () => {
  const khoi = layHam("retRatePrev");
  assert.match(khoi, /if\(EXCL_RET\[st\]\) hoan\+=v;/);
  assert.doesNotMatch(khoi, /canceled/, "đơn huỷ không phải hoàn — cùng gốc với mọi bảng khác");
});

test("tooltip viết hẳn phép tính để kiểm bằng tay", () => {
  const khoi = html.slice(html.indexOf("var lnUocCell"), html.indexOf("var rows=STAFF_GROUPS"));
  assert.match(khoi, /Hoàn '\+nhanThangTruoc\(\)\+' = '\+pc\+'%/);
  assert.match(khoi, /\(DT '\+vnd\(rv\)/);
  assert.match(khoi, /CP '\+vnd\(sp\)/);
});

/* ── Kiểm trên dữ liệu thật: lý do cột này tồn tại ───────────────────────── */
const rev = JSON.parse(readFileSync(new URL("../data/product-revenue.json", import.meta.url), "utf8"));
const NHOM = {
  Duy: ["DUY"],
  "Phương Nam": ["PHUONG_NAM"],
  "Website / Hotline": ["WEBSITE", "ZALO_OA", "HOTLINE"],
  "Page Facebook": ["FB_PAGE"],
};
const HOAN = new Set(["returning", "returned"]);

function tiLeHoan(keys, ym) {
  let tong = 0, hoan = 0;
  for (const k of keys) {
    const g = (rev.source_groups || {})[k];
    if (!g) continue;
    const r = g.order_revenue_by_status_by_date || {};
    for (const st of Object.keys(r)) {
      let v = 0;
      for (const d of Object.keys(r[st] || {})) if (d.slice(0, 7) === ym) v += Number(r[st][d]) || 0;
      tong += v;
      if (HOAN.has(st)) hoan += v;
    }
  }
  return tong > 0 ? hoan / tong : null;
}

test("tỉ lệ hoàn tháng 9 THẤP HƠN tháng 8 ở mọi nhóm — đúng lý do cần cột ước tính", () => {
  for (const [ten, keys] of Object.entries(NHOM)) {
    const t8 = tiLeHoan(keys, "2026-08");
    const t9 = tiLeHoan(keys, "2026-09");
    assert.ok(t8 !== null && t9 !== null, `${ten}: thiếu dữ liệu một trong hai tháng`);
    assert.ok(t9 < t8,
      `${ten}: hoàn T9 ${(t9 * 100).toFixed(1)}% không thấp hơn T8 ${(t8 * 100).toFixed(1)}% — ` +
      `nếu số này đảo chiều thì tiền đề "đơn tháng này chưa hoàn xong" cần xem lại`);
  }
});

test("tỉ lệ hoàn T8/2026 nằm trong khoảng đã đo, không lệch bất thường", () => {
  const moc = { Duy: 0.181, "Phương Nam": 0.198, "Website / Hotline": 0.100, "Page Facebook": 0.267 };
  for (const [ten, keys] of Object.entries(NHOM)) {
    const r = tiLeHoan(keys, "2026-08");
    assert.ok(Math.abs(r - moc[ten]) < 0.01,
      `${ten}: hoàn T8 = ${(r * 100).toFixed(1)}%, đo ngày 24/09 là ${(moc[ten] * 100).toFixed(1)}%`);
  }
});
