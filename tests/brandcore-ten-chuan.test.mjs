import { test } from "node:test";
import assert from "node:assert/strict";

import { chuanHoaTen, tenChuanSku, tenChuanSkuEN, tieuDeChuanHdsd } from "../functions/api/products/_ten-chuan.js";
import { laBaiHuongDanTheoTieuDe, laBaiHdsdChinhThuc, laDanhMucHuongDan } from "../functions/api/products/_wp-posts.js";
import { onRequestPost as scan } from "../functions/api/products/brandcore-scan.js";

/* ══════════════════════════════════════════════════════════════════════════════
   LUẬT VIẾT HOA CỦA TÊN SẢN PHẨM + TÊN CHUẨN CHO nomaauto.us.

   Chốt của chủ dự án 26/08/2026: "Tên chỉ viết hoa tên sản phẩm và đầu câu hoặc sau
   dấu -, chứ không viết hoa viết thường loạn cả lên."

   Rủi ro lớn nhất ở phần này KHÔNG phải hoa/thường sai — mà là đem TÊN TIẾNG VIỆT đi
   đổi tên sản phẩm trên nomaauto.us (trang bán cho khách Mỹ). Nửa cuối file canh đúng
   chuyện đó: bảng tên tiếng Anh trống thì KHÔNG được đề xuất gì.
   ══════════════════════════════════════════════════════════════════════════════ */

// ── Viết hoa: tiếng Việt ────────────────────────────────────────────────────
test("hồ sơ viết hoa mọi chữ → nắn về kiểu câu, giữ NOMA", () => {
  // Có thật trong hồ sơ 22/08/2026.
  assert.equal(chuanHoaTen("NOMA 350 - Dung Dịch Vệ Sinh Đĩa Phanh"),
    "NOMA 350 - Dung dịch vệ sinh đĩa phanh");
  assert.equal(chuanHoaTen("Noma 998 – Dung Dịch Vá & Bơm Lốp Khẩn Cấp"),
    "NOMA 998 - Dung dịch vá & bơm lốp khẩn cấp");
  assert.equal(chuanHoaTen("NOMA 922 – DUNG DỊCH PHỦ NANO KÍNH"),
    "NOMA 922 - Dung dịch phủ nano kính");
});

test("hoa chữ ngay sau dấu gạch giữa tên — đúng chữ chủ dự án dặn", () => {
  assert.equal(chuanHoaTen("NOMA 880 - Dung dịch phủ tinh thể làm mới sơn xe - xoá xước"),
    "NOMA 880 - Dung dịch phủ tinh thể làm mới sơn xe - Xoá xước");
});

test("thừa dấu cách trong hồ sơ bị dọn, không để lại khoảng trắng đôi", () => {
  /* "NOMA 130  - …" và "NOMA 911 -  …" đang có thật. Không dọn thì tên chuẩn khác tên
     trên web đúng một dấu cách vô hình — công cụ rủ đổi tên mà nhìn hai bên y hệt nhau. */
  assert.equal(chuanHoaTen("NOMA 130  - Dung dịch bôi trơn kính oto và làm mềm ron cao su"),
    "NOMA 130 - Dung dịch bôi trơn kính oto và làm mềm ron cao su");
  assert.equal(chuanHoaTen("NOMA 230 - Chai xịt làm mới nội ngoại thất  &  Nhựa Nhám"),
    "NOMA 230 - Chai xịt làm mới nội ngoại thất & nhựa nhám");
});

test("viết tắt và mã số KHÔNG bị hạ xuống chữ thường", () => {
  // Hạ "UV" thành "uv" hay "3M" thành "3m" là sai kiểu rất khó thấy khi soát bằng mắt.
  assert.equal(chuanHoaTen("NOMA 250 - Dung dịch phục hồi nhựa nhám chống tia UV"),
    "NOMA 250 - Dung dịch phục hồi nhựa nhám chống tia UV");
  assert.equal(chuanHoaTen("NOMA 686 - Bộ dưỡng ghế da PU và nhựa ABS"),
    "NOMA 686 - Bộ dưỡng ghế da PU và nhựa ABS");
});

