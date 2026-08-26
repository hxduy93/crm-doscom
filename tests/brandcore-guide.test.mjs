import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { laDanhMucHuongDan, laBaiNoma, laBaiHdsdChinhThuc } from "../functions/api/products/_wp-posts.js";
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
test("bám ĐÚNG mục Hướng dẫn sử dụng của menu Kiến thức", () => {
  // Đúng mục menu: noma.vn /danh-muc/huong-dan-su-dung, doscom.vn /category/huong-dan-su-dung.
  const that = [
    { name: "Hướng Dẫn Sử Dụng", slug: "huong-dan-su-dung" },
    { name: "Hướng dẫn sử dụng NOMA", slug: "huong-dan-su-dung-noma" },
    { name: "Hướng dẫn sử dụng sản phẩm", slug: "huong-dan-su-dung-san-pham" },
    { name: "Hướng dẫn sử dụng Doscom", slug: "huong-dan-su-dung-doscom" },
  ];
  for (const c of that) assert.ok(laDanhMucHuongDan(c), `phải nhận là mục hướng dẫn sử dụng: ${c.name}`);
});

test("KHÔNG quét lan sang danh mục SEO — đây là chỗ đã sai một lần", () => {
  /* Bản đầu nhận mọi danh mục có chữ "hướng dẫn/guide" nên kéo cả "Hướng dẫn chăm sóc
     xe", "Hướng dẫn DIY", "NOMA Product Guide" — toàn bài SEO/so sánh. Đo thật trên
     noma.vn 25/08/2026: 89 bài quét được thì 71 bài SEO, gánh 204/250 mục "còn thiếu"
     vô lý. Nới lại luật này là dựng lại đúng đống nhiễu đó. */
  const khong = [
    { name: "Hướng dẫn chăm sóc xe", slug: "huong-dan-cham-soc-xe" },
    { name: "Hướng dẫn DIY", slug: "huong-dan-diy" },
    { name: "NOMA Product Guide", slug: "noma-product-guide" },
    { name: "Hướng dẫn vệ sinh xe", slug: "huong-dan-ve-sinh-xe" },
    { name: "Tin Tức", slug: "tin-tuc" },
    { name: "Chăm Sóc Ô Tô", slug: "cham-soc-o-to" },
  ];
  for (const c of khong) assert.ok(!laDanhMucHuongDan(c), `không được kéo về: ${c.name}`);
});

