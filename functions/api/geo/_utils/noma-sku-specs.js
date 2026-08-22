// Thông số chuẩn 17 SKU NOMA — trích từ file "Thông tin sản phẩm 17 SKU" (nguồn duy nhất theo Brand Core v3).
//
// Mục đích: "neo" cho agent viết ĐÚNG hướng dẫn sử dụng (HDSD) + công dụng + thời gian, tránh
// lệch so với tài liệu chuẩn (đã phát hiện web tự rút gọn/sửa sai HDSD: 922 nói "5 phút" trong khi
// phải "đợi 4 tiếng"; 250 chà "dọc-ngang" trong khi phải "1 đường thẳng cùng hướng"; 692 xịt thẳng
// thay vì "xịt lên khăn cho trần xe").
//
// Dùng ở: products/generate.js (viết bài mới) + products/brandcore-scan.js (đối chiếu bài đã đăng).
// Cảnh báo an toàn theo GHS nằm ở noma-brandcore.js (NOMA_BRAND_GUIDE) — không lặp lại ở đây.
// Cập nhật tài liệu SKU: từ 22/08/2026 KHÔNG sửa tay ở đây nữa — tải file "Hồ sơ sản
// phẩm" lên trong trang "Sửa brandcore" (nút Nhập hồ sơ sản phẩm). File được đọc, tách
// cột rồi lưu vào KV `noma_sku_specs:v2`; agent đọc qua loadSkuSpecs(env) nên dùng được
// bản mới mà KHÔNG cần deploy lại.
// Bảng dưới đây giữ làm BẢN DỰ PHÒNG: KV trống/hỏng thì rơi về đây, thay vì chạy
// không có thông số (agent tự bịa HDSD là hỏng thật, đã từng xảy ra).

