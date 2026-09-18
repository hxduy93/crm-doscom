/* Mô hình ROAS mục tiêu → chi phí quảng cáo → lợi nhuận, cho các landing NOMA.
 *
 * MỘT THANG ROAS DUY NHẤT: con số hiển thị trong Trình quản lý quảng cáo.
 * Đo 18/09/2026: Meta ghi 356 kết quả / 46,8tr giá trị cho NOMA 230 trong khi landing
 * nhận 368 đơn / 48,5tr → lệch 3-4%, KHÔNG đếm trùng (landing gửi cùng `event_id` cho
 * pixel trình duyệt và Conversions API). Nên số trong trình quản lý dùng thẳng được.
 * ⚠ Khi đọc `actions`/`action_values` của Graph API, Meta lặp CÙNG một sự kiện dưới nhiều
 * nhãn (`complete_registration`, `offsite_conversion.fb_pixel_complete_registration`,
 * `omni_complete_registration`…). Cộng nhiều nhãn là ROAS phồng gấp đôi.
 *
 * Mọi con số tính trên MỘT ĐƠN CHỐT trên Pancake:
 *   AOV   = doanh thu nguồn đơn ÷ số đơn chốt (không tính đơn huỷ)
 *   vốn   = giá vốn CẢ ĐƠN: mọi chai trong đơn (gồm gói ghép) + chai tặng
 *   giao  = tỉ lệ giao thành công theo tiền, trên các đơn đã chốt xong
 *   CPQC  = AOV ÷ ROAS
 *   LN    = AOV×giao − VAT − vốn×giao − phí khác − CPQC
 */

export const VAT_MAC_DINH = 0.10;

/** Mã gói trên landing → danh sách mã SKU trong gói. 'combo-230-911' → ['230','911']. */
export function skuTrongGoi(comboCode) {
  const c = String(comboCode || "").toLowerCase();
  let m = c.match(/^le-(\d{3})$/);
  if (m) return [m[1]];
  m = c.match(/^combo-(\d)x(\d{3})$/);
  if (m) return Array(Number(m[1])).fill(m[2]);
  const so = c.match(/\d{3}/g);
  return so ? so : [];
}

/** Mã quà trên landing → mã SKU. 'noma230' → '230'. Khăn/quà không phải chai → null. */
export function skuCuaQua(giftCode) {
  const g = String(giftCode || "").toLowerCase();
  const m = g.match(/^noma[- ]?(\d{3})$/);
  return m ? m[1] : null;
}

/**
 * Giá vốn trung bình mỗi đơn của một landing, suy từ chi tiết gói mua thật.
 * by_combo/by_gift lấy từ /api/noma<XXX>/stats; giaVon là { '230': 18751, ... }.
 * Trả thêm phần tách riêng của quà để còn nhìn thấy quà tốn bao nhiêu.
 */
export function giaVonMoiDon(by_combo, by_gift, giaVon, giaKhan = 0) {
  let hang = 0, qua = 0, donHang = 0, doanhThu = 0, donQua = 0, thieu = new Set();
  for (const c of by_combo || []) {
    const n = Number(c.orders) || 0;
    donHang += n;
    doanhThu += Number(c.revenue) || 0;
    for (const sku of skuTrongGoi(c.combo)) {
      const v = giaVon[sku];
      if (v == null) { thieu.add(sku); continue; }
      hang += n * v;
    }
  }
  for (const g of by_gift || []) {
    const n = Number(g.orders) || 0;
    const code = String(g.gift || "");
    if (/khan/i.test(code)) { qua += n * giaKhan; donQua += n; continue; }
    const sku = skuCuaQua(code);
    if (!sku) continue;                       // '(không quà)' và mọi quà không phải chai
    const v = giaVon[sku];
    if (v == null) { thieu.add(sku); continue; }
    qua += n * v;
    donQua += n;
  }
  const tong = hang + qua;
  return {
    hang, qua, tong, donHang, donQua, doanhThu,
    moiDon: donHang ? tong / donHang : 0,
    quaMoiDon: donHang ? qua / donHang : 0,
    tyLeTrenDoanhThu: doanhThu ? tong / doanhThu : 0,
    skuThieuGia: [...thieu],
  };
}

