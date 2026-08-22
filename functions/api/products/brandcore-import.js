/* POST /api/products/brandcore-import — nhập file "Hồ sơ sản phẩm" cho phần Sửa brandcore.
   GET  /api/products/brandcore-import — xem đang dùng hồ sơ nào (không đụng gì).

   Vì sao có: trước đây thông số 17 SKU nằm cứng trong `noma-sku-specs.js`, đổi tài liệu
   là phải sửa code + deploy. Nay tải file lên là các agent (viết bài mới, soát brandcore,
   đồng bộ bản Mỹ) dùng ngay bản mới.

   Bảo vệ (red line: endpoint GHI phải có token): Access role != "open" → cho qua;
   "open" → cần X-Products-Token. Giống hệt brandcore-apply.js.

   Body: multipart/form-data
     file    — file hồ sơ (.xlsx .csv .json .docx .txt … xem _dossier.js)
     dryrun  — "1" để chỉ xem trước, KHÔNG ghi đè bản đang dùng.

   Trả: { ok, data: { so_san_pham, ma_san_pham[], cot_bo_qua[], thay_doi, ten_file,
                      cap_nhat, dryrun } }

   ⚠ Ghi ĐÈ toàn bộ hồ sơ chứ không trộn từng phần: file hồ sơ là bản đầy đủ do phòng
     sản phẩm phát hành, trộn nửa cũ nửa mới sẽ tạo ra một phiên bản không tồn tại
     ngoài đời và không ai đối chiếu lại được. Bản cũ được giữ ở key `...:prev` để
     hoàn tác.
*/
import { readAnyFile, rowsToSpecs } from "./_dossier.js";
import { SKU_KV_KEY, loadSkuSpecs } from "../geo/_utils/noma-sku-specs.js";
import { getIdentity } from "../../lib/access.js";

const PREV_KEY = SKU_KV_KEY + ":prev";

function json(o, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/* Access bật thì đã có người đăng nhập; Access tắt (role "open") thì bắt buộc token.
   Dùng ĐÚNG helper getIdentity như brandcore-apply.js — đừng tự đọc biến môi trường,
   hai chỗ lệch luật là một cửa mở mà không ai nhớ đã mở. */
async function chanTruyCap(context) {
  const identity = await getIdentity(context);
  if (identity.role !== "open") return null;
  const { request, env } = context;
  if (!env.PRODUCTS_TOKEN || request.headers.get("X-Products-Token") !== env.PRODUCTS_TOKEN) {
    return json({ ok: false, error: "unauthorized — thiếu/sai X-Products-Token" }, 401);
  }
  return null;
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Products-Token",
    },
  });
}

