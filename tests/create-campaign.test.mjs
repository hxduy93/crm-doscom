// Test cấu trúc ad set cho cả 2 luồng:
//   - MẶC ĐỊNH (adset_per_ad=false): 1 campaign → 1 ad set → N creative.
//   - adset_per_ad=true: 1 creative = 1 ad set ngân sách riêng (vẫn giữ cho luồng thủ công).
// Chỉ test 2 helper thuần buildAdsetBase / withAdsetBudget — không gọi Meta API.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAdsetBase, withAdsetBudget, telCuaHotline, dichCuaAdset, cauHinhCuocGoi, WEB_CALL_DEST, onRequestPost } from "../functions/api/create-campaign.js";

const baseCfg = {
  optimization_goal: "OFFSITE_CONVERSIONS",
  billing_event: "IMPRESSIONS",
  destination_type: "WEBSITE",
  pixel_id: "123",
  objective: "OUTCOME_SALES",
  promoted_event: "COMPLETE_REGISTRATION",
  pacing_type: "standard",
  budget_type: "daily",
  budget_amount: 100000,
  targeting: { geo_locations: { countries: ["VN"] }, age_min: 18, age_max: 65 },
};

test("ABO ad set nhận TRỌN budget_amount (không chia)", () => {
  const body = buildAdsetBase(baseCfg, "camp_1", false, "PAUSED");
  withAdsetBudget(body, baseCfg, baseCfg.budget_amount);
  assert.equal(body.daily_budget, 100000, "mỗi ad set phải là 100k, không phải tổng/N");
  assert.equal(body.lifetime_budget, undefined);
  assert.equal(body.campaign_id, "camp_1");
  assert.equal(body.status, "PAUSED");
  assert.equal(body.bid_strategy, "LOWEST_COST_WITHOUT_CAP", "ABO: bid_strategy ở ad set");
});

test("lifetime budget đi vào lifetime_budget", () => {
  const cfg = { ...baseCfg, budget_type: "lifetime" };
  const body = withAdsetBudget({}, cfg, 500000);
  assert.equal(body.lifetime_budget, 500000);
  assert.equal(body.daily_budget, undefined);
});

test("buildAdsetBase giữ promoted_object + targeting + pacing", () => {
  const body = buildAdsetBase(baseCfg, "camp_1", false, "ACTIVE");
  assert.deepEqual(body.promoted_object, { pixel_id: "123", custom_event_type: "COMPLETE_REGISTRATION" });
  assert.deepEqual(body.targeting.geo_locations.countries, ["VN"]);
  assert.deepEqual(body.pacing_type, ["standard"]);
});

test("CBO: KHÔNG gắn bid_strategy ở ad set (nằm ở campaign)", () => {
  const body = buildAdsetBase(baseCfg, "camp_1", true, "PAUSED");
  assert.equal(body.bid_strategy, undefined);
});

test("mặc định: N creative chung 1 ad set, ad set giữ TRỌN budget_amount", () => {
  // Luồng auto (ads-creator.html) gửi adset_per_ad=false → backend chỉ dựng 1 ad set,
  // budget_amount là ngân sách CẢ campaign chứ không nhân lên theo số creative.
  const cfg = { ...baseCfg, budget_amount: 400000 };
  const body = buildAdsetBase(cfg, "camp_1", false, "PAUSED");
  body.name = "6/7 - NOMA 911";
  withAdsetBudget(body, cfg, cfg.budget_amount);
  assert.equal(body.daily_budget, 400000, "1 ad set chung = trọn 400k, không × số creative");
  assert.equal(body.campaign_id, "camp_1");
});

test("3 creative → 3 ad set, tổng = 3 × budget_amount", () => {
  const n = 3;
  const bodies = Array.from({ length: n }, (_, i) => {
    const b = buildAdsetBase(baseCfg, "camp_1", false, "PAUSED");
    b.name = `SP #${i + 1}`;
    return withAdsetBudget(b, baseCfg, baseCfg.budget_amount);
  });
  const total = bodies.reduce((s, b) => s + b.daily_budget, 0);
  assert.equal(bodies.length, 3);
  assert.equal(total, 300000, "3 ad set × 100k = 300k/ngày/campaign");
  assert.deepEqual(bodies.map((b) => b.name), ["SP #1", "SP #2", "SP #3"]);
});

// ── Đích "Trang web và cuộc gọi" (09/11/2026) ───────────────────────────────
test("số gọi về đúng dạng Meta lưu, sai thì null", () => {
  for (const v of ["0986878597", "0986 878 597", "+84986878597", "84986878597", "986878597"]) {
    assert.equal(telCuaHotline(v), "tel:+84986878597", v);
  }
  for (const v of ["", null, undefined, "123", "abc"]) assert.equal(telCuaHotline(v), null, String(v));
});

