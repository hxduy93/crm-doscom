import { test } from "node:test";
import assert from "node:assert/strict";

import { soatDungSanPham, mocNhanDangSku } from "../functions/api/products/_gap.js";
import { listAllPosts } from "../functions/api/products/_wp-posts.js";
import { onRequestPost as scan } from "../functions/api/products/brandcore-scan.js";

/* ══════════════════════════════════════════════════════════════════════════════
   BÀI VIẾT SAI SẢN PHẨM.

   Ca thật đã lọt lưới (noma.vn 26/08/2026, chủ dự án phát hiện): bài #32792
   "Hướng dẫn sử dụng bộ vệ sinh và dưỡng ghế da Noma 692".
     · tên trong tiêu đề là của NOMA 686 (bộ vệ sinh & dưỡng ghế da),
     · nội dung là quy trình làm sạch GHẾ NỈ (49 lần "ghế nỉ", 0 lần "trần xe"),
     · còn NOMA 692 thật là dung dịch vệ sinh nội thất và TRẦN XE.

   Vì sao lọt: hai cờ này chỉ có ở nút "Soát tiêu đề". Ở danh sách quét chính, bài đó
   trùng mã với bài HDSD 692 thật nên bị chặn đổi tên (đúng), mà không còn cờ nào khác
   → nhìn y hệt một bài sạch. IM LẶNG mới là chỗ hỏng, không phải việc chặn đổi tên.
   ══════════════════════════════════════════════════════════════════════════════ */

const TEN = {
  "692": "NOMA 692 - Dung dịch vệ sinh nội thất và trần xe",
  "686": "NOMA 686 - Bộ vệ sinh và dưỡng ghế da",
  "911": "NOMA 911 - Dung dịch tẩy ố kính",
  "922": "NOMA 922 - Dung dịch phủ nano kính",
};

test("mốc nhận dạng bỏ tiền tố mã — mã thì bài nào cũng có, không phân biệt được gì", () => {
  const m = mocNhanDangSku(TEN["692"]);
  assert.ok(m.length, "phải rút được mốc");
  assert.ok(!m.some((x) => /692/.test(x)), "mốc không được chứa chính con số mã");
});

test("bài mang mã 692 nhưng viết về ghế nỉ/ghế da → BÁO NGHI NGỜ", () => {
  const bai = `Hướng dẫn sử dụng bộ vệ sinh và dưỡng ghế da Noma 692.
    Làm sạch ghế nỉ ô tô hiệu quả với NOMA 692. Quy trình 6 bước làm sạch ghế nỉ.
    Vệ sinh và dưỡng ghế da đúng cách, giữ da bền lâu.`;
  const kq = soatDungSanPham(bai, "692", TEN);
  assert.equal(kq.nghi_ngo, true);
  assert.equal(kq.ma_khop, "686", "phải chỉ đúng sản phẩm mà bài đang thực sự mô tả");
  assert.ok(kq.moc_thieu.length, "phải trả bằng chứng: mốc nào của 692 không thấy trong bài");
});

test("bài đúng sản phẩm thì im lặng, kể cả khi nhắc sản phẩm khác", () => {
  /* Bẫy có thật: hồ sơ NOMA 911 dặn "nên phủ NOMA 922 sau khi tẩy ố" nên bài 911 nhắc
     922 rất nhiều. Bỏ vế "độ phủ của chính mã bài < 50%" là bài này bị báo oan — đo
     trên 19 bài hướng dẫn thật của noma.vn, đó đúng là ca báo nhầm duy nhất. */
  const bai = `Hướng dẫn sử dụng NOMA 911 - Dung dịch tẩy ố kính.
    Dung dịch tẩy ố kính NOMA 911 xử lý màng dầu và vết ố trên kính lái.
    Sau khi tẩy ố, nên dùng dung dịch phủ nano kính NOMA 922 để duy trì hiệu quả.`;
  assert.equal(soatDungSanPham(bai, "911", TEN).nghi_ngo, false);
});

test("không dò ra mã / không có tên chuẩn → không kết luận bừa", () => {
  assert.equal(soatDungSanPham("bài gì đó", null, TEN).do_duoc, false);
  assert.equal(soatDungSanPham("bài gì đó", "999", TEN).do_duoc, false);
});