/** Lãi lỗ mỗi đơn chốt tại một mức ROAS mục tiêu. */
export function tinhTaiRoas({ aov, von, giao, phi = 0, vat = VAT_MAC_DINH, roas, ketQuaMoiDon = 1 }) {
  const thu = aov * giao;
  const vonThuc = von * giao;                 // đơn không giao thì hàng còn trong kho
  const conLai = thu * (1 - vat) - vonThuc - phi;
  const cpqc = roas > 0 ? aov / roas : Infinity;
  const ln = conLai - cpqc;
  return {
    thu, vonThuc, conLai,
    hoaVon: conLai > 0 ? aov / conLai : Infinity,
    cpqc,
    costCap: ketQuaMoiDon > 0 ? cpqc / ketQuaMoiDon : cpqc,
    ln,
    lnMoiTrieu: cpqc > 0 ? (ln / cpqc) * 1e6 : 0,
    bien: thu > 0 ? (ln / thu) * 100 : 0,
  };
}

const trongKy = (obj, from, to) => {
  let t = 0;
  for (const d in obj || {}) if (d >= from && d <= to) t += Number(obj[d]) || 0;
  return t;
};

/**
 * Rút mọi tham số của một sản phẩm từ dashboard-data.json.
 *   nguon: danh sách tên nguồn đơn Pancake ("DUY - NOMA 230", …)
 *   nhan : nhãn sản phẩm trong ad_spend_by_staff ("Noma 230")
 */
export function soLieuSanPham(D, { nguon, nhan }, from, to) {
  let donChot = 0, dt = 0, dtGiao = 0, dtChotXong = 0, von = 0, thieuGia = 0;
  const sg = (D.revenue && D.revenue.source_groups) || {};
  for (const st of Object.keys(sg)) {
    for (const [ten, v] of Object.entries(sg[st].sources || {})) {
      if (!nguon.includes(ten)) continue;
      donChot += trongKy(v.orders_by_date, from, to);
      for (const [tt, bd] of Object.entries(v.revenue_by_status_by_date || {})) {
        const x = trongKy(bd, from, to);
        if (tt !== "canceled") dt += x;
        if (tt !== "other") dtChotXong += x;   // đơn đã kết thúc: giao / hoàn / huỷ
        if (tt === "delivered") dtGiao += x;
      }
      // GIÁ VỐN THẬT từng đơn Pancake (cộng mọi mặt hàng, combo đã bung, chai tặng tính cả).
      for (const [tt, bd] of Object.entries(v.cogs_by_status_by_date || {})) {
        if (tt !== "canceled") von += trongKy(bd, from, to);
      }
      thieuGia += Number(v.cogs_missing_lines) || 0;
    }
  }
  let chiPhi = 0;
  for (const st of Object.keys(D.ad_spend_by_staff || {})) {
    const b = D.ad_spend_by_staff[st][nhan];
    if (b) chiPhi += trongKy(b.by_date, from, to);
  }
  let ketQua = 0;
  for (const c of D.campaigns || []) {
    if (c.cpqc_product !== nhan || c.market === "th") continue;
    for (const d of c.daily || []) {
      if (d.date >= from && d.date <= to) ketQua += Number(d.registrations) || 0;
    }
  }
  return {
    donChot, doanhThu: dt, chiPhi, ketQua,
    giaVon: von,
    vonMoiDon: donChot ? von / donChot : 0,
    tyLeVon: dt ? von / dt : 0,
    thieuGiaDong: thieuGia,
    aov: donChot ? dt / donChot : 0,
    giao: dtChotXong ? dtGiao / dtChotXong : 0,
    roasHienTai: chiPhi ? dt / chiPhi : 0,
    ketQuaMoiDon: donChot ? ketQua / donChot : 1,
  };
}