test("ad set gửi đúng đích web + gọi; riêng VALUE về Trang web vì Meta từ chối", () => {
  const webCall = { ...baseCfg, destination_type: WEB_CALL_DEST };
  assert.equal(buildAdsetBase(webCall, "c", false, "PAUSED").destination_type, "WEBSITE_AND_PHONE_CALL");
  assert.equal(dichCuaAdset({ ...webCall, optimization_goal: "VALUE" }), "WEBSITE");
  assert.equal(dichCuaAdset(baseCfg), "WEBSITE");
});

test("cấu hình cuộc gọi khớp mẫu camp đang chạy", () => {
  assert.deepEqual(cauHinhCuocGoi("tel:+84986878597"), {
    call_ads_configuration: { call_destination_type: "WEBSITE_AND_CALL", phone_number: "tel:+84986878597" },
  });
});

// Chạy trọn handler với fetch giả, ghi lại mọi lời gọi Meta.
async function chayHandler(cfgThem, dichAdsetCoSan) {
  const goi = [];
  const fetchGoc = globalThis.fetch;
  globalThis.fetch = async (url, opt = {}) => {
    const u = new URL(String(url));
    goi.push({ path: u.pathname, method: opt.method || "GET", raw: opt.body });
    const data = (opt.method || "GET") === "GET" ? { destination_type: dichAdsetCoSan, id: "x", name: "Trang", is_published: true } : { id: "id_" + goi.length };
    return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const fd = new FormData();
    fd.append("config", JSON.stringify({
      ...baseCfg, objective: "OUTCOME_SALES", account_id: "act_1", page_id: "99", campaign_name: "C", adset_name: "C",
      ads: [{ ad_name: "A", headline: "H", ad_copy: "B", cta: "ORDER_NOW", link: "https://x.vn/a", video_id: "v1", thumbnail_url: "https://x.vn/t.jpg" }],
      ...cfgThem,
    }));
    const res = await onRequestPost({ request: new Request("https://crm.test/api/create-campaign", { method: "POST", body: fd }), env: { FB_ACCESS_TOKEN: "t" } });
    return { kq: await res.json(), goi };
  } finally {
    globalThis.fetch = fetchGoc;
  }
}
const coSoGoi = (g) => String(g.raw ?? "").includes("call_ads_configuration");
const laCreative = (g) => g.path.endsWith("/adcreatives");

test("camp mới web + gọi: creative kèm số, CTA vẫn về landing", async () => {
  const { kq, goi } = await chayHandler({ destination_type: WEB_CALL_DEST, call_phone: "0986878597" });
  assert.equal(kq.success, true, JSON.stringify(kq));
  const cr = goi.find(laCreative);
  assert.ok(coSoGoi(cr), "creative phải có call_ads_configuration");
  const raw = decodeURIComponent(String(cr.raw));
  assert.match(raw, /tel:\+84986878597/);
  assert.match(raw, /ORDER_NOW/);
  assert.match(raw, /x\.vn/);
});

test("đích Trang web: creative KHÔNG kèm số", async () => {
  const { kq, goi } = await chayHandler({ destination_type: "WEBSITE", call_phone: "0986878597" });
  assert.equal(kq.success, true);
  assert.ok(!coSoGoi(goi.find(laCreative)));
});

test("số sai: dừng TRƯỚC khi tạo campaign, không để lại camp rỗng", async () => {
  const { kq, goi } = await chayHandler({ destination_type: WEB_CALL_DEST, call_phone: "123" });
  assert.equal(kq.success, false);
  assert.match(kq.error, /số điện thoại hợp lệ/);
  assert.ok(!goi.some((g) => g.path.endsWith("/campaigns")));
});

test("đổ vào nhóm web + gọi có sẵn: creative kèm số dù form chọn Trang web", async () => {
  const { kq, goi } = await chayHandler({ destination_type: "WEBSITE", call_phone: "0986878597", existing_adset_id: "55" }, WEB_CALL_DEST);
  assert.equal(kq.success, true, JSON.stringify(kq));
  assert.ok(coSoGoi(goi.find(laCreative)));
});

test("đổ vào nhóm Trang web có sẵn: không kèm số, không đổi đích nhóm, có cảnh báo", async () => {
  const { kq, goi } = await chayHandler({ destination_type: WEB_CALL_DEST, call_phone: "0986878597", existing_adset_id: "55" }, "WEBSITE");
  assert.equal(kq.success, true, JSON.stringify(kq));
  assert.ok(!coSoGoi(goi.find(laCreative)));
  assert.ok(!goi.some((g) => g.method === "POST" && g.path.endsWith("/55")), "không được sửa ad set có sẵn");
  assert.match(kq.warnings.join(" "), /KHÔNG có nút gọi/);
});

test("VALUE: nhóm mới chạy Trang web, creative không số, có cảnh báo", async () => {
  const { kq, goi } = await chayHandler({ destination_type: WEB_CALL_DEST, call_phone: "0986878597", optimization_goal: "VALUE" });
  assert.equal(kq.success, true, JSON.stringify(kq));
  assert.ok(!coSoGoi(goi.find(laCreative)));
  assert.match(kq.warnings.join(" "), /Tối đa hoá giá trị/);
});
