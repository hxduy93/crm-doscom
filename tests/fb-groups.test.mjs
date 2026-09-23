import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  groupName, parseGroupName, demKetQua, soNgayChay, chamDiem,
} from "../functions/lib/fb-groups.js";

// QUYẾT 2026-08-05: mỗi sản phẩm có ĐÚNG 2 hộp sống lâu dài "<SP> - TEST" và
// "<SP> - SCALE". Tên phải CỐ ĐỊNH (không kèm ngày) thì lần chạy sau mới tìm lại
// được hộp cũ để đổ creative vào — nếu không sẽ quay lại cảnh ~19 ad set cùng tệp,
// mỗi cái ~7 chuyển đổi/tuần, không cái nào thoát giai đoạn máy học.

test("tên hộp cố định, không kèm ngày tháng", () => {
  assert.equal(groupName("NOMA 911", "TEST"), "NOMA 911 - TEST");
  assert.equal(groupName("  NOMA   911 ", "scale"), "NOMA 911 - SCALE");
  assert.throws(() => groupName("NOMA 911", "SCALEE"), /TEST hoặc SCALE/);
  assert.throws(() => groupName("", "TEST"), /thiếu tên sản phẩm/);
});

test("đọc ngược tên hộp; campaign đặt tên kiểu cũ thì KHÔNG nhận nhầm", () => {
  assert.deepEqual(parseGroupName("NOMA 911 - TEST"), { product: "NOMA 911", group: "TEST" });
  assert.deepEqual(parseGroupName("NOMA 680 - scale"), { product: "NOMA 680", group: "SCALE" });
  assert.equal(parseGroupName("5/8 - NOMA 680 - quangteo"), null);
  assert.equal(parseGroupName("4/8 - Noma911 - Đồ chơi xe 7979"), null);
  assert.equal(parseGroupName(""), null);
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

test("tên CAMPAIGN là tên hộp cố định, KHÔNG kèm ngày", () => {
  assert.match(html, /campaign_name: tenHop/, "campaign phải mang tên hộp");
  assert.match(html, /const tenHop = `\$\{g\.product\} - \$\{autoGroup\}`/);
  assert.doesNotMatch(html, /campaign_name: `\$\{dm\} - \$\{g\.product\}/,
    "quay lại đặt tên campaign theo ngày là mỗi lần chạy lại đẻ hộp mới");
});

// Nhóm QC ĐẦU TIÊN mang đúng tên hộp; nhóm thứ hai trở đi trong cùng campaign phải có
// tên khác để còn phân biệt trên Ads Manager — danh tính hộp neo ở sổ D1 nên không sao.
test("ad set đầu mang tên hộp, ad set thêm vào campaign cũ mới kèm ngày", () => {
  assert.match(html, /adset_name: dich\.loai === "adset_moi" \? `\$\{tenHop\} · \$\{dm\}` : tenHop/);
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
