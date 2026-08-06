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

  // ── Ba SKU Noma có landing riêng (thêm 06/08/2026) ─────────────────────────
  // NGUỒN: công dụng + HDSD + thời gian lấy NGUYÊN từ functions/api/geo/_utils/
  // noma-sku-specs.js (tài liệu 17 SKU — nguồn duy nhất theo Brand Core v3);
  // giá + combo lấy từ PRICING trong <landing>/functions/api/order.js; painPoints
  // và usps diễn lại theo đúng nội dung landing đang chạy. KHÔNG thêm số nào
  // ngoài các nguồn đó — luật "không bịa số liệu" ở openspec/config.yaml.

  "Noma 680": {
    name: "Noma 680",
    brand: "NOMA",
    fullName: "Bọt tuyết vệ sinh đa năng Noma 680 — chai 650ml, có bàn chải trên nắp",
    priceRange: "99.000đ / chai 650ml (2 chai 198.000đ tặng khăn microfiber)",
    category: "Chăm sóc ô tô — vệ sinh nội thất & ngoại thất",
    source: "noma-sku-specs.js mã 680 + PRICING landing noma680 (đối chiếu 2026-08-06)",
    guarantee: null,
    usps: [
      "Một chai dùng cho nhiều bề mặt: nhựa nội thất, nỉ, thảm sàn, kính, la-zăng, ốp nhựa ngoại thất",
      "Dạng bọt tuyết bám được cả trên bề mặt dựng đứng nên có thời gian phá vết bẩn",
      "Bàn chải tích hợp ngay trên nắp — chà được khe hốc gió, chân ghế mà không cần mua thêm",
      "Chờ 60-90 giây là bọt tự phá liên kết bẩn, không phải chà mạnh",
      "Chai 650ml đủ nhiều lượt vệ sinh toàn xe",
    ],
    painPoints: [
      "Mỗi bề mặt một loại hoá chất riêng — mua đủ bộ thì tốn, dùng không hết thì để mốc góc nhà",
      "Ngại bắt đầu vì phải nhớ mỗi chai một cách dùng khác nhau",
      "Vết bẩn ở khe hốc gió, chân ghế, kẽ nhựa mà khăn không luồn vào được",
    ],
    usage: [
      "Lắc kỹ trước khi dùng",
      "Xịt đều lên bề mặt bẩn, cách 10-15cm",
      "Chờ 60-90 giây cho bọt phá vỡ liên kết bẩn",
      "Dùng bàn chải trên nắp chà nhẹ vết cứng đầu",
      "Lau sạch bọt bằng khăn",
      "Vết cứng đầu: lặp lại 1-2 lần",
    ],
    effectDuration: "Làm sạch tức thì sau 60-90 giây; bề mặt sạch 2-4 tuần",
    targetAudience: "Chủ xe tự chăm xe tại nhà (DIY), người mới bắt đầu chưa muốn sắm cả bộ hoá chất",
    tonePreferred: "Giọng 'người anh biết xe' — thẳng thắn, thực dụng, nói cả giới hạn sản phẩm",
    avoidWords: [
      "rẻ", "siêu rẻ", "hàng xịn", "số 1", "tốt nhất", "đỉnh", "vượt trội", "đột phá",
      "100%", "tuyệt đối", "hoàn toàn",
      "Made in USA", "chính hãng Mỹ", "công nghệ Mỹ", "sản xuất tại Mỹ", "nhập khẩu từ Mỹ",
    ],
    fbPolicyNotes: "KHÔNG hứa 'sạch mọi vết bẩn'. Nói rõ vết cứng đầu có thể phải lặp lại 1-2 lần. Tuân thủ Brand Core NOMA v3.",
  },

  "Noma 350": {
    name: "Noma 350",
    brand: "NOMA",
    fullName: "Dung dịch vệ sinh phanh đĩa Noma 350 — dạng xịt áp suất cao, non-chlorinated",
    priceRange: "159.000đ / chai (2 chai 318.000đ có quà)",
    category: "Chăm sóc ô tô — vệ sinh hệ thống phanh",
    source: "noma-sku-specs.js mã 350 + PRICING landing noma350 (đối chiếu 2026-08-06)",
    guarantee: null,
    usps: [
      "Xịt thẳng qua khe vành, không phải kích xe hay tháo bánh",
      "Áp suất cao đẩy sạch khe hẹp giữa má phanh và đĩa — chỗ khăn và bàn chải không vào được",
      "Bay hơi trong 30-60 giây, không cần lau lại, không cần rửa nước",
      "Công thức non-chlorinated — theo nhà sản xuất, an toàn với cao su, nhựa và cảm biến quanh cụm phanh",
      "Làm tại sân nhà trong khoảng mười phút, không cần dụng cụ gì thêm",
    ],
    painPoints: [
      "Phanh kêu rít mỗi lần đạp, rửa xe xong vẫn kêu",
      "Bụi phanh bám trên đĩa, cùm phanh và mặt trong vành, xe càng chạy càng dày",
      "Vòi nước chỉ xịt được mặt ngoài vành, không đẩy được bụi trong khe",
      "Bụi kim loại gặp nước giữ ẩm qua đêm là sáng ra đĩa có lớp rỉ mỏng",
      "Dùng nhầm dung dịch có dầu để lại màng trơn ngay trên bề mặt ma sát",
    ],
    usage: [
      "Xác định khu vực (đĩa phanh, cụm phanh, chi tiết bám bụi/dầu)",
      "Đảm bảo bề mặt đã nguội, không xịt gần nguồn lửa",
      "Lắc bình trước khi dùng",
      "Xoay vô-lăng để lộ đĩa phanh, xịt trực tiếp cách 10-15cm",
      "Chờ 30-60 giây cho dung dịch tự bay hơi",
      "Bẩn nặng: lặp lại 1-2 lần",
    ],
    effectDuration: "Làm sạch tức thì, tự bay hơi",
    targetAudience: "Chủ xe ô tô tự chăm xe tại nhà, người bị phanh kêu rít sau khi rửa xe",
    tonePreferred: "Giọng 'người anh biết xe' — giải thích nguyên nhân trước, bán sau; không hù dọa",
    avoidWords: [
      "rẻ", "siêu rẻ", "số 1", "tốt nhất", "đỉnh", "vượt trội", "đột phá",
      "100%", "tuyệt đối", "hoàn toàn",
      "Made in USA", "chính hãng Mỹ", "công nghệ Mỹ", "sản xuất tại Mỹ", "nhập khẩu từ Mỹ",
    ],
    fbPolicyNotes: "Đây là hoá chất bình xịt — nhắc bề mặt phải nguội, tránh nguồn lửa. KHÔNG khẳng định 'hết kêu phanh vĩnh viễn' hay sửa được lỗi cơ khí. Câu an toàn với cao su/nhựa/cảm biến phải ghi rõ 'theo nhà sản xuất'.",
  },

  "Noma 230": {
    name: "Noma 230",
    brand: "NOMA",
    fullName: "Xịt dưỡng & đánh bóng nhựa nhám Noma 230 — chai 450ml",
    priceRange: "99.000đ / chai 450ml (2 chai 198.000đ tặng khăn microfiber)",
    category: "Chăm sóc ô tô — phục hồi nhựa nhám nội & ngoại thất",
    source: "noma-sku-specs.js mã 230 + PRICING landing noma230 (đối chiếu 2026-08-06)",
    guarantee: null,
    usps: [
      "Bù lại lớp dầu đã mất trong nhựa — thứ quyết định màu, chứ không chỉ rửa sạch bụi",
      "Một lần xịt, một lần lau; không cần máy đánh bóng, không phải tháo chi tiết",
      "Dùng được cho mọi mảng nhựa nhám trong và ngoài xe: cản trước/sau, ốp hông, viền cửa, ốp gương, taplo",
      "Taplo thì xịt lên khăn rồi lau, tránh dung dịch bắn vào kính",
      "Chống bạc màu và bảo vệ bề mặt sau khi phục hồi",
    ],
    painPoints: [
      "Xe mới chạy hai năm mà yếm, cản đã bạc trắng như xe cũ mười năm",
      "Rửa sạch rồi nhìn vẫn cũ — vì bụi nằm dưới đáy rãnh nhựa nhám, vòi nước không với tới",
      "Nắng rút hết dầu giữ dẻo và giữ màu trong nhựa, để lại bề mặt khô xốp",
      "Hoá chất tẩy rửa mạnh cuốn nốt phần dầu còn lại, càng rửa kỹ nhựa càng bạc nhanh",
      "Bạc rồi thì không tự hồi — không có cách nào rửa cho đen trở lại",
    ],
    usage: [
      "Làm sạch bụi và lau khô bề mặt nhựa (bề mặt PHẢI khô hoàn toàn trước khi xịt)",
      "Lắc kỹ bình trước khi dùng",
      "Xịt cách bề mặt 20-25cm, lượng vừa đủ",
      "Dùng khăn sạch lau và dàn đều",
      "Vùng bẩn/bạc màu: lau kỹ hơn với lực vừa phải",
      "Để khô tự nhiên",
    ],
    effectDuration: "60-90 ngày (đỗ có mái che), 45-60 ngày (đỗ nắng), 30-45 ngày (khắc nghiệt)",
    targetAudience: "Chủ xe ô tô và xe máy có mảng nhựa nhám bạc màu, tự chăm xe tại nhà",
    tonePreferred: "Giọng 'người anh biết xe' — giải thích vì sao nhựa bạc rồi mới nói cách xử lý",
    avoidWords: [
      "rẻ", "siêu rẻ", "số 1", "tốt nhất", "đỉnh", "vượt trội", "đột phá",
      "100%", "tuyệt đối", "hoàn toàn", "như mới 100%",
      "Made in USA", "chính hãng Mỹ", "công nghệ Mỹ", "sản xuất tại Mỹ", "nhập khẩu từ Mỹ",
    ],
    fbPolicyNotes: "Ảnh trước/sau phải kèm câu 'mức độ phục hồi tuỳ tình trạng nhựa lúc bắt đầu' như trên landing. Nêu thời gian hiệu lực theo điều kiện đỗ xe, KHÔNG hứa vĩnh viễn.",
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
