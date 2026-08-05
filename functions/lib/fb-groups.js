// Nhóm chạy TEST / SCALE cho quảng cáo Facebook.
//
// QUYẾT 2026-08-05 (chủ dự án): mỗi sản phẩm có ĐÚNG hai "hộp" sống lâu dài —
//   "<sản phẩm> - TEST"  : ngân sách nhỏ, tối đa 4 creative, luân chuyển liên tục
//   "<sản phẩm> - SCALE" : ngân sách lớn, chỉ chứa creative đã thắng
// Trước đó mỗi lần chạy tự động lại đẻ 1 campaign + 1 ad set mới → tài khoản Noma
// Việt Nam có ~19 ad set cùng tệp, mỗi cái ~7 chuyển đổi/tuần nên KHÔNG cái nào
// thoát nổi giai đoạn máy học (Meta cần ~50/tuần). Tên campaign/ad set vì vậy phải
// CỐ ĐỊNH (không kèm ngày) để lần chạy sau tìm lại được đúng hộp cũ.
//
// Ngày/tháng + tên KOC vẫn nằm ở TÊN AD (xem ads-creator.html) — đó mới là thứ
// thay đổi theo từng video.

export const GROUPS = ["TEST", "SCALE"];
export const MAX_TEST_ADS = 4;   // trần creative sống cùng lúc trong 1 ad set TEST

// Tên hộp. Sản phẩm giữ nguyên chữ người dùng nhập, chỉ gọn khoảng trắng.
export function groupName(product, group) {
  const p = String(product || "").trim().replace(/\s+/g, " ");
  const g = String(group || "").trim().toUpperCase();
  if (!p) throw new Error("thiếu tên sản phẩm");
  if (!GROUPS.includes(g)) throw new Error(`nhóm phải là TEST hoặc SCALE (nhận "${group}")`);
  return `${p} - ${g}`;
}

// Tách ngược tên campaign/ad set → { product, group }. Không khớp thì trả null
// (campaign cũ đặt tên kiểu "5/8 - NOMA 680 - quangteo" sẽ rơi vào đây, cố ý).
export function parseGroupName(name) {
  const m = String(name || "").trim().match(/^(.*\S)\s+-\s+(TEST|SCALE)$/i);
  if (!m) return null;
  return { product: m[1].replace(/\s+/g, " "), group: m[2].toUpperCase() };
}

// Số kết quả (lượt hoàn tất đăng ký) từ mảng actions của Insights API.
// Meta trả cùng một sự kiện dưới nhiều tên; ưu tiên tên pixel offsite, không cộng
// dồn để tránh đếm đôi.
export function demKetQua(actions, eventKeys) {
  const keys = eventKeys && eventKeys.length
    ? eventKeys
    : ["offsite_conversion.fb_pixel_complete_registration", "complete_registration",
       "offsite_conversion.fb_pixel_lead", "lead"];
  const map = {};
  for (const a of actions || []) map[a.action_type] = Number(a.value) || 0;
  for (const k of keys) if (map[k] != null) return map[k];
  return 0;
}

// Số ngày ad đã chạy (theo giờ VN, làm tròn xuống, tối thiểu 0).
export function soNgayChay(createdTime, now) {
  const t = Date.parse(createdTime || "");
  if (!Number.isFinite(t)) return 0;
  const ms = (Number.isFinite(now) ? now : Date.now()) - t;
  return Math.max(0, Math.floor(ms / 86400000));
}

/**
 * Chấm điểm một creative trong nhóm TEST theo đúng ngưỡng đã chốt:
 *  · Chưa chạy đủ 3 ngày HOẶC chưa tiêu đủ 3 × CPL mục tiêu → CHƯA ĐỌC ĐƯỢC.
 *  · Tiêu ≥ 3 × CPL mục tiêu mà 0 kết quả → TẮT.
 *  · CPL ≤ CPL mục tiêu và có ≥ 5 kết quả → BÊ SANG SCALE.
 *  · CPL > 1,5 × mục tiêu và đã tiêu ≥ 5 × mục tiêu → TẮT.
 *  · Còn lại → THEO DÕI THÊM.
 * Không có CPL mục tiêu (chưa có ad set SCALE để so) thì KHÔNG phán bừa.
 */
export function chamDiem(ad, opts = {}) {
  const cplMuc = Number(opts.target_cpl) || 0;
  const minNgay = opts.min_days == null ? 3 : Number(opts.min_days);
  const minKq = opts.min_results == null ? 5 : Number(opts.min_results);
  const spend = Number(ad.spend) || 0;
  const kq = Number(ad.results) || 0;
  const ngay = Number(ad.days) || 0;
  const cpl = kq > 0 ? spend / kq : null;

  if (!cplMuc) return { verdict: "wait", ly_do: "chưa có CPL chuẩn từ nhóm SCALE để so — nhập CPL mục tiêu" };
  if (ngay < minNgay) return { verdict: "wait", ly_do: `mới chạy ${ngay} ngày, chờ đủ ${minNgay} ngày` };
  if (spend < 3 * cplMuc) {
    return { verdict: "wait", ly_do: `mới tiêu ${Math.round(spend).toLocaleString("vi-VN")}đ, chờ đủ ${Math.round(3 * cplMuc).toLocaleString("vi-VN")}đ (3× CPL mục tiêu)` };
  }
  if (kq === 0) return { verdict: "kill", ly_do: `tiêu ${Math.round(spend).toLocaleString("vi-VN")}đ mà 0 kết quả` };
  if (cpl <= cplMuc && kq >= minKq) {
    return { verdict: "promote", ly_do: `CPL ${Math.round(cpl).toLocaleString("vi-VN")}đ ≤ mục tiêu, ${kq} kết quả` };
  }
  if (cpl > 1.5 * cplMuc && spend >= 5 * cplMuc) {
    return { verdict: "kill", ly_do: `CPL ${Math.round(cpl).toLocaleString("vi-VN")}đ cao hơn 50% so với mục tiêu` };
  }
  if (cpl <= cplMuc && kq < minKq) {
    return { verdict: "watch", ly_do: `CPL tốt nhưng mới ${kq}/${minKq} kết quả — chưa đủ để chắc` };
  }
  return { verdict: "watch", ly_do: `CPL ${Math.round(cpl).toLocaleString("vi-VN")}đ, cho chạy thêm 2–3 ngày` };
}

// Ad cũ nhất trong danh sách (để nhường chỗ khi ad set TEST đã đủ 4 creative).
// Chỉ xét ad đang bật; ad tắt rồi thì không chiếm chỗ.
export function adCuNhat(ads) {
  const song = (ads || []).filter(a => a && a.dang_chay !== false);
  if (!song.length) return null;
  return song.slice().sort((a, b) => Date.parse(a.created_time || 0) - Date.parse(b.created_time || 0))[0];
}

// Còn chỗ cho bao nhiêu creative mới, và phải tắt bớt mấy cái.
export function tinhChoTrong(soAdDangChay, soVideoMoi, tran = MAX_TEST_ADS) {
  const dangChay = Math.max(0, Number(soAdDangChay) || 0);
  const moi = Math.max(0, Number(soVideoMoi) || 0);
  const canTat = Math.max(0, dangChay + moi - tran);
  return { can_tat: Math.min(canTat, dangChay), con_cho: Math.max(0, tran - dangChay) };
}