test("phân biệt bài HDSD chính thức với bài SEO lọt vào danh mục", () => {
  // Chỉ bài HDSD chính thức mới bị đối chiếu đủ hồ sơ sản phẩm.
  for (const t of [
    "HƯỚNG DẪN SỬ DỤNG NOMA 350: DUNG DỊCH VỆ SINH PHANH ĐĨA",
    "Hướng dẫn sử dụng bộ vệ sinh và dưỡng ghế da Noma 692",
    "HƯỚNG DẪN SỬ DỤNG NOMA NOMA 110 – DẦU CHỐNG RỈ",
  ]) assert.ok(laBaiHdsdChinhThuc(t), `phải là bài HDSD chính thức: ${t}`);

  for (const t of [
    "Hướng dẫn phủ kính chống nước ô tô hiệu quả với NOMA 922",   // bài chủ dự án chụp màn hình
    "Phủ kính chống nước ô tô top 3 năm 2026: NOMA 922, 3M, Soft9",
    "NOMA 230 vs Liqui Moly: Chọn giải pháp dưỡng taplo",
    "Hướng dẫn sử dụng máy dò Doscom D1",                          // có khuôn nhưng không phải SKU NOMA
  ]) assert.ok(!laBaiHdsdChinhThuc(t), `KHÔNG được coi là bài HDSD chính thức: ${t}`);
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
      assert.equal(u.searchParams.get("context"), "edit", "phải đọc context=edit để có content.raw");
      assert.equal(u.searchParams.get("categories"), null,
        "phạm vi quét bám TIÊU ĐỀ, không được lọc theo danh mục nữa");
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

  const noma = d.items.find((x) => x.id === 32387);
  const doscom = d.items.find((x) => x.id === 25083);

  assert.ok(noma.la_noma && noma.sku === "350");
  assert.ok(doscom.sku === null, "bài thiết bị Doscom không dò ra mã NOMA nên không có hồ sơ để đổi tên");
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

test("GHI NỘI DUNG mà không đọc được content.raw → TỪ CHỐI", () => {
  assert.match(APPLY, /if \(doiNoiDung && !orig\.raw\)/,
    "mất rào chắn raw — ghi bản rendered là xoá khối Gutenberg của bài");
  const iCheck = APPLY.indexOf("if (doiNoiDung && !orig.raw)");
  const iGhi = APPLY.indexOf("await updatePost(c, id, ghi)");
  assert.ok(iCheck > 0 && iGhi > iCheck, "phải kiểm raw TRƯỚC khi ghi");
});

test("VÁ TIÊU ĐỀ không bị rào chắn raw chặn nhầm", () => {
  /* Vá tiêu đề không đụng nội dung nên không cần content.raw. Bắt nó qua cửa raw là
     46 bài mất tiêu đề của noma.vn không vá được nếu tài khoản thiếu quyền đọc bản gốc. */
  assert.match(APPLY, /const doiNoiDung = violations\.length > 0 \|\| ghiThang;/);
  assert.ok(!/if \(!orig\.raw\)/.test(APPLY), "rào chắn raw phải gắn với việc GHI NỘI DUNG, không gắn với mọi lần ghi");
});

test("bài hướng dẫn có sao lưu riêng, không đè lên backup của sản phẩm", () => {
  // Trùng khoá là hoàn tác sản phẩm #350 lại lôi về nội dung bài viết #350.
  assert.match(APPLY, /bcbackup:\$\{site\}:post:\$\{id\}/);
  const iBackup = APPLY.indexOf("KV_BACKUP_POST(site, id, ts)");
  const iUpdate = APPLY.indexOf("await updatePost(c, id, ghi)");
  assert.ok(iBackup > 0 && iUpdate > iBackup, "phải sao lưu TRƯỚC khi ghi đè");
});

test("hoàn tác chỉ trả lại ĐÚNG trường đã sửa", () => {
  /* Bản vá tiêu đề không đọc content.raw nên backup của nó không có nội dung tin cậy.
     Hoàn tác mà ghi luôn `content` là dùng chính nút cứu hộ để phá bài. */
  assert.match(APPLY, /const daSua = Array\.isArray\(bak\.da_sua\) \? bak\.da_sua : \["content"\]/);
  assert.match(APPLY, /da_sua: Object\.keys\(ghi\)/, "backup phải ghi lại đã sửa trường nào");
});

test("đường ghi sản phẩm KHÔNG bị đụng tới", () => {
  assert.match(APPLY, /updateProduct\(c, id, \{ description: newDesc/);
  assert.match(SCAN, /listNomaProducts\(c, site\)/);
});

test("ghi bài chỉ gửi ĐÚNG trường được giao", () => {
  // Gửi kèm trường khác là có ngày tự đổi trạng thái đăng / danh mục của bài đang chạy.
  assert.match(WP, /if \(typeof truong\?\.content === "string"\) payload\.content = truong\.content;/);
  assert.match(WP, /if \(typeof truong\?\.title === "string"\) payload\.title = truong\.title;/);
  assert.match(WP, /if \(!Object\.keys\(payload\)\.length\) throw new Error/,
    "không có trường nào để ghi thì phải báo lỗi, không gửi POST rỗng");
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


/* ══ Phạm vi đối chiếu hồ sơ + soát tiêu đề ═══════════════════════════════════
   Hai thứ này sinh ra từ một lượt quét thật 25/08/2026 trên noma.vn:
     · 71/89 bài là SEO nhưng vẫn bị đòi chép đủ hồ sơ → 204/250 mục "thiếu" vô lý.
     · 46/111 bài có post_title RỖNG → trang mất <title> và <h1>.
   ═════════════════════════════════════════════════════════════════════════════ */

// WP giả cho mục "Hướng dẫn sử dụng" của noma.vn: 1 bài HDSD chính thức + 1 bài SEO.
function gaNoma() {
  const BAI = [
    {
      id: 32387, link: "https://noma.vn/hdsd-noma-350/", status: "publish", categories: [37],
      title: { raw: "HƯỚNG DẪN SỬ DỤNG NOMA 350: DUNG DỊCH VỆ SINH PHANH ĐĨA" },
      content: { raw: "<p>Lắc đều chai rồi xịt trực tiếp lên đĩa phanh, chờ 5 phút cho khô.</p>" },
    },
    {
      id: 33355, link: "https://noma.vn/phu-kinh-noma-922/", status: "publish", categories: [37],
      title: { raw: "Hướng dẫn phủ kính chống nước ô tô hiệu quả với NOMA 922" },
      content: { raw: "<p>Phủ kính chống nước là giải pháp tốt nhất cho mùa mưa.</p>" },
    },
    {
      id: 32801, link: "https://noma.vn/5-loi-ve-sinh-ghe-da-o-to-noma-692/", status: "publish", categories: [100],
      title: { raw: "" },                                   // bài mất tiêu đề (có thật)
      content: { raw: "<p>Ghế da bẩn thì dùng NOMA 692.</p>" },
    },
    {
      id: 32802, link: "https://noma.vn/trung-ten/", status: "publish", categories: [100],
      title: { raw: "Hướng dẫn phủ kính chống nước ô tô hiệu quả với NOMA 922" },  // trùng 33355
      content: { raw: "<p>Bài trùng tên.</p>" },
    },
  ];
  return async (url) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith("/wp-json/wp/v2/categories")) {
      return gia([
        { id: 37, name: "Hướng Dẫn Sử Dụng", slug: "huong-dan-su-dung", count: 2 },
        { id: 100, name: "Hướng dẫn chăm sóc xe", slug: "huong-dan-cham-soc-xe", count: 21 },
      ]);
    }
    if (u.pathname.endsWith("/wp-json/wp/v2/posts")) {
      // include= → lấy nội dung đúng những bài đã lọc theo tiêu đề; không có → đọc tiêu đề toàn web.
      const inc = u.searchParams.get("include");
      const ds = inc ? BAI.filter((b) => inc.split(",").map(Number).includes(b.id)) : BAI;
      return gia(ds, { "X-WP-TotalPages": "1", "X-WP-Total": String(ds.length) });
    }
    throw new Error("gọi nhầm endpoint: " + u.pathname);
  };
}

const ENV_NOMA = { WC_NOMA_USER: "u", WC_NOMA_APP_PWD: "p", WC_NOMA_CK: "ck", WC_NOMA_CS: "cs" };

async function goiNoma(body) {
  const goc = globalThis.fetch;
  globalThis.fetch = gaNoma();
  try {
    const res = await scan({
      request: new Request("https://crm.test/api/products/brandcore-scan", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      }),
      env: ENV_NOMA,
    });
    return await res.json();
  } finally { globalThis.fetch = goc; }
}

test("quét theo TIÊU ĐỀ: chỉ bài có 'hướng dẫn sử dụng' trong tên", async () => {
  /* Chủ dự án chốt 25/08/2026: "quét ra tất cả bài viết có tiêu đề hướng dẫn sử dụng,
     đừng kèm bài viết khác". Bài SEO nằm CÙNG danh mục cũng phải bị loại; ngược lại bài
     hướng dẫn nằm ngoài danh mục vẫn phải quét được. */
  const d = await goiNoma({ site: "noma", target: "guide", mode: "list" });
  assert.ok(d.ok, d.error);
  assert.equal(d.scanned, 1, "chỉ 1 bài có 'hướng dẫn sử dụng' trong tiêu đề");
  assert.equal(d.items[0].id, 32387);
  assert.equal(d.tong_bai_tren_web, 4, "vẫn đọc tiêu đề toàn web rồi mới lọc");
  assert.ok(!d.items.some((x) => x.id === 33355),
    "bài SEO 'Hướng dẫn phủ kính…' cùng danh mục KHÔNG được kéo vào");
});

test("đối chiếu hồ sơ chỉ chạy trên bài đã lọc theo tiêu đề", async () => {
  const d = await goiNoma({ site: "noma", target: "guide", mode: "gap" });
  assert.ok(d.ok, d.error);
  assert.equal(d.scanned, 1, "bài SEO không lọt vào đây nữa nên không sinh mục thiếu giả");
  assert.equal(d.results[0].id, 32387);
});

test("soát tiêu đề: bắt bài mất tiêu đề, trùng tên và sai khuôn", async () => {
  const d = await goiNoma({ site: "noma", target: "guide", mode: "title" });
  assert.ok(d.ok, d.error);
  assert.equal(d.scanned, 4, "phải quét TOÀN BỘ bài, không bó trong mục hướng dẫn");

  const rong = d.results.find((r) => r.id === 32801);
  assert.ok(rong, "bài mất tiêu đề phải lọt vào danh sách — đây là lỗi nặng nhất");
  assert.ok(rong.van_de.some((v) => v.ma === "rong"));
  assert.equal(d.results[0].id, 32801, "bài mất tiêu đề phải xếp lên đầu");

  const trung = d.results.filter((r) => r.van_de.some((v) => v.ma === "trung"));
  assert.equal(trung.length, 2, "cả hai bài trùng tên đều phải được nêu");

  // Bài SEO nằm trong mục hướng dẫn + nhắc NOMA → nhắc là sai khuôn tiêu đề HDSD.
  const saiKhuon = d.results.find((r) => r.id === 33355);
  assert.ok(saiKhuon.van_de.some((v) => v.ma === "khuon"));

  // Bài HDSD chính thức không có vấn đề gì → không được xuất hiện.
  assert.ok(!d.results.some((r) => r.id === 32387));
});

test("khuôn tiêu đề HDSD chỉ áp cho bài NOMA — không bắt bài Doscom theo khuôn NOMA", () => {
  /* doscom.vn có 93 bài hướng dẫn camera/máy dò trong đúng mục này. Bắt chúng theo khuôn
     "Hướng dẫn sử dụng NOMA <mã>" là 93 bài cùng báo lỗi một lượt, vô nghĩa. */
  assert.match(SCAN, /if \(trongMucHdsd && tenNoma && !laBaiHdsdChinhThuc\(p\.tieu_de\)\)/);
});

test("tiêu đề AI đặt ra vẫn bị soát lại trước khi cho vá", () => {
  // Đây là chữ sẽ thành <title> + <h1> của bài — tin prompt là có ngày "NOMA 911 tốt nhất" lên web.
  assert.match(SCAN, /const viPham = scanForbidden\(moi, forbidden\);/);
  assert.match(SCAN, /trung_voi: idTrung && idTrung !== id \? idTrung : null/);
  assert.match(UI, /if \(chuaSuaTay && \(\(d\.vi_pham && d\.vi_pham\.length\) \|\| d\.trung_voi/,
    "giao diện phải chặn vá tiêu đề vi phạm mà người dùng chưa sửa tay");
});

test("giao diện có đủ ba nấc của phần tiêu đề", () => {
  for (const id of ["btnTitleScan", "btnTitleDraft", "btnTitleApply", "btnTitlePickEmpty"]) {
    assert.match(UI, new RegExp(`id="${id}"`), `thiếu nút #${id}`);
  }
  // Vá tiêu đề gửi trường `title`, không phải content.
  assert.match(UI, /fixes\.push\(\{ id: row\.id, title: moi \}\)/);
});

test("không cho AI cướp khuôn tiêu đề của bài hướng dẫn chính thức", () => {
  /* Suýt xảy ra thật khi chạy thử 25/08/2026: một bài mẹo về đèn pha được AI đặt thành
     "Hướng dẫn sử dụng NOMA 620: Xóa ố vàng đèn pha tại nhà", trong khi bài HDSD 620
     chính thức đang chạy — hai bài cùng khuôn cho một sản phẩm là tự cắn từ khoá nhau. */
  assert.match(SCAN, /const chuKhuon = code/, "mất bước dò xem khuôn HDSD của SKU đã có chủ chưa");
  assert.match(SCAN, /trung_khuon: chuKhuon && laBaiHdsdChinhThuc\(moi\) \? \{ id: chuKhuon\.id/,
    "phải tự kiểm lại kết quả AI, không tin mỗi lời dặn trong prompt");
  assert.match(UI, /d\.trung_voi \|\| d\.trung_khuon\)\) continue;/,
    "giao diện phải chặn vá tiêu đề cướp khuôn khi người dùng chưa sửa tay");
});

/* ══ Khuôn đặt tên bài hướng dẫn theo HỒ SƠ SẢN PHẨM ══════════════════════════
   Chủ dự án chốt 25/08/2026: tên trong tiêu đề bài hướng dẫn phải đúng cột "Tên sản
   phẩm" của hồ sơ (_Hồ sơ sản phẩm cập nhật 22-8), không phải chữ ai đó gõ trên WP.
   Ba tình huống có thật trên noma.vn, mỗi cái xử lý một kiểu:
     · lệch chữ            → dựng tên chuẩn, sửa được ngay, KHÔNG cần AI
     · gắn nhầm mã sản phẩm → chỉ báo, người quyết (không biết sai mã hay sai mô tả)
     · hai bài cùng một mã  → chỉ báo, đổi cả hai về một tên là trùng khít hơn
   ═════════════════════════════════════════════════════════════════════════════ */
const HO_SO = {
  "350": { ten: "NOMA 350 - Dung Dịch Vệ Sinh Đĩa Phanh", hdsd: "Xịt lên đĩa phanh" },
  "686": { ten: "NOMA 686 - Bộ vệ sinh và dưỡng ghế da", hdsd: "Lau ghế da" },
  "692": { ten: "NOMA 692 - Dung dịch vệ sinh nội thất và trần xe", hdsd: "Xịt lên nội thất" },
  "911": { ten: "NOMA 911 - Dung dịch tẩy ố kính", hdsd: "Chà lên kính" },
};

// KV giả: hồ sơ sản phẩm dạng mới (như file .xlsx chủ dự án tải lên).
const ENV_HOSO = {
  ...ENV_NOMA,
  INVENTORY: { get: async (k) => (k === "noma_sku_specs:v2" ? JSON.stringify({ specs: HO_SO, ten_file: "test.xlsx" }) : null) },
};

function gaTieuDe() {
  const BAI = [
    { id: 1, link: "https://noma.vn/a/", status: "publish", categories: [37],
      title: { raw: "HƯỚNG DẪN SỬ DỤNG NOMA 350 - DUNG DỊCH VỆ SINH PHANH ĐĨA" }, content: { raw: "<p>x</p>" } },
    { id: 2, link: "https://noma.vn/b/", status: "publish", categories: [37],
      title: { raw: "Hướng dẫn sử dụng NOMA 911: Dung dịch tẩy ố kính" }, content: { raw: "<p>x</p>" } },
    { id: 3, link: "https://noma.vn/c/", status: "publish", categories: [37],
      title: { raw: "Hướng dẫn sử dụng bộ vệ sinh và dưỡng ghế da Noma 692" }, content: { raw: "<p>x</p>" } },
  ];
  return async (url) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith("/wp-json/wp/v2/categories")) {
      return gia([{ id: 37, name: "Hướng Dẫn Sử Dụng", slug: "huong-dan-su-dung", count: 3 }]);
    }
    if (u.pathname.endsWith("/wp-json/wp/v2/posts")) {
      return gia(BAI, { "X-WP-TotalPages": "1" });
    }
    throw new Error("gọi nhầm endpoint: " + u.pathname);
  };
}

async function soatTieuDe(fetchGia = gaTieuDe(), env = ENV_HOSO) {
  const goc = globalThis.fetch;
  globalThis.fetch = fetchGia;
  try {
    const res = await scan({
      request: new Request("https://crm.test/api/products/brandcore-scan", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ site: "noma", target: "guide", mode: "title" }),
      }),
      env,
    });
    return await res.json();
  } finally { globalThis.fetch = goc; }
}

