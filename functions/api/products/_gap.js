/* ══════════════════════════════════════════════════════════════════════════════
   ĐỐI CHIẾU BÀI ĐÃ ĐĂNG ↔ HỒ SƠ SẢN PHẨM — tìm phần nội dung CÒN THIẾU trên web.

   Khác với brandcore-scan: chỗ đó chỉ tìm chữ SAI (từ cấm, claim quá đà, HDSD lệch)
   rồi thay chuỗi. Nó KHÔNG bao giờ phát hiện được chữ THIẾU — prompt còn ghi rõ
   "không chèn mục/bước mới". Nên một sản phẩm có thể sạch vi phạm hoàn toàn mà vẫn
   thiếu hẳn thành phần, hạn dùng, đối tượng sử dụng… trên trang.

   Cách dò: KHÔNG dùng AI ở bước này (rẻ, chạy được cho cả trăm SP, và quan trọng hơn
   là kết quả lặp lại được — cùng đầu vào cho cùng kết luận). Mỗi trường trong hồ sơ
   được rút ra vài "mốc neo" rồi tìm trong text của bài:
     · mốc SỐ + ĐƠN VỊ  ("100g", "3 năm", "30-45 ngày") — chắc chắn nhất, số hiếm khi trùng ngẫu nhiên
     · mốc TỪ KHOÁ dài  (bỏ dấu, ≥5 ký tự, bỏ từ chung chung)

   Kết luận chia BA mức chứ không phải hai — "không chắc" là mức quan trọng nhất:
   ép mọi thứ về có/không sẽ tạo ra danh sách thiếu giả, người dùng vài lần là mất
   niềm tin vào cả công cụ.
   ══════════════════════════════════════════════════════════════════════════════ */

// Trường nào cần có mặt trên trang bán hàng. Cố ý KHÔNG kiểm mấy trường nội bộ
// (insight, pain, concept, keyword, đối thủ…) — đó là tài liệu cho marketing, không
// phải nội dung phải hiển thị cho khách.
export const GAP_FIELDS = [
  { key: "mo_ta",              nhan: "Mô tả ngắn",                 trong_yeu: true },
  { key: "tinh_nang",          nhan: "Tính năng nổi bật",          trong_yeu: true },
  { key: "co_che",             nhan: "Cơ chế hoạt động",           trong_yeu: false },
  { key: "cong_nghe",          nhan: "Công nghệ",                  trong_yeu: false },
  { key: "thanh_phan",         nhan: "Thành phần",                 trong_yeu: true },
  { key: "dung_tich",          nhan: "Dung tích",                  trong_yeu: true },
  { key: "the_sp",             nhan: "Thể sản phẩm",               trong_yeu: false },
  { key: "hdsd",               nhan: "Hướng dẫn sử dụng",          trong_yeu: true },
  { key: "doi_tuong",          nhan: "Đối tượng sử dụng",          trong_yeu: false },
  { key: "luu_y",              nhan: "Lưu ý & bảo quản",           trong_yeu: true },
  { key: "hsd",                nhan: "Hạn sử dụng",                trong_yeu: true },
  { key: "bao_hanh",           nhan: "Bảo hành",                   trong_yeu: false },
  { key: "thoi_gian",          nhan: "Thời gian duy trì",          trong_yeu: true },
  { key: "thoi_gian_hieu_qua", nhan: "Thời gian thấy hiệu quả",    trong_yeu: false },
  { key: "so_lan_dung",        nhan: "Số lần dùng được",           trong_yeu: false },
  { key: "usp",                nhan: "USP",                        trong_yeu: false },
  { key: "ppe",                nhan: "Trang bị bảo hộ (PPE)",      trong_yeu: false },
  { key: "so_cuu",             nhan: "Sơ cứu y tế",                trong_yeu: false },
];