test("tên không có mã NOMA vẫn nắn được hoa/thường, không vỡ", () => {
  assert.equal(chuanHoaTen("Combo Chăm Kính Chuẩn Chuyên Gia"), "Combo chăm kính chuẩn chuyên gia");
  assert.equal(chuanHoaTen(""), "");
  assert.equal(chuanHoaTen(null), "");
});

// ── Viết hoa: tiếng Anh ─────────────────────────────────────────────────────
test("tên tiếng Anh dùng Title Case kiểu Mỹ, từ nối để thường", () => {
  /* Bê luật viết kiểu câu tiếng Việt sang tên hàng ở Mỹ thì trang bán hàng trông như
     lỗi dịch máy — và 16 sản phẩm bên đó vốn đã Title Case. */
  assert.equal(chuanHoaTen("NOMA 130 – Lubricant for car windows and rubber seals", { en: true }),
    "NOMA 130 - Lubricant for Car Windows and Rubber Seals");
  assert.equal(chuanHoaTen("Noma 998 – Emergency Tire Plug & Inflator Solution", { en: true }),
    "NOMA 998 - Emergency Tire Plug & Inflator Solution");
  assert.equal(chuanHoaTen("noma 350 - brake cleaner", { en: true }), "NOMA 350 - Brake Cleaner");
});

// ── Nguồn tên chuẩn theo web ────────────────────────────────────────────────
const HO_SO = { "911": { ten: "NOMA 911 -  Dung Dịch Tẩy Ố Kính" } };
const TEN_EN = { "911": "NOMA 911 – deep glass water spot remover" };

test("web tiếng Việt lấy tên hồ sơ, web Mỹ lấy bảng tên tiếng Anh", () => {
  assert.equal(tenChuanSku("911", HO_SO), "NOMA 911 - Dung dịch tẩy ố kính");
  assert.equal(tenChuanSkuEN("911", TEN_EN), "NOMA 911 - Deep Glass Water Spot Remover");
});

test("bảng tên tiếng Anh thiếu mã → KHÔNG rơi về tên tiếng Việt", () => {
  /* Đây là lỗi nguy hiểm nhất của phần này: rơi về tên tiếng Việt là công cụ rủ đổi tên
     sản phẩm trên nomaauto.us thành tiếng Việt, ngay trên trang bán cho khách Mỹ. */
  assert.equal(tenChuanSkuEN("911", {}), null);
  assert.equal(tieuDeChuanHdsd("911", { specs: HO_SO, namesEn: {}, en: true }), null);
});

test('tiêu đề bài hướng dẫn: "Hướng dẫn sử dụng " ở VN, "How to Use " ở Mỹ', () => {
  assert.equal(tieuDeChuanHdsd("911", { specs: HO_SO, en: false }),
    "Hướng dẫn sử dụng NOMA 911 - Dung dịch tẩy ố kính");
  assert.equal(tieuDeChuanHdsd("911", { specs: HO_SO, namesEn: TEN_EN, en: true }),
    "How to Use NOMA 911 - Deep Glass Water Spot Remover");
});

// ── Phạm vi quét bài trên web Mỹ ────────────────────────────────────────────
test("nhận CẢ HAI khuôn tiêu đề đang có trên nomaauto.us", () => {
  /* Đo thật 26/08/2026: 14 bài "How to Use NOMA …" + 4 bài "NOMA … Usage Guide". Chỉ
     nhận một khuôn là đúng 4 bài lệch khuôn thành 4 bài công cụ không nhìn thấy. */
  for (const t of [
    "How to Use NOMA 250: Restore Textured Plastic Trim to Its Original Finish",
    "NOMA 686 Usage Guide: Leather Seat Cleaning & Conditioning Kit",
    "Directions for Use: NOMA 911",
  ]) assert.ok(laBaiHuongDanTheoTieuDe(t, true), `phải nhận là bài hướng dẫn: ${t}`);

  // Bài SEO nằm chung mục "Directions For Use" (có thật, id 30067) không được lọt vào.
  assert.ok(!laBaiHuongDanTheoTieuDe("Simple, Effective Tips to Keep Rodents Out of Your Car", true));
  assert.ok(!laBaiHuongDanTheoTieuDe("Restoring Yellowed Headlights: NOMA 620 vs. 5 DIY Methods", true));
});