test("tên sản phẩm lệch hồ sơ → dựng sẵn tiêu đề chuẩn, không cần AI", async () => {
  const d = await soatTieuDe();
  const r = d.results.find((x) => x.id === 1);
  assert.ok(r, "bài sai tên phải được nêu ra");
  assert.ok(r.van_de.some((v) => v.ma === "ten_sp"));
  assert.equal(r.de_xuat, "Hướng dẫn sử dụng NOMA 350 - Dung Dịch Vệ Sinh Đĩa Phanh",
    'tên chuẩn phải lấy NGUYÊN VĂN cột "Tên sản phẩm" của hồ sơ');
});

test("khác nhau mỗi dấu câu / hoa thường thì KHÔNG bắt lỗi", async () => {
  // "NOMA 911: Dung dịch tẩy ố kính" vs hồ sơ "NOMA 911 - Dung dịch tẩy ố kính".
  const d = await soatTieuDe();
  const r = d.results.find((x) => x.id === 2);
  assert.ok(!r || !r.van_de.some((v) => v.ma === "ten_sp"),
    "bắt lỗi ở mức dấu câu là tạo việc vô ích cho người duyệt");
});

test("gắn nhầm mã sản phẩm → CHỈ BÁO, không tự sửa", async () => {
  /* Bài "…bộ vệ sinh và dưỡng ghế da Noma 692" mang tên sản phẩm của NOMA 686.
     Không biết sai ở mã hay ở phần mô tả nên tuyệt đối không tự đặt lại tên. */
  const d = await soatTieuDe();
  const r = d.results.find((x) => x.id === 3);
  const v = r.van_de.find((x) => x.ma === "sai_sku");
  assert.ok(v, "phải bắt được bài gắn nhầm mã");
  assert.match(v.nhan, /NOMA 686/);
  assert.equal(r.de_xuat, null, "bài gắn nhầm mã KHÔNG được có tên đề xuất tự động");
});

