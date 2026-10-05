import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseGroupName, spNgan, tenCampaign, tenAd, nhanCamp, ngayThang, demKetQua, soNgayChay, chamDiem,
} from "../functions/lib/fb-groups.js";

// 05/10/2026 (chủ dự án): THAY tên hộp cố định "<SP> - TEST/SCALE" bằng cấu trúc
//   campaign + nhóm QC : "<d/m> - <SP> - <camp số mấy>"  vd "5/10 - Noma911 - 3 creative test"
//   quảng cáo          : "<d/m> - <SP> - KOC <tên>"     vd "5/10 - Noma911 - KOC chongsally"
// Hộp vẫn neo theo ID trong sổ D1 nên tên kèm ngày không làm lạc hộp.

test("mã sản phẩm ngắn dùng trong tên và làm khoá so sản phẩm", () => {
  assert.equal(spNgan("NOMA 880 · Phu Tinh The Lam Moi Xoa ..."), "Noma880");
  assert.equal(spNgan("noma911"), "Noma911");
  assert.equal(spNgan("NOMA 911 · Co Qua Tang"), "Noma911");
  assert.equal(spNgan("Máy dò D2 Pro"), "D2Pro");
  assert.equal(spNgan("DR4 PRO"), "DR4Pro");
  assert.equal(spNgan("Camera DA8.1"), "DA8.1");
  assert.equal(spNgan("D1"), "D1");
  assert.equal(spNgan(""), "");
});

test("tên campaign + ad đúng ví dụ chủ dự án", () => {
  assert.equal(tenCampaign("5/10", "noma911", "3 creative test", "TEST"), "5/10 - Noma911 - 3 creative test");
  assert.equal(tenAd("5/10", "NOMA 911 · Co Qua Tang", "chongsally"), "5/10 - Noma911 - KOC chongsally");
  assert.throws(() => tenCampaign("5/10", "", "x", "TEST"), /thiếu tên sản phẩm/);
});

test("phần cuối tên campaign luôn nói đúng nhóm: SCALE phải có chữ scale, TEST thì không", () => {
  assert.equal(nhanCamp("camp 2", "SCALE"), "camp 2 scale");
  assert.equal(nhanCamp("camp 2 scale", "SCALE"), "camp 2 scale");
  assert.equal(nhanCamp("3 creative", "TEST"), "3 creative");
  assert.equal(nhanCamp("scale thử", "TEST"), "thử test");
  assert.equal(nhanCamp("", "SCALE"), "scale");
});

test("đọc ngược tên campaign: kiểu mới lẫn kiểu cũ, không nhận nhầm tên lạ", () => {
  assert.deepEqual(parseGroupName("5/10 - noma911 - 3 creative test"), { product: "Noma911", group: "TEST" });
  assert.deepEqual(parseGroupName("5/10 - Noma911 - camp 2 scale"), { product: "Noma911", group: "SCALE" });
  assert.deepEqual(parseGroupName("NOMA 911 · Co Qua Tang - TEST"), { product: "Noma911", group: "TEST" });
  assert.deepEqual(parseGroupName("NOMA 680 - scale"), { product: "Noma680", group: "SCALE" });
  // campaign đang chạy thật, đặt lệch khuôn nhưng có mã SP (đo 05/10/2026)
  assert.deepEqual(parseGroupName("2/10-Noma350-PhươngNam-thaithucthoi"), { product: "Noma350", group: "TEST" });
  assert.deepEqual(parseGroupName("Doscom-14/9-Noma911-Nam-GiaThau123"), { product: "Noma911", group: "TEST" });
  assert.deepEqual(parseGroupName("17/5 - D1 Thái Lan"), { product: "D1", group: "TEST" });
  assert.deepEqual(parseGroupName("3/10 - D2 Pro - Content nhà"), { product: "D2Pro", group: "TEST" });
  assert.equal(parseGroupName("Chương trình đại lý"), null);
  assert.equal(parseGroupName("Chương trình hợp tác của sale"), null);
  assert.equal(parseGroupName(""), null);
});

test("ngày/tháng theo giờ Việt Nam, không số 0 đầu", () => {
  // 04/10 17:30 UTC = 05/10 00:30 giờ VN
  assert.equal(ngayThang(Date.UTC(2026, 9, 4, 17, 30)), "5/10");
});

test("đếm kết quả: ưu tiên sự kiện pixel, KHÔNG cộng dồn tên trùng nghĩa", () => {
  const actions = [
    { action_type: "offsite_conversion.fb_pixel_complete_registration", value: "7" },
    { action_type: "complete_registration", value: "7" },
    { action_type: "link_click", value: "120" },
  ];
  assert.equal(demKetQua(actions), 7, "hai tên cùng một sự kiện → chỉ tính một");
  assert.equal(demKetQua([{ action_type: "lead", value: "3" }]), 3);
  assert.equal(demKetQua([]), 0);
  assert.equal(demKetQua(null), 0);
});

