// Catalog 5 sản phẩm Doscom - dùng cho prompt AI generate ad copy
// Đồng bộ với skill doscom-products

export const PRODUCTS = {
  "D1": {
    name: "Máy dò D1",
    brand: "DOSCOM",
    fullName: "Thiết bị dò D1 Doscom — dò thiết bị ghi âm, máy nghe lén, camera ẩn",
    priceRange: "2.500.000đ",
    category: "An ninh - bảo mật",
    source: "https://doscom.vn/product/thiet-bi-do-d1-do-thiet-bi-dinh-vi-nghe-len-camera-giau-kin (đối chiếu 2026-07-22)",
    // Số liệu lấy NGUYÊN từ trang bán. AI chỉ được dùng số trong danh sách này.
    // Bản cũ ghi "pin 8 tiếng" (thật: 12 giờ) và "quét từ trường" (trang không có).
    specs: [
      "Dải tần quét: 30 MHz – 1.5 GHz",
      "Tần số quét: 1500 lần/phút",
      "Dò được: GSM (2G/3G/4G/5G), GPS, WiFi",
      "Phạm vi dò: 0 – 30 cm",
      "Chế độ báo động: rung và chuông",
      "Pin 300 mAh – hoạt động 12 giờ liên tục",
      "Kích thước: 135 × 22 × 12 mm, nặng 66 g",
      "Màn hình LCD 1 inch, sạc Type-C",
      "Nhiệt độ hoạt động: -10 ~ 50°C",
    ],
    usps: [
      "Phát hiện máy nghe lén, định vị GPS, camera ẩn",
      "2 chế độ dò: sóng RF + đèn hồng ngoại tìm camera siêu nhỏ",
      "Quét 360 độ không bỏ sót",
      "Pin 300mAh dùng 12 giờ liên tục, nặng 66g bỏ túi được",
      "Dùng được ở khách sạn, homestay, xe hơi, văn phòng",
    ],
    painPoints: [
      "Lo lắng bị quay lén khi đi công tác, du lịch",
      "Sợ bị theo dõi trong xe hoặc nhà riêng",
      "Doanh nhân lo rò rỉ thông tin trong phòng họp",
    ],
    targetAudience: "Doanh nhân, người hay công tác, du lịch, gia đình thành thị",
    tonePreferred: "Nghiêm túc, tạo cảm giác an toàn, không hù dọa thái quá",
    avoidWords: [
      "theo dõi vợ", "theo dõi chồng", "rình", "gián điệp",
      "bí mật cá nhân của người khác",
    ],
    fbPolicyNotes: "Không được ám chỉ xâm phạm quyền riêng tư người khác. Tập trung vào 'bảo vệ bản thân'.",
  },

  "DR1": {
    name: "Máy ghi âm DR1",
    brand: "DOSCOM",
    fullName: "Thiết bị ghi âm DR1 Doscom — bộ nhớ 16GB, lưu file đến 192 giờ",
    priceRange: "1.300.000đ",
    category: "Thiết bị ghi âm chuyên dụng",
    source: "https://doscom.vn/product/thiet-bi-ghi-am-dr1-doscom (đối chiếu 2026-07-22)",
    // Bản cũ ghi "16-32GB" (chỉ có 16GB) và "nhỏ như chiếc USB" (thật: 41g,
    // 77×22.6×13.3mm). Ví dụ mẫu trong prompt còn ghi "8g" và "280 giờ" — đều bịa.
    specs: [
      "Bộ nhớ 16GB — lưu file đến 192 giờ",
      "Ghi âm liên tục 30 giờ",
      "Pin 230 mAh, sạc Type-C",
      "Kích thước: 77 × 22.6 × 13.3 mm, nặng 41 g",
      "Định dạng MP3, WAV — bitrate 32/64/128/192/512 kbps",
      "Có loa ngoài, phát được nhạc MP3",
      "Kết nối OTG với điện thoại và máy tính",
    ],
    usps: [
      "Bộ nhớ 16GB lưu file đến 192 giờ, ghi liên tục 30 giờ",
      "Ghi âm chỉ trong 1 chạm",
      "Tự động kích hoạt theo giọng nói",
      "Lọc tạp âm, micro siêu nhạy",
      "Cắm OTG là lấy file, không cần cài app",
    ],
    painPoints: [
      "Cần lưu lại cuộc họp quan trọng",
      "Phóng viên, nhà báo cần tác nghiệp",
      "Sinh viên cần ghi lại bài giảng dài",
      "Ghi âm bằng điện thoại thì hết pin, hết bộ nhớ giữa chừng",
    ],
    targetAudience: "Nhà sáng tạo nội dung, nhà báo, phóng viên, học sinh, sinh viên; dùng cho họp, phỏng vấn, giảng dạy",
    tonePreferred: "Chuyên nghiệp, nhấn mạnh tính tiện dụng và bảo mật",
    avoidWords: [
      "ghi âm lén", "nghe lén", "rình",
    ],
    fbPolicyNotes: "Phải nêu mục đích hợp pháp (tác nghiệp, ghi nhớ). Không được ám chỉ ghi âm bí mật người khác.",
  },

  // NOMA là thương hiệu RIÊNG (NOMA Technologies LLC), không phải dòng sản phẩm của
  // Doscom → brand:"NOMA" để endpoint nạp thêm Brand Core v3 ở
  // functions/api/geo/_utils/noma-brandcore.js. Số liệu dưới đây do chủ dự án xác
  // nhận 2026-07-22 (bản cũ ghi sai: 200ml, 4-5 xe, "mưa axit", "không hạt mài").
  "Noma 911": {
    name: "Noma 911",
    brand: "NOMA",
    fullName: "Dung dịch tẩy ố kính Noma 911",
    priceRange: "199.000đ / chai 100ml",
    category: "Chăm sóc ô tô",
    // Hàng tiêu dùng → KHÔNG có bảo hành. null = bỏ hẳn dòng cam kết bảo hành,
    // khác với để trống (undefined) là dùng chính sách bảo hành mặc định của Doscom.
    guarantee: null,
    usps: [
      "Tẩy ố kính do cặn canxi trong nước mưa, nước cứng và màng dầu bám lâu ngày",
      "Công thức đậm đặc có hạt mài siêu nhỏ — đánh bật cặn bám mà không gây xước kính",
      "An toàn với viền cao su, không ăn mòn",
      "1 chai 100ml dùng được cho 2-3 xe",
      "Được các gara, tiệm detailing tin dùng",
    ],
    painPoints: [
      "Nước mưa chứa nhiều canxi — vệ sinh kính không kỹ sẽ đóng cặn trắng bám chặt trên kính",
      "Cặn bám làm chói đèn ngược chiều khi chạy đêm, tầm nhìn kém lúc trời mưa",
      "Rửa xe thông thường và nước lau kính không xử lý được lớp cặn khoáng này",
      "Mang ra gara/tiệm detailing thì mất thời gian, mà vài tháng lại phải đi lần nữa",
    ],
    // Quy trình CHÍNH THỨC (đồng bộ functions/api/geo/_utils/noma-sku-specs.js).
    // Có sẵn để AI khỏi tự bịa thao tác khi viết dạng bài "hướng dẫn dùng".
    usage: [
      "Lắc đều chai",
      "Bóp dung dịch lên bề mặt kính",
      "Chà bằng pad theo chuyển động tròn",
      "Đợi 1-2 phút",
      "Rửa lại bằng nước sạch và lau khô",
    ],
    targetAudience: "Chủ xe ô tô tự chăm xe tại nhà (DIY), nam 25-45 thành thị; thêm tệp chủ gara/tiệm rửa xe",
    tonePreferred: "Giọng 'người anh biết xe' — thẳng thắn, minh bạch, dám nói cả giới hạn sản phẩm, thực dụng, gần gũi",
    // Lấy từ danh sách cấm của Brand Core NOMA v3 (mục ⛔ TỪ / CLAIM CẤM).
    avoidWords: [
      "rẻ", "siêu rẻ", "hàng xịn", "số 1", "tốt nhất", "đỉnh", "vượt trội", "đột phá",
      "100%", "tuyệt đối", "hoàn toàn", "xoá hoàn toàn",
      "Made in USA", "chính hãng Mỹ", "công nghệ Mỹ", "sản xuất tại Mỹ", "nhập khẩu từ Mỹ",
    ],
    fbPolicyNotes: "Tránh khẳng định tuyệt đối ('tẩy sạch 100%') — dùng 'hiệu quả lên đến', 'thấy rõ ngay lần đầu'. Nói 'ố do cặn canxi', KHÔNG nói 'mưa axit'. Tuân thủ Brand Core NOMA v3 kèm bên dưới.",
  },

  "DA8.1": {
    name: "Camera DA8.1",
    brand: "DOSCOM",
    fullName: "Camera gọi video 2 chiều DA8.1 Doscom — màn hình 2,8 inch",
    priceRange: "1.250.000đ – 1.940.000đ (tùy dung lượng thẻ nhớ chọn kèm)",
    category: "Camera an ninh gia đình kiêm video call",
    source: "https://doscom.vn/product/camera-da8-goi-video-2-chieu (đối chiếu 2026-07-22)",
    // Bản cũ sai: góc dọc 60° (thật 90°), thẻ nhớ 128GB (thật tối đa 256GB),
    // hồng ngoại "10m" (thật 5-10m), và claim "camera đầu tiên" không có nguồn.
    specs: [
      "Màn hình 2,8 inch trên thân camera",
      "Hình ảnh FullHD, góc nhìn 140°",
      "Xoay ngang 350°, xoay dọc 90°",
      "Hồng ngoại ban đêm 5 – 10 mét",
      "Hỗ trợ thẻ nhớ tối đa 256GB",
      "Kết nối WiFi, app Im Cam cho iOS và Android",
    ],
    usps: [
      "Gọi video 2 chiều chỉ bằng 1 nút bấm trên thân camera – người ở nhà không cần smartphone",
      "Màn hình 2,8 inch ngay trên camera – ông bà/trẻ nhỏ thấy mặt người gọi",
      "Hình FullHD, góc nhìn 140°, hồng ngoại ban đêm 5-10m",
      "Xoay ngang 350° + dọc 90° – bao quát cả phòng",
      "Phát hiện và theo dõi chuyển động người, cảnh báo về điện thoại qua app Im Cam",
      "Hỗ trợ thẻ nhớ tối đa 256GB, tự ghi đè khi đầy",
      "Hỗ trợ lắp đặt miễn phí tại nội thành Hà Nội và TP.HCM",
    ],
    painPoints: [
      "Ba mẹ đi làm lo con nhỏ ở nhà một mình, con cần nhưng không gọi được",
      "Ông bà lớn tuổi ở quê không dùng smartphone, khó video call với con cháu",
      "Gia đình có thú cưng, muốn xem chúng ở nhà khi đi vắng",
      "Camera an ninh thông thường chỉ xem một chiều, không liên lạc 2 chiều được",
    ],
    targetAudience: "Ba mẹ đi làm có con nhỏ ở nhà, gia đình có ông bà lớn tuổi, người thuê nhà có thú cưng, gia đình nhiều thế hệ sống cách xa",
    tonePreferred: "Ấm áp, gần gũi, tập trung vào kết nối gia đình và yên tâm hàng ngày",
    avoidWords: [
      "giám sát lén", "theo dõi bí mật", "rình",
    ],
    fbPolicyNotes: "Tập trung vào kết nối gia đình + an toàn cho người thân. KHÔNG ám chỉ theo dõi/giám sát lén người khác.",
    provenAngles: [
      "CAMERA CẦN THIẾT CHO GIA ĐÌNH CÓ NGƯỜI GIÀ VÀ TRẺ NHỎ — camera vừa là thiết bị an ninh vừa là 'đường dây nóng' để ông bà/trẻ nhỏ ở nhà liên lạc với con cháu đi làm xa, chỉ bằng 1 nút bấm không cần smartphone. (Angle đã thành công 2025)",
      "CON Ở NHÀ MỘT MÌNH – BẠN ĐANG XEM ĐƯỢC GÌ — nhấn mạnh camera thường chỉ xem 1 chiều, DA8.1 cho phép con chủ động bấm nút gọi mẹ. (Angle đã thành công 2025)",
    ],
  },

  // DA8.1 Pro đã NGỪNG BÁN (chủ dự án xác nhận 2026-07-22) → gỡ khỏi catalog để
  // không sinh được content quảng cáo mới. Pixel "DA8.1 Pro" và dữ liệu doanh thu
  // lịch sử vẫn giữ nguyên ở ads-creator.html và index.html — campaign cũ còn tham
  // chiếu, xoá đi là hỏng báo cáo cũ.
};

export function getProduct(key) {
  return PRODUCTS[key] || null;
}
