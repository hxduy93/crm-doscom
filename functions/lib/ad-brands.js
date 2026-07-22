// Định danh thương hiệu dùng cho chân bài quảng cáo.
//
// VÌ SAO TÁCH RA: trước đây footer bị ghi cứng "Công ty TNHH Doscom Holdings"
// trong SYSTEM_PROMPT nên MỌI bài đều ký tên Doscom — kể cả bài NOMA. Nhưng
// NOMA là thương hiệu riêng (NOMA Technologies LLC, vận hành bởi Công ty TNHH
// Noma Auto) theo Brand Core v3, ký tên Doscom là lệch định danh thương hiệu.
//
// Hotline và 2 địa chỉ dùng chung cho cả hai thương hiệu — chủ dự án xác nhận
// 2026-07-22. NOMA chưa có tổng đài riêng; khi nào có thì sửa ở đây.

const HOTLINE = "1900638597";
const DIA_CHI = [
  "📍 HN: 38B Triệu Việt Vương, Nguyễn Du, Hai Bà Trưng, Hà Nội",
  "📍 HCM: Số 22, Đường 12, KĐT City Land, Phường 10, Quận Gò Vấp, TP.HCM",
];
// Dấu ━ (U+2501) dài đúng 26 ký tự — giữ nguyên, đây là nhận diện chân bài.
const KE_NGANG = "━".repeat(26);

export const BRANDS = {
  DOSCOM: {
    key: "DOSCOM",
    company: "Công ty TNHH Doscom Holdings",
    site: "doscom.vn",
    // Được phép gắn "… của Doscom" vào tên sản phẩm trong bài.
    signature: "của Doscom",
  },
  NOMA: {
    key: "NOMA",
    company: "Công ty TNHH Noma Auto",
    site: "noma.vn",
    // NOMA là thương hiệu độc lập → KHÔNG gắn "của Doscom" vào tên sản phẩm.
    signature: null,
  },
};

export const DEFAULT_BRAND = "DOSCOM";

export function getBrand(key) {
  return BRANDS[String(key || DEFAULT_BRAND).toUpperCase()] || BRANDS[DEFAULT_BRAND];
}

// Khối chân bài cố định của 1 thương hiệu. AI phải chèn NGUYÊN VĂN, không sửa.
export function footerFor(brandKey) {
  const b = getBrand(brandKey);
  return [
    KE_NGANG,
    `🏢 ${b.company}`,
    `📞 Hotline: ${HOTLINE}`,
    `🌐 Website: ${b.site}`,
    ...DIA_CHI,
  ].join("\n");
}