test("số ngày chạy", () => {
  const now = Date.parse("2026-08-05T10:00:00Z");
  assert.equal(soNgayChay("2026-08-02T10:00:00Z", now), 3);
  assert.equal(soNgayChay("2026-08-05T09:00:00Z", now), 0);
  assert.equal(soNgayChay("", now), 0);
});

// ── Chấm điểm creative trong nhóm TEST ──────────────────────────────────────
const TARGET = 110000;
const ad = (o) => ({ days: 5, spend: 0, results: 0, ...o });

test("chưa chạy đủ 3 ngày → chưa đọc được", () => {
  const d = chamDiem(ad({ days: 2, spend: 900000, results: 9 }), { target_cpl: TARGET });
  assert.equal(d.verdict, "wait");
  assert.match(d.ly_do, /chờ đủ 3 ngày/);
});

test("chưa tiêu đủ 3× CPL mục tiêu → chưa đọc được, kể cả đã có kết quả", () => {
  const d = chamDiem(ad({ spend: 200000, results: 2 }), { target_cpl: TARGET });
  assert.equal(d.verdict, "wait");
  assert.match(d.ly_do, /3× CPL mục tiêu/);
});

test("tiêu đủ mà 0 kết quả → tắt", () => {
  const d = chamDiem(ad({ spend: 350000, results: 0 }), { target_cpl: TARGET });
  assert.equal(d.verdict, "kill");
});

test("CPL ≤ mục tiêu và ≥5 kết quả → bê sang SCALE", () => {
  const d = chamDiem(ad({ spend: 500000, results: 5 }), { target_cpl: TARGET });
  assert.equal(d.verdict, "promote");
});

test("CPL tốt nhưng chưa đủ 5 kết quả → chưa vội, theo dõi thêm", () => {
  const d = chamDiem(ad({ spend: 400000, results: 4 }), { target_cpl: TARGET });
  assert.equal(d.verdict, "watch");
  assert.match(d.ly_do, /4\/5 kết quả/);
});

test("CPL cao hơn 50% và đã tiêu ≥5× mục tiêu → tắt", () => {
  const d = chamDiem(ad({ spend: 600000, results: 3 }), { target_cpl: TARGET });
  assert.equal(d.verdict, "kill");
  assert.match(d.ly_do, /cao hơn 50%/);
});

test("KHÔNG phán bừa khi chưa có CPL chuẩn", () => {
  const d = chamDiem(ad({ spend: 900000, results: 0 }), { target_cpl: 0 });
  assert.equal(d.verdict, "wait");
  assert.match(d.ly_do, /chưa có CPL chuẩn/);
});

// ── Trần 4 creative ĐÃ BỎ (23/09/2026) ──────────────────────────────────────
// Luồng tự động từng tự tắt ad CŨ NHẤT để giữ hộp TEST ở 4 creative. Luật đó xét tuổi
// chứ không xét hiệu quả nên tắt nhầm creative đang thắng. Giữ test này để không ai
// lặng lẽ dựng lại cơ chế đó.
// ── Luồng tự động phải dùng lại hộp, không đẻ ad set mới ────────────────────
const html = readFileSync(new URL("../ads-creator.html", import.meta.url), "utf8");