export const NOMA_SKU_SPECS = {
  "250": {
    name: "NOMA 250 — Dung dịch phục hồi nhựa nhám",
    cong_dung: ["Phục hồi nhựa nhám", "Tăng tính thẩm mỹ", "Chống tia UV", "Bảo vệ bề mặt", "Chống oxy hóa"],
    hdsd: ["Lắc kỹ chai", "Mở nắp, bóc seal", "Đổ dung dịch lên mặt đen pad chà", "Chà đều MỘT ĐƯỜNG THẲNG cùng một hướng", "Để khô 5-10 phút"],
    thoi_gian: "Hiệu quả ~90 ngày (tùy môi trường sử dụng)",
  },
  "310": {
    name: "NOMA 310 — Chai xịt chống hấp hơi (mờ) kính",
    cong_dung: ["Chống hấp hơi/mờ kính", "Ngăn hơi nước ngưng tụ", "Tăng tầm nhìn khi gặp ẩm"],
    hdsd: ["Mở nắp, bóc seal, lắp vòi xịt", "Lắc kỹ chai", "Xịt đều cách kính 15-20cm", "Lau bằng khăn microfiber theo chuyển động tròn", "Để khô 15-30 phút"],
    thoi_gian: "Hiệu quả >30 ngày (tùy môi trường, không lau lại)",
  },
  "620": {
    name: "NOMA 620 — Bộ phục hồi & làm mới đèn pha",
    cong_dung: ["Tẩy ố vàng, mờ đục đèn pha", "Phục hồi độ trong", "Phủ dưỡng bảo vệ sau xử lý"],
    hdsd: ["Lắc chai, xịt dung dịch tẩy ố lên đèn pha cách 15-20cm", "Chà đều bằng pad chuyển động tròn", "Rửa lại bằng nước sạch, lau khô", "Nhỏ dung dịch dưỡng, lau bằng pad xanh theo 1 chiều", "Để khô 5-10 phút"],
    thoi_gian: "Hiệu quả 3-6 tháng (tối đa 1 năm nếu bảo quản tốt)",
  },
  "692": {
    name: "NOMA 692 — Dung dịch làm sạch nội thất (da & nỉ)",
    cong_dung: ["Làm sạch ghế da, nỉ, trần xe", "Không để lại vệt loang", "Khử mùi ẩm mốc"],
    hdsd: ["Chuẩn bị khăn microfiber sạch khô, hút bụi sơ bề mặt", "Xịt dung dịch — KHUYẾN NGHỊ (đặc biệt cho trần xe): xịt lên KHĂN trước rồi lau; hoặc xịt trực tiếp cách 40cm", "Lau nhẹ theo vòng tròn hoặc 1 chiều; vết bẩn cứng đầu lặp lại", "Lau lại bằng khăn sạch"],
    thoi_gian: "Làm sạch tức thì; đa năng cho nỉ + da + trần xe",
  },
  "890": {
    name: "NOMA 890 — Dung dịch xịt phủ bóng, làm mới sơn",
    cong_dung: ["Xịt phủ bóng sơn xe", "Làm mới sơn", "Chống bám nước (hiệu ứng lá sen)", "Bảo vệ chống UV"],
    hdsd: ["Mở nắp, lắp vòi xịt, lắc đều", "Xịt cách bề mặt 15-20cm", "Dùng pad chà dàn đều", "Đợi 1 phút, lau bằng khăn microfiber", "Test bằng cách đổ nước - nếu vón cục là thành công"],
    thoi_gian: "Lớp phủ duy trì 1-2 tháng (tùy môi trường)",
  },
  "911": {
    name: "NOMA 911 — Dung dịch tẩy ố kính",
    cong_dung: ["Tẩy ố và màng dầu trên kính", "Khôi phục độ trong, tầm nhìn rõ", "Nên phủ NOMA 922 sau khi tẩy ố"],
    hdsd: ["Lắc đều", "Bóp dung dịch lên bề mặt kính", "Chà bằng pad theo chuyển động tròn", "Đợi 1-2 phút", "Rửa lại bằng nước sạch và lau khô"],
    thoi_gian: "Hiệu quả tức thì sau khi xử lý",
  },
  "922": {
    name: "NOMA 922 — Dung dịch phủ nano kính chống bám nước",
    cong_dung: ["Phủ nano chống bám nước (lá sen)", "Kháng bẩn & dầu mỡ", "Tăng độ trong, giảm chói đèn ban đêm", "Giảm ma sát cần gạt", "Ngăn ố khoáng"],
    hdsd: ["Lắc kỹ chai", "Bóp dung dịch vừa đủ lên kính", "Chà bằng pad chuyển động tròn nhỏ", "ĐỢI TỐI THIỂU 4 TIẾNG (khuyến khích để qua đêm) cho dung dịch khô và thẩm thấu", "Lau lại bằng khăn mềm sạch", "Test bằng nước - nếu vón cục là thành công"],
    thoi_gian: "Hiệu quả 2-5 tháng. LƯU Ý: cần đợi ≥4 tiếng/để qua đêm cho lớp phủ ổn định — KHÔNG phải 'xong trong 5 phút'.",
  },
  "955": {
    name: "NOMA 955 — Dung dịch xóa vết trầy xước sơn",
    cong_dung: ["Xóa vết trầy, làm mờ vết xước bề mặt", "Hiệu chỉnh sơn thật (không dùng filler che tạm)", "Tăng độ bóng, để lại lớp wax bảo vệ"],
    hdsd: ["Mở nắp, lắc kỹ chai", "Bóp dung dịch lên bề mặt vết trầy", "Chà bằng pad chuyển động tròn 20-40 giây", "Lau sạch bằng khăn microfiber"],
    thoi_gian: "Hiệu quả tức thì sau 1-2 lần; lớp bảo vệ 2-4 tuần",
  },
  "110": {
    name: "NOMA 110 — Dầu tẩy rỉ và bôi trơn đa năng",
    cong_dung: ["Tẩy rỉ, nới lỏng ốc kẹt", "Bôi trơn, chống ẩm dây điện", "Bảo vệ chi tiết kim loại"],
    hdsd: ["Lắc kỹ chai trước khi dùng", "Gắn vòi dẫn nếu cần xử lý vị trí nhỏ/sâu/khó tiếp cận", "Xịt vừa đủ lên vị trí rỉ sét/kẹt, cách 15-20cm", "Để thẩm thấu vài phút", "Bề mặt rỉ nặng: loại bỏ rỉ lỏng bằng giấy nhám/bàn chải kim loại trước", "Kiểm tra và vận hành; còn kẹt thì lặp lại"],
    thoi_gian: "Tác dụng nhanh; dùng khi cần",
  },
  "120": {
    name: "NOMA 120 — Dung dịch vệ sinh súc rửa kim phun",
    cong_dung: ["Làm sạch hệ thống nhiên liệu, kim phun", "Khôi phục hiệu suất động cơ", "Dùng định kỳ bảo dưỡng"],
    hdsd: ["Dùng khi vừa đổ đầy bình xăng", "Lắc nhẹ chai, gắn vòi rót", "Rót toàn bộ 1 chai 300ml vào bình xăng", "Đóng nắp bình, lau sạch nếu rớt ra ngoài", "Chạy hết bình xăng để dung dịch đi qua hệ thống nhiên liệu", "Theo dõi sau 1-2 bình; dùng định kỳ mỗi 10.000km"],
    thoi_gian: "Hiệu quả sau 1-2 bình xăng; định kỳ mỗi ~10.000km",
  },
  "130": {
    name: "NOMA 130 — Xịt silicone dưỡng, làm mềm ron cao su",
    cong_dung: ["Làm mềm, dưỡng ron cao su", "Chống dính, bảo vệ ron cửa/kính", "Bôi trơn rãnh trượt"],
    hdsd: ["Xác định khu vực xử lý (ron cửa/cốp/kính, cao su, nhựa, rãnh trượt)", "Làm sạch bụi và lau khô bề mặt", "Lắc kỹ bình, gắn vòi dẫn nếu xịt khe hẹp", "Xịt lớp mỏng đều, cách 10-15cm", "Chờ 2-3 phút cho thẩm thấu", "Lau lại bằng khăn sạch", "Để khô tự nhiên"],
    thoi_gian: "Ron mềm ngay sau 2-3 phút",
  },
  "230": {
    name: "NOMA 230 — Xịt dưỡng & đánh bóng nhựa nhám (taplo)",
    cong_dung: ["Dưỡng và đánh bóng nhựa nhám, taplo", "Phục hồi màu, chống bạc màu", "Bảo vệ bề mặt nội thất"],
    hdsd: ["Làm sạch bụi và lau khô bề mặt nhựa", "Lắc kỹ bình trước khi dùng", "Xịt cách bề mặt 20-25cm, lượng vừa đủ", "Dùng khăn sạch lau và dàn đều", "Vùng bẩn/bạc màu: lau kỹ hơn với lực vừa phải", "Để khô tự nhiên"],
    thoi_gian: "60-90 ngày (đỗ có mái che), 45-60 ngày (đỗ nắng), 30-45 ngày (khắc nghiệt)",
  },
  "350": {
    name: "NOMA 350 — Dung dịch vệ sinh phanh đĩa",
    cong_dung: ["Làm sạch đĩa phanh, bụi phanh, dầu mỡ", "Bay hơi nhanh, không cần lau", "Không chứa clo (non-chlorinated)"],
    hdsd: ["Xác định khu vực (đĩa phanh, cụm phanh, chi tiết bám bụi/dầu)", "Đảm bảo bề mặt đã nguội, không xịt gần nguồn lửa", "Lắc bình trước khi dùng", "Xoay vô-lăng để lộ đĩa phanh, xịt trực tiếp cách 10-15cm", "Chờ 30-60 giây cho dung dịch tự bay hơi", "Bẩn nặng: lặp lại 1-2 lần"],
    thoi_gian: "Làm sạch tức thì, tự bay hơi",
  },
  "680": {
    name: "NOMA 680 — Bọt tuyết vệ sinh đa năng (foam cleaner)",
    cong_dung: ["Làm sạch đa năng dạng bọt tuyết", "Xử lý vết bẩn cứng đầu", "Vệ sinh nhiều bề mặt"],
    hdsd: ["Lắc kỹ trước khi dùng", "Xịt đều lên bề mặt bẩn, cách 10-15cm", "Chờ 60-90 giây cho bọt phá vỡ liên kết bẩn", "Dùng bàn chải trên nắp chà nhẹ vết cứng đầu", "Lau sạch bọt bằng khăn", "Vết cứng đầu: lặp lại 1-2 lần"],
    thoi_gian: "Làm sạch tức thì sau 60-90 giây; bề mặt sạch 2-4 tuần",
  },
  "998": {
    name: "NOMA 998 — Dung dịch vá & bơm lốp khẩn cấp",
    cong_dung: ["Vá & bơm lốp khẩn cấp (lỗ ≤6mm mặt lốp)", "Giải pháp tạm thời trên đường", "Cho ô tô & xe máy"],
    hdsd: ["Dừng xe an toàn, kiểm tra lỗ thủng ≤6mm trên mặt lốp", "Xoay bánh để lỗ thủng hướng xuống dưới", "Xả hết hơi còn lại trong lốp", "Lắc kỹ chai", "Kết nối vòi chai vào van lốp", "Bấm xịt toàn bộ dung dịch vào lốp", "Chạy 10-15 km/h để dung dịch phân bố đều"],
    thoi_gian: "Giải pháp TẠM THỜI — phải đến tiệm vá lốp chuyên nghiệp sau đó",
  },
  "686": {
    name: "NOMA 686 — Bộ vệ sinh & dưỡng ghế da",
    cong_dung: ["Làm sạch chuyên sâu ghế da (Chai 1)", "Dưỡng & bảo vệ da (Chai 2)", "Chăm sóc da toàn diện"],
    hdsd: ["Lắc kỹ Chai 1 ~10 giây", "Đổ lượng vừa đủ lên pad bọt biển (đường kính 2-3cm/lần) — KHÔNG đổ trực tiếp lên ghế", "Thoa đều lên da theo chuyển động tròn nhỏ, từ lưng ghế xuống đệm", "Chà nhẹ nhàng, tập trung vùng bẩn cứng đầu", "Dùng khăn microfiber sạch lau sạch bọt và bẩn", "Bước dưỡng: dùng Chai 2 dưỡng & bảo vệ da sau khi làm sạch"],
    thoi_gian: "Làm sạch + dưỡng bảo vệ da (quy trình 2 chai)",
  },
  "880": {
    name: "NOMA 880 — Dung dịch phủ tinh thể bảo vệ sơn",
    cong_dung: ["Phủ tinh thể (nano) bảo vệ sơn thân xe", "Tăng độ bóng, chống bám nước", "Dành cho gara/detailing/DIY đã hiểu quy trình"],
    hdsd: ["Rửa sạch xe, xử lý vết bẩn trên sơn và lau khô hoàn toàn", "Nhỏ lượng NOMA 880 vừa đủ lên miếng bọt biển phủ chuyên dụng", "Phủ từng khu vực nhỏ, thao tác ngang rồi dọc để lớp phủ dàn đều", "Để bề mặt ổn định trong 12 GIỜ (1 chai 50ml dùng 2-3 lần cho toàn xe)"],
    thoi_gian: "Cần để ổn định 12 giờ sau khi phủ",
  },
};

