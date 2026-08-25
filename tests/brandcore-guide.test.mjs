import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { laDanhMucHuongDan, laBaiNoma } from "../functions/api/products/_wp-posts.js";
import { GAP_FIELDS_HDSD, doiChieuBaiHdsd } from "../functions/api/products/_gap.js";
import {
  CLAIM_QUANG_CAO_CHUNG, QUY_TAC_QUANG_CAO_CHUNG, NOMA_FORBIDDEN, scanForbidden,
} from "../functions/api/geo/_utils/noma-brandcore.js";
import { onRequestPost as scan } from "../functions/api/products/brandcore-scan.js";

/* ══════════════════════════════════════════════════════════════════════════════
   SOÁT PHẦN HƯỚNG DẪN SỬ DỤNG trên doscom.vn & noma.vn (bài viết WordPress).

   Rủi ro lớn nhất của phần này KHÔNG phải là chạy sai kỹ thuật, mà là SỬA NHẦM NGƯỜI:
   doscom.vn để bài hướng dẫn camera/máy dò Doscom chung danh mục với bài NOMA. Đem
   Brand Core NOMA áp lên bài Doscom là gán nhầm định danh thương hiệu ngay trên trang
   đang chạy quảng cáo. Phần lớn test dưới đây canh đúng chuyện đó.

   Rủi ro thứ hai: ghi đè bài bằng bản `content.rendered`. WordPress dựng lại HTML khi
   render (shortcode đã chạy, khối `<!-- wp:… -->` đã mất) nên ghi bản đó ngược vào bài
   là xoá sạch cấu trúc block — backup có cứu được nội dung nhưng người dùng đã kịp thấy
   bài vỡ trên web. Vì vậy đường ghi phải TỪ CHỐI khi không đọc được raw.
   ══════════════════════════════════════════════════════════════════════════════ */

// ── Nhận diện danh mục hướng dẫn ────────────────────────────────────────────
test("bắt đúng các danh mục hướng dẫn CÓ THẬT trên hai web", () => {
  // Lấy nguyên tên/slug đang có trên doscom.vn và noma.vn (WP REST, 25/08/2026).
  const that = [
    { name: "Hướng Dẫn Sử Dụng", slug: "huong-dan-su-dung" },
    { name: "Hướng dẫn chăm sóc xe", slug: "huong-dan-cham-soc-xe" },
    { name: "Hướng dẫn DIY", slug: "huong-dan-diy" },
    { name: "NOMA Product Guide", slug: "noma-product-guide" },
    { name: "Hướng dẫn sử dụng sản phẩm", slug: "huong-dan-su-dung-san-pham" },
  ];
  for (const c of that) assert.ok(laDanhMucHuongDan(c), `phải nhận là danh mục hướng dẫn: ${c.name}`);
});

test("KHÔNG quét lan sang danh mục không phải hướng dẫn", () => {
  // Quét lan = kéo cả trăm bài tin tức về rồi sửa chữ trong đó — tốn tiền AI và sửa nhầm chỗ.
  const khong = [
    { name: "Tin Tức", slug: "tin-tuc" },
    { name: "An ninh gia đình", slug: "an-ninh-gia-dinh" },
    { name: "Chăm Sóc Ô Tô", slug: "cham-soc-o-to" },
    { name: "NOMA sản phẩm", slug: "noma-san-pham" },
  ];
  for (const c of khong) assert.ok(!laDanhMucHuongDan(c), `không được coi là hướng dẫn: ${c.name}`);
});

test("bài camera Doscom KHÔNG bị nhận nhầm là bài NOMA", () => {
  assert.ok(!laBaiNoma({ name: "Kiểm tra camera ẩn phòng: Hướng dẫn với Doscom D1", content: "<p>Bật máy dò…</p>" }));
  assert.ok(laBaiNoma({ name: "HƯỚNG DẪN SỬ DỤNG NOMA 350", content: "<p>Xịt dung dịch…</p>" }));
  // Nhắc NOMA trong thân bài cũng tính — bài so sánh sản phẩm vẫn phải theo brand core.
  assert.ok(laBaiNoma({ name: "Vệ sinh phanh đĩa tại nhà", content: "<p>Dùng NOMA 350 xịt đều…</p>" }));
});