// ── Đường quét chính phải hiện cờ, không im lặng ────────────────────────────
const BAI = [
  { id: 32792, title: { rendered: "Hướng dẫn sử dụng bộ vệ sinh và dưỡng ghế da Noma 692" },
    link: "https://noma.vn/a", status: "publish", categories: [1],
    content: { rendered: "<p>Làm sạch ghế nỉ ô tô với NOMA 692. Quy trình làm sạch ghế nỉ. Vệ sinh và dưỡng ghế da.</p>" } },
  { id: 30415, title: { rendered: "Hướng dẫn sử dụng NOMA 692 - Dung dịch vệ sinh nội thất và trần xe" },
    link: "https://noma.vn/b", status: "publish", categories: [1],
    content: { rendered: "<p>Dung dịch vệ sinh nội thất và trần xe NOMA 692, dùng cho da, vải và trần xe.</p>" } },
];

const ENV = {
  WC_NOMA_USER: "u", WC_NOMA_APP_PWD: "p", WC_NOMA_CK: "ck", WC_NOMA_CS: "cs",
  INVENTORY: {
    get: async (k) => (k === "noma_sku_specs:v2"
      ? JSON.stringify({ specs: { "692": { ten: TEN["692"] }, "686": { ten: TEN["686"] } } })
      : null),
  },
};

async function quetBai() {
  const goc = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith("/wp-json/wp/v2/posts")) {
      return new Response(JSON.stringify(BAI), {
        status: 200,
        headers: { "content-type": "application/json", "X-WP-TotalPages": "1", "X-WP-Total": String(BAI.length) },
      });
    }
    if (u.pathname.endsWith("/wp-json/wp/v2/categories")) {
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error("gọi nhầm endpoint: " + u.pathname);
  };
  try {
    const res = await scan({
      request: new Request("https://crm.test/api/products/brandcore-scan", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ site: "noma", target: "guide", mode: "list" }),
      }),
      env: ENV,
    });
    return await res.json();
  } finally { globalThis.fetch = goc; }
}

test("danh sách quét chính phải BÁO bài sai sản phẩm, dù bị chặn đổi tên vì trùng mã", async () => {
  const d = await quetBai();
  assert.ok(d.ok, d.error);
  const x = d.items.find((i) => i.id === 32792);
  assert.equal(x.trung_ma, true);
  assert.equal(x.can_doi_ten, false, "trùng mã thì vẫn không tự đổi tên — đó là đúng");
  assert.ok(x.sai_ten_sp, "nhưng PHẢI báo tiêu đề đang mang tên sản phẩm khác");
  assert.equal(x.sai_ten_sp.ma, "686");
  assert.ok(x.sai_sp_noi_dung, "và PHẢI báo nội dung đang mô tả sản phẩm khác");
  assert.equal(d.sai_sp_count, 1);

  const ok = d.items.find((i) => i.id === 30415);
  assert.equal(ok.sai_ten_sp, null, "bài đúng sản phẩm thì không được báo");
  assert.equal(ok.sai_sp_noi_dung, null);
});

// ── Lỗi credential WordPress phải nói rõ sửa ở đâu ──────────────────────────
test("WP 401 invalid_username → chỉ thẳng biến môi trường phải sửa", async () => {
  /* WooCommerce dùng CK/CS còn bài viết dùng username + Application Password, nên có
     trạng thái quét SẢN PHẨM chạy ngon mà quét BÀI VIẾT 401. Ném nguyên văn JSON của
     WordPress thì người dùng không đoán được phải sửa biến nào. */
  const goc = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    JSON.stringify({ code: "invalid_username", message: "<strong>Error:</strong> Unknown username.", data: { status: 401 } }),
    { status: 401, headers: { "content-type": "application/json" } });
  try {
    await assert.rejects(
      () => listAllPosts({ site: "nomaauto", url: "https://nomaauto.us", user: "x", pwd: "y" }),
      /WC_NOMAAUTO_USER/,
    );
  } finally { globalThis.fetch = goc; }
});
