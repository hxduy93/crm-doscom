// CÔNG THỨC VIẾT ADS DOSCOM — nguồn DUY NHẤT cho cách AI viết content quảng cáo.
//
// Chắt ra từ 3 vòng chủ dự án duyệt 66 bài AI viết thật (24/09/2026):
// vòng 1 → 3 Đạt, vòng 2 → 6 Đạt, vòng 3 → 20/22 Đạt. Mỗi luật dưới đây ứng với
// một lời chê cụ thể; gỡ luật nào là lỗi đó quay lại.
//
// MUỐN ĐỔI CÁCH VIẾT:
//   • Đổi khung bài / luật chung      → sửa CONG_THUC
//   • Đổi hướng viết của 1 sản phẩm   → sửa CONG_THUC_SAN_PHAM[<mã SP>]
//   • Thêm sản phẩm mới              → thêm 1 mục vào CONG_THUC_SAN_PHAM (mã trùng
//     key trong product-catalog.js). Không có mục thì AI chỉ theo công thức chung.
// Không cần sửa ad-prompts.js hay ad-formats.js — hai file đó tự đọc từ đây.

export const CONG_THUC = {
  ten: "Công thức Doscom 5 bước",

  // Thân bài, theo đúng thứ tự.
  buoc: [
    {
      ma: "mo_bai",
      ten: "DÒNG MỞ BÀI",
      luat: [
        "1 dòng, tối đa ~100 ký tự, emoji đầu dòng — dòng quan trọng nhất bài.",
        "Chọn 1 trong 2 khuôn:",
        "  Khuôn A: [LOẠI SẢN PHẨM + TÊN SP] – [1 lợi ích / tính năng chính]",
        "     vd: \"Thiết bị ghi âm DR1 Doscom – ghi âm liên tục 30 giờ, lưu trữ đến 192 giờ ghi âm\"",
        "  Khuôn B: [VẤN ĐỀ cụ thể, có thật] – [Dùng/Xịt ngay + LOẠI SẢN PHẨM + TÊN SP]",
        "     vd: \"Rửa xe xong mà kính lái vẫn còn ố trắng – Sử dụng ngay dung dịch tẩy ố kính Noma 911\"",
        "Sản phẩm có \"Dòng mở bài mẫu (chủ dự án viết)\" → variant A dùng GẦN NGUYÊN VĂN câu đó; variant sau giữ đúng khuôn, chỉ đổi lợi ích.",
        "BẮT BUỘC gọi tên LOẠI sản phẩm (dung dịch…, thiết bị…, máy dò…, camera…), không chỉ tên mã.",
        "CHỈ 1 ý chính. KHÔNG nhồi 3-4 thông số vào dòng này (pin, cân nặng… để xuống bullet).",
      ],
    },
    {
      ma: "van_de",
      ten: "VẤN ĐỀ",
      luat: [
        "1-2 câu ngắn, nói thẳng điều khách đang gặp bằng lời thường.",
        "KHÔNG bịa tình huống/cảnh (\"xe đỗ qua đêm bị gắn…\", \"đỗ nắng nhìn chéo capo…\"), KHÔNG phóng đại hậu quả.",
        "KHÔNG giảng cơ chế hoá học/kỹ thuật, KHÔNG mở bằng \"Tình huống quen thuộc:\", \"Bạn có bao giờ…\".",
      ],
    },
    {
      ma: "giai_phap",
      ten: "GIẢI PHÁP",
      luat: [
        "GIỚI THIỆU SP NGAY câu tiếp theo: tên SP + tính năng đặc biệt nhất giải quyết đúng vấn đề đó.",
        "KHÔNG dùng câu chuyển kiểu \"👉 Đó là lý do…\", \"…được thiết kế để…\", \"Giải pháp gọn nhẹ:\".",
      ],
    },
    {
      ma: "tinh_nang",
      ten: "TÍNH NĂNG",
      luat: [
        "3-5 bullet ✅, mỗi bullet 1 dòng = \"Tính năng – lợi ích cho khách\". Có số liệu thật.",
        "Các ý NỐI LIỀN MẠCH theo một mạch: công dụng chính → cách nó làm được → tiện ở chỗ nào.",
      ],
    },
    {
      ma: "chot",
      ten: "CHỐT",
      luat: [
        "1 dòng \"💼 Phù hợp cho: [3-4 nhóm cụ thể]\".",
        "Cam kết/bảo hành (chỉ khi SP có) + khuyến mãi (chỉ khi người dùng nhập).",
        "CTA bắt đầu 👉 kèm {{URL}}, rồi footer thương hiệu.",
      ],
    },
  ],

  // Hai trường ngắn đi kèm bài.
  tieuDe: "headline tối đa 40 ký tự, PHẢI có tên SP hoặc giải pháp (vd \"Cặn canxi bám kính? Dùng ngay Noma 911\"). Không nêu vấn đề suông, không giải thích nguyên nhân, không nêu số người đã mua.",
  moTa: "description tối đa 30 ký tự — 3-6 chữ.",
  doDai: "thân bài 350-650 ký tự (chưa tính footer).",

  // Luật giọng văn áp cho mọi bước.
  luatChung: [
    "Câu ngắn, lời thường như người bán hàng nói với khách. Mỗi câu một ý.",
    "Chỉ viết tiếng Việt — không video call, DIY, detailing, check, app…",
    "Gọi đúng tên thường ngày (vết xước, vết trầy, cặn canxi, bụi phanh) — không tự đặt thuật ngữ (\"xước xoáy\", \"mạng nhện\").",
    "Không bịa số liệu, số người mua, lời khách hàng, tình huống.",
  ],
};