test("hai bài cùng một mã → chỉ báo, không đổi cả hai về một tên", async () => {
  const haiBai = async (url) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith("/wp-json/wp/v2/categories")) {
      return gia([{ id: 37, name: "Hướng Dẫn Sử Dụng", slug: "huong-dan-su-dung", count: 2 }]);
    }
    return gia([
      { id: 10, link: "https://noma.vn/x/", status: "publish", categories: [37],
        title: { raw: "HƯỚNG DẪN SỬ DỤNG NOMA 350 - DUNG DỊCH VỆ SINH PHANH ĐĨA" }, content: { raw: "<p>x</p>" } },
      { id: 11, link: "https://noma.vn/y/", status: "publish", categories: [37],
        title: { raw: "HƯỚNG DẪN SỬ DỤNG NOMA 350: DUNG DỊCH VỆ SINH PHANH ĐĨA" }, content: { raw: "<p>x</p>" } },
    ], { "X-WP-TotalPages": "1" });
  };
  const d = await soatTieuDe(haiBai);
  for (const id of [10, 11]) {
    const r = d.results.find((x) => x.id === id);
    assert.ok(r.van_de.some((v) => v.ma === "trung_sku"), `bài #${id} phải bị báo trùng mã`);
    assert.equal(r.de_xuat, null, "trùng mã thì không đề xuất — đổi cả hai về một tên là trùng khít hơn");
  }
});