// ── Bộ luật cho bài KHÔNG thuộc NOMA ────────────────────────────────────────
test("luật quảng cáo chung KHÔNG chứa một luật xuất xứ/MSDS nào của NOMA", () => {
  for (const f of CLAIM_QUANG_CAO_CHUNG) {
    assert.ok(!/^xuất xứ:/.test(f.type), `lọt luật xuất xứ NOMA vào bộ chung: ${f.type}`);
    assert.ok(!/MSDS|GHS|quốc tế/i.test(f.type + " " + f.fix), `lọt luật riêng của NOMA: ${f.type}`);
  }
  // Khối luật nhét vào prompt cũng không được mang theo định danh/xuất xứ NOMA:
  // AI đọc thấy là có ngày tự "sửa" bài Doscom cho hợp brand core NOMA.
  assert.ok(!/gốc Mỹ|OEM|Made in USA|NOMA Technologies/i.test(QUY_TAC_QUANG_CAO_CHUNG),
    "khối luật chung đang mô tả thương hiệu NOMA — bỏ ra, bài Doscom không liên quan");
  assert.match(QUY_TAC_QUANG_CAO_CHUNG, /KHÔNG chèn định danh, xuất xứ hay thông điệp NOMA/);
});

test("mọi mục khai trong bộ chung đều TỒN TẠI trong NOMA_FORBIDDEN", () => {
  /* Bộ chung dựng bằng cách lọc theo TÊN loại vi phạm. Đổi tên một type trong
     NOMA_FORBIDDEN mà quên chỗ này thì luật đó lặng lẽ biến mất — bài Doscom hết bị
     soát mà không có lỗi nào nổi lên. Test này là cái chuông đó. */
  assert.equal(CLAIM_QUANG_CAO_CHUNG.length, 13, "số luật chung thay đổi — kiểm lại TYPE_CHUNG trong noma-brandcore.js");
  for (const f of CLAIM_QUANG_CAO_CHUNG) {
    assert.ok(NOMA_FORBIDDEN.some((x) => x.type === f.type), `type không còn trong NOMA_FORBIDDEN: ${f.type}`);
  }
});

test("bài Doscom: bắt claim thổi phồng nhưng BỎ QUA chuyện xuất xứ Mỹ", () => {
  const bai = "Máy dò Doscom D1 tốt nhất thị trường, phát hiện 100% thiết bị. Made in USA.";
  const co = scanForbidden(bai, CLAIM_QUANG_CAO_CHUNG).map((f) => f.type);
  assert.ok(co.includes("từ cấm: tốt nhất"));
  assert.ok(co.includes("claim: 100%"));
  assert.ok(!co.some((t) => /xuất xứ/.test(t)),
    "bài Doscom KHÔNG được soát bằng luật xuất xứ NOMA — sửa vào là gán nhầm định danh thương hiệu");
  // Cùng câu đó nếu là bài NOMA thì xuất xứ PHẢI bị bắt.
  assert.ok(scanForbidden(bai, NOMA_FORBIDDEN).map((f) => f.type).includes("xuất xứ: Made in USA"));
});

