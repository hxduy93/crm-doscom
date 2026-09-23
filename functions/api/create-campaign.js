/**
 * Cloudflare Pages Function: POST /api/create-campaign
 * -----------------------------------------------------
 * Full end-to-end campaign creation from the dashboard form.
 *
 * Request (multipart/form-data):
 *   - config         JSON string (campaign + adset + ads metadata)
 *   - video_0, video_1, ...   Video files (one per ad that has a video)
 *   - image_0, image_1, ...   Image files (one per ad that has an image)
 *
 * Creates, in order:
 *   1. Uploads videos/images to the ad account (per ad)
 *   2. Campaign (PAUSED)
 *   3. AdSet   (PAUSED, with promoted_object + targeting)
 *   4. AdCreative + Ad (PAUSED) for each ad in config.ads
 *
 * Response: { success, campaign_id, adset_id, ads:[{ad_id,creative_id,video_id|image_hash}], ads_manager_url }
 * On error: { success: false, step, error, partial:{...} } — partial so caller can clean up.
 *
 * Env: FB_ACCESS_TOKEN (Meta Marketing API, scopes ads_management + pages_manage_ads + business_management)
 */

const FB_API_VERSION = "v20.0";
const GRAPH = `https://graph.facebook.com/${FB_API_VERSION}`;

import { ghiSo } from "../lib/ad-boxes.js";

// ─────────────────── chiến lược giá thầu (Meta: "Chiến lược giá thầu") ───────────────────
// LOWEST_COST_WITHOUT_CAP  = "Chi phí thấp nhất" — Meta tự đấu, không trần (mặc định).
// LOWEST_COST_WITH_MIN_ROAS= "Mục tiêu ROAS"     — chỉ có nghĩa với optimization_goal=VALUE.
// COST_CAP                 = "Mục tiêu chi phí trên mỗi kết quả" — Meta giữ CPA TRUNG BÌNH
//                            quanh mức đặt; từng kết quả có thể cao/thấp hơn.
// LOWEST_COST_WITH_BID_CAP = "Giới hạn giá thầu" — trần CỨNG cho mỗi phiên đấu giá.
// Hai cái cuối BẮT BUỘC kèm bid_amount.
//
// ĐƠN VỊ bid_amount: đơn vị NHỎ NHẤT của tiền tệ tài khoản. VND không có phần thập phân
// (currency offset = 1) nên 50.000đ gửi đúng là 50000 — CÙNG quy ước với daily_budget đang
// gửi (400000 = 400k/ngày). ĐỪNG nhân 100: đó là quy ước của USD/EUR, gửi nhầm thành đặt
// thầu gấp 100 lần mức muốn.
export const BID_STRATEGIES = [
  "LOWEST_COST_WITHOUT_CAP",
  "LOWEST_COST_WITH_MIN_ROAS",
  "COST_CAP",
  "LOWEST_COST_WITH_BID_CAP",
];
const BID_AMOUNT_REQUIRED = new Set(["COST_CAP", "LOWEST_COST_WITH_BID_CAP"]);

// Chuỗi lạ / bỏ trống → quay về chi phí thấp nhất, KHÔNG ném lỗi: mất giá thầu còn hơn
// làm hỏng cả lượt tạo campaign.
export function normalizeBidStrategy(v) {
  const s = String(v || "").trim().toUpperCase();
  return BID_STRATEGIES.includes(s) ? s : "LOWEST_COST_WITHOUT_CAP";
}

export function needsBidAmount(v) {
  return BID_AMOUNT_REQUIRED.has(normalizeBidStrategy(v));
}

