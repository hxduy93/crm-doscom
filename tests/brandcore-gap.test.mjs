import { test } from "node:test";
import assert from "node:assert/strict";
import { doiChieuSanPham, doTruong, mocNeo, boHtml } from "../functions/api/products/_gap.js";

/* Đối chiếu bài đã đăng ↔ hồ sơ sản phẩm để tìm phần CÒN THIẾU trên web.

   Vì sao cần bộ test riêng: brandcore-scan chỉ tìm chữ SAI. Một sản phẩm sạch vi phạm
   vẫn có thể thiếu hẳn thành phần / hạn dùng / đối tượng dùng trên trang. Rủi ro lớn
   nhất của phần này là báo THIẾU GIẢ — vài lần sai là người dùng bỏ luôn công cụ,
   nên test tập trung vào chuyện đó.
*/

const SPEC = {
  code: "911",
  ten: "NOMA 911 - Dung dịch tẩy ố kính",
  dung_tich: "100g",
  hsd: "3 năm (kể từ ngày sản xuất)",
  thanh_phan: "Water 60% (CAS 7732-18-5) / Alumina powder 35% (CAS 1344-28-1)",
  thoi_gian: "2-4 tuần tùy môi trường sử dụng",
  luu_y: "Chỉ dùng trên bề mặt kính. Không dùng cho kính đã phủ ceramic.",
  hdsd: "Bước 1: Làm mát kính xe. Bước 2: Chà đều bằng mút.",
};

test("mốc số + đơn vị được rút đúng — đây là bằng chứng chắc nhất", () => {
  assert.deepEqual(mocNeo("100g").so, ["100g"]);
  assert.deepEqual(mocNeo("3 năm (kể từ ngày sản xuất)").so, ["3nam"]);
  // Mốc luôn ở dạng BỎ HẾT KHOẢNG TRẮNG, vì trang web có thể viết "2-4 tuần",
  // "2 - 4 tuần" hay "2–4 tuần" — cả ba phải cùng khớp một mốc.
  assert.ok(mocNeo("2-4 tuần tùy môi trường").so.includes("24tuan"));
});

test("mốc chữ là CỤM 2 ÂM TIẾT, không phải từ đơn", () => {
  // Tiếng Việt âm tiết ngắn: lọc theo từ đơn thì "kính", "nhựa" bị vứt hết, còn giữ
  // lại thì trùng ngẫu nhiên với mọi bài. Cụm 2 âm tiết mới đủ đặc trưng.
  const { tu } = mocNeo("Không dùng cho kính đã phủ ceramic");
  assert.ok(tu.includes("phu ceramic"), "phải có cụm đặc trưng");
  assert.ok(tu.includes("ceramic"), "từ kỹ thuật dài vẫn giữ riêng lẻ");
  assert.ok(!tu.includes("kinh"), "âm tiết đơn chung chung không được làm mốc");
});

test("bài có nhắc số liệu → kết luận CÓ, kèm bằng chứng để tự kiểm chứng", () => {
  const kq = doTruong("Chai dung tích 100g, dùng cho kính lái", SPEC.dung_tich);
  assert.equal(kq.muc, "co");
  assert.ok(kq.bang_chung.includes("100g"));
});

test("bài không nhắc gì → kết luận THIẾU", () => {
  assert.equal(doTruong("Sản phẩm chăm sóc xe cao cấp", SPEC.hsd).muc, "thieu");
});

test("chỉ trùng vài từ chung chung KHÔNG được tính là đã có", () => {
  // "sử dụng", "sản phẩm" là từ xuất hiện ở mọi bài — nếu tính thì mọi trường đều "có".
  const kq = doTruong("Sản phẩm này sử dụng cho ô tô", SPEC.luu_y);
  assert.notEqual(kq.muc, "co");
});

test("web mới nói được một phần → KHÔNG CHẮC, không kết luận vội", () => {
  // Bài có câu đầu ("chỉ dùng trên bề mặt kính") nhưng thiếu vế "không dùng cho kính
  // phủ ceramic" — đây đúng là vùng xám, ép về "có" hay "thiếu" đều sai.
  const kq = doTruong("Chỉ dùng trên bề mặt kính lái xe.", SPEC.luu_y);
  assert.equal(kq.muc, "khong_chac");
  assert.ok(kq.bang_chung.length, "phải nêu được đã khớp ở chỗ nào");
});

test("bỏ thẻ HTML trước khi so — mô tả WooCommerce là HTML", () => {
  const t = boHtml('<div class="x">Dung tích <b>100g</b></div><script>var a=1</script>');
  assert.match(t, /100g/);
  assert.ok(!/script|var a/.test(t), "nội dung thẻ script không được lọt vào");
});

test("đối chiếu cả sản phẩm: chỉ ra đúng phần thiếu, không vơ đũa cả nắm", () => {
  const page = {
    name: "NOMA 911 - Dung dịch tẩy ố kính",
    short_description: "<p>Chai 100g, hiệu quả 2-4 tuần.</p>",
    description: "<p>Bước 1: Làm mát kính xe. Bước 2: Chà đều bằng mút.</p>",
  };
  const r = doiChieuSanPham(page, SPEC);
  assert.equal(r.co_ho_so, true);
  const ten = (arr) => arr.map((x) => x.truong).sort();
  assert.ok(ten(r.co).includes("dung_tich"), "dung tích có trên bài");
  assert.ok(ten(r.co).includes("thoi_gian"), "thời gian duy trì có trên bài");
  assert.ok(ten(r.thieu).includes("hsd"), "hạn sử dụng KHÔNG có trên bài → phải báo thiếu");
  assert.ok(ten(r.thieu).includes("thanh_phan"), "thành phần KHÔNG có trên bài → phải báo thiếu");
  // Mỗi mục thiếu phải kèm trích hồ sơ để người dùng copy sang web.
  assert.match(r.thieu.find((x) => x.truong === "hsd").trich_ho_so, /3 năm/);
  assert.ok(r.diem > 0 && r.diem < 100);
});

test("trường hồ sơ để trống thì KHÔNG đòi web phải có", () => {
  const r = doiChieuSanPham({ name: "NOMA 911", description: "", short_description: "" }, { code: "911", dung_tich: "100g" });
  const moi = [...r.thieu, ...r.khong_chac, ...r.co].map((x) => x.truong);
  assert.deepEqual(moi, ["dung_tich"], "chỉ xét đúng trường hồ sơ có dữ liệu");
});

test("hồ sơ dạng cũ (mảng) → nói rõ chưa có hồ sơ, KHÔNG báo thiếu hàng loạt", () => {
  const r = doiChieuSanPham({ name: "NOMA 922", description: "abc" },
    { name: "NOMA 922", cong_dung: ["a"], hdsd: ["b"], thoi_gian: "c" });
  assert.equal(r.co_ho_so, false);
  assert.deepEqual(r.thieu, []);
});