// Hướng viết riêng từng sản phẩm — chủ dự án chốt qua 3 vòng duyệt.
//   dongMoBai : câu mở bài chủ dự án TỰ VIẾT (AI dùng gần nguyên văn)
//   trongTam  : phải nói gì, nói nhiều cái gì
//   tranh     : không được nói gì
export const CONG_THUC_SAN_PHAM = {
  "D1": {
    dongMoBai: ["D1 Doscom – Máy dò định vị GPS, nghe lén, quay lén chuyên nghiệp"],
    trongTam: [
      "Dò định vị GPS gắn lén trên xe và máy nghe lén trong phòng họp; quay lén chỉ nhắc lướt",
      "Pin 12 giờ, nặng 66g đưa xuống bullet",
    ],
    tranh: [
      "KHÔNG dựng tình huống ai gắn định vị, ai theo dõi ai (dễ sai sự thật và chạm chuyện gia đình) — chỉ nêu nhu cầu kiểm tra xe, phòng họp, phòng nghỉ",
    ],
  },
  "DR1": {
    dongMoBai: ["Thiết bị ghi âm DR1 Doscom – Ghi âm liên tục 30 giờ, lưu trữ đến 192 giờ ghi âm"],
  },
  "DA8.1": {
    dongMoBai: ["DA8.1 Doscom – Camera cần thiết cho gia đình có người già và trẻ nhỏ"],
    trongTam: [
      "Người già là chính (~90% nội dung): ông bà chỉ bấm 1 nút trên camera là gọi được cho con cháu, không cần smartphone",
      "Trẻ nhỏ tối đa ~10%: 1 câu hoặc 1 bullet",
    ],
    tranh: ["Không viết 'video call' — viết 'gọi điện, liên lạc với con cháu'"],
  },
  "Noma 911": {
    dongMoBai: [
      "Rửa xe xong mà kính lái vẫn còn ố trắng – Sử dụng ngay dung dịch tẩy ố kính Noma 911",
      "Dung dịch tẩy ố kính Noma 911 – công thức hạt mài siêu nhỏ đánh bật cặn canxi mà không làm xước kính",
    ],
    trongTam: ["Nguyên nhân chỉ nói gọn: cặn canxi có trong nước mưa"],
    tranh: ["Không dùng cụm 'nước cứng' (khách không hiểu)", "Không viết 'gara/tiệm chăm xe tin dùng' — chưa có bằng chứng"],
  },
  "Noma 680": {
    dongMoBai: ["Dung dịch vệ sinh đa năng Noma 680 – 1 chai vệ sinh hết nội thất, ngoại thất xe hơi"],
    trongTam: [
      "Đánh mạnh: sạch bong vết bẩn chỉ sau 90 giây, có bàn chải tích hợp trên thân chai",
      "Mạch ý: một chai cho mọi bề mặt → bọt tự phá bẩn sau 90 giây → bàn chải cho khe hốc",
    ],
  },
  "Noma 350": {
    dongMoBai: ["Phanh kêu rít dù đã rửa xe sạch sẽ – Xịt ngay Noma 350"],
    trongTam: ["Nêu vấn đề xong thì câu kế tiếp giới thiệu ngay dung dịch vệ sinh phanh Noma 350"],
    tranh: ["Không nêu dung tích chai và số lần dùng (không có số xác minh)"],
  },
  "Noma 230": {
    dongMoBai: [
      "Noma 230 – Dung dịch làm mới nhựa nhám trên ốp, cản xe",
      "Ốp, cản nhựa bạc trắng – Xịt ngay Noma 230",
    ],
    trongTam: ["Bài NGẮN: 2 câu vấn đề/giải pháp + 3-4 bullet. Chuyện 'bù dầu cho nhựa' tối đa 1 bullet"],
  },
  "Noma 120": {
    dongMoBai: ["Noma 120 – Dung dịch súc rửa kim phun và buồng đốt ngay từ bên trong. Thao tác cực dễ, tự làm tại nhà trong 3 phút"],
    trongTam: ["Chuyện tia phun, piston, xu-páp tối đa 1 câu", "Cách dùng 'đổ vào bình xăng' chỉ nói 1 lần, trong bullet"],
    tranh: ["Không nhắc tên hoạt chất PEA ở đầu bài"],
  },
  "Noma 880": {
    dongMoBai: ["Dung dịch phủ tinh thể Noma 880 – xoá vết xước, vết trầy nhẹ trên sơn xe, tự làm tại nhà"],
    trongTam: [
      "Vấn đề chỉ cần nói: xe bị xước, trầy trông xấu, mất thẩm mỹ",
      "Vẫn trung thực: xử lý xước/trầy NHẸ trên bề mặt; xước sâu tới lớp màu thì không (1 câu cuối bài)",
    ],
    tranh: [
      "Không nói xe phải nằm xưởng, chờ bảo hiểm — xước nhẹ không đến mức hỏng xe",
      "Không dùng 'xước xoáy', 'mạng nhện'",
    ],
  },
  "Noma 130": {
    dongMoBai: ["Noma 130 – Dung dịch làm mềm ron cao su, công thức từ dầu silicone tinh khiết"],
    trongTam: [
      "Ghi rõ 'kính xe ô tô', 'ron cửa ô tô' — không viết chung chung",
      "Nêu triệu chứng (ron khô cứng, kính rít, cửa kêu) xong thì câu kế tiếp là giải pháp Noma 130",
    ],
    tranh: ["Không nói 'tạo ra từ dầu silicone' — nói 'công thức từ dầu silicone tinh khiết'"],
  },
  // Noma 998: 4/4 bài Đạt qua 3 vòng — chưa cần hướng riêng.
};

