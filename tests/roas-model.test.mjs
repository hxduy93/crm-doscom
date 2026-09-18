import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  skuTrongGoi, skuCuaQua, giaVonMoiDon, tinhTaiRoas, soLieuSanPham,
} from "../functions/lib/roas-model.js";

// Công cụ "ROAS mục tiêu" (18/09/2026). Canh đúng ba chỗ từng tính sai trong lúc dựng:
//   1. giá vốn phải là CẢ ĐƠN (gồm chai của gói ghép + chai tặng), không chỉ chai cùng mã;
//   2. chỉ đơn GIAO ĐƯỢC mới mất hàng;
//   3. CPQC = AOV ÷ ROAS, và ROAS là con số Meta hiển thị (đã kiểm: không đếm trùng).

test("tách mã SKU trong gói landing", () => {
  assert.deepEqual(skuTrongGoi("le-230"), ["230"]);
  assert.deepEqual(skuTrongGoi("combo-2x230"), ["230", "230"]);
  assert.deepEqual(skuTrongGoi("combo-3x911"), ["911", "911", "911"]);
  assert.deepEqual(skuTrongGoi("combo-230-911"), ["230", "911"]);
  assert.deepEqual(skuTrongGoi("combo-911-922-310"), ["911", "922", "310"]);
  assert.deepEqual(skuTrongGoi(""), []);
});

test("mã quà: chai NOMA ra số, khăn và '(không quà)' thì không", () => {
  assert.equal(skuCuaQua("noma230"), "230");
  assert.equal(skuCuaQua("noma-680"), "680");
  assert.equal(skuCuaQua("khan-microfiber"), null);
  assert.equal(skuCuaQua("(không quà)"), null);
});

test("giá vốn mỗi đơn gồm chai gói ghép và chai tặng", () => {
  const VON = { "230": 18751, "911": 43129, "680": 18751 };
  const r = giaVonMoiDon(
    [{ combo: "le-230", orders: 2, revenue: 198000 },
     { combo: "combo-230-911", orders: 1, revenue: 318000 }],
    [{ gift: "(không quà)", orders: 2 }, { gift: "noma680", orders: 1 }],
    VON,
  );
  // hàng bán: 2 chai 230 + (1 chai 230 + 1 chai 911)
  assert.equal(r.hang, 3 * 18751 + 43129);
  assert.equal(r.qua, 18751, "chai 680 tặng vẫn mất giá vốn");
  assert.equal(r.donHang, 3);
  assert.equal(Math.round(r.moiDon), Math.round((3 * 18751 + 43129 + 18751) / 3));
  assert.deepEqual(r.skuThieuGia, []);
});

test("thiếu giá vốn một SKU thì báo ra, không âm thầm tính bằng 0", () => {
  const r = giaVonMoiDon([{ combo: "combo-230-955", orders: 1, revenue: 300000 }], [], { "230": 18751 });
  assert.deepEqual(r.skuThieuGia, ["955"]);
});

test("khăn microfiber tính theo giá nhập truyền vào", () => {
  const a = giaVonMoiDon([{ combo: "le-230", orders: 10, revenue: 990000 }], [{ gift: "khan-microfiber", orders: 10 }], { "230": 18751 }, 0);
  const b = giaVonMoiDon([{ combo: "le-230", orders: 10, revenue: 990000 }], [{ gift: "khan-microfiber", orders: 10 }], { "230": 18751 }, 8000);
  assert.equal(a.qua, 0);
  assert.equal(b.qua, 80000);
  assert.equal(b.moiDon - a.moiDon, 8000);
});

test("CPQC = AOV ÷ ROAS, và chỉ đơn giao được mới mất giá vốn", () => {
  const t = tinhTaiRoas({ aov: 150000, von: 30000, giao: 0.9, roas: 2, ketQuaMoiDon: 1.2 });
  assert.equal(t.cpqc, 75000, "150.000 ÷ 2");
  assert.equal(t.thu, 135000);
  assert.equal(t.vonThuc, 27000, "30.000 × 90%");
  assert.equal(t.conLai, 135000 * 0.9 - 27000);
  assert.equal(Math.round(t.ln), Math.round(t.conLai - 75000));
  assert.equal(Math.round(t.costCap), Math.round(75000 / 1.2));
});

test("điểm hoà vốn là mức ROAS làm lãi bằng 0", () => {
  const p = { aov: 150000, von: 30000, giao: 0.9 };
  const hv = tinhTaiRoas({ ...p, roas: 2 }).hoaVon;
  const t = tinhTaiRoas({ ...p, roas: hv });
  assert.ok(Math.abs(t.ln) < 1e-6, "tại điểm hoà vốn lãi phải bằng 0");
  assert.ok(tinhTaiRoas({ ...p, roas: hv + 0.1 }).ln > 0);
  assert.ok(tinhTaiRoas({ ...p, roas: hv - 0.1 }).ln < 0);
});

test("phí khác đẩy điểm hoà vốn lên", () => {
  const p = { aov: 150000, von: 30000, giao: 0.9 };
  assert.ok(tinhTaiRoas({ ...p, phi: 15000, roas: 2 }).hoaVon > tinhTaiRoas({ ...p, roas: 2 }).hoaVon);
});