/* Bộ trường cho BÀI HƯỚNG DẪN SỬ DỤNG (bài viết trên doscom.vn / noma.vn).
   Chỉ giữ những gì một bài hướng dẫn BẮT BUỘC phải nói. Mức "trọng yếu" cũng khác
   trang bán hàng: ở đây các bước dùng, lưu ý, đồ bảo hộ và sơ cứu là trọng yếu —
   thiếu chúng là người đọc làm sai/gặp nguy, chứ không chỉ là bài chưa đủ ý. */
const HDSD_TRONG_YEU = {
  hdsd: true, luu_y: true, ppe: true, so_cuu: true,
  thoi_gian: false, thoi_gian_hieu_qua: false, doi_tuong: false, so_lan_dung: false,
};
export const GAP_FIELDS_HDSD = GAP_FIELDS
  .filter((f) => f.key in HDSD_TRONG_YEU)
  .map((f) => ({ ...f, trong_yeu: HDSD_TRONG_YEU[f.key] }));

// Từ quá phổ thông → xuất hiện ở mọi bài, dùng làm mốc sẽ cho kết quả "có" giả.
const STOP = new Set(`
 duoc khong nhung cung voi cho tren duoi trong ngoai theo hoac
 giup lam cho san pham noma dung su dung nguoi khach hang xe oto
 cach buoc phut gio ngay thang nam lan viec khi neu con nhu the
 luon tot hon nhat rat kha day dan mot hai ba bon nam sau bay
 tren mat be be_mat truoc cung_mot
`.trim().split(/\s+/));

export const boDau = (s) =>
  String(s || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/* Rút "mốc neo" từ giá trị hồ sơ.
   Ưu tiên số+đơn vị vì đó là thứ chắc chắn: bài có "100g" thì gần như chắc đang nói
   về dung tích, còn trùng từ "bảo vệ" thì chẳng chứng minh được gì. */
export function mocNeo(giaTri) {
  const raw = String(giaTri || "");
  const t = boDau(raw);
  if (!t) return { so: [], tu: [] };

  /* boDau() đã biến "2-4 tuần" thành "2 4 tuan" (gạch nối bị bỏ) nên mẫu phải chấp
     nhận dạng có khoảng trắng. Mốc được giữ ở DẠNG BỎ HẾT TRẮNG ("24tuan") và bên dò
     cũng so với bản bỏ trắng của trang — nếu không, "100g" trong hồ sơ sẽ trượt khi
     trang viết "100 g", và ngược lại. */
  const so = [...new Set(
    (t.match(/\d+(?:\s?[-–]?\s?\d+)?\s?(?:g|kg|ml|l|cm|mm|nam|thang|tuan|ngay|gio|phut|giay|%)/g) || [])
      .map((x) => x.replace(/\s+/g, ""))
  )];

  /* Tiếng Việt âm tiết ngắn ("kính", "nhựa", "phủ") nên lọc theo độ dài đơn lẻ sẽ
     vứt gần hết mốc, mà giữ lại thì trùng ngẫu nhiên rất cao. Dùng CỤM 2 ÂM TIẾT
     liền nhau ("phu ceramic", "be mat kinh") — đặc trưng hơn hẳn từ đơn, và vẫn
     chịu được việc web viết lại câu miễn còn giữ cụm đó.
     Giữ thêm vài từ đơn DÀI (≥6) vì đó thường là tên chất/kỹ thuật: ceramic,
     alumina, microfiber… — mấy chữ này một mình đã đủ chứng minh. */
  const tokens = t.split(" ").filter((w) => w.length >= 3);
  const cum = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i], b = tokens[i + 1];
    if (STOP.has(a) && STOP.has(b)) continue;      // "duoc su", "cho nguoi"… vô nghĩa
    cum.push(`${a} ${b}`);
  }
  const tuDai = tokens.filter((w) => w.length >= 6 && !STOP.has(w));
  const tu = [...new Set([...tuDai, ...cum])].slice(0, 16);

  return { so, tu };
}

