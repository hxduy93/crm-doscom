/**
 * GET /api/fb-groups?account_id=<id>&days=14&target_cpl=110000
 * ------------------------------------------------------------
 * Trạng thái hai nhóm chạy TEST / SCALE của từng sản phẩm trong 1 tài khoản QC:
 * ad set nào đang sống, trong đó có ad nào, mỗi ad tiêu bao nhiêu / ra mấy kết quả
 * / CPL bao nhiêu, và chấm sẵn "bê sang SCALE · tắt · theo dõi · chưa đủ dữ liệu".
 *
 * Dùng cho 2 việc:
 *   1. Luồng tạo Ads tự động: liệt kê MỌI ad set của hộp để người chạy chọn đích.
 *   2. Bảng "TEST vs SCALE" trong ads-creator.html.
 *
 * CPL mục tiêu: lấy ?target_cpl= nếu có, không thì tính từ chính nhóm SCALE của
 * sản phẩm đó (chi tiêu / kết quả). Không có cả hai thì KHÔNG chấm điểm — thà báo
 * "chưa có chuẩn để so" còn hơn phán bừa.
 *
 * 23/09/2026 — SỬA LỖI GỘP AD SET. Trước đây mỗi nhóm chỉ trả về MỘT ad set (ad set của
 * ad đầu tiên Meta trả về) nhưng lại gom ad của MỌI ad set vào chung danh sách đó.
 * Campaign "NOMA 230 · … - TEST" có 3 ad set. Hai hệ quả, nặng nhẹ khác nhau:
 *   · Đích đổ creative phụ thuộc thứ tự Meta trả ad — thứ tự đó không có cam kết nào.
 *     Đo 23/09/2026 thì Meta trả ad mới nhất trước nên vô tình trúng ad set đúng.
 *   · Danh sách ad gộp làm cơ chế "giữ trần 4 creative" (đã bỏ) đếm trên cả campaign rồi
 *     tắt ad cũ nhất bất kể ad set — cái này sai thật và đã sẵn sàng quét sạch ad set
 *     không liên quan ở hộp NOMA 350 (13 creative bật trên 3 ad set).
 * Nay trả về ĐỦ danh sách ad set, kèm gợi ý mặc định neo theo sổ D1 `ad_boxes`.
 *
 * Response: { ok, account_id, days, products:[{ product, target_cpl, test, scale }] }
 *   test/scale = {
 *     adsets: [{ campaign_id, campaign_name, adset_id, adset_name, adset_status,
 *                daily_budget, optimization_goal, ads:[...], so_ad_dang_chay, la_so }],
 *     ads: [...],               // gộp ad của MỌI ad set — dùng cho việc tick bê sang SCALE
 *     mac_dinh_adset_id,        // ad set chọn sẵn trong dropdown (chỉ là gợi ý)
 *     adset_id_theo_so,         // ad set mà sổ D1 đang trỏ tới, null nếu chưa ghi sổ
 *   } | null
 */
import { getIdentity, canAccess } from "../lib/access.js";
import { parseGroupName, demKetQua, soNgayChay, chamDiem } from "../lib/fb-groups.js";
import { docSo, khoaHop, chonMacDinh } from "../lib/ad-boxes.js";