export const SKU_KV_KEY = "noma_sku_specs:v2";

/* Đọc hồ sơ sản phẩm đang dùng. Ưu tiên bản người dùng tải lên (KV), không có thì rơi
   về bảng dự phòng ngay trong file này.
   Trả kèm `nguon` + `cap_nhat` để giao diện nói rõ đang chạy bản nào — im lặng dùng
   bản dự phòng là kiểu hỏng tệ nhất: agent vẫn chạy, chỉ là bằng dữ liệu cũ. */
export async function loadSkuSpecs(env) {
  try {
    const raw = env && env.INVENTORY ? await env.INVENTORY.get(SKU_KV_KEY) : null;
    if (raw) {
      const d = JSON.parse(raw);
      if (d && d.specs && Object.keys(d.specs).length) {
        return { specs: d.specs, nguon: "kv", cap_nhat: d.cap_nhat || null, ten_file: d.ten_file || null,
                 so_san_pham: Object.keys(d.specs).length };
      }
    }
  } catch (e) { /* KV hỏng → dùng bản dự phòng, không làm gãy agent */ }
  return { specs: NOMA_SKU_SPECS, nguon: "mac_dinh", cap_nhat: null, ten_file: null,
           so_san_pham: Object.keys(NOMA_SKU_SPECS).length };
}