/* Một trường có mặt trên bài chưa?
     co         — tìm thấy mốc số, hoặc ≥50% mốc từ
     khong_chac — có dấu vết nhưng thưa (≥20%)
     thieu      — không thấy gì
   Trả kèm `bang_chung` để người dùng tự kiểm chứng, không phải tin suông. */
export function doTruong(pageText, giaTri) {
  const page = boDau(pageText);
  const pageChat = page.replace(/\s+/g, "");     // bản bỏ hết trắng, để so mốc số
  const { so, tu } = mocNeo(giaTri);
  if (!so.length && !tu.length) return { muc: "khong_co_du_lieu", bang_chung: [], ty_le: 0 };

  const hitSo = so.filter((x) => pageChat.includes(x));
  const hitTu = tu.filter((w) => page.includes(w));
  const tyLe = tu.length ? hitTu.length / tu.length : 0;

  if (hitSo.length || tyLe >= 0.5) {
    return { muc: "co", bang_chung: [...hitSo, ...hitTu].slice(0, 6), ty_le: tyLe };
  }
  if (tyLe >= 0.2) return { muc: "khong_chac", bang_chung: hitTu.slice(0, 6), ty_le: tyLe };
  return { muc: "thieu", bang_chung: [], ty_le: tyLe };
}

/** Bỏ thẻ HTML để so bằng chữ thuần (mô tả sản phẩm WooCommerce là HTML). */
export const boHtml = (html) =>
  String(html || "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");

/* Đối chiếu 1 sản phẩm.
   `spec` là hồ sơ dạng mới (nhiều trường chữ). Hồ sơ dạng cũ (mảng) không có đủ
   trường nên trả về rỗng — nói rõ bằng `co_ho_so:false` thay vì báo "thiếu hết". */
export function doiChieuSanPham({ name, description, short_description }, spec) {
  return doiChieuText(`${name || ""} ${boHtml(short_description)} ${boHtml(description)}`, spec, GAP_FIELDS);
}

/* Đối chiếu 1 BÀI HƯỚNG DẪN SỬ DỤNG (bài viết WordPress trên doscom.vn / noma.vn).

   Cố ý dùng BỘ TRƯỜNG KHÁC sản phẩm: bài hướng dẫn không có nghĩa vụ nhắc dung tích,
   thành phần hay bảo hành — đòi mấy thứ đó là tạo ra danh sách "thiếu" giả rồi người
   dùng bỏ luôn công cụ. Ngược lại, thứ một bài hướng dẫn THIẾU thì nguy hiểm thật:
   bước dùng, lưu ý, đồ bảo hộ, sơ cứu. */
export function doiChieuBaiHdsd({ name, content }, spec) {
  return doiChieuText(`${name || ""} ${boHtml(content)}`, spec, GAP_FIELDS_HDSD);
}

/* Lõi dùng chung: đo từng trường của hồ sơ trên text của trang. */
export function doiChieuText(pageText, spec, fields = GAP_FIELDS) {
  if (!spec || Array.isArray(spec.cong_dung) || Array.isArray(spec.hdsd)) {
    return { co_ho_so: false, thieu: [], khong_chac: [], co: [], diem: null };
  }

  const thieu = [], khongChac = [], co = [];
  for (const f of fields) {
    const giaTri = spec[f.key];
    if (!giaTri) continue;                       // hồ sơ không có thì không đòi web phải có
    const kq = doTruong(pageText, giaTri);
    const item = {
      truong: f.key,
      nhan: f.nhan,
      trong_yeu: f.trong_yeu,
      bang_chung: kq.bang_chung,
      trich_ho_so: String(giaTri).replace(/\s*\n\s*/g, " / ").slice(0, 400),
    };
    if (kq.muc === "thieu") thieu.push(item);
    else if (kq.muc === "khong_chac") khongChac.push(item);
    else if (kq.muc === "co") co.push(item);
  }

  const tong = thieu.length + khongChac.length + co.length;
  return {
    co_ho_so: true,
    thieu, khong_chac: khongChac, co,
    // Điểm phủ: đếm "không chắc" bằng nửa điểm — nó chưa phải thiếu, cũng chưa phải đủ.
    diem: tong ? Math.round(((co.length + khongChac.length * 0.5) / tong) * 100) : null,
  };
}

