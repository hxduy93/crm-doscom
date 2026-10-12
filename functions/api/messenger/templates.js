// GET  /api/messenger/templates?page_id=…  — mẫu Utility của Page (để gửi khách quá 7 ngày)
// POST /api/messenger/templates            — tạo mẫu mới { page_id, name, body, language }
// Mẫu Utility = tin cập nhật đơn/tài khoản, Meta duyệt ngay khi tạo, CẤM nội dung quảng cáo
// (bị từ chối với lý do TAG_SHOULD_BE_MARKETING). Cần scope pages_utility_messaging.
import { getIdentity } from "../../lib/access.js";
import { thamSoMau, tenMauHopLe } from "../../lib/nhan-tin-lai.js";
import { json, graph, pageToken, giaiThichLoi } from "./_graph.js";

function bodyOf(t) {
  if (t.body) return t.body;
  const c = (t.components || []).find((x) => String(x.type).toUpperCase() === "BODY");
  return (c && c.text) || "";
}

export async function onRequestGet(context) {
  const id = await getIdentity(context);
  if (!id.all) return json({ ok: false, error: "Chỉ quản trị viên được dùng menu này" }, 403);
  const pageId = (new URL(context.request.url).searchParams.get("page_id") || "").replace(/\D/g, "");
  if (!pageId) return json({ ok: false, error: "Thiếu page_id" }, 400);
  try {
    const token = await pageToken(context.env, pageId);
    const d = await graph(`/${pageId}/message_templates`, { token, params: { limit: "100" } });
    const templates = (d.data || []).map((t) => {
      const body = bodyOf(t);
      return {
        id: t.id, name: t.name, language: t.language || "vi", category: t.category || "",
        status: t.status || "", body, params: thamSoMau(body),
      };
    });
    return json({ ok: true, templates });
  } catch (e) {
    return json({ ok: false, error: giaiThichLoi(e) }, 502);
  }
}

export async function onRequestPost(context) {
  const id = await getIdentity(context);
  if (!id.all) return json({ ok: false, error: "Chỉ quản trị viên được dùng menu này" }, 403);
  let b;
  try { b = await context.request.json(); } catch { return json({ ok: false, error: "Body không phải JSON" }, 400); }
  const pageId = String(b.page_id || "").replace(/\D/g, "");
  const name = String(b.name || "").trim();
  const body = String(b.body || "").trim();
  if (!pageId || !body) return json({ ok: false, error: "Thiếu page_id hoặc nội dung mẫu" }, 400);
  if (!tenMauHopLe(name)) return json({ ok: false, error: "Tên mẫu chỉ gồm chữ thường không dấu, số, gạch dưới" }, 400);
  const params = thamSoMau(body);
  const khac = params.filter((p) => p !== "customer_name");
  if (khac.length) {
    return json({ ok: false, error: `Chỉ hỗ trợ tham số {{customer_name}} — gửi hàng loạt không tự điền được: ${khac.join(", ")}` }, 400);
  }
  const comp = { type: "BODY", text: body };
  if (params.length) comp.example = { body_text_named_params: [{ param_name: "customer_name", example: "Minh" }] };
  try {
    const token = await pageToken(context.env, pageId);
    const r = await graph(`/${pageId}/message_templates`, {
      token, method: "POST",
      body: { name, language: b.language || "vi", category: "UTILITY", parameter_format: "NAMED", components: [comp] },
    });
    return json({ ok: true, id: r.id, status: r.status, category: r.category });
  } catch (e) {
    return json({ ok: false, error: giaiThichLoi(e) }, 502);
  }
}
