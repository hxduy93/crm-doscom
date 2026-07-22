/**
 * Cloudflare Pages Function: POST /api/fb-upload-media
 * ------------------------------------------------------
 * Đưa 1 media (video hoặc ảnh) lên FB ad account, trả về id để gắn vào creative.
 *
 * 3 CHẾ ĐỘ — chọn theo field gửi lên:
 *   A. file      (multipart)  Byte đi qua Worker. Chỉ hợp video nhỏ: cả file phải
 *                             nằm trong 1 request nên thực tế ~<90MB và chậm.
 *   B. file_url  (json/form)  CHỈ gửi LINK, Facebook tự tải video về. KHÔNG giới
 *                             hạn dung lượng (Meta cho tới 4GB), không tốn băng
 *                             thông trình duyệt lẫn Worker → lối chính cho video
 *                             TikTok (link CDN tiktokcdn.com công khai).
 *   C. video_id  (json/form)  Không upload gì, chỉ ĐỢI TIẾP 1 video đã gửi lần
 *                             trước — dùng khi lần trước trả về can_retry_poll.
 *
 * Mỗi request tự dừng ở ~55s rồi trả { ok:false, can_retry_poll:true, video_id }
 * thay vì để Cloudflare cắt ngang. Client cứ gọi lại kèm video_id là đợi tiếp →
 * video nặng, FB encode lâu bao nhiêu cũng xong, không còn trần 30MB.
 *
 * Request (multipart/form-data HOẶC application/json):
 *   - file        File (video/* hoặc image/*)        — chế độ A
 *   - file_url    String (http/https công khai)      — chế độ B
 *   - video_id    String                             — chế độ C
 *   - account_id  String (act_xxx hoặc xxx)          — bắt buộc ở A và B
 *   - kind        "video" | "image" (optional ở A, infer từ MIME)
 *   - name        String (optional) tên video hiện trong thư viện FB
 *
 * Response:
 *   - Video xong:  { ok:true, kind:"video", video_id, thumbnail_url }
 *   - Ảnh xong:    { ok:true, kind:"image", image_hash }
 *   - Đang xử lý:  202 { ok:false, can_retry_poll:true, video_id, step, error }
 *   - Lỗi:         502 { ok:false, step, error, fallback_client_upload? }
 *     fallback_client_upload=true nghĩa là FB không tải được link → client nên
 *     tự tải file về rồi upload theo chế độ A.
 */

const FB_API_VERSION = "v20.0";
const GRAPH = `https://graph.facebook.com/${FB_API_VERSION}`;

// Ngân sách thời gian 1 request. Edge cắt quanh ~100s nên dừng sớm ở 55s để còn
// kịp trả JSON cho client (client gọi lại là đợi tiếp, không mất video_id).
// env.FB_MEDIA_BUDGET_MS chỉ để test rút ngắn cho nhanh.
const REQUEST_BUDGET_MS = 55000;
// Phần cuối ngân sách chừa cho bước lấy thumbnail (tối đa 12s).
const THUMBNAIL_BUDGET_MS = 12000;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fbGet(endpoint, params, token) {
  const qs = new URLSearchParams(params || {});
  qs.append("access_token", token);
  const r = await fetch(`${GRAPH}${endpoint}?${qs}`, { signal: AbortSignal.timeout(15000) });
  const data = await r.json().catch(() => ({ error: { message: `Non-JSON (status ${r.status})` } }));
  if (!r.ok || data.error) throw new Error(data.error?.message || `HTTP ${r.status}`);
  return data;
}

async function fbPost(endpoint, body, token) {
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
  const data = await r.json().catch(() => ({ error: { message: `Non-JSON (status ${r.status})` } }));
  if (!r.ok || data.error) {
    const err = new Error(data.error?.error_user_msg || data.error?.message || `HTTP ${r.status}`);
    err.fbCode = data.error?.code;
    throw err;
  }
  return data;
}