/* ══════════════════════════════════════════════════════════════════════════════
   BÀI NÀY CÓ ĐANG VIẾT ĐÚNG SẢN PHẨM KHÔNG?

   Vì sao cần, dù đã có phần soát tiêu đề: chỗ đó chỉ đọc TIÊU ĐỀ. Có thật trên noma.vn
   (26/08/2026) bài #32792 "Hướng dẫn sử dụng bộ vệ sinh và dưỡng ghế da Noma 692" —
   tên trong tiêu đề là của NOMA 686, còn NỘI DUNG lại là quy trình làm sạch GHẾ NỈ
   (đếm được 49 lần "ghế nỉ", 0 lần "trần xe"), trong khi NOMA 692 là dung dịch vệ sinh
   nội thất và trần xe. Ba thứ nói ba sản phẩm khác nhau trên cùng một bài đang bán hàng.

   Luật (không dùng AI — phải lặp lại được để còn đối chiếu giữa các lần quét):
     · mốc nhận dạng của một mã = cụm 2 âm tiết rút từ PHẦN MÔ TẢ của tên chuẩn
       ("dung dich", "sinh noi", "noi that", "that tran" cho 692).
     · độ phủ = tỉ lệ mốc của mã đó tìm thấy trong (tiêu đề + nội dung).
     · NGHI NGỜ khi: độ phủ của chính mã bài < 50% VÀ có mã khác phủ cao hơn.

   Ngưỡng cố ý CHẶT ở vế đầu. Đo trên 19 bài hướng dẫn thật của noma.vn: chỉ bỏ vế
   "< 50%" thôi là bài #30413 (HDSD NOMA 911) bị báo oan — nó nhắc NOMA 922 nhiều vì
   hồ sơ 911 dặn "nên phủ 922 sau khi tẩy ố". Với ngưỡng này: 1 bài bị báo, đúng bài sai.

   CỐ Ý chỉ báo, KHÔNG tự sửa: không biết sai ở mã, ở tiêu đề hay ở cả bài — phải người
   đọc rồi quyết. Trả kèm bằng chứng (mốc thiếu, mã khớp hơn) để còn kiểm chứng.
   ══════════════════════════════════════════════════════════════════════════════ */
export function mocNhanDangSku(tenChuan) {
  // Bỏ tiền tố "NOMA <mã> - " vì mã thì bài nào cũng có, không phân biệt được gì.
  const duoi = String(tenChuan || "").replace(/^\s*NOMA\s*\d{2,4}\s*[-–—:]?\s*/i, "");
  return mocNeo(duoi).tu;
}

export function soatDungSanPham(text, maBai, tenTheoMa) {
  const t = boDau(text);
  const phuCua = (ma) => {
    const moc = mocNhanDangSku(tenTheoMa[ma]);
    if (!moc.length) return null;
    const thay = moc.filter((w) => t.includes(w));
    return { ma, phu: thay.length / moc.length, moc, thieu: moc.filter((w) => !thay.includes(w)) };
  };

  const minh = maBai ? phuCua(maBai) : null;
  if (!minh) return { do_duoc: false, nghi_ngo: false };

  let khop = null;
  for (const ma of Object.keys(tenTheoMa || {})) {
    if (ma === maBai) continue;
    const d = phuCua(ma);
    if (d && (!khop || d.phu > khop.phu)) khop = d;
  }

  const nghiNgo = minh.phu < 0.5 && Boolean(khop) && khop.phu > minh.phu;
  return {
    do_duoc: true,
    nghi_ngo: nghiNgo,
    phu: Math.round(minh.phu * 100),
    moc_thieu: minh.thieu.slice(0, 6),
    ma_khop: nghiNgo ? khop.ma : null,
    phu_khop: nghiNgo ? Math.round(khop.phu * 100) : null,
  };
}
