// Endpoint: POST /api/geo/publish-wp
//
// Đăng article từ geo_content_queue lên WordPress (doscom.vn hoặc noma.vn).
//
// Flow:
//   1. Validate article ở status pending_review/edited.
//   2. Nếu có image_base64 → upload lên WP media → lấy featured_media ID.
//   3. Resolve category names → category IDs (auto tạo nếu chưa có).
//   4. POST /wp-json/wp/v2/posts với title/content/excerpt/slug/status/categories/tags/featured_media/meta.
//   5. Cập nhật geo_content_queue: status='published', wp_post_id, wp_post_url, xóa image_base64.
//   6. Fire-and-forget: submit URL lên Google Indexing API + IndexNow (Bing/Yandex)
//      qua ctx.waitUntil — không block response, không break publish nếu fail.
//
// Body: {
//   article_id: "uuid",
//   target_site: "doscom" | "noma",   // default lấy từ article.brand
//   wp_status: "publish" | "draft" | "pending",   // default "draft" để anh review trên WP trước khi go-live
//   override?: { title, content_html, meta_description, slug, ... }  // optional last-min override
// }
//
// ENV cần set:
//   WP_DOSCOM_URL       — vd "https://doscom.vn"
//   WP_DOSCOM_USER      — username trên doscom.vn (vd "geo-agent")
//   WP_DOSCOM_APP_PWD   — Application Password
//   WP_NOMA_URL         — vd "https://noma.vn"
//   WP_NOMA_USER
//   WP_NOMA_APP_PWD

import { submitUrlToGoogle } from "./_utils/google-indexing.js";
import { submitUrlToIndexNow } from "./_utils/indexnow.js";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