test("giá vốn mỗi đơn lấy từ ĐƠN PANCAKE, không suy từ landing", () => {
  const D = JSON.parse(readFileSync(new URL("../data/product-revenue.json", import.meta.url), "utf8"));
  const s = soLieuSanPham({ revenue: D }, { nguon: ["DUY - NOMA 230", "PHƯƠNG NAM - NOMA 230"], nhan: "Noma 230" },
    "2026-09-01", "2026-09-30");
  assert.ok(s.giaVon > 0, "phải đọc được cogs_by_status_by_date do fetch_pancake_revenue.py ghi");
  assert.ok(s.vonMoiDon > 10000 && s.vonMoiDon < s.aov, "giá vốn mỗi đơn phải nhỏ hơn AOV");
  assert.ok(s.tyLeVon > 0.05 && s.tyLeVon < 0.6, "tỉ lệ giá vốn trên doanh thu nằm trong khoảng hợp lý");
});

test("rút số liệu sản phẩm từ dashboard-data thật", () => {
  const D = JSON.parse(readFileSync(new URL("../data/dashboard-data.json", import.meta.url), "utf8"));
  const s = soLieuSanPham(D, { nguon: ["DUY - NOMA 230", "PHƯƠNG NAM - NOMA 230"], nhan: "Noma 230" },
    "2026-09-01", "2026-09-30");
  assert.ok(s.donChot > 0, "phải đọc được đơn chốt của nguồn NOMA 230");
  assert.ok(s.aov > 50000 && s.aov < 500000, "AOV nằm trong khoảng hợp lý");
  assert.ok(s.giao > 0.5 && s.giao <= 1, "tỉ lệ giao phải trong 50-100%");
  assert.ok(s.chiPhi > 0, "phải đọc được chi phí quảng cáo Noma 230");
  assert.ok(Math.abs(s.roasHienTai - s.doanhThu / s.chiPhi) < 1e-9);
});

test("tách lẻ/combo: cộng lại phải bằng tổng, tỉ lệ combo đúng", () => {
  const D = JSON.parse(readFileSync(new URL("../data/product-revenue.json", import.meta.url), "utf8"));
  const s = soLieuSanPham({ revenue: D }, { nguon: ["DUY - NOMA 230", "PHƯƠNG NAM - NOMA 230"], nhan: "Noma 230" },
    "2026-09-01", "2026-09-30");
  const don = s.mix.le.don + s.mix.combo.don;
  assert.equal(don, s.donChot, "đơn lẻ + đơn combo phải bằng tổng đơn chốt");
  assert.ok(Math.abs(s.mix.le.doanhThu + s.mix.combo.doanhThu - s.doanhThu) < 1, "doanh thu hai nhánh phải cộng đủ");
  assert.ok(Math.abs(s.mix.le.giaVon + s.mix.combo.giaVon - s.giaVon) < 1, "giá vốn hai nhánh phải cộng đủ");
  assert.ok(s.mix.combo.aov > s.mix.le.aov, "đơn combo phải có AOV cao hơn đơn lẻ");
  assert.ok(s.tyLeCombo > 0 && s.tyLeCombo < 1);
  assert.ok(Math.abs(s.tyLeCombo - s.mix.combo.don / don) < 1e-9);
});

test("khoảng ngày lọc đúng, ngày ngoài kỳ không được cộng", () => {
  const D = {
    revenue: { source_groups: { DUY: { sources: { "DUY - X": {
      orders_by_date: { "2026-09-01": 2, "2026-10-01": 5 },
      revenue_by_status_by_date: { delivered: { "2026-09-01": 200000, "2026-10-01": 999 } },
      cogs_by_status_by_date: { delivered: { "2026-09-01": 40000, "2026-10-01": 777 }, canceled: { "2026-09-01": 12345 } },
      cogs_missing_lines: 3,
      mix: {
        le: { orders_by_date: { "2026-09-01": 1 }, revenue_by_status_by_date: { delivered: { "2026-09-01": 80000 } },
              cogs_by_status_by_date: { delivered: { "2026-09-01": 15000 } } },
        combo: { orders_by_date: { "2026-09-01": 1 }, revenue_by_status_by_date: { delivered: { "2026-09-01": 120000 } },
                 cogs_by_status_by_date: { delivered: { "2026-09-01": 25000 } } },
      },
    } } } } },
    ad_spend_by_staff: { DUY: { X: { by_date: { "2026-09-01": 50000, "2026-10-01": 777 } } } },
    campaigns: [{ cpqc_product: "X", market: "vn", daily: [{ date: "2026-09-01", registrations: 3 }, { date: "2026-10-01", registrations: 9 }] }],
  };
  const s = soLieuSanPham(D, { nguon: ["DUY - X"], nhan: "X" }, "2026-09-01", "2026-09-30");
  assert.equal(s.donChot, 2);
  assert.equal(s.doanhThu, 200000);
  assert.equal(s.chiPhi, 50000);
  assert.equal(s.ketQua, 3);
  assert.equal(s.aov, 100000);
  assert.equal(s.roasHienTai, 4);
  assert.equal(s.giaVon, 40000, "đơn huỷ không tính giá vốn, ngày ngoài kỳ không cộng");
  assert.equal(s.vonMoiDon, 20000);
  assert.equal(s.thieuGiaDong, 3);
  assert.equal(s.tyLeCombo, 0.5);
  assert.equal(s.mix.le.aov, 80000);
  assert.equal(s.mix.combo.vonMoiDon, 25000);
});