async function uploadVideo(accountId, file, token) {
  const fd = new FormData();
  fd.append("source", file, file.name);
  const data = await fbPost(`/act_${accountId}/advideos`, fd, token);
  return data.id;
}

// Chế độ B: đưa LINK cho Facebook, FB tự tải video từ CDN. Gọi này trả về gần như
// ngay (FB tải + encode nền) → không đụng giới hạn body/thời gian của Cloudflare.
// Điều kiện: link http/https công khai, không cần đăng nhập, không phải fbcdn.
async function uploadVideoByUrl(accountId, url, name, token) {
  const body = { file_url: url };
  if (name) body.title = name;
  try {
    const data = await fbPost(`/act_${accountId}/advideos`, body, token);
    return data.id;
  } catch (e) {
    // Chỉ khi FB chê tham số (code 100) mới thử lại trần link — lỗi khác (không
    // tải được URL, token hỏng…) thì ném luôn, đừng gọi 2 lần cho phí.
    if (!name || e.fbCode !== 100) throw e;
    const data = await fbPost(`/act_${accountId}/advideos`, { file_url: url }, token);
    return data.id;
  }
}

async function uploadImage(accountId, file, token) {
  const fd = new FormData();
  fd.append("filename", file, file.name);
  const data = await fbPost(`/act_${accountId}/adimages`, fd, token);
  const images = data.images || {};
  const first = images[Object.keys(images)[0]];
  if (!first || !first.hash) throw new Error("Image upload OK nhưng không có hash trả về");
  return first.hash;
}

// Poll FB đến khi video_status = "ready" HOẶC hết ngân sách thời gian.
// Hết giờ KHÔNG phải lỗi — trả { ready:false } để handler bảo client gọi lại.
async function waitForVideoReady(videoId, token, deadline, pollIntervalMs = 3000) {
  let lastStatus = "unknown";
  while (Date.now() < deadline) {
    try {
      const data = await fbGet(`/${videoId}`, { fields: "status" }, token);
      const status = data.status || {};
      const vs = status.video_status || status.processing_progress || "unknown";
      lastStatus = vs;
      if (vs === "ready") return { ready: true };
      if (vs === "error") {
        throw new Error(`FB báo video lỗi xử lý: ${JSON.stringify(status)}`);
      }
    } catch (e) {
      if (String(e.message).includes("FB báo video lỗi")) throw e;
    }
    if (Date.now() + pollIntervalMs >= deadline) break;
    await sleep(pollIntervalMs);
  }
  return { ready: false, status: lastStatus };
}