test("khuôn tiếng Anh KHÔNG được nhận nhầm khi đang soát web tiếng Việt", () => {
  // Ngược lại cũng vậy: cờ `en` sai là quét nhầm phạm vi cả web.
  assert.ok(!laBaiHuongDanTheoTieuDe("How to Use NOMA 250: Restore Trim"));
  assert.ok(laBaiHuongDanTheoTieuDe("Hướng dẫn sử dụng NOMA 250 - Dung dịch phục hồi nhựa nhám"));
  assert.ok(laBaiHdsdChinhThuc("How to Use NOMA 250: Restore Trim", true));
  assert.ok(!laBaiHdsdChinhThuc("How to Use a Clay Bar at Home", true), "không có mã NOMA thì không có hồ sơ để đối chiếu");
});

test('mục "Directions For Use" của nomaauto.us được nhận là mục hướng dẫn', () => {
  assert.ok(laDanhMucHuongDan({ name: "Directions For Use", slug: "directions-for-use" }, true));
  assert.ok(!laDanhMucHuongDan({ name: "Car Care Guides", slug: "car-care-guides" }, true));
});

// ── Đường quét thật trên nomaauto.us ────────────────────────────────────────
const SP_US = [
  { id: 1, name: "Noma 998 – Emergency Tire Plug & Inflator Solution", permalink: "https://nomaauto.us/p1", status: "publish", description: "", short_description: "" },
  { id: 2, name: "NOMA 911 - Deep Glass Water Spot Remover", permalink: "https://nomaauto.us/p2", status: "publish", description: "", short_description: "" },
];

function envUS(names) {
  return {
    WC_NOMAAUTO_USER: "u", WC_NOMAAUTO_APP_PWD: "p", WC_NOMAAUTO_CK: "ck", WC_NOMAAUTO_CS: "cs",
    INVENTORY: {
      get: async (k) => {
        if (k === "noma_sku_specs:v2") {
          return JSON.stringify({ specs: {
            "911": { ten: "NOMA 911 - Dung dịch tẩy ố kính" },
            "998": { ten: "Noma 998 – Dung Dịch Vá & Bơm Lốp Khẩn Cấp" },
          } });
        }
        if (k === "noma_sku_names:en:v1") return names ? JSON.stringify({ names }) : null;
        return null;
      },
    },
  };
}

async function quetTenUS(names) {
  const goc = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith("/wp-json/wc/v3/products")) {
      return new Response(JSON.stringify(SP_US), {
        status: 200,
        headers: { "content-type": "application/json", "X-WP-TotalPages": "1", "X-WP-Total": String(SP_US.length) },
      });
    }
    throw new Error("gọi nhầm endpoint: " + u.pathname);
  };
  try {
    const res = await scan({
      request: new Request("https://crm.test/api/products/brandcore-scan", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ site: "nomaauto", target: "product-name", mode: "list" }),
      }),
      env: envUS(names),
    });
    return await res.json();
  } finally { globalThis.fetch = goc; }
}

test("CHƯA có bảng tên tiếng Anh → không đề xuất đổi tên nào, báo rõ còn thiếu", () => {
  return quetTenUS(null).then((d) => {
    assert.ok(d.ok, d.error);
    assert.equal(d.doi_ten_count, 0, "không có tên EN mà vẫn rủ đổi là sắp ghi tên tiếng Việt lên web Mỹ");
    assert.equal(d.chua_co_ten_en_count, 2);
    for (const it of d.items) assert.equal(it.ten_chuan, null);
  });
});

test("có bảng tên tiếng Anh → đối chiếu theo bảng, nắn luôn khuôn 'Noma 998 –'", async () => {
  const d = await quetTenUS({
    "911": "NOMA 911 - Deep Glass Water Spot Remover",
    "998": "NOMA 998 - Emergency Tire Plug & Inflator Solution",
  });
  const a = d.items.find((x) => x.id === 1);
  assert.equal(a.ten_chuan, "NOMA 998 - Emergency Tire Plug & Inflator Solution");
  assert.equal(a.can_doi_ten, true, '"Noma 998 –" lệch khuôn "NOMA 998 -" — phải đổi');

  const b = d.items.find((x) => x.id === 2);
  assert.equal(b.can_doi_ten, false, "đã khớp từng ký tự thì để yên");
  assert.equal(d.chua_co_ten_en_count, 0);
});