test("giao diện chặn vá cùng một tiêu đề cho nhiều bài trong một lượt", () => {
  assert.match(UI, /const trungLo = Object\.keys\(dem\)\.filter\(\(t\) => dem\[t\] > 1\);/);
  assert.match(UI, /id="btnTitlePickName"/, "thiếu nút chọn nhanh nhóm sai tên sản phẩm");
});

/* ══ Đổi tên bài hướng dẫn theo hồ sơ — KHÔNG dùng AI ═════════════════════════
   Chủ dự án chốt 25/08/2026: "chỉ cần nút thay thế thôi, không cần agent gen lại một
   cái tiêu đề khác. Sử dụng luôn câu tiêu đề là tên sản phẩm trong file brandcore".
   Tiêu đề mới = "Hướng dẫn sử dụng " + NGUYÊN VĂN tên sản phẩm, bỏ hết đuôi quảng cáo.
   ═════════════════════════════════════════════════════════════════════════════ */
test("quét trả sẵn tiêu đề chuẩn dựng từ hồ sơ, không nhờ AI", async () => {
  const d = await soatQuet();
  const r = d.items.find((x) => x.id === 1);
  assert.equal(r.tieu_de_chuan, "Hướng dẫn sử dụng NOMA 890 - Dung dịch xịt phủ bóng, làm mới sơn xe",
    "phải là tên sản phẩm nguyên văn trong hồ sơ, không cắt gọt, không thêm đuôi");
  assert.equal(r.can_doi_ten, true);
  assert.equal(d.doi_ten_count, 1);
});

