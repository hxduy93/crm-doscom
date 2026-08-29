import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRODUCTS } from "../functions/lib/product-catalog.js";
import { NOMA_SKU_SPECS } from "../functions/api/geo/_utils/noma-sku-specs.js";
import { buildUserPrompt } from "../functions/lib/ad-prompts.js";
import { getFormat } from "../functions/lib/ad-formats.js";

// 29/08/2026: nạp nội dung 3 SKU Noma có landing riêng (880 · 998 · 130) để chạy được
// "Tạo Ads tự động". LUẬT: không bịa số liệu — công dụng/HDSD/thời gian khớp tài liệu
// 17 SKU (noma-sku-specs.js), giá khớp PRICING của landing đang chạy.

const BA_SKU = [
  { key: "Noma 880", code: "880" },
  { key: "Noma 998", code: "998" },
  { key: "Noma 130", code: "130" },
];

test("ba sản phẩm đã có trong catalog cho AI viết caption", () => {
  for (const { key } of BA_SKU) assert.ok(PRODUCTS[key], `thiếu ${key} trong PRODUCTS`);
});

test("hướng dẫn sử dụng khớp NGUYÊN tài liệu 17 SKU, không tự rút gọn", () => {
  for (const { key, code } of BA_SKU) {
    const chuan = NOMA_SKU_SPECS[code].hdsd;
    const cat = PRODUCTS[key].usage;
    assert.equal(cat.length, chuan.length, `${key}: số bước HDSD lệch tài liệu chuẩn`);
    chuan.forEach((b, i) => {
      const goc = b.split("(")[0].trim();
      assert.ok(cat[i].toLowerCase().includes(goc.slice(0, 14).toLowerCase()),
        `${key} bước ${i + 1}: "${cat[i]}" không khớp tài liệu "${b}"`);
    });
  }
});

test("giá khớp PRICING của landing đang chạy", () => {
  assert.match(PRODUCTS["Noma 880"].priceRange, /390\.000đ \/ hộp 50ml/);
  assert.match(PRODUCTS["Noma 880"].priceRange, /2 hộp 780\.000đ/);
  assert.match(PRODUCTS["Noma 998"].priceRange, /119\.000đ \/ chai 500ml/);
  assert.match(PRODUCTS["Noma 998"].priceRange, /4 chai 476\.000đ/);
  assert.match(PRODUCTS["Noma 130"].priceRange, /179\.000đ \/ chai/);
  assert.match(PRODUCTS["Noma 130"].priceRange, /3 chai 537\.000đ/);
});

test("giữ nguyên luật Brand Core: cấm từ tuyệt đối và claim xuất xứ Mỹ", () => {
  for (const { key } of BA_SKU) {
    const p = PRODUCTS[key];
    assert.equal(p.brand, "NOMA");
    assert.equal(p.guarantee, null, `${key}: hàng tiêu dùng, KHÔNG có bảo hành`);
    for (const tu of ["100%", "tuyệt đối", "số 1", "Made in USA", "chính hãng Mỹ"]) {
      assert.ok(p.avoidWords.includes(tu), `${key}: thiếu từ cấm "${tu}"`);
    }
  }
});

// Hai SKU này làm sai là hỏng đồ / mất an toàn thật, không phải chuyện chữ nghĩa:
// 880 chưa đủ 12 giờ mà gặp nước là phải làm lại cả xe; 998 chỉ là bản vá TẠM THỜI.
test("cảnh báo an toàn của 880 và 998 nằm trong catalog, không để AI tự bỏ qua", () => {
  const p880 = PRODUCTS["Noma 880"];
  assert.match(p880.effectDuration, /12 giờ/);
  assert.ok(p880.limits.some((l) => /12 giờ/.test(l)), "880: thiếu giới hạn chờ 12 giờ");
  assert.match(p880.fbPolicyNotes, /12 giờ/);

  const p998 = PRODUCTS["Noma 998"];
  assert.match(p998.effectDuration, /TẠM THỜI/);
  assert.ok(p998.limits.some((l) => /không săm|tubeless/i.test(l)), "998: thiếu điều kiện lốp không săm");
  assert.ok(p998.limits.some((l) => /6mm/.test(l)), "998: thiếu giới hạn lỗ thủng ≤6mm");
  assert.match(p998.fbPolicyNotes, /TẠM THỜI/);
  assert.ok(p998.avoidWords.includes("vá vĩnh viễn"), "998: phải cấm chữ 'vá vĩnh viễn'");
});