// ── Đối chiếu hồ sơ cho BÀI hướng dẫn ───────────────────────────────────────
const SPEC = {
  ten: "NOMA 350 - Dung dịch vệ sinh phanh đĩa",
  dung_tich: "450ml",
  bao_hanh: "12 tháng",
  thanh_phan: "Acetone 40% / Heptane 30%",
  hdsd: "Bước 1: Lắc đều chai. Bước 2: Xịt trực tiếp lên đĩa phanh. Bước 3: Chờ 5 phút cho khô.",
  luu_y: "Không xịt lên lốp cao su. Bảo quản nơi thoáng mát, tránh ánh nắng.",
  ppe: "Đeo găng tay nitrile và kính bảo hộ khi thao tác",
  so_cuu: "Dính mắt: rửa nước sạch 15 phút rồi tới cơ sở y tế",
  thoi_gian: "Hiệu quả duy trì 3 tháng",
};

test("bộ trường của BÀI khác trang bán hàng — không đòi dung tích/bảo hành/thành phần", () => {
  const keys = GAP_FIELDS_HDSD.map((f) => f.key);
  for (const k of ["dung_tich", "bao_hanh", "thanh_phan", "usp", "mo_ta"]) {
    assert.ok(!keys.includes(k), `bài hướng dẫn không có nghĩa vụ nhắc "${k}" — đòi là tạo danh sách thiếu giả`);
  }
  for (const k of ["hdsd", "luu_y", "ppe", "so_cuu"]) assert.ok(keys.includes(k), `thiếu trường bắt buộc "${k}"`);
});

test("bước dùng, lưu ý, PPE, sơ cứu là TRỌNG YẾU trong bài hướng dẫn", () => {
  const trongYeu = GAP_FIELDS_HDSD.filter((f) => f.trong_yeu).map((f) => f.key).sort();
  assert.deepEqual(trongYeu, ["hdsd", "luu_y", "ppe", "so_cuu"]);
});

test("bài thiếu đồ bảo hộ + sơ cứu → báo thiếu TRỌNG YẾU, không im lặng", () => {
  const bai = {
    name: "HƯỚNG DẪN SỬ DỤNG NOMA 350",
    content: `<p>Lắc đều chai rồi xịt trực tiếp lên đĩa phanh, chờ 5 phút cho khô.</p>
              <p>Không xịt lên lốp cao su. Bảo quản nơi thoáng mát, tránh ánh nắng.</p>`,
  };
  const kq = doiChieuBaiHdsd(bai, SPEC);
  assert.ok(kq.co_ho_so);
  const thieu = kq.thieu.map((x) => x.truong);
  assert.ok(thieu.includes("ppe"), "thiếu đồ bảo hộ mà không báo là nguy hiểm thật");
  assert.ok(thieu.includes("so_cuu"));
  // Bài đã có bước dùng + lưu ý → KHÔNG được báo thiếu (thiếu giả là thứ giết niềm tin).
  assert.ok(!thieu.includes("hdsd"), "bài đã ghi đủ bước mà vẫn báo thiếu → báo thiếu giả");
  assert.ok(!thieu.includes("luu_y"));
  // Và tuyệt đối không đòi dung tích/bảo hành như trang bán hàng.
  assert.ok(!thieu.includes("dung_tich") && !thieu.includes("bao_hanh"));
});

// ── Quét thật một lượt: giả lập WordPress REST ──────────────────────────────
function gia(json, headers = {}) {
  return new Response(JSON.stringify(json), { status: 200, headers: { "content-type": "application/json", ...headers } });
}

/* Giả lập WP REST của doscom.vn: một danh mục hướng dẫn + một danh mục tin tức,
   trong đó có 1 bài NOMA và 1 bài Doscom. Đây là đúng tình huống ngoài đời. */