test("bài đã đúng tên rồi thì KHÔNG rủ đổi nữa", async () => {
  const d = await soatQuet();
  const r = d.items.find((x) => x.id === 2);
  assert.equal(r.can_doi_ten, false, "khác nhau mỗi hoa/thường và dấu câu thì coi như đã đúng");
});

test("bài không dò ra mã NOMA thì không có tên chuẩn để thay", async () => {
  const d = await soatQuet();
  const r = d.items.find((x) => x.id === 3);
  assert.equal(r.tieu_de_chuan, null, "bài hướng dẫn thiết bị Doscom không có hồ sơ NOMA");
  assert.equal(r.can_doi_ten, false);
});

test("giao diện đổi tên bằng nút THAY THẾ, gửi thẳng tiêu đề chuẩn", () => {
  assert.match(UI, /id="btnRename"/, "thiếu nút thay thế tiêu đề");
  assert.match(UI, /fixes: picks\.map\(\(p\) => \(\{ id: p\.id, title: p\.tieu_de_chuan \}\)\)/,
    "phải gửi thẳng tiêu đề chuẩn từ hồ sơ, không qua AI");
  // Nút AI chỉ còn dành cho bài MẤT tiêu đề hẳn (không suy ra được từ hồ sơ).
  assert.match(UI, /\.filter\(\(i\) => titleRows\[i\] && titleRows\[i\]\.tieu_de_rong\)/);
});

