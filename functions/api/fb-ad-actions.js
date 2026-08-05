/**
 * POST /api/fb-ad-actions        (ghi — cần quyền, xem phần Xác thực bên dưới)
 * ---------------------------------------------------------------------------
 * Hai thao tác của quy trình TEST → SCALE:
 *
 *   { action: "pause_ad", ad_id }
 *       Tắt 1 ad. Dùng cho "creative thua thì tắt" và cho luồng tự động khi ad set
 *       TEST đã đủ 4 creative (tắt cái cũ nhất để nhường chỗ).
 *
 *   { action: "promote", ad_id, account_id, product, daily_budget? }
 *       Bê 1 ad từ nhóm TEST sang nhóm SCALE của cùng sản phẩm.
 *
 *       QUAN TRỌNG — DÙNG LẠI BÀI VIẾT CŨ, KHÔNG UPLOAD LẠI VIDEO:
 *       creative mới dựng bằng `object_story_id` = post ID của ad gốc, nên bản ở
 *       SCALE THỪA HƯỞNG toàn bộ like/comment/share đã tích được. Upload lại video
 *       sẽ tạo bài mới, tương tác về 0 và CTR tụt — đó là lỗi hay gặp nhất khi
 *       "nhân bản ad thắng".
 *
 *       Chưa có hộp SCALE thì tạo mới, CLONE nguyên cấu hình ad set TEST (mục tiêu,
 *       sự kiện, đối tượng, cửa sổ ghi nhận) rồi chỉ đổi tên + ngân sách. Campaign,
 *       ad set và ad mới đều tạo ở PAUSED — tiền chỉ chạy khi bạn tự bật, giống hệt
 *       quy ước của /api/create-campaign.
 *
 * Xác thực: getIdentity + canAccess. Access chưa bật (role "open") → bắt buộc
 * header X-Optimizer-Token (red-line: endpoint GHI phải có token).
 */
import { getIdentity, canAccess } from "../lib/access.js";
import { groupName, parseGroupName } from "../lib/fb-groups.js";

const GRAPH = "https://graph.facebook.com/v21.0";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function fbGet(path, params, token) {
  const p = new URLSearchParams({ ...params, access_token: token });
  const r = await fetch(`${GRAPH}${path}?${p}`, { signal: AbortSignal.timeout(25000) });
  const d = await r.json().catch(() => ({ error: { message: `Non-JSON (status ${r.status})` } }));
  if (!r.ok || d.error) throw new Error(d.error?.message || `HTTP ${r.status}`);
  return d;
}

async function fbPost(path, body, token) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined || v === null) continue;
    fd.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  fd.append("access_token", token);
  const r = await fetch(`${GRAPH}${path}`, { method: "POST", body: fd, signal: AbortSignal.timeout(25000) });
  const d = await r.json().catch(() => ({ error: { message: `Non-JSON (status ${r.status})` } }));
  if (!r.ok || d.error) throw new Error(d.error?.message || `HTTP ${r.status}`);
  return d;
}

// Ad set TEST và SCALE chỉ khác tên + ngân sách. Clone phần còn lại để hai hộp
// đo được với nhau — khác đối tượng/sự kiện thì so CPL là vô nghĩa.
const ADSET_CLONE_FIELDS = [
  "name", "optimization_goal", "billing_event", "bid_strategy", "daily_budget",
  "lifetime_budget", "promoted_object", "targeting", "attribution_spec",
  "destination_type", "pacing_type", "campaign_id", "start_time",
].join(",");