const GRAPH = "https://graph.facebook.com/v21.0";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function fbGetAll(path, params, token, maxPages = 10) {
  const p = new URLSearchParams({ ...params, access_token: token, limit: params.limit || "200" });
  let next = `${GRAPH}${path}?${p}`;
  const out = [];
  let guard = 0;
  while (next && guard++ < maxPages) {
    const r = await fetch(next, { signal: AbortSignal.timeout(25000) });
    const d = await r.json().catch(() => ({ error: { message: `Non-JSON (status ${r.status})` } }));
    if (!r.ok || d.error) throw new Error(d.error?.message || `HTTP ${r.status}`);
    out.push(...(d.data || []));
    next = d.paging?.next || null;
  }
  return out;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const token = env.FB_ACCESS_TOKEN;
  if (!token) return json({ ok: false, error: "FB_ACCESS_TOKEN chưa cấu hình trên CRM" }, 500);

  const q = new URL(request.url).searchParams;
  const acct = String(q.get("account_id") || q.get("account") || "").replace(/^act_/, "");
  if (!acct) return json({ ok: false, error: "Thiếu ?account_id=" }, 400);
  const days = Math.min(Math.max(parseInt(q.get("days") || "14", 10) || 14, 1), 90);
  const targetCplParam = Number(q.get("target_cpl")) || 0;

  const id = await getIdentity(context);
  if (!canAccess(id, acct)) return json({ ok: false, error: "Không có quyền trên tài khoản này" }, 403);

  try {
    // Một lượt: mọi ad ACTIVE/PAUSED kèm ad set + campaign + số liệu. Tài khoản
    // của mình cỡ vài chục ad nên không cần lọc phía Meta.
    const ads = await fbGetAll("/act_" + acct + "/ads", {
      fields: [
        "name,status,effective_status,created_time",
        "adset{id,name,status,daily_budget,optimization_goal}",
        "campaign{id,name,status}",
        // video_id để đối chiếu ĐÚNG video nào đang thắng; object_story_spec là
        // đường lùi khi creative không trả thẳng video_id.
        "creative{effective_object_story_id,video_id,object_story_spec}",
        `insights.date_preset(last_${days}d){spend,actions,impressions}`,
      ].join(","),
      effective_status: '["ACTIVE","PAUSED","CAMPAIGN_PAUSED","ADSET_PAUSED","PENDING_REVIEW","DISAPPROVED","WITH_ISSUES","IN_PROCESS"]',
    }, token);

    const now = Date.now();
    // product -> { test: Map<adset_id, hop>, scale: Map<adset_id, hop> }
    // Khoá theo adset_id: một campaign có thể chứa nhiều ad set, mỗi cái là một đích đổ
    // creative RIÊNG. Gộp chúng lại chính là gốc của lỗi chọn nhầm ad set.
    const sanPham = new Map();
    const so = await docSo(env.DB, acct);

    for (const ad of ads) {
      const camp = ad.campaign || {};
      const g = parseGroupName(camp.name) || parseGroupName((ad.adset || {}).name);
      if (!g) continue;   // campaign đặt tên kiểu cũ → không thuộc hộp nào, bỏ qua

      const ins = ((ad.insights || {}).data || [])[0] || {};
      const spend = Number(ins.spend) || 0;
      const results = demKetQua(ins.actions);
      const cre = ad.creative || {};
      const videoId = cre.video_id
        || (((cre.object_story_spec || {}).video_data || {}).video_id)
        || null;
      const item = {
        ad_id: ad.id,
        ad_name: ad.name,
        status: ad.status,
        effective_status: ad.effective_status,
        dang_chay: ad.status === "ACTIVE",
        created_time: ad.created_time,
        days: soNgayChay(ad.created_time, now),
        spend,
        results,
        cpl: results > 0 ? Math.round(spend / results) : null,
        impressions: Number(ins.impressions) || 0,
        post_id: cre.effective_object_story_id || null,
        video_id: videoId,          // ID video trên Facebook
        tiktok_id: null,            // ID video gốc trên TikTok — điền ở bước dưới
      };

      if (!sanPham.has(g.product)) sanPham.set(g.product, { test: new Map(), scale: new Map() });
      const nhom = sanPham.get(g.product);
      const key = g.group.toLowerCase();
      const as = ad.adset || {};
      const asId = String(as.id || "");
      if (!asId) continue;   // ad không gắn ad set thì không thuộc đích nào
      if (!nhom[key].has(asId)) {
        nhom[key].set(asId, {
          campaign_id: camp.id || null,
          campaign_name: camp.name || null,
          campaign_status: camp.status || null,
          adset_id: asId,
          adset_name: as.name || null,
          adset_status: as.status || null,
          daily_budget: Number(as.daily_budget) || null,
          optimization_goal: as.optimization_goal || null,
          ads: [],
        });
      }
      nhom[key].get(asId).ads.push(item);
    }

    // Gắn ID video GỐC TRÊN TIKTOK: sổ uploaded_videos lưu filename = "<id tiktok>.mp4"
    // kèm ad_id/video_id. Nhờ vậy nhìn bảng là biết ad này chạy đúng video nào bên
    // TikTok Shop, khỏi phải mò ngược. Sổ hỏng thì bỏ qua, không làm sập cả bảng.
    if (env.DB) {
      try {
        const rows = await env.DB.prepare(
          "SELECT filename, video_id, ad_id FROM uploaded_videos WHERE account_id = ?"
        ).bind(acct).all();
        const theoAd = new Map(), theoVideo = new Map();
        for (const r of rows.results || []) {
          const tt = String(r.filename || "").replace(/\.[^.]+$/, "");
          if (!tt) continue;
          if (r.ad_id) theoAd.set(String(r.ad_id), tt);
          if (r.video_id) theoVideo.set(String(r.video_id), tt);
        }
        for (const nhom of sanPham.values()) {
          for (const hop of [...nhom.test.values(), ...nhom.scale.values()]) {
            for (const a of hop.ads) {
              a.tiktok_id = theoAd.get(String(a.ad_id))
                || (a.video_id ? theoVideo.get(String(a.video_id)) : null)
                || null;
            }
          }
        }
      } catch (e) { /* sổ lỗi → cột UID để trống, phần còn lại vẫn dùng được */ }
    }

    // Gói một nhóm (TEST hoặc SCALE) thành { adsets, ads, mac_dinh_adset_id, ... }.
    // `ads` là danh sách GỘP của mọi ad set — chỗ tick "bê sang SCALE" làm việc ở cấp ad
    // nên không cần biết ad nằm ở ad set nào; còn chỗ chọn đích thì đọc `adsets`.
    const goiNhom = (m, product, group) => {
      const ds = [...m.values()];
      if (!ds.length) return null;
      for (const hop of ds) {
        hop.ads.sort((a, b) => Date.parse(b.created_time || 0) - Date.parse(a.created_time || 0));
        hop.so_ad_dang_chay = hop.ads.filter(a => a.dang_chay).length;
      }
      const ghi = so.get(khoaHop(product, group)) || null;
      const idTheoSo = ghi && ghi.adset_id ? String(ghi.adset_id) : null;
      for (const hop of ds) hop.la_so = idTheoSo != null && hop.adset_id === idTheoSo;
      // Ad set đang chạy lên trước, trong mỗi nhóm thì cái có ad mới nhất lên trước.
      ds.sort((a, b) => {
        const ra = a.adset_status === "ACTIVE" ? 0 : 1;
        const rb = b.adset_status === "ACTIVE" ? 0 : 1;
        if (ra !== rb) return ra - rb;
        return Date.parse(b.ads[0] && b.ads[0].created_time || 0) - Date.parse(a.ads[0] && a.ads[0].created_time || 0);
      });
      const md = chonMacDinh(ds, idTheoSo);
      return {
        adsets: ds,
        ads: ds.flatMap(h => h.ads),
        so_adset: ds.length,
        mac_dinh_adset_id: md ? md.adset_id : null,
        adset_id_theo_so: idTheoSo,
        // Sổ trỏ tới một ad set KHÔNG còn trong tài khoản (đã xoá / đổi campaign) —
        // nói ra để người chạy biết vì sao gợi ý mặc định khác với lần trước.
        so_lac: idTheoSo != null && !ds.some(h => h.adset_id === idTheoSo),
      };
    };

    const products = [];
    for (const [product, nhom] of sanPham) {
      const test = goiNhom(nhom.test, product, "TEST");
      const scale = goiNhom(nhom.scale, product, "SCALE");
      // CPL chuẩn = CPL thật của nhóm SCALE (gộp mọi ad set). Không có thì dùng tham số.
      let target = targetCplParam;
      if (!target && scale) {
        const chi = scale.ads.reduce((t, a) => t + a.spend, 0);
        const kq = scale.ads.reduce((t, a) => t + a.results, 0);
        if (kq > 0) target = Math.round(chi / kq);
      }
      if (test) {
        for (const a of test.ads) {
          const d = chamDiem(a, { target_cpl: target });
          a.verdict = a.dang_chay ? d.verdict : "off";
          a.ly_do = a.dang_chay ? d.ly_do : "ad đang tắt";
        }
      }
      products.push({ product, target_cpl: target || null, test, scale });
    }
    products.sort((a, b) => a.product.localeCompare(b.product, "vi"));

    return json({ ok: true, account_id: acct, days, products });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e).slice(0, 300) }, 502);
  }
}
