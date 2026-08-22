import { test } from "node:test";
import assert from "node:assert/strict";
import { readAnyFile, rowsToSpecs } from "../functions/api/products/_dossier.js";
import { skuSpecText, findSkuCode, NOMA_SKU_SPECS } from "../functions/api/geo/_utils/noma-sku-specs.js";

/* Nhập file "Hồ sơ sản phẩm" cho phần Sửa brandcore.

   Vì sao canh kỹ: bảng này là NGUỒN THÔNG SỐ cho AI khi soát bài đã đăng và khi viết
   bài mới. Đọc sai một cột là hàng loạt bài ra sai HDSD/claim mà không ai thấy ngay —
   đúng loại lỗi đã xảy ra trước đây (922 ghi "5 phút" trong khi phải "đợi 4 tiếng").
*/

// Bảng rút gọn mô phỏng đúng hình dạng file thật: dòng 1 = tên NHÓM cột (ô gộp),
// dòng 2 = tên cột, dòng 3 = câu hướng dẫn nhập, từ dòng 4 mới là dữ liệu.
const HEAD_GROUP = ["", "1. Thông tin cơ bản", "", "", "2. Thông tin sản phẩm", "", "ĐỐI THỦ CẠNH TRANH", ""];
const HEAD = ["Tên sản phẩm", "Mã sản phẩm", "Mã SKU", "Giá bán", "Hướng dẫn sử dụng", "CLAIM KHÔNG ĐƯỢC PHÉP DÙNG", "Thương hiệu", "Giá bán"];
const HINT = ["Nhập tên gồm: Tính năng + Mã sản phẩm", "Nhập tên rút gọn", "", "", "", "", "", ""];
const ROW911 = ["NOMA 911 - Tẩy ố kính", "NOMA 911", "CAR-001", "219000", "B1. Làm mát kính\nB2. Chà đều", "Không dùng từ 'vĩnh viễn'", "3M", "285000"];
const ROW922 = ["NOMA 922 - Phủ nano", "NOMA 922", "CAR-007", "219000", "Đợi 4 tiếng trước khi gặp nước", "", "", ""];

test("đọc đúng cấu trúc file: bỏ dòng nhóm cột + dòng hướng dẫn, lấy đủ sản phẩm", () => {
  const r = rowsToSpecs([HEAD_GROUP, HEAD, HINT, ROW911, ROW922]);
  assert.equal(r.so_san_pham, 2);
  assert.deepEqual(Object.keys(r.specs).sort(), ["911", "922"]);
  assert.equal(r.specs["911"].sku, "CAR-001");
  assert.equal(r.specs["911"].code, "911");
  // Dòng hướng dẫn ("Nhập tên gồm…") KHÔNG được thành một sản phẩm.
  assert.equal(r.specs["911"].ten, "NOMA 911 - Tẩy ố kính");
});

test("hai cột cùng tên KHÔNG đè nhau — giá sản phẩm phải khác giá đối thủ", () => {
  const r = rowsToSpecs([HEAD_GROUP, HEAD, HINT, ROW911]);
  assert.equal(r.specs["911"].gia, "219000", "giá sản phẩm lấy ở cột đầu tiên");
  assert.equal(r.specs["911"].gia_2, "285000", "giá đối thủ được tách sang khoá riêng");
});

test("cột lạ được liệt kê ra thay vì nuốt im lặng", () => {
  const head = [...HEAD, "Cột phòng R&D mới thêm"];
  const r = rowsToSpecs([HEAD_GROUP, head, HINT, [...ROW911, "abc"]]);
  assert.deepEqual(r.cot_bo_qua, ["Cột phòng R&D mới thêm"]);
});

test("thiếu cột 'Tên sản phẩm' → báo lỗi, KHÔNG nhận bừa file khác", () => {
  assert.throws(() => rowsToSpecs([["Cột A", "Cột B"], ["1", "2"]]), /khong_thay_dong_tieu_de/);
});

test("đọc được CSV có ô bọc nháy kép chứa dấu phẩy và xuống dòng", async () => {
  const csv = 'Tên sản phẩm,Mã sản phẩm,Hướng dẫn sử dụng\n' +
              '"NOMA 250 - Phục hồi nhựa",NOMA 250,"B1. Lắc kỹ, mở nắp\nB2. Chà một chiều"\n';
  const doc = await readAnyFile("hoso.csv", new TextEncoder().encode(csv));
  assert.equal(doc.kind, "rows");
  const r = rowsToSpecs(doc.rows);
  assert.equal(r.so_san_pham, 1);
  assert.match(r.specs["250"].hdsd, /Chà một chiều/);
});

test("file PDF bị từ chối rõ ràng thay vì đọc ra rác", async () => {
  const pdf = new TextEncoder().encode("%PDF-1.7\n...");
  await assert.rejects(() => readAnyFile("hoso.pdf", pdf), /pdf_khong_doc_duoc/);
});

// ── Dựng đoạn thông số nhét vào prompt ──────────────────────────────────────

test("thông số dựng từ hồ sơ mới có CLAIM CẤM — phần quan trọng nhất khi soát brandcore", () => {
  const { specs } = rowsToSpecs([HEAD_GROUP, HEAD, HINT, ROW911]);
  const txt = skuSpecText("911", specs);
  assert.match(txt, /CLAIM CẤM DÙNG/);
  assert.match(txt, /vĩnh viễn/);
  assert.match(txt, /Hướng dẫn sử dụng/);
  // Xuống dòng trong ô được gộp lại thành một dòng để prompt không vỡ khuôn.
  assert.ok(!/\n\s*B2\./.test(txt), "các bước HDSD phải nằm trên cùng một dòng");
});

test("bản dự phòng (dạng mảng) vẫn dựng được như cũ — không phá agent đang chạy", () => {
  const txt = skuSpecText("922");
  assert.match(txt, /THÔNG SỐ CHUẨN/);
  assert.match(txt, /Công dụng:/);
  assert.equal(skuSpecText("khong-co"), "");
});

test("findSkuCode dò được mã chỉ có trong hồ sơ mới", () => {
  const { specs } = rowsToSpecs([HEAD_GROUP, HEAD, HINT, ROW911]);
  // 911 có ở cả hai bảng; điều cần canh là hàm chấp nhận bảng truyền vào.
  assert.equal(findSkuCode("Dung dịch NOMA 911 abc", specs), "911");
  assert.equal(findSkuCode("Sản phẩm không có mã", specs), null);
  // Không truyền gì → dùng bản dự phòng, giữ nguyên hành vi cũ.
  assert.equal(findSkuCode("NOMA 922 phủ nano"), "922");
  assert.ok(Object.keys(NOMA_SKU_SPECS).length > 0);
});