// Trả URL thumbnail, hoặc null nếu FB chưa sinh kịp trong ngân sách.
async function waitForVideoThumbnail(videoId, token, deadline, pollIntervalMs = 2000) {
  while (Date.now() < deadline) {
    try {
      const data = await fbGet(`/${videoId}/thumbnails`, { fields: "uri,is_preferred" }, token);
      const list = (data && data.data) || [];
      if (list.length > 0) {
        const preferred = list.find((t) => t.is_preferred) || list[0];
        if (preferred && preferred.uri) return preferred.uri;
      }
    } catch (e) { /* transient, ignore */ }
    if (Date.now() + pollIntervalMs >= deadline) break;
    await sleep(pollIntervalMs);
  }
  return null;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const budgetMs = Number(env.FB_MEDIA_BUDGET_MS) > 0 ? Number(env.FB_MEDIA_BUDGET_MS) : REQUEST_BUDGET_MS;
  const thumbBudgetMs = Math.min(THUMBNAIL_BUDGET_MS, Math.floor(budgetMs / 4));
  const deadline = Date.now() + budgetMs;
  const token = env.FB_ACCESS_TOKEN;
  if (!token) return json({ ok: false, step: "init", error: "FB_ACCESS_TOKEN chưa cấu hình" }, 500);

  let file = null, fileUrl = "", accountId = "", kind = "", videoId = "", name = "";
  try {
    const ct = request.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const b = await request.json();
      fileUrl = String(b.file_url || "").trim();
      videoId = String(b.video_id || "").trim();
      accountId = String(b.account_id || "").replace(/^act_/, "");
      kind = String(b.kind || "").toLowerCase();
      name = String(b.name || "").trim();
    } else {
      const form = await request.formData();
      const f = form.get("file");
      if (f && f instanceof File && f.size > 0) file = f;
      fileUrl = String(form.get("file_url") || "").trim();
      videoId = String(form.get("video_id") || "").trim();
      accountId = String(form.get("account_id") || "").replace(/^act_/, "");
      kind = String(form.get("kind") || "").toLowerCase();
      name = String(form.get("name") || "").trim();
    }

    // Chế độ C (chỉ đợi tiếp) không cần account_id lẫn media.
    if (!videoId) {
      if (!file && !fileUrl) {
        return json({ ok: false, step: "parse", error: "Thiếu file, file_url hoặc video_id" }, 400);
      }
      if (!accountId) {
        return json({ ok: false, step: "parse", error: "Thiếu account_id" }, 400);
      }
      if (!kind) {
        kind = file
          ? ((file.type || "").startsWith("video") ? "video"
            : (file.type || "").startsWith("image") ? "image" : "")
          : "video"; // gửi link thì mặc định là video
      }
      if (!["video", "image"].includes(kind)) {
        return json({ ok: false, step: "parse", error: `Kind không hợp lệ: '${kind}'. MIME: ${file?.type || "-"}` }, 400);
      }
      if (fileUrl) {
        if (kind !== "video") {
          return json({ ok: false, step: "parse", error: "file_url chỉ dùng cho video" }, 400);
        }
        if (!/^https?:\/\//i.test(fileUrl)) {
          return json({ ok: false, step: "parse", error: "file_url phải là link http/https công khai" }, 400);
        }
      }
    } else {
      kind = "video";
    }
  } catch (e) {
    return json({ ok: false, step: "parse", error: String(e.message || e) }, 400);
  }

  let step = "upload";
  try {
    if (kind === "image") {
      const image_hash = await uploadImage(accountId, file, token);
      return json({ ok: true, kind: "image", image_hash });
    }

    // ── Video ──
    if (!videoId) {
      videoId = fileUrl
        ? await uploadVideoByUrl(accountId, fileUrl, name, token)
        : await uploadVideo(accountId, file, token);
    }

    step = "wait_ready";
    const ready = await waitForVideoReady(videoId, token, deadline - thumbBudgetMs);
    if (!ready.ready) {
      return json({
        ok: false,
        step,
        video_id: videoId,
        can_retry_poll: true,
        error: `Video vẫn đang được Facebook xử lý (status: ${ready.status}). Gọi lại kèm video_id để đợi tiếp.`,
      }, 202);
    }

    step = "wait_thumbnail";
    const thumbnail_url = await waitForVideoThumbnail(
      videoId, token, Math.min(deadline, Date.now() + thumbBudgetMs)
    );
    if (!thumbnail_url) {
      return json({
        ok: false,
        step,
        video_id: videoId,
        can_retry_poll: true,
        error: "Facebook chưa sinh xong thumbnail. Gọi lại kèm video_id để đợi tiếp.",
      }, 202);
    }

    return json({ ok: true, kind: "video", video_id: videoId, thumbnail_url });
  } catch (e) {
    // FB không tải được link (code 389 và họ hàng) → báo client tự tải file rồi
    // upload lối thường, đừng bỏ cuộc.
    const msg = String(e.message || e);
    const pullFailed = step === "upload" && !!fileUrl;
    return json({
      ok: false,
      step,
      video_id: videoId || null,
      error: msg,
      ...(pullFailed ? { fallback_client_upload: true } : {}),
    }, 502);
  }
}
