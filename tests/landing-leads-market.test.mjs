import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TH_PRODUCTS, isThaiProduct, resolveMarket, marketFilter,
} from "../functions/api/landing-leads.js";

/* Vì sao có bộ test này:
   Landing D1 bản Thái (noma955.click) ghi vào CÙNG bảng landing_leads với các landing
   Việt Nam. Trước khi có tham số ?market, bảng "Lead theo landing & nhân sự" của
   dashboard VN vẽ ra chỉ các dòng staff duy/pn nhưng lại CỘNG cả dòng Thái vào `grand`,
   `tot`, `items.length` -> dòng tổng lớn hơn tổng các dòng nhìn thấy, cột % lệch.
   Ba luật dưới đây canh đúng chỗ đó. */

// ---- resolveMarket: giá trị lạ phải rơi về 'all', không được thành lỗi ----
test("resolveMarket chỉ nhận vn/th, còn lại là all", () => {
  assert.equal(resolveMarket("vn"), "vn");
  assert.equal(resolveMarket("th"), "th");
  assert.equal(resolveMarket("TH"), "th");          // không phân biệt hoa thường
  assert.equal(resolveMarket("xx"), "all");
  assert.equal(resolveMarket(""), "all");
  assert.equal(resolveMarket(null), "all");
  assert.equal(resolveMarket(undefined), "all");    // giao diện cũ không truyền tham số
});

// ---- Phân loại theo DANH SÁCH TƯỜNG MINH, không suy đoán theo hậu tố ----
test("isThaiProduct chỉ đúng với mã đã khai, không bắt theo đuôi 'TH'", () => {
  assert.equal(isThaiProduct("D1TH"), true);
  assert.equal(isThaiProduct("D1"), false);
  assert.equal(isThaiProduct("DR1"), false);
  // Mã Việt lỡ kết thúc bằng TH thì KHÔNG được xếp nhầm sang thị trường Thái.
  assert.equal(isThaiProduct("NOMABATH"), false);
  assert.equal(isThaiProduct(null), false);
});

// ---- Mệnh đề SQL sinh ra đúng hình dạng + đủ tham số ----
test("marketFilter sinh đúng SQL và số tham số khớp số dấu ?", () => {
  const all = marketFilter("all");
  assert.equal(all.sql, "");
  assert.deepEqual(all.args, []);

  const th = marketFilter("th");
  assert.match(th.sql, /AND product IN \(\?(,\?)*\)/);
  assert.equal(th.args.length, TH_PRODUCTS.length);
  assert.equal((th.sql.match(/\?/g) || []).length, th.args.length);

  const vn = marketFilter("vn");
  assert.equal(vn.args.length, TH_PRODUCTS.length);
  assert.equal((vn.sql.match(/\?/g) || []).length, vn.args.length);
  // product IS NULL phải nằm ở nhánh vn: SQL cho `NULL NOT IN (...)` ra NULL (không
  // phải TRUE), thiếu vế này là dòng product rỗng rơi khỏi cả hai thị trường.
  assert.match(vn.sql, /product IS NULL OR product NOT IN/);
});

/* ---- Bất biến quan trọng nhất: vn + th = all, không mất dòng, không đếm đôi ----
   Mô phỏng đúng ngữ nghĩa SQL của marketFilter trên một tập dòng mẫu. Nếu ai đó sau này
   đổi cách phân loại (vd chuyển sang regex hậu tố) mà làm hai tập chồng nhau hoặc hở ra,
   test này đỏ ngay. */
function applyFilter(rows, market) {
  const f = marketFilter(market);
  if (!f.sql) return rows.slice();
  const set = new Set(f.args);
  if (market === "th") return rows.filter(r => set.has(r.product));
  return rows.filter(r => r.product == null || !set.has(r.product));
}

const ROWS = [
  { product: "D1",   landing: "/d1cb",  staff: "duy" },
  { product: "D1",   landing: "/d1tpn", staff: "pn" },
  { product: "DR1",  landing: "/dr1lad", staff: "duy" },
  { product: "DR1",  landing: "/dr1tpn", staff: "pn" },
  { product: "D1TH", landing: "/d1th",  staff: "th" },
  { product: "D1TH", landing: "/d1th",  staff: "th" },
];

test("market=vn loại sạch lead Thái", () => {
  const vn = applyFilter(ROWS, "vn");
  assert.equal(vn.length, 4);
  assert.equal(vn.some(r => r.product === "D1TH"), false);
  assert.equal(vn.some(r => r.landing === "/d1th"), false);
  assert.equal(vn.some(r => r.staff === "th"), false);
});

test("market=th chỉ còn lead Thái", () => {
  const th = applyFilter(ROWS, "th");
  assert.equal(th.length, 2);
  assert.equal(th.every(r => isThaiProduct(r.product)), true);
});

test("vn + th = all — không mất dòng, không đếm đôi", () => {
  const vn = applyFilter(ROWS, "vn");
  const th = applyFilter(ROWS, "th");
  const all = applyFilter(ROWS, "all");
  assert.equal(vn.length + th.length, all.length);
  // hai tập rời nhau
  const inTh = new Set(th);
  assert.equal(vn.some(r => inTh.has(r)), false);
});

test("dòng product rỗng vẫn thuộc vn, không biến mất khỏi cả hai thị trường", () => {
  const rows = ROWS.concat([{ product: null, landing: "/la", staff: "duy" }]);
  const vn = applyFilter(rows, "vn");
  const th = applyFilter(rows, "th");
  assert.equal(vn.length + th.length, rows.length);
  assert.equal(vn.some(r => r.product == null), true);
});