function gaWordPress() {
  return async (url) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith("/wp-json/wp/v2/categories")) {
      return gia([
        { id: 1035, name: "Hướng Dẫn Sử Dụng", slug: "huong-dan-su-dung", count: 2 },
        { id: 42, name: "Tin Tức", slug: "tin-tuc", count: 9 },
        { id: 99, name: "Hướng dẫn DIY", slug: "huong-dan-diy", count: 0 }, // rỗng → bỏ
      ]);
    }
    if (u.pathname.endsWith("/wp-json/wp/v2/posts")) {
      assert.equal(u.searchParams.get("categories"), "1035", "chỉ được kéo bài trong danh mục hướng dẫn");
      assert.equal(u.searchParams.get("context"), "edit", "phải đọc context=edit để có content.raw");
      return gia([
        {
          id: 32387, link: "https://doscom.vn/hdsd-noma-350/", status: "publish", categories: [1035],
          title: { raw: "HƯỚNG DẪN SỬ DỤNG NOMA 350" },
          content: { raw: "<!-- wp:paragraph --><p>Sản phẩm Made in USA, an toàn tuyệt đối.</p><!-- /wp:paragraph -->" },
        },
        {
          id: 25083, link: "https://doscom.vn/camera-da1-pro/", status: "publish", categories: [1035],
          title: { raw: "Hướng dẫn kết nối WiFi Doscom DA1 Pro" },
          content: { raw: "<p>Camera Doscom DA1 Pro tốt nhất phân khúc, chuẩn Made in USA.</p>" },
        },
      ], { "X-WP-TotalPages": "1", "X-WP-Total": "2" });
    }
    throw new Error("gọi nhầm endpoint: " + u.pathname);
  };
}

const ENV = {
  WC_DOSCOM_USER: "u", WC_DOSCOM_APP_PWD: "p", WC_DOSCOM_CK: "ck", WC_DOSCOM_CS: "cs",
};

async function goiScan(body) {
  const goc = globalThis.fetch;
  globalThis.fetch = gaWordPress();
  try {
    const res = await scan({
      request: new Request("https://crm.test/api/products/brandcore-scan", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      }),
      env: ENV,
    });
    return await res.json();
  } finally {
    globalThis.fetch = goc;
  }
}

test("quét bài hướng dẫn: mỗi bài chịu ĐÚNG bộ luật của nó", async () => {
  const d = await goiScan({ site: "doscom", target: "guide", mode: "list" });
  assert.ok(d.ok, d.error);
  assert.equal(d.target, "guide");
  assert.equal(d.scanned, 2);
  assert.equal(d.noma_count, 1, "chỉ 1 trong 2 bài nói về NOMA");
  assert.equal(d.guide_categories.length, 1, "danh mục Tin Tức và danh mục rỗng phải bị loại");

  const noma = d.items.find((x) => x.id === 32387);
  const doscom = d.items.find((x) => x.id === 25083);

  assert.ok(noma.la_noma && noma.sku === "350");
  const cnNoma = noma.flags.map((f) => f.type);
  assert.ok(cnNoma.includes("xuất xứ: Made in USA"));
  assert.ok(cnNoma.includes("claim: an toàn tuyệt đối"));

  assert.ok(!doscom.la_noma);
  const cnDoscom = doscom.flags.map((f) => f.type);
  assert.ok(cnDoscom.includes("từ cấm: tốt nhất"));
  assert.ok(!cnDoscom.some((t) => /xuất xứ/.test(t)),
    "bài Doscom bị soát bằng luật xuất xứ NOMA → sẽ sửa 'Made in USA' thành định danh NOMA trên bài camera");
});

test("target lạ bị chặn thay vì âm thầm quét sản phẩm", async () => {
  const d = await goiScan({ site: "doscom", target: "bai-viet", mode: "list" });
  assert.equal(d.ok, false);
  assert.match(d.error, /target không hợp lệ/);
});

// ── Rào chắn ở đường GHI ────────────────────────────────────────────────────
const APPLY = readFileSync(new URL("../functions/api/products/brandcore-apply.js", import.meta.url), "utf8").split("\r\n").join("\n");
const SCAN = readFileSync(new URL("../functions/api/products/brandcore-scan.js", import.meta.url), "utf8").split("\r\n").join("\n");
const WP = readFileSync(new URL("../functions/api/products/_wp-posts.js", import.meta.url), "utf8").split("\r\n").join("\n");
const UI = readFileSync(new URL("../brandcore-fix.html", import.meta.url), "utf8");