async function timHopScale(acct, product, token) {
  const ten = groupName(product, "SCALE");
  const d = await fbGet(`/act_${acct}/adsets`, {
    fields: "id,name,status,campaign_id,daily_budget",
    limit: "200",
  }, token);
  const found = (d.data || []).find(a => String(a.name || "").trim() === ten);
  return found || null;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const token = env.FB_ACCESS_TOKEN;
  if (!token) return json({ ok: false, error: "FB_ACCESS_TOKEN chưa cấu hình trên CRM" }, 500);

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: "body phải là JSON" }, 400); }

  const action = String(body.action || "");
  const id = await getIdentity(context);
  if (id.role === "open") {
    if (!env.OPTIMIZER_TOKEN || request.headers.get("X-Optimizer-Token") !== env.OPTIMIZER_TOKEN) {
      return json({ ok: false, error: "unauthorized — sai/thiếu X-Optimizer-Token" }, 401);
    }
  }

  try {
    if (action === "pause_ad") {
      const adId = String(body.ad_id || "");
      if (!adId) return json({ ok: false, error: "thiếu ad_id" }, 400);
      // Đọc tài khoản của ad TRƯỚC khi tắt để chặn tắt nhầm ad của người khác.
      const ad = await fbGet(`/${adId}`, { fields: "id,name,account_id" }, token);
      if (!canAccess(id, String(ad.account_id || ""))) {
        return json({ ok: false, error: "Không có quyền trên tài khoản của ad này" }, 403);
      }
      await fbPost(`/${adId}`, { status: "PAUSED" }, token);
      return json({ ok: true, action, ad_id: adId, ad_name: ad.name || null });
    }

    if (action === "promote") {
      const adId = String(body.ad_id || "");
      if (!adId) return json({ ok: false, error: "thiếu ad_id" }, 400);

      const ad = await fbGet(`/${adId}`, {
        fields: "id,name,account_id,adset{id,name,campaign_id},creative{effective_object_story_id,url_tags}",
      }, token);
      const acct = String(ad.account_id || "").replace(/^act_/, "");
      if (!canAccess(id, acct)) return json({ ok: false, error: "Không có quyền trên tài khoản của ad này" }, 403);

      const postId = (ad.creative || {}).effective_object_story_id;
      if (!postId) {
        return json({ ok: false, error: "Ad này không có post ID (bài viết) để dùng lại — có thể vẫn đang xử lý, thử lại sau" }, 409);
      }

      // Sản phẩm: lấy từ tên ad set nguồn ("<SP> - TEST"), cho phép ghi đè bằng body.
      const tuTen = parseGroupName((ad.adset || {}).name || "");
      const product = String(body.product || (tuTen && tuTen.product) || "").trim();
      if (!product) {
        return json({ ok: false, error: "Không suy được tên sản phẩm từ ad set nguồn — truyền thêm product" }, 400);
      }

      let scale = await timHopScale(acct, product, token);
      const daTao = { campaign: false, adset: false };

      if (!scale) {
        // Chưa có hộp SCALE → dựng mới bằng đúng cấu hình của ad set TEST.
        const src = await fbGet(`/${(ad.adset || {}).id}`, { fields: ADSET_CLONE_FIELDS }, token);
        const camp = await fbPost(`/act_${acct}/campaigns`, {
          name: groupName(product, "SCALE"),
          objective: "OUTCOME_SALES",
          status: "PAUSED",
          buying_type: "AUCTION",
          special_ad_categories: [],
        }, token);
        daTao.campaign = true;

        // Ngân sách SCALE: mặc định gấp đôi ad set TEST (TEST ~300–400k → SCALE
        // ~800k để đủ ~50 kết quả/tuần). Truyền daily_budget để tự quyết.
        const nsTest = Number(src.daily_budget) || 0;
        const ns = Math.max(Number(body.daily_budget) || 0, 0) || (nsTest ? nsTest * 2 : 0);
        const adsetBody = {
          name: groupName(product, "SCALE"),
          campaign_id: camp.id,
          status: "PAUSED",
          optimization_goal: src.optimization_goal,
          billing_event: src.billing_event,
          bid_strategy: src.bid_strategy || "LOWEST_COST_WITHOUT_CAP",
          targeting: src.targeting,
          promoted_object: src.promoted_object,
          destination_type: src.destination_type,
          attribution_spec: src.attribution_spec,
          pacing_type: src.pacing_type,
        };
        if (ns > 0) adsetBody.daily_budget = Math.round(ns);
        const as = await fbPost(`/act_${acct}/adsets`, adsetBody, token);
        daTao.adset = true;
        scale = { id: as.id, campaign_id: camp.id, name: adsetBody.name };
      }

      // Creative dựng từ BÀI VIẾT CŨ → giữ nguyên tương tác xã hội đã tích.
      const creativeBody = { name: ad.name || `SCALE ${adId}`, object_story_id: postId };
      const urlTags = (ad.creative || {}).url_tags;
      if (urlTags) creativeBody.url_tags = urlTags;
      const creative = await fbPost(`/act_${acct}/adcreatives`, creativeBody, token);

      const adMoi = await fbPost(`/act_${acct}/ads`, {
        name: ad.name || `SCALE ${adId}`,
        adset_id: scale.id,
        creative: { creative_id: creative.id },
        status: "PAUSED",
      }, token);

      return json({
        ok: true, action, product,
        source_ad_id: adId,
        post_id: postId,
        scale_adset_id: scale.id,
        scale_campaign_id: scale.campaign_id || null,
        new_ad_id: adMoi.id,
        created: daTao,
        ads_manager_url: `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${acct}&selected_ad_ids=${adMoi.id}`,
        note: "Ad mới tạo ở trạng thái TẠM DỪNG — vào Ads Manager bật khi đã xem lại."
          + (daTao.adset ? " Ad set SCALE vừa được tạo, nhớ bật cả ad set + campaign." : ""),
      });
    }

    return json({ ok: false, error: `action không hợp lệ: "${action}" (dùng pause_ad | promote)` }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e.message || e).slice(0, 300) }, 502);
  }
}