// Bộ dữ liệu cho bốn test trên: 1 bài sai tên, 1 bài đã đúng, 1 bài Doscom.
function gaDoiTen() {
  const BAI = [
    { id: 1, link: "https://noma.vn/1/", status: "publish", categories: [37],
      title: { raw: "HƯỚNG DẪN SỬ DỤNG NOMA 890: XỊT BÓNG & LÀM MỚI SƠN XE TỨC THÌ" }, content: { raw: "<p>x</p>" } },
    { id: 2, link: "https://noma.vn/2/", status: "publish", categories: [37],
      title: { raw: "hướng dẫn sử dụng NOMA 911: Dung dịch tẩy ố kính" }, content: { raw: "<p>x</p>" } },
    { id: 3, link: "https://noma.vn/3/", status: "publish", categories: [37],
      title: { raw: "Hướng dẫn sử dụng máy dò Doscom D1" }, content: { raw: "<p>x</p>" } },
    { id: 4, link: "https://noma.vn/4/", status: "publish", categories: [37],
      title: { raw: "5 mẹo chăm sóc sơn xe mùa mưa" }, content: { raw: "<p>x</p>" } },
  ];
  return async (url) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith("/wp-json/wp/v2/categories")) return gia([]);
    const inc = u.searchParams.get("include");
    const ds = inc ? BAI.filter((b) => inc.split(",").map(Number).includes(b.id)) : BAI;
    return gia(ds, { "X-WP-TotalPages": "1" });
  };
}

async function soatQuet() {
  const goc = globalThis.fetch;
  globalThis.fetch = gaDoiTen();
  try {
    const res = await scan({
      request: new Request("https://crm.test/api/products/brandcore-scan", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ site: "noma", target: "guide", mode: "list" }),
      }),
      env: {
        ...ENV_NOMA,
        INVENTORY: { get: async (k) => (k === "noma_sku_specs:v2" ? JSON.stringify({ specs: {
          "890": { ten: "NOMA 890 - Dung dịch xịt phủ bóng, làm mới sơn xe" },
          "911": { ten: "NOMA 911 - Dung dịch tẩy ố kính" },
        } }) : null) },
      },
    });
    return await res.json();
  } finally { globalThis.fetch = goc; }
}