// Tìm mã SKU NOMA xuất hiện trong text (tên/mô tả sản phẩm). Trả mã đầu tiên khớp (vd "922").
export function findSkuCode(text, specs) {
  const t = String(text || "");
  for (const code of Object.keys(specs || NOMA_SKU_SPECS)) {
    if (new RegExp(`NOMA\\s?${code}\\b`, "i").test(t)) return code;
  }
  return null;
}

/* Dựng đoạn "thông số chuẩn" của 1 SKU để nhét vào prompt agent. Trả "" nếu không có.

   Chịu được HAI dạng dữ liệu:
     - Bản dự phòng trong file này: cong_dung/hdsd là MẢNG.
     - Hồ sơ tải lên: hơn 40 trường dạng CHỮ (mô tả, USP, claim được/cấm…).
   Cố ý CHỌN LỌC trường đưa vào prompt chứ không đổ hết 50 cột: prompt phình ra vừa
   tốn tiền vừa làm model loãng trọng tâm. Hai trường claim là quan trọng nhất với
   việc soát brandcore nên luôn đặt cuối, sát chỗ model ra quyết định. */
const F = (label, v) => (v ? `- ${label}: ${String(v).replace(/\s*\n\s*/g, " / ").trim()}` : null);

export function skuSpecText(code, specs) {
  const s = (specs || NOMA_SKU_SPECS)[code];
  if (!s) return "";

  // Dạng cũ (mảng) — giữ nguyên khuôn để không đổi hành vi agent đang chạy.
  if (Array.isArray(s.cong_dung) || Array.isArray(s.hdsd)) {
    return [
      `THÔNG SỐ CHUẨN ${s.name} (nguồn: tài liệu 17 SKU — DÙNG ĐÚNG, không tự rút gọn/sửa):`,
      `- Công dụng: ${(s.cong_dung || []).join("; ")}.`,
      `- Hướng dẫn sử dụng (đúng thứ tự, đủ bước):`,
      ...(s.hdsd || []).map((b, i) => `  ${i + 1}. ${b}`),
      `- Thời gian/hiệu lực: ${s.thoi_gian}`,
    ].join("\n");
  }

  // Dạng hồ sơ sản phẩm tải lên.
  return [
    `THÔNG SỐ CHUẨN ${s.ten || s.ma || "NOMA " + code} (nguồn: hồ sơ sản phẩm — DÙNG ĐÚNG, không tự rút gọn/sửa):`,
    F("Dung tích", s.dung_tich),
    F("Thể sản phẩm", s.the_sp),
    F("Thành phần", s.thanh_phan),
    F("Công dụng / tính năng", s.tinh_nang || s.mo_ta),
    F("Cơ chế hoạt động", s.co_che),
    F("Hướng dẫn sử dụng (đủ bước, đúng thứ tự)", s.hdsd),
    F("Đối tượng phù hợp", s.doi_tuong),
    F("Thời gian duy trì", s.thoi_gian),
    F("Thời gian thấy hiệu quả", s.thoi_gian_hieu_qua),
    F("Số lần dùng được", s.so_lan_dung),
    F("Lưu ý khi dùng & bảo quản", s.luu_y),
    F("Hạn sử dụng", s.hsd),
    F("Bảo hành", s.bao_hanh),
    F("USP", s.usp),
    F("CLAIM ĐƯỢC PHÉP DÙNG", s.claim_duoc),
    F("CLAIM CẤM DÙNG (vi phạm nếu xuất hiện)", s.claim_cam),
  ].filter(Boolean).join("\n");
}