export async function onRequestGet({ env }) {
  const cur = await loadSkuSpecs(env);
  return json({
    ok: true,
    data: {
      nguon: cur.nguon,                      // "kv" = hồ sơ đã tải lên · "mac_dinh" = bản dự phòng trong code
      so_san_pham: cur.so_san_pham,
      ma_san_pham: Object.keys(cur.specs).sort(),
      ten_file: cur.ten_file,
      cap_nhat: cur.cap_nhat,
      co_ban_hoan_tac: Boolean(env.INVENTORY && (await env.INVENTORY.get(PREV_KEY))),
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const chan = await chanTruyCap(context);
  if (chan) return chan;
  if (!env.INVENTORY) return json({ ok: false, error: "thiếu binding KV INVENTORY" }, 500);

  let form;
  try { form = await request.formData(); }
  catch { return json({ ok: false, error: "cần gửi dạng multipart/form-data có trường 'file'" }, 400); }

  // Hoàn tác: đưa lại bản trước đó.
  if (String(form.get("undo") || "") === "1") {
    const prev = await env.INVENTORY.get(PREV_KEY);
    if (!prev) return json({ ok: false, error: "không có bản trước để hoàn tác" }, 404);
    await env.INVENTORY.put(SKU_KV_KEY, prev);
    await env.INVENTORY.delete(PREV_KEY);
    const d = JSON.parse(prev);
    return json({ ok: true, data: { hoan_tac: true, so_san_pham: Object.keys(d.specs || {}).length, ten_file: d.ten_file } });
  }

  const file = form.get("file");
  if (!file || typeof file.arrayBuffer !== "function") {
    return json({ ok: false, error: "chưa chọn file" }, 400);
  }
  const tenFile = String(file.name || "khong-ten");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length) return json({ ok: false, error: "file rỗng" }, 400);
  // KV giới hạn 25MB/giá trị; hồ sơ dạng chữ chỉ vài trăm KB nên chặn sớm ở 10MB.
  if (bytes.length > 10 * 1024 * 1024) return json({ ok: false, error: "file quá lớn (>10MB)" }, 413);

  let doc;
  try { doc = await readAnyFile(tenFile, bytes); }
  catch (e) { return json({ ok: false, error: `không đọc được file: ${String(e.message || e)}` }, 400); }

  // Chỉ dạng BẢNG mới tách được thành hồ sơ từng sản phẩm. File chữ (docx/txt) đọc
  // được nội dung nhưng không có cột → nói thẳng thay vì lưu một mớ không dùng được.
  let rows = null;
  if (doc.kind === "rows") rows = doc.rows;
  else if (doc.kind === "json") {
    const arr = Array.isArray(doc.json) ? doc.json : doc.json.products;
    if (!Array.isArray(arr) || !arr.length) return json({ ok: false, error: "JSON phải là mảng sản phẩm" }, 400);
    const cols = [...new Set(arr.flatMap((o) => Object.keys(o)))];
    rows = [cols, ...arr.map((o) => cols.map((c) => (o[c] == null ? "" : String(o[c]))))];
  } else {
    return json({
      ok: false,
      error: "file này không có dạng bảng nên không tách được từng sản phẩm — " +
             "dùng .xlsx / .csv / .json theo mẫu 'Hồ sơ sản phẩm' (có cột 'Tên sản phẩm')",
    }, 400);
  }

  let parsed;
  try { parsed = rowsToSpecs(rows); }
  catch (e) { return json({ ok: false, error: String(e.message || e) }, 400); }
  if (!parsed.so_san_pham) return json({ ok: false, error: "không đọc được sản phẩm nào trong file" }, 400);

  // So với bản đang dùng để người bấm biết mình sắp đổi những gì.
  const cur = await loadSkuSpecs(env);
  const cu = new Set(Object.keys(cur.specs));
  const moi = new Set(Object.keys(parsed.specs));
  const thay_doi = {
    them: [...moi].filter((k) => !cu.has(k)).sort(),
    mat: [...cu].filter((k) => !moi.has(k)).sort(),
    giu: [...moi].filter((k) => cu.has(k)).sort(),
  };

  const payload = {
    specs: parsed.specs,
    ten_file: tenFile,
    cap_nhat: new Date().toISOString(),
    so_cot: (rows[0] || []).length,
  };

  const dryrun = String(form.get("dryrun") || "") === "1";
  if (!dryrun) {
    // Giữ bản cũ để hoàn tác — CHỈ khi bản cũ đến từ KV. Bản dự phòng trong code
    // không cần sao lưu (nó luôn có sẵn), lưu vào đây chỉ làm rối nút Hoàn tác.
    if (cur.nguon === "kv") {
      const old = await env.INVENTORY.get(SKU_KV_KEY);
      if (old) await env.INVENTORY.put(PREV_KEY, old);
    }
    await env.INVENTORY.put(SKU_KV_KEY, JSON.stringify(payload));
  }

  return json({
    ok: true,
    data: {
      dryrun,
      ten_file: tenFile,
      cap_nhat: payload.cap_nhat,
      so_san_pham: parsed.so_san_pham,
      so_cot: payload.so_cot,
      ma_san_pham: Object.keys(parsed.specs).sort(),
      cot_bo_qua: parsed.cot_bo_qua,          // cột trong file mà hệ thống chưa biết dùng
      thay_doi,
      nguon_truoc: cur.nguon,
    },
  });
}