// Số tiền giá thầu hợp lệ (VND nguyên, > 0) hoặc null nếu không nhập/không hợp lệ.
export function parseBidAmount(v) {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ───────────────────────── helpers ─────────────────────────

// JSON response helper — trước đây thiếu, gây ReferenceError khi catch block
// chạy → user thấy "ad không tạo được" thay vì error thật từ FB.
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function fbGet(endpoint, params, token) {
  const qs = new URLSearchParams(params || {});
  qs.append("access_token", token);
  const r = await fetch(`${GRAPH}${endpoint}?${qs}`, { signal: AbortSignal.timeout(30000) });
  const data = await r.json().catch(() => ({ error: { message: `Non-JSON response (status ${r.status})` } }));
  if (!r.ok || data.error) {
    throw new Error((data.error && data.error.message) || `HTTP ${r.status}`);
  }
  return data;
}

async function fbPost(endpoint, body, token) {
  // body can be FormData (for file uploads) or URLSearchParams / object
  let init;
  if (body instanceof FormData) {
    body.append("access_token", token);
    init = { method: "POST", body };
  } else {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined || v === null) continue;
      params.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
    params.append("access_token", token);
    init = {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    };
  }
  const r = await fetch(`${GRAPH}${endpoint}`, { ...init, signal: AbortSignal.timeout(60000) });
  const data = await r.json().catch(() => ({ error: { message: `Non-JSON response (status ${r.status})` } }));
  if (!r.ok || data.error) {
    const msg = (data.error && data.error.error_user_msg) || (data.error && data.error.message) || `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return data;
}

// Derive the promoted_object for OFFSITE_CONVERSIONS/SALES campaigns
function buildPromotedObject(cfg) {
  if (!cfg.pixel_id) return null;
  // Event type inference — user can override via config.promoted_event
  let evt = cfg.promoted_event;
  if (!evt) {
    if (cfg.optimization_goal === "OFFSITE_CONVERSIONS") {
      evt = cfg.objective === "OUTCOME_SALES" ? "PURCHASE" : "COMPLETE_REGISTRATION";
    } else if (cfg.optimization_goal === "VALUE") {
      evt = "PURCHASE";
    }
  }
  const po = { pixel_id: cfg.pixel_id };
  if (evt) po.custom_event_type = evt;
  return po;
}

// Default targeting — Vietnam 18-65, all genders.
// Meta (v21+) BẮT BUỘC khai advantage_audience (1=bật Advantage+ đối tượng, 0=tắt).
// Mặc định bật 1 nếu caller chưa khai → tránh lỗi "create_adset" thiếu cờ.
function buildTargeting(cfg) {
  const t = cfg.targeting || {
    geo_locations: { countries: ["VN"] },
    age_min: 18,
    age_max: 65,
  };
  // advantage_audience=0: tôn trọng đúng tuổi/giới tính đã chọn (vd 30-60).
  // (Bật =1 thì Meta KHÔNG cho giới hạn tuổi tối đa — xung đột với khoảng tuổi.)
  if (!t.targeting_automation) {
    t.targeting_automation = { advantage_audience: 0 };
  }
  return t;
}

// Normalize any date-ish string → Meta-compatible ISO with VN timezone (+07:00).
// Accepts: "2026-04-17" (date only) | "2026-04-17T10:30" (datetime-local)
//        | "2026-04-17T10:30:00" (no tz) | full ISO with tz (pass through)
function toMetaDatetime(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (s.length === 10) return `${s}T00:00:00+07:00`;      // date only → midnight VN
  if (s.length === 16) return `${s}:00+07:00`;             // datetime-local → add seconds+tz
  if (s.length === 19 && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) return `${s}+07:00`;
  return s;                                                 // already has tz
}

// Upload a video file to the ad account. Returns video_id.
async function uploadVideo(accountId, file, token) {
  const fd = new FormData();
  fd.append("source", file, file.name);
  const data = await fbPost(`/act_${accountId}/advideos`, fd, token);
  return data.id;
}

// Poll video processing status — FB cần video.status.video_status = "ready"
// trước khi dùng trong ad creative.
// LƯU Ý: Cloudflare Pages Function có limit request duration ~30s tổng,
// nên mình giảm max wait xuống 20s. Video > 15MB có thể fail → user nén lại.
async function waitForVideoReady(videoId, token, maxWaitMs = 20000, pollIntervalMs = 2500) {
  const start = Date.now();
  let lastStatus = "unknown";
  while (Date.now() - start < maxWaitMs) {
    try {
      const data = await fbGet(`/${videoId}`, { fields: "status" }, token);
      const status = data.status || {};
      const vs = status.video_status || status.processing_progress || "unknown";
      lastStatus = vs;
      if (vs === "ready") return true;
      if (vs === "error") {
        throw new Error(`FB báo video lỗi xử lý: ${JSON.stringify(status)}`);
      }
      // Còn "processing" → tiếp tục poll
    } catch (e) {
      // Lỗi tạm thời (vd 404 vì video chưa kịp index) → tiếp tục poll
      if (String(e.message).includes("FB báo video lỗi")) throw e;
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  throw new Error(`Video chưa ready sau ${maxWaitMs/1000}s (status: ${lastStatus}). 👉 GIẢI PHÁP: đợi 1-2 phút rồi bấm "Thử lại" — video sẽ ready và lần này chạy nhanh. Nếu vẫn fail → nén video xuống < 10MB.`);
}

// Wait for Meta to generate thumbnails after video upload, then return a URL.
// Meta takes 5–30s to auto-generate thumbnails depending on video length.
async function waitForVideoThumbnail(videoId, token, maxWaitMs = 8000, pollIntervalMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const data = await fbGet(`/${videoId}/thumbnails`, { fields: "uri,is_preferred" }, token);
      const list = (data && data.data) || [];
      if (list.length > 0) {
        const preferred = list.find((t) => t.is_preferred) || list[0];
        if (preferred && preferred.uri) return preferred.uri;
      }
    } catch (e) {
      // Ignore transient errors while video is still processing
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  throw new Error("Thumbnail chưa sinh xong sau 25s — video có thể quá lớn. Thử upload video ngắn hơn (< 1 phút) hoặc nén lại.");
}

// Upload an image file. Returns image_hash.
async function uploadImage(accountId, file, token) {
  const fd = new FormData();
  fd.append("filename", file, file.name);
  const data = await fbPost(`/act_${accountId}/adimages`, fd, token);
  const images = data.images || {};
  const first = images[Object.keys(images)[0]];
  if (!first || !first.hash) throw new Error("Image upload succeeded but no hash returned");
  return first.hash;
}

// Build object_story_spec for creative based on media type & destination
// NOTE: Link đích (ad.link) được GIỮ NGUYÊN. UTM params được gửi riêng qua
// adcreative.url_tags (set trong onRequestPost bên dưới) — Meta tự append vào
// mọi click URL. Tương đương field "Thông số URL" trong Ads Manager UI.
function buildStorySpec({ pageId, ad, videoId, videoThumbnailUrl, imageHash, destinationType }) {
  const cta = { type: ad.cta || "LEARN_MORE", value: {} };
  if (ad.link) cta.value.link = ad.link;

  if (videoId) {
    if (!videoThumbnailUrl) {
      throw new Error("Thumbnail required for video ad — waitForVideoThumbnail() failed");
    }
    return {
      page_id: pageId,
      video_data: {
        video_id: videoId,
        image_url: videoThumbnailUrl, // REQUIRED by Meta — auto-generated after upload
        message: ad.ad_copy || "",
        title: ad.headline || "",
        call_to_action: cta,
        link_description: ad.description || "",
      },
    };
  }
  if (imageHash) {
    return {
      page_id: pageId,
      link_data: {
        image_hash: imageHash,
        link: ad.link || "https://doscom.vn",
        message: ad.ad_copy || "",
        name: ad.headline || "",
        description: ad.description || "",
        call_to_action: cta,
      },
    };
  }
  throw new Error("Ad must have either a video or image");
}

// Build the shared AdSet body (mọi field TRỪ name + budget) — dùng lại dù tạo
// 1 ad set chung hay 1 ad set / creative.
export function buildAdsetBase(cfg, campaignId, isCBO, launchStatus) {
  const base = {
    campaign_id: campaignId,
    optimization_goal: cfg.optimization_goal,
    billing_event: cfg.billing_event,
    status: launchStatus,
    destination_type: cfg.destination_type || "WEBSITE",
    targeting: buildTargeting(cfg),
  };
  const startIso = toMetaDatetime(cfg.start_time);
  const endIso = toMetaDatetime(cfg.end_time);
  if (startIso) base.start_time = startIso;
  if (endIso) base.end_time = endIso;
  if (Array.isArray(cfg.attribution_spec) && cfg.attribution_spec.length > 0) {
    base.attribution_spec = cfg.attribution_spec;
  }
  if (cfg.pacing_type) base.pacing_type = [cfg.pacing_type];
  const po = buildPromotedObject(cfg);
  if (po) base.promoted_object = po;
  // ABO → bid_strategy nằm ở ad set (CBO thì ở campaign).
  // cfg.bid_strategy chỉ dùng khi chạy "tối đa hoá GIÁ TRỊ có sàn ROAS"
  // (LOWEST_COST_WITH_MIN_ROAS) — mọi trường hợp khác giữ chi phí thấp nhất.
  const bidStrategy = normalizeBidStrategy(cfg.bid_strategy);
  if (!isCBO) base.bid_strategy = bidStrategy;
  // Sàn ROAS: Meta nhận qua bid_constraints.roas_average_floor, đơn vị 1/10000
  // (2.0 → 20000). Chỉ có nghĩa với optimization_goal = VALUE.
  if (base.bid_strategy === "LOWEST_COST_WITH_MIN_ROAS" && Number(cfg.roas_average_floor) > 0) {
    base.bid_constraints = { roas_average_floor: Math.round(Number(cfg.roas_average_floor) * 10000) };
  }
  // Giá thầu bằng tiền (COST_CAP / LOWEST_COST_WITH_BID_CAP): bid_amount nằm ở AD SET
  // KỂ CẢ khi chạy CBO — CBO chỉ đẩy bid_strategy lên campaign, số tiền vẫn ở đây.
  if (BID_AMOUNT_REQUIRED.has(bidStrategy)) {
    const amt = parseBidAmount(cfg.bid_amount);
    if (amt === null) throw new Error(`Chiến lược giá thầu "${bidStrategy}" phải kèm bid_amount là số VND > 0`);
    base.bid_amount = amt;
  }
  // Chiến lược vòng đời khách hàng (Meta mở 2026 cho campaign Doanh số):
  // 0 = KHÔNG tiêu đồng nào cho khách cũ = "Chinh phục khách hàng mới".
  // Không gửi field này = giữ mặc định "thu hút chuyển đổi từ tất cả đối tượng".
  const ecb = cfg.existing_customer_budget_percentage;
  if (ecb === 0 || (Number.isFinite(Number(ecb)) && String(ecb).trim() !== "")) {
    const pct = Math.max(0, Math.min(100, Math.round(Number(ecb))));
    base.existing_customer_budget_percentage = pct;
  }
  return base;
}

// Field vòng đời khách hàng chưa mở cho mọi tài khoản — tài khoản chưa được bật
// thì Meta trả lỗi "unknown/invalid param". Bỏ field đó ra rồi tạo lại còn hơn
// để campaign vừa tạo nằm trơ không có ad set nào.
export function isLifecycleUnsupported(msg) {
  const m = String(msg || "").toLowerCase();
  if (!m.includes("existing_customer_budget_percentage")) return false;
  return /unknown|invalid|not (supported|available|allowed)|does not (support|exist)|unsupported|permission/.test(m);
}

// Gắn ngân sách ABO cho 1 ad set. amount = ngân sách của CHÍNH ad set này.
export function withAdsetBudget(body, cfg, amount) {
  if (cfg.budget_type === "lifetime") body.lifetime_budget = amount;
  else body.daily_budget = amount;
  return body;
}

// ───────────────────────── main handler ─────────────────────────

export async function onRequestPost(context) {
  const { request, env } = context;
  const token = env.FB_ACCESS_TOKEN;

  if (!token) {
    return json({ success: false, step: "init", error: "FB_ACCESS_TOKEN not configured on Cloudflare env" }, 500);
  }

  let cfg;
  const filesByAd = {}; // { 0: { video: File, image: File }, 1: {...} }
  try {
    const form = await request.formData();
    const configStr = form.get("config");
    if (!configStr) throw new Error("Missing 'config' field in form data");
    cfg = JSON.parse(configStr);

    // Collect video/image files per ad index
    for (const [key, val] of form.entries()) {
      const mv = key.match(/^video_(\d+)$/);
      const mi = key.match(/^image_(\d+)$/);
      if (mv && val instanceof File && val.size > 0) {
        const idx = parseInt(mv[1], 10);
        (filesByAd[idx] = filesByAd[idx] || {}).video = val;
      } else if (mi && val instanceof File && val.size > 0) {
        const idx = parseInt(mi[1], 10);
        (filesByAd[idx] = filesByAd[idx] || {}).image = val;
      }
    }
  } catch (e) {
    return json({ success: false, step: "parse_form", error: String(e.message || e) }, 400);
  }

  // Validate required fields
  const required = ["account_id", "page_id", "objective", "optimization_goal", "billing_event"];
  for (const f of required) {
    if (!cfg[f]) return json({ success: false, step: "validate", error: `Missing field: ${f}` }, 400);
  }
  if (!Array.isArray(cfg.ads) || cfg.ads.length === 0) {
    return json({ success: false, step: "validate", error: "config.ads must be a non-empty array" }, 400);
  }
  // Bắt thiếu giá thầu Ở ĐÂY, trước khi tạo bất cứ thứ gì trên Meta: lỗi ở bước ad set
  // để lại một campaign rỗng nằm trơ trong tài khoản, phải vào xoá tay.
  if (needsBidAmount(cfg.bid_strategy) && parseBidAmount(cfg.bid_amount) === null) {
    return json({
      success: false, step: "validate",
      error: `Chiến lược giá thầu "${normalizeBidStrategy(cfg.bid_strategy)}" phải kèm giá thầu (bid_amount) là số VND > 0`,
    }, 400);
  }

  const accountIdRaw = String(cfg.account_id).replace(/^act_/, "");
  const partial = {};

  try {
    // ── Step 1: Upload all media (HOẶC dùng media đã upload trước qua /api/fb-upload-media) ──
    // 2026-05-06: split flow để tránh CF 30s timeout. Frontend nên upload qua
    // /api/fb-upload-media trước → nhận video_id + thumbnail_url, gửi vào cfg.ads[i].
    // Endpoint này nếu thấy ad đã có video_id/image_hash sẽ SKIP upload+wait.
    const uploaded = {}; // idx → { video_id?, image_hash?, thumbnail_url? }
    for (let i = 0; i < cfg.ads.length; i++) {
      const ad = cfg.ads[i];
      const files = filesByAd[i] || {};
      uploaded[i] = {};

      // Pre-uploaded path (preferred — nhanh, không bị timeout)
      if (ad.video_id) {
        uploaded[i].video_id = ad.video_id;
        uploaded[i].thumbnail_url = ad.thumbnail_url || null;
      } else if (ad.image_hash) {
        uploaded[i].image_hash = ad.image_hash;
      }
      // Fallback: file kèm trong form (backward compat — nhưng dễ timeout với video)
      else if (files.video) {
        uploaded[i].video_id = await uploadVideo(accountIdRaw, files.video, token);
      } else if (files.image) {
        uploaded[i].image_hash = await uploadImage(accountIdRaw, files.image, token);
      } else {
        throw new Error(`Ad #${i + 1} thiếu video_id/image_hash trong cfg HOẶC file kèm trong form`);
      }
    }
    partial.uploaded = uploaded;

    // ── Step 2: Create Campaign ─────────────────────────────────
    // Budget level: "campaign" (CBO) → budget on campaign, adset inherits.
    //               "adset"    (ABO) → budget on adset (default).
    // launch_status: "ACTIVE" starts running immediately, "PAUSED" for review
    const launchStatus = cfg.launch_status === "ACTIVE" ? "ACTIVE" : "PAUSED";
    const isCBO = cfg.budget_level === "campaign";

    // ĐỔ VÀO AD SET ĐANG CHẠY (QUYẾT 2026-08-05): cfg.existing_adset_id có nghĩa là
    // "sản phẩm này đã có hộp TEST rồi, thêm creative vào đó" → BỎ QUA bước tạo
    // campaign + ad set. Trước đây mỗi lần chạy đều đẻ campaign + ad set mới nên một
    // tài khoản tích thành ~19 ad set cùng tệp, không cái nào đủ 50 chuyển đổi/tuần
    // để thoát learning. Ngân sách giữ nguyên của ad set cũ — KHÔNG đụng vào, vì sửa
    // ngân sách là reset giai đoạn máy học, đúng thứ đang cố tránh.
    /* HAI BIẾN NÀY PHẢI KHAI Ở ĐÂY — trước mọi nhánh có thể gọi createAdForAdset().
       Chúng được gán bên trong hàm đó; `let` nằm sau chỗ gọi thì rơi vào "vùng chết"
       và ném "Cannot access 'currentAdSubStep' before initialization".
       Đã dính đúng lỗi này: nhánh `cfg.existing_adset_id` (thêm creative vào ad set
       đang chạy, làm 05/08/2026) gọi hàm rồi THOÁT SỚM, không bao giờ chạy tới chỗ
       khai báo cũ ở dưới → tính năng đó hỏng 100% từ lúc ra đời, tới 22/08/2026 mới
       phát hiện. Đừng dời hai dòng này xuống dưới. */

    /* Ghi sổ hộp: (tài khoản, sản phẩm, nhóm) -> campaign_id + adset_id vừa dùng.
       Lần chạy sau tra theo ID nên đổi tên bên Trình quản lý QC không làm lạc hộp nữa.
       Ghi cả khi DÙNG LẠI ad set — đó là lúc người chạy tự tay chọn đích, chính là thứ
       đáng nhớ nhất. Hỏng sổ KHÔNG làm hỏng lượt tạo: chỉ cảnh báo. */
    async function ghiSoHop(campaignId, adsetId) {
      const box = cfg.box || null;
      if (!box || !box.product || !adsetId) return;
      const ok = await ghiSo(env.DB, {
        account_id: accountIdRaw, product: box.product, group: box.group || "TEST",
        campaign_id: campaignId, adset_id: adsetId,
      });
      if (!ok) warnings.push("Không ghi được sổ hộp vào D1 — lần sau phải tự chọn lại nhóm quảng cáo đích.");
    }

    let currentAdSubStep = "";  // để báo lỗi chính xác sub-step nào fail
    let currentAdIndex = -1;
    /* Cũng phải khai TRƯỚC nhánh existing_adset_id vì nhánh đó return sớm — khai ở dưới
       thì nhánh dùng lại hộp không có chỗ ghi cảnh báo. Xem ghi chú TDZ ngay trên. */
    const warnings = [];

    if (cfg.existing_adset_id) {
      const adsetId = String(cfg.existing_adset_id);
      partial.campaign_id = cfg.existing_campaign_id || null;
      partial.adset_id = adsetId;
      partial.adsets = [adsetId];
      partial.ads = [];

      /* GIÁ THẦU TRÊN HỘP ĐANG CHẠY — mặc định KHÔNG ĐỤNG VÀO.
         Sửa bid_strategy/bid_amount của một ad set đang sống làm Meta chạy lại giai đoạn
         máy học, đúng thứ mà việc dùng lại hộp sinh ra để tránh (xem ghi chú ngân sách ở
         trên). Nên chỉ đổi khi người chạy tick rõ ràng; không tick mà vẫn chọn giá thầu
         thì phải NÓI RA, đừng để họ tưởng đã đặt được. */
      const reuseStrategy = normalizeBidStrategy(cfg.bid_strategy);
      if (cfg.apply_bid_to_existing === true) {
        const bidBody = { bid_strategy: reuseStrategy };
        if (BID_AMOUNT_REQUIRED.has(reuseStrategy)) bidBody.bid_amount = parseBidAmount(cfg.bid_amount);
        try {
          await fbPost(`/${adsetId}`, bidBody, token);
          warnings.push(
            `Đã đặt lại giá thầu cho hộp đang chạy: ${reuseStrategy}` +
            (bidBody.bid_amount ? ` · ${bidBody.bid_amount}đ` : "") +
            " — ad set sẽ chạy lại giai đoạn máy học (~50 chuyển đổi/tuần).");
        } catch (e) {
          warnings.push(`Không đặt được giá thầu cho hộp đang chạy: ${e.message || e}. Creative vẫn được thêm, giá thầu giữ nguyên như cũ.`);
        }
      } else if (reuseStrategy !== "LOWEST_COST_WITHOUT_CAP") {
        warnings.push('Hộp đã có sẵn nên giá thầu vừa chọn KHÔNG được áp — ad set giữ nguyên cài đặt cũ. Tick "Áp giá thầu lên hộp đang chạy" nếu thật sự muốn đổi.');
      }

      let idx = -1;
      try {
        for (let i = 0; i < cfg.ads.length; i++) {
          idx = i;
          await createAdForAdset(i, adsetId);
        }
      } catch (adErr) {
        throw new Error(`[Ad #${idx + 1} - thêm vào ad set sẵn có] ${adErr.message || adErr}`);
      }
      await ghiSoHop(partial.campaign_id, adsetId);
      return json({
        success: true,
        reused_adset: true,
        campaign_id: partial.campaign_id,
        adset_id: adsetId,
        adsets: partial.adsets,
        ads: partial.ads,
        ...(warnings.length ? { warnings } : {}),
        ads_manager_url: `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${accountIdRaw}&selected_adset_ids=${adsetId}`,
      });
    }
    /* ĐÍCH THỨ BA (23/09/2026): "tạo NHÓM QC MỚI trong campaign đang có".
       Trước đây chỉ có hai đường — dùng lại nguyên ad set cũ, hoặc đẻ campaign mới hoàn
       toàn. Không có cách nào thêm một ad set thứ hai vào đúng campaign đang chạy, nên
       người chạy phải vào Trình quản lý QC làm tay (đó là gốc của mấy ad set "BID",
       "BID - tăng tốc" nằm lẫn trong campaign hộp mà luồng tự động không hiểu). */
    if (cfg.existing_campaign_id) {
      partial.campaign_id = String(cfg.existing_campaign_id);
      partial.reused_campaign = true;
      if (isCBO) {
        warnings.push("Campaign có sẵn đang giữ ngân sách của chính nó (CBO) — không đụng vào; ngân sách khai trong form bị bỏ qua.");
      }
    } else {
    const campaignBody = {
      name: cfg.campaign_name || `${cfg.objective}-${Date.now()}`,
      objective: cfg.objective,
      status: launchStatus,
      buying_type: cfg.buying_type || "AUCTION",
      special_ad_categories: [],
      is_adset_budget_sharing_enabled: isCBO,
    };
    if (isCBO) {
      if (cfg.budget_type === "lifetime") {
        campaignBody.lifetime_budget = cfg.budget_amount;
      } else {
        campaignBody.daily_budget = cfg.budget_amount;
      }
      // CBO: bid_strategy nằm ở CAMPAIGN (số tiền bid_amount vẫn ở ad set — xem buildAdsetBase).
      // Trước đây ghim cứng LOWEST_COST_WITHOUT_CAP nên chọn giá thầu ở CBO là mất im lặng.
      campaignBody.bid_strategy = normalizeBidStrategy(cfg.bid_strategy);
    }
    const campRes = await fbPost(`/act_${accountIdRaw}/campaigns`, campaignBody, token);
    partial.campaign_id = campRes.id;
    }

    // ── Step 3+4: AdSet(s) + Ads ────────────────────────────────
    // 2026-07-06: hỗ trợ "1 creative = 1 ad set" (cfg.adset_per_ad).
    // Nhiều ad CHUNG 1 ad set bị FB dồn phân phối cho 1 ad "khỏe nhất" ngay trong
    // learning phase → 2 creative đều ngon vẫn chỉ 1 cái được tiêu tiền. Tách mỗi
    // creative sang 1 ad set NGÂN SÁCH RIÊNG (ABO) → FB buộc phân phối tất cả.
    // Mỗi ad set nhận TRỌN cfg.budget_amount (vd 100k/ngày × 3 = 300k/campaign).
    const adsetPerAd = cfg.adset_per_ad === true && !isCBO;
    partial.ads = [];
    partial.adsets = [];

    // Tạo Creative + Ad cho ad thứ i, gắn vào adsetId cho sẵn.
    async function createAdForAdset(i, adsetId) {
      const ad = cfg.ads[i];
      const media = uploaded[i];

      // Video ads need: (1) status=ready (xử lý xong) (2) thumbnail.
      // Đã pre-upload qua /api/fb-upload-media → media.thumbnail_url có sẵn,
      // video chắc chắn ready → skip wait, không lo timeout.
      let videoThumbnailUrl = media.thumbnail_url || null;
      if (media.video_id && !videoThumbnailUrl) {
        currentAdSubStep = "wait_video_ready";
        await waitForVideoReady(media.video_id, token);
        currentAdSubStep = "wait_video_thumbnail";
        videoThumbnailUrl = await waitForVideoThumbnail(media.video_id, token);
      }

      currentAdSubStep = "build_story_spec";
      const storySpec = buildStorySpec({
        pageId: cfg.page_id,
        ad,
        videoId: media.video_id,
        videoThumbnailUrl,
        imageHash: media.image_hash,
        destinationType: cfg.destination_type,
      });

      // Build adcreative body — attach url_tags if ad has UTM params.
      // Tên creative ĐẶT GIỐNG ad set / ad (= ngày - sản phẩm - tên video).
      const creativeBody = {
        name: ad.ad_name || `Ad ${i + 1}`,
        object_story_spec: storySpec,
      };
      if (ad.url_tags && typeof ad.url_tags === "string" && ad.url_tags.trim()) {
        creativeBody.url_tags = ad.url_tags.trim();
      }
      currentAdSubStep = "create_adcreative";
      const creativeRes = await fbPost(`/act_${accountIdRaw}/adcreatives`, creativeBody, token);

      currentAdSubStep = "create_ad";
      const adRes = await fbPost(`/act_${accountIdRaw}/ads`, {
        name: ad.ad_name || `${cfg.campaign_name} - Ad ${i + 1}`,
        adset_id: adsetId,
        creative: { creative_id: creativeRes.id },
        status: launchStatus,
      }, token);

      partial.ads.push({
        ad_id: adRes.id,
        creative_id: creativeRes.id,
        adset_id: adsetId,
        video_id: media.video_id || null,
        image_hash: media.image_hash || null,
      });
    }

    // Tạo ad set — tài khoản chưa được Meta bật "vòng đời khách hàng" thì bỏ đúng
    // field đó rồi tạo lại, kèm cảnh báo trả về UI (xem isLifecycleUnsupported).
    // (`warnings` khai ở trên, trước nhánh dùng lại hộp.)
    async function createAdset(body) {
      try {
        return await fbPost(`/act_${accountIdRaw}/adsets`, body, token);
      } catch (e) {
        if (body.existing_customer_budget_percentage === undefined) throw e;
        if (!isLifecycleUnsupported(e.message)) throw e;
        const retry = { ...body };
        delete retry.existing_customer_budget_percentage;
        if (!warnings.length) {
          warnings.push("Tài khoản chưa dùng được 'Chiến lược vòng đời khách hàng' — ad set đã tạo với đối tượng mặc định (tất cả đối tượng).");
        }
        return await fbPost(`/act_${accountIdRaw}/adsets`, retry, token);
      }
    }

    try {
      if (adsetPerAd) {
        // 1 ad set / creative — mỗi ad set nhận TRỌN budget_amount.
        for (let i = 0; i < cfg.ads.length; i++) {
          currentAdIndex = i;
          currentAdSubStep = "create_adset";
          const body = buildAdsetBase(cfg, partial.campaign_id, isCBO, launchStatus);
          // 1 creative/ad set → tên ad set = tên ad (= ngày - sản phẩm - KOC).
          body.name = cfg.ads[i].ad_name || `${cfg.adset_name || cfg.campaign_name} #${i + 1}`;
          withAdsetBudget(body, cfg, cfg.budget_amount);
          const adsetRes = await createAdset(body);
          partial.adsets.push(adsetRes.id);
          if (!partial.adset_id) partial.adset_id = adsetRes.id;
          await createAdForAdset(i, adsetRes.id);
        }
      } else {
        // Cũ: 1 ad set dùng chung, N ad.
        currentAdSubStep = "create_adset";
        const body = buildAdsetBase(cfg, partial.campaign_id, isCBO, launchStatus);
        body.name = cfg.adset_name || cfg.campaign_name;
        if (!isCBO) withAdsetBudget(body, cfg, cfg.budget_amount);
        const adsetRes = await createAdset(body);
        partial.adsets.push(adsetRes.id);
        partial.adset_id = adsetRes.id;
        for (let i = 0; i < cfg.ads.length; i++) {
          currentAdIndex = i;
          await createAdForAdset(i, adsetRes.id);
        }
      }
    } catch (adErr) {
      // Re-throw nhưng kèm context: ad index + sub-step nào fail
      throw new Error(`[Ad #${currentAdIndex + 1} - ${currentAdSubStep}] ${adErr.message || adErr}`);
    }

    await ghiSoHop(partial.campaign_id, partial.adset_id);
    return json({
      success: true,
      reused_campaign: partial.reused_campaign === true,
      campaign_id: partial.campaign_id,
      adset_id: partial.adset_id,
      adsets: partial.adsets,
      ads: partial.ads,
      ...(warnings.length ? { warnings } : {}),
      ads_manager_url: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${accountIdRaw}&selected_campaign_ids=${partial.campaign_id}`,
    });
  } catch (e) {
    // Figure out which step failed based on what's been populated in `partial`
    let step;
    if (!partial.uploaded) {
      step = "upload_media";
    } else if (!partial.campaign_id) {
      step = "create_campaign";
    } else if (!partial.adset_id) {
      step = "create_adset";
    } else {
      // campaign + adset exist → failing inside creative/ad loop or thumbnail wait
      step = "create_ads";
    }
    return json({
      success: false,
      step,
      error: String(e.message || e),
      partial,
    }, 502);
  }
}