// Test sổ NHẬN video TikTok (/api/video-claims): 1 video chỉ 1 nhân sự chạy.
// Test phần logic thuần (không đụng D1) + luật gỡ nhận 60s.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STAFF, RELEASE_WINDOW_S, videoKeyFromLink, partitionClaims, canRelease, normalizeVideo,
} from "../functions/api/video-claims.js";

const LINK = "https://www.tiktok.com/@toanmanshop/video/7106594312292453675";
const KEY = "7106594312292453675";

test("khoá video = id trong link TikTok (mọi biến thể link đều ra 1 khoá)", () => {
  assert.equal(videoKeyFromLink(LINK), KEY);
  assert.equal(videoKeyFromLink("www.tiktok.com/@a/video/" + KEY + "?is_from_webapp=1"), KEY);
  assert.equal(videoKeyFromLink(KEY), KEY, "truyền thẳng id cũng chấp nhận");
  assert.equal(videoKeyFromLink("https://tiktok.com/@a"), null, "link không có id → không nhận được");
  assert.equal(videoKeyFromLink(""), null);
});

test("cùng 1 video ở 2 shop/2 link khác nhau vẫn là MỘT khoá → không chạy trùng được", () => {
  const a = normalizeVideo({ link: "https://www.tiktok.com/@shopA/video/" + KEY, shop: "Noma Auto" });
  const b = normalizeVideo({ link: "https://m.tiktok.com/@shopB/video/" + KEY + "?lang=vi", shop: "Doscom Mart" });
  assert.equal(a.key, b.key);
});

test("video chưa ai nhận → nhận được; video người khác giữ → vào conflicts, KHÔNG ghi đè", () => {
  const active = new Map([["222", { staff: "PHUONG_NAM" }]]);
  const { claimed, conflicts } = partitionClaims(
    [{ key: "111" }, { key: "222" }, { key: "333" }], active, "DUY"
  );
  assert.deepEqual(claimed.map((c) => c.key), ["111", "333"]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].key, "222");
  assert.equal(conflicts[0].staff, "PHUONG_NAM");
  assert.equal(conflicts[0].staff_name, "Nam", "báo lỗi phải hiện TÊN người giữ, không phải mã");
});

test("bấm lại video CHÍNH MÌNH đang giữ → vẫn cho, không báo trùng", () => {
  const active = new Map([["111", { staff: "DUY" }]]);
  const { claimed, conflicts } = partitionClaims([{ key: "111" }], active, "DUY");
  assert.deepEqual(claimed.map((c) => c.key), ["111"]);
  assert.equal(conflicts.length, 0);
});

test("gửi trùng khoá trong 1 lần → chỉ ghi 1 lần", () => {
  const { claimed } = partitionClaims([{ key: "111" }, { key: "111" }], new Map(), "DUY");
  assert.equal(claimed.length, 1);
});

test("gỡ nhận: chính chủ, trong 60s đầu → được", () => {
  const now = 1_800_000_000;
  const row = { staff: "DUY", claimed_at: now - 30, released_at: null };
  assert.equal(canRelease(row, "DUY", now).ok, true);
});

test("gỡ nhận: quá 60s → KHÔNG được (đã nhận là cam kết thật)", () => {
  const now = 1_800_000_000;
  const row = { staff: "DUY", claimed_at: now - RELEASE_WINDOW_S - 1, released_at: null };
  const v = canRelease(row, "DUY", now);
  assert.equal(v.ok, false);
  assert.match(v.reason, /quá hạn/);
});

test("gỡ nhận: không gỡ hộ người khác được", () => {
  const now = 1_800_000_000;
  const row = { staff: "PHUONG_NAM", claimed_at: now - 5, released_at: null };
  const v = canRelease(row, "DUY", now);
  assert.equal(v.ok, false);
  assert.match(v.reason, /Nam/, "phải nói rõ ai đang giữ");
});

test("gỡ nhận: video chưa ai nhận / đã gỡ rồi → từ chối, không lỗi ngầm", () => {
  const now = 1_800_000_000;
  assert.equal(canRelease(null, "DUY", now).ok, false);
  assert.equal(canRelease({ staff: "DUY", claimed_at: now, released_at: now }, "DUY", now).ok, false);
});

test("chỉ có đúng 2 nhân sự Duy & Nam, mã khớp lib/access.js", () => {
  assert.deepEqual(Object.keys(STAFF).sort(), ["DUY", "PHUONG_NAM"]);
  assert.equal(STAFF.DUY, "Duy");
  assert.equal(STAFF.PHUONG_NAM, "Nam");
});

test("normalizeVideo: bỏ dòng thiếu link, cắt chuỗi dài, giữ đủ trường tra cứu", () => {
  assert.equal(normalizeVideo({ title: "không có link" }), null);
  assert.equal(normalizeVideo(null), null);
  const v = normalizeVideo({ link: LINK, title: "x".repeat(500), product: "Noma 911", shop: "Noma Auto" });
  assert.equal(v.key, KEY);
  assert.equal(v.title.length, 300, "cắt bớt để 1 lần ghi không phình DB");
  assert.equal(v.product, "Noma 911");
  assert.equal(v.shop, "Noma Auto");
});