/** Khung bài (skeleton) dạng chữ, dùng cho dạng usp_bullet trong ad-formats.js. */
export function khungBai() {
  return CONG_THUC.buoc
    .map((b, i) => `${i + 1}. ${b.ten}:\n${b.luat.map((l) => `   ${l}`).join("\n")}`)
    .join("\n");
}

/** Khối luật chung (tiêu đề, mô tả, độ dài, giọng) để chèn vào system prompt. */
export function luatCongThuc() {
  return `📐 ${CONG_THUC.ten.toUpperCase()} (chủ dự án chốt qua 3 vòng duyệt, 24/09/2026)
- Tiêu đề: ${CONG_THUC.tieuDe}
- Mô tả: ${CONG_THUC.moTa}
- Độ dài: ${CONG_THUC.doDai}
${CONG_THUC.luatChung.map((l) => `- ${l}`).join("\n")}`;
}

/** Mục "TRỌNG TÂM NỘI DUNG" cho 1 sản phẩm; rỗng nếu SP chưa có hướng riêng. */
export function congThucSanPham(key) {
  const c = CONG_THUC_SAN_PHAM[key];
  if (!c) return "";
  const dong = [
    ...(c.dongMoBai || []).map((d) => `Dòng mở bài mẫu (chủ dự án viết): '${d}'`),
    ...(c.trongTam || []),
    ...(c.tranh || []).map((t) => `TRÁNH: ${t}`),
  ];
  return `\n🎯 TRỌNG TÂM NỘI DUNG (chủ dự án chốt — ưu tiên hơn thứ tự USP/pain point ở trên):
${dong.map((d) => `• ${d}`).join("\n")}`;
}
