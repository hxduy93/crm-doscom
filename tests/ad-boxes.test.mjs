import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  chuanSanPham, chuanNhom, khoaHop, docSo, ghiSo, moiNhat, chonMacDinh,
} from "../functions/lib/ad-boxes.js";

// YÊU CẦU 23/09/2026: hộp quảng cáo phải neo vào ID, và người chạy phải THẤY mình đang
// đổ creative vào nhóm QC nào. Trước đó hộp nhận diện bằng TÊN và mỗi nhóm chỉ giữ được
// MỘT ad set, nên campaign có 3 nhóm (đo thật: NOMA 230/350/680) thì creative rơi vào
// nhóm nào là hên xui — kể cả nhóm đang TẮT.

test("khoá sản phẩm bỏ khoảng trắng thừa và không phân biệt hoa thường", () => {
  assert.equal(chuanSanPham("  NOMA   230 "), "noma 230");
  assert.equal(chuanSanPham("noma 230"), "noma 230");
  assert.equal(khoaHop("NOMA  230", "test"), "noma 230|TEST");
  assert.equal(khoaHop("NOMA 230", "SCALE"), "noma 230|SCALE");
});

test("nhóm chỉ nhận TEST/SCALE, thứ khác trả null", () => {
  assert.equal(chuanNhom("test"), "TEST");
  assert.equal(chuanNhom(" scale "), "SCALE");
  assert.equal(chuanNhom("BID"), null);
  assert.equal(chuanNhom(""), null);
});

// ── chọn mặc định cho dropdown ────────────────────────────────────────────────
const asTest = (id, status, ngay) => ({
  adset_id: id, adset_status: status,
  ads: ngay ? [{ created_time: ngay }] : [],
});

test("ưu tiên ad set mà sổ đang trỏ tới, kể cả khi nó đang TẮT", () => {
  const ds = [
    asTest("A", "ACTIVE", "2026-09-22T00:00:00Z"),
    asTest("B", "PAUSED", "2026-09-01T00:00:00Z"),
  ];
  assert.equal(chonMacDinh(ds, "B").adset_id, "B", "sổ phải thắng — đó là đích lần trước");
});

test("sổ trỏ tới ad set đã biến mất thì lùi về ACTIVE mới nhất", () => {
  const ds = [
    asTest("A", "ACTIVE", "2026-09-10T00:00:00Z"),
    asTest("B", "ACTIVE", "2026-09-22T00:00:00Z"),
    asTest("C", "PAUSED", "2026-09-23T00:00:00Z"),
  ];
  assert.equal(chonMacDinh(ds, "KHONG_TON_TAI").adset_id, "B",
    "ad set TẮT mới hơn vẫn không được chọn — đổ creative vào nhóm tắt là tiền không chạy");
});

test("không có ad set nào ĐANG CHẠY thì mới lấy tới nhóm đã tắt", () => {
  const ds = [asTest("A", "PAUSED", "2026-09-01T00:00:00Z"), asTest("B", "PAUSED", "2026-09-20T00:00:00Z")];
  assert.equal(chonMacDinh(ds, null).adset_id, "B");
});

test("danh sách rỗng → null (chỗ gọi hiểu là tạo hộp mới)", () => {
  assert.equal(chonMacDinh([], null), null);
  assert.equal(chonMacDinh(null, "A"), null);
});

test("độ mới tính theo ad mới nhất, KHÔNG theo ID ad set", () => {
  assert.equal(moiNhat({ ads: [{ created_time: "2026-09-01T00:00:00Z" }, { created_time: "2026-09-20T00:00:00Z" }] }),
    Date.parse("2026-09-20T00:00:00Z"));
  assert.equal(moiNhat({ ads: [] }), 0);
  assert.equal(moiNhat(null), 0);
  assert.equal(moiNhat({ ads: [{ created_time: "rac" }] }), 0);
});

// ── sổ D1 hỏng thì không được làm sập trang ───────────────────────────────────
test("D1 lỗi / chưa có bảng → sổ rỗng, KHÔNG ném", async () => {
  const dbLoi = { prepare() { throw new Error("no such table: ad_boxes"); } };
  assert.deepEqual([...(await docSo(dbLoi, "123")).keys()], []);
  assert.deepEqual([...(await docSo(null, "123")).keys()], []);
  assert.equal(await ghiSo(dbLoi, { account_id: "123", product: "NOMA 230", group: "TEST", campaign_id: "c", adset_id: "a" }), false);
});

test("đọc sổ trả về Map theo khoá chuẩn hoá", async () => {
  const db = {
    prepare: () => ({ bind: () => ({ all: async () => ({ results: [
      { product: "noma 230", grp: "TEST", campaign_id: "c1", adset_id: "a1", product_raw: "NOMA 230" },
    ] }) }) }),
  };
  const so = await docSo(db, "act_999");
  assert.equal(so.get("noma 230|TEST").adset_id, "a1");
  assert.equal(so.get(khoaHop("NOMA  230", "test")).campaign_id, "c1");
});