test("thời gian hiệu quả và giới hạn ĐI VÀO prompt (trước 29/08 chỉ nằm trong file)", () => {
  const prompt = buildUserPrompt({
    product: PRODUCTS["Noma 998"], format: "x", formatLabel: "x", cta: "x",
    notes: "", promotion: "", formats: [getFormat("huong_dan")],
  });
  assert.match(prompt, /THỜI GIAN HIỆU QUẢ/);
  assert.match(prompt, /GIẢI PHÁP TẠM THỜI/);
  assert.match(prompt, /GIỚI HẠN & ĐIỀU KIỆN DÙNG/);
  assert.match(prompt, /không săm/i);
});

test("sản phẩm KHÔNG khai thời gian hiệu quả thì prompt cấm hứa độ bền", () => {
  const prompt = buildUserPrompt({
    product: PRODUCTS["Noma 911"], format: "x", formatLabel: "x", cta: "x",
    notes: "", promotion: "", formats: [getFormat("huong_dan")],
  });
  assert.match(prompt, /KHÔNG CÓ SỐ XÁC MINH/);
});

// Chọn sản phẩm ở tab tự động sẽ tự điền pixel + link đích → sai một ký tự là tiền
// chạy vào pixel/landing của sản phẩm khác.
test("trang tạo ads khai đúng pixel và hai link landing của ba SKU", () => {
  const html = readFileSync(new URL("../ads-creator.html", import.meta.url), "utf8");
  const block = html.match(/const PRODUCTS = \{[\s\S]*?\r?\n  \}/);
  assert.ok(block, "không trích được bảng PRODUCTS từ ads-creator.html");
  const P = new Function(`${block[0]};\nreturn PRODUCTS`)();

  const mong = {
    "Noma 880": ["2267972717349779", "https://noma880-lp.pages.dev/n880d", "https://noma880-lp.pages.dev/n880tpn"],
    "Noma 998": ["2153138088949626", "https://noma998.io.vn/n998d", "https://noma998.io.vn/n998tpn"],
    "Noma 130": ["927121283250832", "https://noma130.io.vn/n130d", "https://noma130.io.vn/n130tpn"],
  };
  for (const [ten, [pixel, link, linkPn]] of Object.entries(mong)) {
    assert.ok(P[ten], `thiếu ${ten} trong dropdown sản phẩm`);
    assert.equal(P[ten].pixel, pixel, `${ten}: pixel sai`);
    assert.equal(P[ten].link, link, `${ten}: link Duy sai`);
    assert.equal(P[ten].linkPn, linkPn, `${ten}: link Phương Nam sai`);
    // Chưa ai chốt tkqc/trang cho ba SKU này — để rỗng buộc người chạy tự chọn,
    // điền bừa là tiền chạy sang tài khoản khác.
    assert.equal(P[ten].account, "", `${ten}: account phải để rỗng cho tới khi chốt`);
    assert.equal(P[ten].page, "", `${ten}: page phải để rỗng cho tới khi chốt`);
  }
});

test("mọi sản phẩm trong dropdown đều có nội dung cho AI viết caption", () => {
  const html = readFileSync(new URL("../ads-creator.html", import.meta.url), "utf8");
  const block = html.match(/const PRODUCTS = \{[\s\S]*?\r?\n  \}/);
  const P = new Function(`${block[0]};\nreturn PRODUCTS`)();
  for (const ten of Object.keys(P)) {
    assert.ok(PRODUCTS[ten], `${ten} có trong dropdown nhưng THIẾU ở product-catalog.js → AI không viết được bài`);
  }
});
