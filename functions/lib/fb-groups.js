// Nhóm chạy TEST / SCALE cho quảng cáo Facebook.
//
// QUYẾT 2026-08-05 (chủ dự án): mỗi sản phẩm có ĐÚNG hai "hộp" sống lâu dài —
//   "<sản phẩm> - TEST"  : ngân sách nhỏ, creative luân chuyển liên tục
//   "<sản phẩm> - SCALE" : ngân sách lớn, chỉ chứa creative đã thắng
// Trước đó mỗi lần chạy tự động lại đẻ 1 campaign + 1 ad set mới → tài khoản Noma
// Việt Nam có ~19 ad set cùng tệp, mỗi cái ~7 chuyển đổi/tuần nên KHÔNG cái nào
// thoát nổi giai đoạn máy học (Meta cần ~50/tuần). Tên campaign/ad set vì vậy phải
// CỐ ĐỊNH (không kèm ngày) để lần chạy sau tìm lại được đúng hộp cũ.
//
// ⚠ 05/10/2026: luật tên cố định ở trên ĐÃ THAY bằng cấu trúc "ngày/tháng - SP - camp"
// (xem spNgan()/tenCampaign() bên dưới). Hai hộp TEST/SCALE vẫn còn, chỉ đổi cách đặt tên.

export const GROUPS = ["TEST", "SCALE"];

// 23/09/2026 — ĐÃ BỎ trần MAX_TEST_ADS = 4 cùng hai hàm adCuNhat()/tinhChoTrong().
// Luồng tự động từng tự TẮT ad cũ nhất để giữ hộp TEST ở 4 creative. Luật đó xét TUỔI
// chứ không xét HIỆU QUẢ nên tắt nhầm cả creative đang thắng, trong khi chamDiem() ngay
// dưới đây đã biết chấm đúng nhưng chỉ được dùng để tô màu bảng. Chủ dự án quyết bỏ hẳn:
// số creative mỗi nhóm do người chạy tự quyết bên Trình quản lý QC.

// ── CẤU TRÚC TÊN MỚI (chủ dự án chốt 05/10/2026) ──────────────────────────────
//   Campaign + nhóm QC : "<ngày/tháng> - <sản phẩm> - <camp số mấy>"   vd "5/10 - Noma911 - 3 creative test"
//   Quảng cáo          : "<ngày/tháng> - <sản phẩm> - KOC <tên KOC>"   vd "5/10 - Noma911 - KOC chongsally"
// Thay cho tên hộp cố định "<SP> - TEST/SCALE" của QUYẾT 05/08/2026. Hộp vẫn được neo
// theo ID trong sổ D1 `ad_boxes`, nên tên kèm ngày không làm lạc hộp nữa.
// TEST hay SCALE đọc từ phần cuối tên campaign: có chữ "scale" → SCALE, còn lại → TEST.

// Mã sản phẩm ngắn dùng trong tên: "NOMA 880 · Phu Tinh The…" → "Noma880", "noma911" →
// "Noma911", "Máy dò D2 Pro" → "D2Pro". Cũng là KHOÁ so sản phẩm giữa hàng đợi TikTok,
// tên campaign mới và tên hộp kiểu cũ — ads-creator.html giữ một bản sao y hệt
// (tests/fb-groups.test.mjs canh hai bản cho ra cùng kết quả).
export function spNgan(product) {
  const s = String(product || "").trim();
  if (!s) return "";
  const noma = s.match(/noma\s*[-_]?\s*(\d{3})/i);
  if (noma) return "Noma" + noma[1];
  const dos = s.match(/(?:^|[^a-z0-9])(d[a-z]?\d+(?:\.\d+)?)((?:\s*(?:pro|plus|max|mini))*)(?![a-z0-9])/i);
  if (dos) {
    const duoi = (dos[2].match(/pro|plus|max|mini/gi) || [])
      .map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join("");
    return dos[1].toUpperCase() + duoi;
  }
  return s.split(/\s*·\s*/)[0].replace(/\s+/g, " ").trim();
}

// "d/m" theo giờ Việt Nam.
export function ngayThang(now = Date.now()) {
  const d = new Date(now + 7 * 3600 * 1000);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

// Phần cuối tên campaign phải nói được nó là TEST hay SCALE, vì đó là thứ duy nhất
// parseGroupName() dựa vào. Thiếu chữ của nhóm thì gắn thêm vào cuối.
export function nhanCamp(label, group) {
  const g = String(group || "TEST").trim().toLowerCase();
  let l = String(label || "").trim().replace(/\s+/g, " ");
  if (!l) return g;
  const coScale = /scale/i.test(l);
  if (g === "scale" && !coScale) l += " scale";
  if (g === "test" && coScale) l = l.replace(/scale/gi, "").trim() + " test";
  return l;
}

export function tenCampaign(dm, product, label, group) {
  const sp = spNgan(product);
  if (!sp) throw new Error("thiếu tên sản phẩm");
  return `${dm} - ${sp} - ${nhanCamp(label, group)}`;
}

export function tenAd(dm, product, koc) {
  return `${dm} - ${spNgan(product)} - KOC ${String(koc || "").trim() || "NA"}`;
}

// Mã sản phẩm CHẮC CHẮN có trong tên (NOMA ### hoặc mã Doscom D1/DR1/DA8.1…); null nếu không
// có. Khác spNgan(): KHÔNG lùi về "chữ đầu tên", vì tên như "Chương trình đại lý" không
// được biến thành một sản phẩm.
export function maSP(name) {
  const s = String(name || "");
  if (/noma\s*[-_]?\s*\d{3}/i.test(s)) return spNgan(s);
  if (/(?:^|[^a-z0-9])d[a-z]?\d+(?:\.\d+)?(?![0-9])/i.test(s)) return spNgan(s);
  return null;
}

// Tách ngược tên campaign → { product (mã ngắn), group }. Nhận:
//   mới : "5/10 - Noma911 - 3 creative test"      (có "scale" → SCALE, còn lại TEST)
//   cũ  : "NOMA 911 · Co Qua Tang - TEST"          (hộp cố định trước 05/10/2026)
//   lệch khuôn nhưng có mã SP: "2/10-Noma350-PhươngNam-…", "Doscom-14/9-Noma911-…",
//         "17/5 - D1 Thái Lan" — campaign ĐANG CHẠY của cả hai nhân sự đặt tên đủ kiểu
//         (đo 05/10/2026: 9/9 campaign đang chạy của Phương Nam không khớp khuôn cứng).
// Tên không có mã sản phẩm ("Chương trình đại lý") → null, không vào bảng.
export function parseGroupName(name) {
  const t = String(name || "").trim();
  if (!t) return null;
  const cu = t.match(/^(.*\S)\s+-\s+(TEST|SCALE)$/i);
  if (cu && !/^\d{1,2}\/\d{1,2}\s*-/.test(t)) {
    const sp = spNgan(cu[1]);
    return sp ? { product: sp, group: cu[2].toUpperCase() } : null;
  }
  const sp = maSP(t);
  return sp ? { product: sp, group: /scale/i.test(t) ? "SCALE" : "TEST" } : null;
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