test("ghi sổ bỏ tiền tố act_ và từ chối dữ liệu thiếu", async () => {
  let daBind = null;
  const db = { prepare: () => ({ bind: (...a) => { daBind = a; return { run: async () => ({}) }; } }) };
  assert.equal(await ghiSo(db, { account_id: "act_777", product: "NOMA 230", group: "TEST", campaign_id: "c", adset_id: "a" }), true);
  assert.equal(daBind[0], "777");
  assert.equal(daBind[1], "noma 230");
  assert.equal(daBind[2], "TEST");
  // Thiếu ad set / nhóm sai thì không ghi bừa.
  assert.equal(await ghiSo(db, { account_id: "777", product: "NOMA 230", group: "TEST", adset_id: "" }), false);
  assert.equal(await ghiSo(db, { account_id: "777", product: "NOMA 230", group: "BID", adset_id: "a" }), false);
  assert.equal(await ghiSo(db, { account_id: "777", product: "   ", group: "TEST", adset_id: "a" }), false);
});

// ── API trả về ĐỦ ad set, không gộp nữa ───────────────────────────────────────
const grp = readFileSync(new URL("../functions/api/fb-groups.js", import.meta.url), "utf8");

test("gom theo adset_id, không giữ mỗi ad set của ad đầu tiên", () => {
  assert.match(grp, /nhom\[key\]\.has\(asId\)/, "phải khoá theo adset_id");
  assert.match(grp, /adsets: ds/, "phải trả cả danh sách ad set");
  assert.doesNotMatch(grp, /sanPham\.set\(g\.product, \{ test: null, scale: null \}\)/,
    "quay lại cấu trúc một-ad-set-mỗi-nhóm là dựng lại đúng lỗi chọn nhầm");
});

test("mỗi ad set có số creative đang chạy RIÊNG của nó", () => {
  assert.match(grp, /hop\.so_ad_dang_chay = hop\.ads\.filter\(a => a\.dang_chay\)\.length/);
});

// ── giao diện: đích phải hiện ra, không đoán ngầm ─────────────────────────────
const html = readFileSync(new URL("../ads-creator.html", import.meta.url), "utf8");

test("có dropdown chọn nhóm QC đích cho từng sản phẩm", () => {
  assert.match(html, /Đổ \{newCnt \|\| g\.files\.length\} creative vào đâu\?/);
  assert.match(html, /value=\{`as:\$\{a\.adset_id\}`\}/, "mỗi ad set thật là một lựa chọn");
  assert.match(html, /value=\{`nas:\$\{cid\}`\}/, "phải có lựa chọn tạo nhóm QC mới trong campaign cũ");
  assert.match(html, /value="new"/, "phải có lựa chọn tạo campaign mới");
});

test("ad set đã biến mất thì lùi về tạo mới, không gửi ID chết xuống Meta", () => {
  const khoi = html.slice(html.indexOf("const dichCua = "), html.indexOf("const loadGroups"));
  assert.match(khoi, /return h \? \{ loai: "adset"/);
  assert.match(khoi, /\{ loai: "moi" \}/);
});

test("ghi sổ hộp được gửi kèm mỗi lần tạo", () => {
  assert.match(html, /box: \{ product: g\.product, group: autoGroup \}/);
  const cc = readFileSync(new URL("../functions/api/create-campaign.js", import.meta.url), "utf8");
  assert.match(cc, /async function ghiSoHop\(/);
  // Ghi cả ở nhánh dùng lại ad set — đó mới là lúc người chạy tự tay chọn đích.
  assert.equal((cc.match(/await ghiSoHop\(/g) || []).length, 2);
});

test("backend nhận đích thứ ba: nhóm QC mới trong campaign có sẵn", () => {
  const cc = readFileSync(new URL("../functions/api/create-campaign.js", import.meta.url), "utf8");
  assert.match(cc, /if \(cfg\.existing_campaign_id\) \{/);
  assert.match(cc, /partial\.reused_campaign = true/);
});

// ── trần 4 creative đã bỏ hẳn ────────────────────────────────────────────────
test("không còn trần creative và không còn tự tắt ad", () => {
  assert.doesNotMatch(html, /MAX_TEST_ADS|MAX_CREATIVES/, "trần đã bỏ");
  const chay = html.slice(html.indexOf("const handleAutoRun"), html.indexOf("const nhomCua"));
  assert.doesNotMatch(chay, /pauseAd\(/, "luồng tự động KHÔNG được tự tắt ad nào nữa");
  const lib = readFileSync(new URL("../functions/lib/fb-groups.js", import.meta.url), "utf8");
  assert.doesNotMatch(lib, /export function adCuNhat|export function tinhChoTrong/);
});