test("campaign + nhóm QC mới đặt tên <d/m> - <SP> - <camp>, cùng một tên", () => {
  assert.match(html, /campaign_name: tenHop,/);
  assert.match(html, /adset_name: tenHop,/);
  assert.match(html, /const tenHop = `\$\{dm\} - \$\{spTen\} - \$\{nhanCamp\(/);
});

test("spNgan/nhanCamp trong trang cho CÙNG kết quả với bản server", () => {
  const cat = (ten) => {
    const i = html.indexOf(`function ${ten}(`);
    let k = html.indexOf("{", i), d = 0;
    for (; k < html.length; k++) { if (html[k] === "{") d++; else if (html[k] === "}" && --d === 0) break; }
    return html.slice(i, k + 1);
  };
  const trang = new Function(cat("spNgan") + cat("nhanCamp") + " return { spNgan, nhanCamp };")();
  for (const x of ["NOMA 880 · Phu Tinh", "noma911", "Máy dò D2 Pro", "DR4 PRO", "DA8.1", "D1 thái lan", "Xyz abc"]) {
    assert.equal(trang.spNgan(x), spNgan(x), x);
  }
  for (const [l, g] of [["camp 2", "SCALE"], ["3 creative", "TEST"], ["scale x", "TEST"], ["", "SCALE"]]) {
    assert.equal(trang.nhanCamp(l, g), nhanCamp(l, g), `${l}|${g}`);
  }
});

const api = readFileSync(new URL("../functions/api/fb-groups.js", import.meta.url), "utf8");
test("bảng + danh sách đích CHỈ lấy campaign và nhóm QC đang hoạt động", () => {
  assert.match(api, /camp\.effective_status !== "ACTIVE" \|\| \(ad\.adset \|\| \{\}\)\.effective_status !== "ACTIVE"\) continue/);
  assert.match(api, /campaign\{id,name,status,effective_status\}/);
  // ad tắt cũ bị ẩn, ad mới tạo (PAUSED chờ duyệt) vẫn hiện
  assert.match(api, /if \(!item\.dang_chay && item\.days >= 2\) continue;/);
});

test("bê sang SCALE chỉ tìm hộp SCALE đang hoạt động, tạo mới thì theo tên mới", () => {
  assert.match(act, /effective_status !== "ACTIVE" \|\| \(a\.campaign \|\| \{\}\)\.effective_status !== "ACTIVE"/);
  assert.match(act, /tenCampaign\(ngayThang\(\), product/);
  assert.doesNotMatch(act, /groupName\(/);
});

// 23/09/2026: đích KHÔNG còn tự dò theo tên (timHop) mà do người chạy chọn ở dropdown.
test("đích đổ creative lấy từ lựa chọn của người chạy, không tự dò theo tên", () => {
  assert.match(html, /const dich = dichCua\(g\.product, gdNow\)/);
  assert.doesNotMatch(html, /timHop\(g\.product/, "không được quay lại cách dò theo tên");
  assert.match(html, /existing_adset_id: dich\.adset_id/);
  assert.match(html, /existing_campaign_id: dich\.campaign_id/);
  assert.match(html, /ad_name: adNames\[i\]/, "tên ad vẫn theo công thức KOC");
});

const cc = readFileSync(new URL("../functions/api/create-campaign.js", import.meta.url), "utf8");

test("backend: existing_adset_id thì KHÔNG tạo campaign/ad set mới và không đụng ngân sách", () => {
  assert.match(cc, /if \(cfg\.existing_adset_id\)/);
  // Cắt đúng thân nhánh dùng lại ad set (tới câu return của chính nó), không cắt lấn
  // sang nhánh "campaign có sẵn" thêm ngày 23/09/2026.
  const iRe = cc.indexOf("if (cfg.existing_adset_id)");
  const khoi = cc.slice(iRe, cc.indexOf("if (cfg.existing_campaign_id)", iRe));
  assert.doesNotMatch(khoi, /campaigns`/, "không được tạo campaign khi đã có ad set");
  assert.doesNotMatch(khoi, /withAdsetBudget/, "không được sửa ngân sách ad set đang chạy (reset máy học)");
  assert.match(khoi, /reused_adset: true/);
});

const act = readFileSync(new URL("../functions/api/fb-ad-actions.js", import.meta.url), "utf8");

test("bê sang SCALE phải dùng lại bài viết cũ, không upload lại video", () => {
  assert.match(act, /object_story_id: postId/, "creative mới phải dựng từ post ID của ad gốc");
  assert.doesNotMatch(act, /advideos|adimages/, "không được upload lại media — mất hết tương tác xã hội");
  assert.match(act, /status: "PAUSED"/, "ad bê sang phải ở trạng thái tạm dừng");
});

// ── Đẩy hàng loạt creative thắng sang SCALE (tick chọn theo UID video) ───────
const grp = readFileSync(new URL("../functions/api/fb-groups.js", import.meta.url), "utf8");

test("bảng trả kèm UID video để đối chiếu đúng video nào đang thắng", () => {
  assert.match(grp, /creative\{effective_object_story_id,video_id,object_story_spec\}/,
    "phải xin video_id của creative");
  assert.match(grp, /tiktok_id/, "phải map sang ID video gốc trên TikTok");
  assert.match(grp, /FROM uploaded_videos WHERE account_id = \?/,
    "ID TikTok lấy từ sổ uploaded_videos (filename = <id tiktok>.mp4)");
});

test("sổ uploaded_videos hỏng thì KHÔNG làm sập cả bảng", () => {
  const khoi = grp.slice(grp.indexOf("if (env.DB)"), grp.indexOf("const products = []"));
  assert.match(khoi, /catch \(e\) \{/, "phải bọc try/catch quanh truy vấn sổ");
});

test("đẩy hàng loạt phải TUẦN TỰ, không song song", () => {
  const day = html.slice(html.indexOf("const dayHangLoat"), html.indexOf("const tatAd"));
  assert.match(day, /for \(const \{ ad, product \} of ds\)/, "duyệt tuần tự từng ad");
  assert.match(day, /await goiAdAction\(\{ action: "promote"/);
  assert.doesNotMatch(day, /Promise\.all|Promise\.allSettled/,
    "chạy song song sẽ tạo 2 hộp SCALE trùng nhau khi sản phẩm chưa có hộp");
});

test("máy tick sẵn creative đủ điều kiện nhưng không đè lựa chọn của người", () => {
  assert.match(html, /a\.verdict === "promote"\) win\[a\.ad_id\] = true/);
  assert.match(html, /setPicked\(c => \(\{ \.\.\.win, \.\.\.c \}\)\)/,
    "tick của người dùng phải ghi đè tick tự động");
});