test("không đọc được content.raw → TỪ CHỐI ghi, không ghi bản rendered", () => {
  assert.match(APPLY, /if \(!orig\.raw\)/, "mất rào chắn raw — ghi bản rendered là xoá khối Gutenberg của bài");
  const iCheck = APPLY.indexOf("if (!orig.raw)");
  const iGhi = APPLY.indexOf("await updatePost(c, id, newContent)");
  assert.ok(iCheck > 0 && iGhi > iCheck, "phải kiểm raw TRƯỚC khi ghi");
});

test("bài hướng dẫn có sao lưu riêng, không đè lên backup của sản phẩm", () => {
  // Trùng khoá là hoàn tác sản phẩm #350 lại lôi về nội dung bài viết #350.
  assert.match(APPLY, /bcbackup:\$\{site\}:post:\$\{id\}/);
  const iBackup = APPLY.indexOf("KV_BACKUP_POST(site, id, ts)");
  const iUpdate = APPLY.indexOf("await updatePost(c, id, newContent)");
  assert.ok(iBackup > 0 && iUpdate > iBackup, "phải sao lưu TRƯỚC khi ghi đè");
});

test("đường ghi sản phẩm KHÔNG bị đụng tới", () => {
  assert.match(APPLY, /updateProduct\(c, id, \{ description: newDesc/);
  assert.match(SCAN, /listNomaProducts\(c, site\)/);
});

test("ghi bài chỉ gửi content — không đụng tiêu đề, danh mục, trạng thái đăng", () => {
  assert.match(WP, /body: JSON\.stringify\(\{ content \}\)/,
    "gửi kèm trường khác là có ngày tự đổi trạng thái/tiêu đề bài đang chạy");
});

test("đọc bài ưu tiên context=edit, thiếu quyền thì hạ xuống view và báo raw:false", () => {
  assert.match(WP, /let r = await goi\("edit"\)/);
  assert.match(WP, /r\.status === 401 \|\| r\.status === 403/);
  assert.match(WP, /const coRaw = typeof \(p && p\.content && p\.content\.raw\) === "string"/);
});

// ── Giao diện: không được gửi thiếu `target` ────────────────────────────────
test("MỌI request tới brandcore-scan/apply đều kèm target", () => {
  /* Thiếu `target` là máy chủ mặc định về "product": người dùng chọn "Bài hướng dẫn",
     bấm nút, thấy chạy ngon — nhưng thực ra vừa soát/sửa sản phẩm. Loại lỗi im lặng
     đúng nghĩa, nên phải canh từng chỗ gọi. */
  for (const ep of ["/api/products/brandcore-scan", "/api/products/brandcore-apply"]) {
    const phan = UI.split(`fetch("${ep}"`).slice(1);
    assert.ok(phan.length >= 2, `không tìm thấy chỗ gọi ${ep}`);
    for (const chunk of phan) {
      const than = chunk.slice(0, 700);
      assert.match(than, /target: loai\(\)/, `một lời gọi ${ep} quên kèm target:\n${than.slice(0, 200)}`);
    }
  }
});

test("đổi loại nội dung thì dọn kết quả cũ", () => {
  // Giữ lại danh sách sản phẩm rồi bấm "Rà bằng AI" ở chế độ bài = gửi id sản phẩm
  // sang đường bài viết → rà nhầm bài, và bản sửa đề xuất là của nội dung khác.
  assert.match(UI, /\$\("#loai"\)\.onchange/);
  assert.match(UI, /scanned = \[\]; proposals = \[\]; daSuaPhien = \[\];/);
});

test("nội dung bổ sung cho bài ghi vào trường content, không phải description", () => {
  assert.match(UI, /laBai\(\) \? \{ content: r\.new_content \} : \{ description: r\.new_description \}/);
});
