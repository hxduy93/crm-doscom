// GET /api/products/categories?site=doscom|noma
// Trả danh mục product của WooCommerce (cho dropdown menu "Đăng sản phẩm").
import { siteCreds, isConfigured, fetchCategories } from "./_wc.js";

function json(o, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function onRequestGet({ request, env }) {
  const site = String(new URL(request.url).searchParams.get("site") || "").toLowerCase();
  if (site !== "doscom" && site !== "noma") {
    return json({ ok: false, error: "Tham số site phải là doscom hoặc noma" }, 400);
  }
  const c = siteCreds(site, env);
  if (!isConfigured(c)) {
    return json({ ok: false, error: `Chưa cấu hình secret WC_${site.toUpperCase()}_* trên CRM` }, 500);
  }
  try {
    const cats = await fetchCategories(c);
    return json({
      ok: true,
      site,
      categories: cats.map((x) => ({ id: x.id, name: x.name, parent: x.parent, count: x.count })),
    });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 502);
  }
}