// Fire-and-forget submit URL tới Google + IndexNow. Log kết quả vào geo_index_log.
async function notifySearchEngines(env, articleId, url) {
  if (!url || !env.DB) return;
  const now = Math.floor(Date.now() / 1000);

  const [google, indexnow] = await Promise.all([
    submitUrlToGoogle(env, url, "URL_UPDATED"),
    submitUrlToIndexNow(env, url),
  ]);

  try {
    await env.DB.prepare(`
      INSERT INTO geo_index_log (article_id, url, google_ok, google_msg, indexnow_ok, indexnow_msg, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      articleId, url,
      google.ok ? 1 : 0,
      (google.ok ? "ok" : (google.error || "")).slice(0, 500),
      indexnow.ok ? 1 : 0,
      (indexnow.ok ? `${indexnow.status} ok` : (indexnow.error || "")).slice(0, 500),
      now
    ).run();
  } catch (err) {
    console.error("[notifySearchEngines] log insert failed:", err?.message);
  }
}

function getSiteConfig(site, env) {
  if (site === "doscom") {
    return {
      url:  env.WP_DOSCOM_URL,
      user: env.WP_DOSCOM_USER,
      pwd:  env.WP_DOSCOM_APP_PWD,
    };
  }
  if (site === "noma") {
    return {
      url:  env.WP_NOMA_URL,
      user: env.WP_NOMA_USER,
      pwd:  env.WP_NOMA_APP_PWD,
    };
  }
  return null;
}

function authHeader(user, pwd) {
  // WordPress Application Password = Basic Auth
  return "Basic " + btoa(`${user}:${pwd}`);
}

function base64ToBlob(b64, mime = "image/png") {
  const byteChars = atob(b64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNumbers)], { type: mime });
}

async function uploadMedia(siteConfig, { base64, filename, alt, caption, title }) {
  // WP REST API hỗ trợ raw body upload (Approach B) — đơn giản hơn multipart,
  // hoạt động ngon trên Cloudflare Workers fetch.
  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);

  const res = await fetch(`${siteConfig.url}/wp-json/wp/v2/media`, {
    method: "POST",
    headers: {
      "Authorization": authHeader(siteConfig.user, siteConfig.pwd),
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
    body: bytes,
  });

  if (!res.ok) {
    const txt = (await res.text()).slice(0, 500);
    throw new Error(`WP media upload failed ${res.status}: ${txt}`);
  }

  const created = await res.json();

  // Set alt_text + caption + title bằng PATCH riêng (raw upload không support form fields).
  // Caption hiển thị dưới ảnh trong media library + có thể được theme dùng để render <figcaption>.
  if (alt || caption || title) {
    const patchBody = {};
    if (alt)     patchBody.alt_text = alt;
    if (caption) patchBody.caption  = caption;
    if (title)   patchBody.title    = title;
    await fetch(`${siteConfig.url}/wp-json/wp/v2/media/${created.id}`, {
      method: "POST",  // WP REST cho update cũng dùng POST
      headers: {
        "Authorization": authHeader(siteConfig.user, siteConfig.pwd),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(patchBody),
    }).catch(() => {});  // best-effort, không break pipeline nếu fail
  }

  return {
    id: created.id,
    source_url: created.source_url,
    media_details: created.media_details,
  };
}

async function resolveCategories(siteConfig, categoryNames) {
  if (!categoryNames || !categoryNames.length) return [];
  const ids = [];

  for (const name of categoryNames) {
    // 1. Tìm category đã tồn tại
    const searchRes = await fetch(
      `${siteConfig.url}/wp-json/wp/v2/categories?search=${encodeURIComponent(name)}&per_page=10`,
      { headers: { "Authorization": authHeader(siteConfig.user, siteConfig.pwd) } }
    );

    if (searchRes.ok) {
      const found = await searchRes.json();
      const exact = found.find(c => c.name.toLowerCase() === name.toLowerCase());
      if (exact) {
        ids.push(exact.id);
        continue;
      }
    }

    // 2. Tạo category mới nếu chưa có
    const createRes = await fetch(`${siteConfig.url}/wp-json/wp/v2/categories`, {
      method: "POST",
      headers: {
        "Authorization": authHeader(siteConfig.user, siteConfig.pwd),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, slug: slugify(name) }),
    });

    if (createRes.ok) {
      const created = await createRes.json();
      ids.push(created.id);
    }
    // Nếu lỗi tạo (vd quyền) → skip silent, không break pipeline
  }
  return ids;
}

async function resolveTags(siteConfig, tagNames) {
  if (!tagNames || !tagNames.length) return [];
  const ids = [];

  for (const name of tagNames) {
    const searchRes = await fetch(
      `${siteConfig.url}/wp-json/wp/v2/tags?search=${encodeURIComponent(name)}&per_page=10`,
      { headers: { "Authorization": authHeader(siteConfig.user, siteConfig.pwd) } }
    );
    if (searchRes.ok) {
      const found = await searchRes.json();
      const exact = found.find(t => t.name.toLowerCase() === name.toLowerCase());
      if (exact) {
        ids.push(exact.id);
        continue;
      }
    }

    const createRes = await fetch(`${siteConfig.url}/wp-json/wp/v2/tags`, {
      method: "POST",
      headers: {
        "Authorization": authHeader(siteConfig.user, siteConfig.pwd),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, slug: slugify(name) }),
    });
    if (createRes.ok) {
      const created = await createRes.json();
      ids.push(created.id);
    }
  }
  return ids;
}

function slugify(s) {
  return String(s).toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")  // remove diacritics
    .replace(/đ/g, "d").replace(/Đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// Chèn <figure> ảnh inline sau H2 khớp với after_heading (text gần đúng).
// Nếu không tìm thấy heading match, fallback append ở cuối phần đầu (sau </p> intro).
// Figure dùng class aligncenter + inline style để chắc chắn căn giữa bất kể theme WP.
// Có <figcaption> hiển thị mô tả ảnh (lấy từ caption hoặc alt — chính là H2 heading của section).
function injectInlineImage(html, { after_heading, position, url, alt, caption }) {
  if (!url) return html;
  const captionText = caption || alt || "";
  const altText = alt || captionText || "";
  const captionHtml = captionText
    ? `<figcaption class="wp-element-caption" style="text-align:center;font-style:italic;color:#555;font-size:0.9em;margin-top:0.5em;">${escapeAttr(captionText)}</figcaption>`
    : "";
  const figure = `\n\n<figure class="wp-block-image aligncenter size-large geo-inline-image" style="text-align:center;margin-left:auto;margin-right:auto;display:block;"><img src="${escapeAttr(url)}" alt="${escapeAttr(altText)}" loading="lazy" style="display:block;margin:0 auto;max-width:100%;height:auto;" />${captionHtml}</figure>\n\n`;

  // Tìm <h2>...heading...</h2> matching (case-insensitive, normalize whitespace)
  if (after_heading) {
    const normHeading = String(after_heading).trim().toLowerCase();
    // Regex bắt h2 với content khớp 1 phần (60% similarity bằng substring)
    const h2Regex = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
    let match;
    while ((match = h2Regex.exec(html)) !== null) {
      const h2Text = match[1].replace(/<[^>]+>/g, "").trim().toLowerCase();
      if (h2Text.includes(normHeading.slice(0, 30)) || normHeading.includes(h2Text.slice(0, 30))) {
        const insertPos = match.index + match[0].length;
        // Chèn sau </h2>, tìm đến </p> đầu tiên để chèn ảnh sau đoạn paragraph đầu của section
        const afterH2 = html.slice(insertPos);
        const pEnd = afterH2.search(/<\/p>/i);
        if (pEnd > -1) {
          const finalInsertPos = insertPos + pEnd + 4; // sau </p>
          return html.slice(0, finalInsertPos) + figure + html.slice(finalInsertPos);
        }
        return html.slice(0, insertPos) + figure + html.slice(insertPos);
      }
    }
  }

  // Fallback: chèn sau H2 thứ position-th
  const h2Indices = [];
  const h2Regex = /<\/h2>/gi;
  let m;
  while ((m = h2Regex.exec(html)) !== null) h2Indices.push(m.index + m[0].length);
  if (h2Indices[position]) {
    const idx = h2Indices[position];
    const afterH2 = html.slice(idx);
    const pEnd = afterH2.search(/<\/p>/i);
    if (pEnd > -1) {
      const finalInsertPos = idx + pEnd + 4;
      return html.slice(0, finalInsertPos) + figure + html.slice(finalInsertPos);
    }
    return html.slice(0, idx) + figure + html.slice(idx);
  }

  // Cuối cùng: append cuối bài
  return html + figure;
}

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildContentWithSchema(html, schemaJsonLd) {
  // Inject schema vào cuối content dưới dạng <script type="application/ld+json">
  if (!schemaJsonLd) return html;
  let schemas;
  try { schemas = typeof schemaJsonLd === "string" ? JSON.parse(schemaJsonLd) : schemaJsonLd; }
  catch { return html; }

  const scripts = (Array.isArray(schemas) ? schemas : [schemas])
    .map(s => `<script type="application/ld+json">${JSON.stringify(s)}</script>`)
    .join("\n");

  return `${html}\n\n<!-- GEO Schema JSON-LD -->\n${scripts}`;
}

// Extract primary keyword từ schema_jsonld (do generate-content.js lưu keywords array với primary
// làm phần tử đầu). Fallback: dùng wp_tags[0] hoặc title.
function extractFocusKeyword(article) {
  try {
    const schemas = JSON.parse(article.schema_jsonld || "[]");
    const articleSchema = (Array.isArray(schemas) ? schemas : [schemas]).find(s => s?.["@type"] === "Article");
    if (articleSchema?.keywords) {
      const first = String(articleSchema.keywords).split(",")[0].trim();
      if (first) return first;
    }
  } catch {}
  try {
    const tags = JSON.parse(article.wp_tags || "[]");
    if (tags[0]) return String(tags[0]).trim();
  } catch {}
  return article.title || "";
}

async function createPost(siteConfig, payload) {
  const res = await fetch(`${siteConfig.url}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: {
      "Authorization": authHeader(siteConfig.user, siteConfig.pwd),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = (await res.text()).slice(0, 800);
    throw new Error(`WP post create failed ${res.status}: ${txt}`);
  }
  return res.json();
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return jsonResponse({ error: "D1 binding 'DB' missing" }, 500);

  let body = {};
  try { body = await request.json(); } catch {}

  const articleId = body.article_id;
  if (!articleId) return jsonResponse({ error: "Missing article_id" }, 400);

  const wpStatus = ["publish", "draft", "pending", "future", "private"].includes(body.wp_status)
    ? body.wp_status : "draft";

  // Load article
  const article = await env.DB.prepare(
    `SELECT * FROM geo_content_queue WHERE id = ?`
  ).bind(articleId).first();

  if (!article) return jsonResponse({ error: `Article ${articleId} not found` }, 404);

  const validStatuses = ["pending_review", "edited", "failed"];
  if (!validStatuses.includes(article.status)) {
    return jsonResponse({
      error: `Article status='${article.status}' — chỉ publish được khi pending_review/edited/failed`,
    }, 400);
  }

  const targetSite = body.target_site || article.brand;
  const siteConfig = getSiteConfig(targetSite, env);
  if (!siteConfig || !siteConfig.url || !siteConfig.user || !siteConfig.pwd) {
    return jsonResponse({
      error: `Missing WP config cho site '${targetSite}'. Set env vars: WP_${targetSite.toUpperCase()}_URL, WP_${targetSite.toUpperCase()}_USER, WP_${targetSite.toUpperCase()}_APP_PWD`,
    }, 500);
  }

  // Apply override (nếu user gửi)
  const override = body.override || {};
  const finalTitle    = override.title    || article.title;
  const finalContent  = override.content_html || article.content_html;
  const finalExcerpt  = override.excerpt  || article.excerpt;
  const finalSlug     = override.slug     || article.slug;
  const finalMetaDesc = override.meta_description || article.meta_description;
  const wpCats        = override.wp_categories || JSON.parse(article.wp_categories || "[]");
  const wpTags        = override.wp_tags || JSON.parse(article.wp_tags || "[]");

  await env.DB.prepare(
    `UPDATE geo_content_queue SET status='publishing', target_site=? WHERE id=?`
  ).bind(targetSite, articleId).run();

  try {
    // 1. Upload image lên WP (nếu có base64)
    let featuredMediaId = null;
    let imageUrl = article.image_url;

    if (article.image_base64) {
      // SEO filename: <title-slug>-<uniq>.png — Date.now() base36 ngắn gọn
      const uniq = Date.now().toString(36);
      const filename = `${slugify(finalTitle)}-${uniq}.png`.slice(0, 120);
      const featuredAlt = article.image_alt || finalTitle;
      const media = await uploadMedia(siteConfig, {
        base64: article.image_base64,
        filename,
        alt: featuredAlt,
        title: finalTitle,
        caption: featuredAlt,
      });
      featuredMediaId = media.id;
      imageUrl = media.source_url;
    }

    // 2. Resolve categories + tags
    const categoryIds = await resolveCategories(siteConfig, wpCats);
    const tagIds = await resolveTags(siteConfig, wpTags);

    // 3a. Upload inline images lên WP + inject vào HTML
    const { results: inlineRows } = await env.DB.prepare(
      `SELECT id, position, after_heading, alt, image_base64, image_url, wp_media_id, width, height
       FROM geo_inline_images WHERE article_id = ? ORDER BY position ASC`
    ).bind(articleId).all();

    let contentWithInline = finalContent;
    const inlineUploaded = [];
    const titleSlug = slugify(finalTitle);
    for (const row of (inlineRows || [])) {
      try {
        // Caption = H2 heading của section ảnh thuộc về (hoặc alt nếu không có)
        const captionText = row.after_heading || row.alt || finalTitle;
        const altText = row.alt || row.after_heading || finalTitle;

        let mediaUrl = row.image_url;
        let mediaId  = row.wp_media_id;
        // Upload nếu chưa upload (image_url null nhưng có base64)
        if (!mediaUrl && row.image_base64) {
          // SEO filename: <title-slug>-<section-slug>.png — Google đọc tên file để hiểu chủ đề.
          // Date.now() base36 (8 ký tự) để chống trùng khi re-publish, ngắn hơn nhiều so với ms epoch.
          const sectionSlug = slugify(captionText).slice(0, 50);
          const uniq = Date.now().toString(36);
          const fname = `${titleSlug}-${sectionSlug || `inline-${row.position}`}-${uniq}.png`.slice(0, 120);
          const media = await uploadMedia(siteConfig, {
            base64: row.image_base64,
            filename: fname,
            alt: altText,
            title: captionText,
            caption: captionText,
          });
          mediaUrl = media.source_url;
          mediaId  = media.id;
          // Cập nhật DB
          await env.DB.prepare(
            `UPDATE geo_inline_images SET image_url = ?, wp_media_id = ?, image_base64 = NULL WHERE id = ?`
          ).bind(mediaUrl, mediaId, row.id).run();
        }
        if (mediaUrl) {
          contentWithInline = injectInlineImage(contentWithInline, {
            after_heading: row.after_heading,
            position: row.position,
            url: mediaUrl,
            alt: altText,
            caption: captionText,
          });
          inlineUploaded.push({ position: row.position, url: mediaUrl, wp_media_id: mediaId });
        }
      } catch (err) {
        // Lỗi 1 ảnh inline không break publish — log nhưng tiếp tục
        console.error(`[publish-wp] inline image ${row.id} upload failed:`, err?.message);
      }
    }

    // 3b. Build content với schema JSON-LD inject
    const contentWithSchema = buildContentWithSchema(contentWithInline, article.schema_jsonld);

    // 4. Create post
    const focusKw = extractFocusKeyword(article);
    const postPayload = {
      title: finalTitle,
      content: contentWithSchema,
      excerpt: finalExcerpt,
      slug: finalSlug,
      status: wpStatus,
      categories: categoryIds,
      tags: tagIds,
      meta: {
        // Yoast SEO compatible
        _yoast_wpseo_metadesc: finalMetaDesc,
        _yoast_wpseo_focuskw: focusKw,
        _yoast_wpseo_title: finalTitle,
        // Rank Math compatible (đúng key cho Rank Math)
        rank_math_description: finalMetaDesc,
        rank_math_focus_keyword: focusKw,
        rank_math_title: finalTitle,
      },
    };
    if (featuredMediaId) postPayload.featured_media = featuredMediaId;

    const post = await createPost(siteConfig, postPayload);

    // 5. Update DB
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(`
      UPDATE geo_content_queue SET
        status = 'published',
        wp_post_id = ?,
        wp_post_url = ?,
        wp_featured_media_id = ?,
        image_url = ?,
        image_base64 = NULL,
        published_at = ?,
        target_site = ?
      WHERE id = ?
    `).bind(
      post.id,
      post.link,
      featuredMediaId,
      imageUrl,
      now,
      targetSite,
      articleId
    ).run();

    // 6. Fire-and-forget: notify search engines (Google Indexing API + IndexNow)
    // Chỉ trigger khi post thực sự publish public — draft/pending không cần index.
    if (wpStatus === "publish" && post.link) {
      context.waitUntil(notifySearchEngines(env, articleId, post.link));
    }

    return jsonResponse({
      article_id: articleId,
      status: "published",
      target_site: targetSite,
      wp_post_id: post.id,
      wp_post_url: post.link,
      wp_status: wpStatus,
      featured_media_id: featuredMediaId,
      categories_assigned: categoryIds,
      tags_assigned: tagIds,
      index_submitted: wpStatus === "publish",
    });

  } catch (err) {
    const errMsg = String(err?.message || err).slice(0, 500);
    await env.DB.prepare(
      `UPDATE geo_content_queue SET status='failed', last_error=? WHERE id=?`
    ).bind(errMsg, articleId).run();
    return jsonResponse({ error: errMsg, article_id: articleId }, 500);
  }
}
