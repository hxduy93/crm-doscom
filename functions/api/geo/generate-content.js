// Endpoint: POST /api/geo/generate-content
//
// Sinh content đầy đủ cho 1 article trong queue (status=idea → drafting → pending_review).
// Output đầy đủ 15 thành phần SEO (title, meta, slug, H1, H2/H3, FAQ, schema, internal/external links).
//
// Body: {
//   article_id: "uuid-từ-geo-content-queue",
//   model: "haiku" | "sonnet",   // default haiku
//   target_words: 2000           // default 2000
// }

import { callClaude } from "./_utils/claude.js";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

const BRAND_CONTEXT = {
  doscom: {
    name: "Doscom",
    short: "Doscom",
    site: "https://doscom.vn",
    products: "phần mềm quản lý bán hàng, POS, ERP cho cửa hàng và chuỗi",
    audience: "chủ shop, chuỗi cửa hàng, F&B, retailer tại Việt Nam",
    usp: "tích hợp đa kênh (Shopee/TikTok/Lazada), tự host được, hỗ trợ tiếng Việt 24/7, có agent AI bán hàng",
  },
  noma: {
    name: "NOMA Autocare",
    short: "NOMA",
    site: "https://noma.vn",
    products: "dịch vụ bảo dưỡng, chăm sóc xe ô tô (rửa xe, detail, đánh bóng, phủ ceramic)",
    audience: "chủ xe ô tô tại HCM, Hà Nội, các thành phố lớn",
    usp: "kỹ thuật viên Đức/Nhật, sản phẩm chính hãng, bảo hành dài hạn, app đặt lịch online",
  },
};

const CONTENT_SYSTEM_PROMPT = `Bạn là Senior Content Writer chuyên SEO + GEO (Generative Engine Optimization). Viết bài blog tiếng Việt vừa tối ưu **AI engine trích nguồn** (ChatGPT/Gemini/Perplexity) vừa đạt **điểm Rank Math ≥85/100** trên WordPress.

═══ RANK MATH SEO CHECKLIST (BẮT BUỘC) ═══
Trước khi viết, tự xác định 1 **primary_keyword** chính (cụm 2-4 từ tiếng Việt, vd: "phần mềm quản lý bán hàng", KHÔNG được dùng nguyên title làm keyword).

Primary keyword PHẢI xuất hiện ở TẤT CẢ các vị trí sau:
1. **Title** — đặt ở đầu hoặc 60% đầu của title. Title 50-60 ký tự.
2. **Meta description** — chứa keyword, 140-155 ký tự.
3. **Slug** — kebab-case, chứa keyword, ≤75 ký tự, không có stop words thừa.
4. **H1** — chứa keyword (có thể == title).
5. **Đoạn intro (10% đầu content)** — keyword xuất hiện trong 100 từ đầu, lý tưởng câu đầu.
6. **Ít nhất 1 H2** — chứa keyword hoặc biến thể.
7. **Image alt** — chứa keyword.
8. **Đoạn kết** — keyword xuất hiện lần nữa.

**Keyword density**: 0.8-2.5% (tức 1 lần / 50-120 từ). KHÔNG nhồi nhét quá 2.5%.

**Cấu trúc bài (giúp Rank Math + GEO cùng tăng điểm)**:
- Title chứa **số** (vd "5 cách…", "Top 7…", "2026") + **power word** (vd "bí mật", "chuyên gia", "tốt nhất", "miễn phí", "thực chiến") + sentiment tích cực.
- Bài ≥1500 từ (đã quy định target ở user prompt).
- Có **≥3 H2**, dưới mỗi H2 có 200-400 từ.
- Có **bảng so sánh** nếu chủ đề cho phép (Rank Math + AI rất thích).
- Có **bullet/numbered list** (≥2 đoạn dùng list).
- Có **≥2 external link dofollow** đến nguồn uy tín (gov.vn, báo lớn, nghiên cứu).
- Có **≥2 internal link** đến trang cùng site.
- Có **FAQ 5-8 Q&A** ở cuối → tăng GEO + có FAQ Schema.

═══ NGUYÊN TẮC GEO (cho AI engine trích nguồn) ═══
1. Mỗi H2/H3 trả lời 1 câu hỏi cụ thể → AI dễ extract.
2. Intro 100-150 từ có định nghĩa rõ ràng → AI quote.
3. FAQ Q&A dạng natural language → AI copy nguyên trạng.
4. Bảng so sánh khi nói về nhiều lựa chọn → AI thích trích bảng.
5. Dữ liệu/số liệu cụ thể (không bịa nếu không có) → tăng E-E-A-T.

═══ PHONG CÁCH ═══
- Tiếng Việt tự nhiên, không dịch máy.
- Tránh sáo rỗng ("Trong thời đại 4.0", "Hiện nay...").
- Văn phong chuyên gia thân thiện, KHÔNG bán hàng lộ liễu.
- Mention brand 2-4 lần tự nhiên.

OUTPUT BẮT BUỘC: 1 JSON object hợp lệ, bắt đầu bằng { kết thúc bằng }. KHÔNG markdown wrapper, KHÔNG text bao quanh, KHÔNG \`\`\`json fence.`;

function buildContentPrompt({ article, brand, targetWords }) {
  const ctx = BRAND_CONTEXT[brand];
  const competitors = JSON.parse(article.competitor_winners || "[]").slice(0, 5);
  const citations = JSON.parse(article.source_citations || "[]").slice(0, 5);

  return `BRAND: ${ctx.name}
SẢN PHẨM: ${ctx.products}
ĐỐI TƯỢNG: ${ctx.audience}
USP: ${ctx.usp}
WEBSITE: ${ctx.site}

TITLE ĐÃ ĐỀ XUẤT: ${article.title}
SLUG: ${article.slug}
BRIEF: ${article.gap_summary || "Bài viết để fix lỗ hổng GEO — AI engine không nhắc brand cho query này."}

LỖ HỔNG GỐC:
- Query gây ra: "${article.query_text || ""}"
- AI nào miss brand: ${(JSON.parse(article.gap_engines || "[]")).join(", ")}
- Đối thủ đang thắng: ${competitors.map(c => `${c.name} (${c.mentions} mentions)`).join(", ") || "không có"}
- AI đang trích từ những domain: ${citations.map(c => c.domain).join(", ") || "không có"}

YÊU CẦU OUTPUT (JSON object, ${targetWords} từ tổng cộng):

{
  "primary_keyword": "cụm 2-4 từ tiếng Việt là KEYWORD CHÍNH (vd 'phần mềm quản lý kho'). KHÔNG dùng title nguyên. Đây sẽ là focus keyword Rank Math.",
  "secondary_keywords": ["biến thể 1", "biến thể 2", "biến thể 3", "long-tail 1", "long-tail 2"],
  "title": "50-60 ký tự, BẮT ĐẦU bằng primary_keyword hoặc đặt nó trong 60% đầu, có số (vd '5', '2026') + power word (bí mật, chuyên gia, tốt nhất, miễn phí...)",
  "slug": "kebab-case-khong-dau, CHỨA primary_keyword, ≤75 ký tự, không có stop words thừa (the, of, va, cua, cho...)",
  "meta_description": "140-155 ký tự, CHỨA primary_keyword (lý tưởng trong 120 ký tự đầu), kêu gọi hành động nhẹ",
  "excerpt": "2-3 câu tóm tắt 200 ký tự, có primary_keyword",
  "content_markdown": "BÀI VIẾT FULL ${targetWords} TỪ theo cấu trúc:\\n\\n# H1 (chứa primary_keyword)\\n\\n[Intro 100-150 từ — câu đầu PHẢI chứa primary_keyword. Có 1 số liệu/định nghĩa. Mention ${ctx.short} 1 lần.]\\n\\n## H2 thứ 1 (chứa primary_keyword hoặc biến thể, dạng câu hỏi)\\n[200-400 từ trả lời, có bullet list hoặc bảng nếu phù hợp]\\n\\n## H2 thứ 2 (chứa biến thể keyword)\\n### H3 sub-section\\n...\\n\\n## H2 thứ 3 — Bảng so sánh\\n| Tiêu chí | A | B | C |\\n|---|---|---|---|\\n| ... | ... | ... | ... |\\n\\n## H2 thứ 4 — Câu hỏi thường gặp (FAQ)\\n### Q1?\\nA1 50-100 từ...\\n\\n## Kết luận (chứa primary_keyword lần cuối) + CTA mềm",
  "faq": [
    {"q": "Câu hỏi tự nhiên 1?", "a": "Trả lời 50-100 từ, AI có thể trích nguyên"},
    "... 5-8 items"
  ],
  "internal_links": [
    {"anchor": "anchor text chứa keyword phụ", "url": "${ctx.site}/blog/<slug-related>", "context": "đặt ở H2 nào"},
    "... ≥2 items"
  ],
  "external_links": [
    {"anchor": "...", "url": "https://nguon-uy-tin.gov.vn hoặc bao-chinh-thong.vn", "context": "đặt ở đâu, KHÔNG đặt link đối thủ trực tiếp"},
    "... ≥2 items, dofollow"
  ],
  "comparison_table": {
    "title": "...",
    "headers": ["Tiêu chí", "${ctx.short}", "Đối thủ A", "Đối thủ B"],
    "rows": [["...","✓","-","-"]]
  },
  "image_prompt": "Mô tả ảnh hero TIẾNG ANH cho Flux Schnell. Realistic photography, professional, brand-safe, NO TEXT, NO clearly visible faces. Đề tài phải LIÊN QUAN trực tiếp đến primary_keyword.",
  "image_alt_vi": "Alt 100-125 ký tự CHỨA primary_keyword, mô tả ảnh tự nhiên",
  "wp_categories_suggest": ["tên category tiếng Việt phù hợp"],
  "wp_tags_suggest": ["primary_keyword là tag đầu", "tag2", "tag3", "tag4", "tag5"]
}

LƯU Ý:
- primary_keyword PHẢI là cụm từ thực sự người Việt tìm kiếm, KHÔNG phải title.
- content_markdown PHẢI \\n thật trong JSON (escape).
- Density primary_keyword 1-2.5% (1 lần / 50-100 từ) — đếm số lần xuất hiện chính xác.
- KHÔNG bịa tính năng/giá ${ctx.short}. Nói chung về danh mục.
- comparison_table = null nếu title không gợi ý so sánh.`;
}

function buildSchemaJsonLd({ article, content, brand, publishUrl }) {
  const ctx = BRAND_CONTEXT[brand];
  const now = new Date().toISOString();

  const schemas = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": content.title,
      "description": content.meta_description,
      "author": { "@type": "Organization", "name": ctx.name, "url": ctx.site },
      "publisher": {
        "@type": "Organization",
        "name": ctx.name,
        "logo": { "@type": "ImageObject", "url": `${ctx.site}/logo.png` },
      },
      "datePublished": now,
      "dateModified": now,
      "mainEntityOfPage": publishUrl || `${ctx.site}/blog/${content.slug}`,
      "image": article.image_url || undefined,
      // Primary keyword là phần tử đầu, secondary tiếp theo → publish-wp.js có thể extract focus keyword cho Rank Math/Yoast
      "keywords": [content.primary_keyword, ...(content.secondary_keywords || [])].filter(Boolean).join(", "),
    },
  ];

  if (Array.isArray(content.faq) && content.faq.length) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": content.faq.map(f => ({
        "@type": "Question",
        "name": f.q,
        "acceptedAnswer": { "@type": "Answer", "text": f.a },
      })),
    });
  }

  schemas.push({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Trang chủ", "item": ctx.site },
      { "@type": "ListItem", "position": 2, "name": "Blog", "item": `${ctx.site}/blog` },
      { "@type": "ListItem", "position": 3, "name": content.title, "item": publishUrl || `${ctx.site}/blog/${content.slug}` },
    ],
  });

  return schemas;
}

function markdownToHtml(md) {
  // Minimal Markdown → HTML cho WordPress (vì WP đã render block, chỉ cần HTML cơ bản).
  // Không dùng lib ngoài để giữ Worker nhỏ.
  if (!md) return "";
  let html = md;

  // Code blocks (đơn giản)
  html = html.replace(/```([\s\S]*?)```/g, (_, code) =>
    `<pre><code>${escapeHtml(code.trim())}</code></pre>`);

  // Headings
  html = html.replace(/^###### (.*$)/gm, "<h6>$1</h6>");
  html = html.replace(/^##### (.*$)/gm, "<h5>$1</h5>");
  html = html.replace(/^#### (.*$)/gm, "<h4>$1</h4>");
  html = html.replace(/^### (.*$)/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.*$)/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.*$)/gm, "<h1>$1</h1>");

  // Bold / italic
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Tables (đơn giản: chỉ table dạng | a | b |)
  html = html.replace(/(\|[^\n]+\|\n\|[\s\-:|]+\|\n(?:\|[^\n]+\|\n?)+)/g, table => {
    const lines = table.trim().split("\n").filter(l => l.trim().startsWith("|"));
    if (lines.length < 2) return table;
    const headers = lines[0].split("|").slice(1, -1).map(s => s.trim());
    const rows = lines.slice(2).map(l => l.split("|").slice(1, -1).map(s => s.trim()));
    return `<table class="geo-table"><thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  });

  // Lists (basic)
  html = html.replace(/^[\-\*] (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, m => `<ul>${m}</ul>`);

  // Paragraphs: split by 2+ newlines, wrap non-tag lines
  const blocks = html.split(/\n{2,}/);
  html = blocks.map(b => {
    const t = b.trim();
    if (!t) return "";
    if (/^<(h\d|ul|ol|pre|table|blockquote|div)/i.test(t)) return t;
    return `<p>${t.replace(/\n/g, "<br>")}</p>`;
  }).join("\n\n");

  return html;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function countWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).length;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return jsonResponse({ error: "D1 binding 'DB' missing" }, 500);

  let body = {};
  try { body = await request.json(); } catch {}

  const articleId = body.article_id;
  const model = ["haiku", "sonnet"].includes(body.model) ? body.model : "haiku";
  const targetWords = Math.min(Math.max(parseInt(body.target_words) || 2000, 800), 4000);
  const force = body.force === true;

  if (!articleId) return jsonResponse({ error: "Missing article_id" }, 400);

  // Load article + join với geo_queries để lấy query text
  const article = await env.DB.prepare(`
    SELECT q.id as article_id, q.brand, q.status, q.title, q.slug,
           q.gap_severity, q.gap_engines, q.gap_summary,
           q.competitor_winners, q.source_citations,
           q.drafted_at, q.created_at,
           gq.text as query_text, gq.category, gq.brand_target,
           gq.id as query_id
    FROM geo_content_queue q
    LEFT JOIN geo_queries gq ON gq.id = q.query_id
    WHERE q.id = ?
  `).bind(articleId).first();

  if (!article) return jsonResponse({ error: `Article ${articleId} not found` }, 404);

  // Auto-recover stale drafting: nếu status='drafting' và drafted_at quá 5 phút trước
  // (hoặc drafted_at NULL và created_at quá 5 phút) → coi như Worker bị kill, cho phép regen.
  const STALE_SEC = 5 * 60;
  const nowSec = Math.floor(Date.now() / 1000);
  if (article.status === "drafting" && !force) {
    const startedAt = article.drafted_at || article.created_at || 0;
    const age = nowSec - startedAt;
    if (age > STALE_SEC) {
      // Stale → recover
      await env.DB.prepare(
        `UPDATE geo_content_queue SET status='failed', last_error=? WHERE id=?`
      ).bind(`Auto-recovered from stale drafting after ${age}s`, articleId).run();
      article.status = "failed";
    } else {
      return jsonResponse({
        error: `Article đang được sinh content (status='drafting', đã chạy ${age}s). Vui lòng đợi ~${STALE_SEC - age}s rồi thử lại, hoặc gửi {force:true} để bỏ qua.`
      }, 409);
    }
  }

  if (!["idea", "failed"].includes(article.status) && !force) {
    return jsonResponse({
      error: `Article status='${article.status}' — chỉ regen được cho idea/failed. Dùng PATCH /api/geo/queue/:id nếu muốn edit.`
    }, 400);
  }

  // Mark drafting (set drafted_at = now để tracking stale state)
  await env.DB.prepare(
    `UPDATE geo_content_queue SET status='drafting', drafted_at=? WHERE id = ?`
  ).bind(nowSec, articleId).run();

  try {
    const userPrompt = buildContentPrompt({ article, brand: article.brand, targetWords });
    const result = await callClaude(env, {
      model,
      systemPrompt: CONTENT_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 16000,
      jsonOutput: true,
    });

    const c = result.parsed;
    if (!c || !c.content_markdown) throw new Error("Claude trả content_markdown empty");

    const contentHtml = markdownToHtml(c.content_markdown);
    const wordCount = countWords(c.content_markdown);
    const readingTime = Math.max(1, Math.round(wordCount / 220));

    const schemas = buildSchemaJsonLd({
      article,
      content: c,
      brand: article.brand,
    });

    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(`
      UPDATE geo_content_queue SET
        status = 'pending_review',
        title = ?,
        slug = ?,
        meta_description = ?,
        excerpt = ?,
        content_html = ?,
        content_markdown = ?,
        faq_json = ?,
        schema_jsonld = ?,
        internal_links_json = ?,
        external_links_json = ?,
        word_count = ?,
        reading_time_min = ?,
        image_prompt = ?,
        image_alt = ?,
        wp_categories = ?,
        wp_tags = ?,
        drafted_at = ?,
        cost_content_usd = ?,
        cost_total_usd = COALESCE(cost_total_usd, 0) + ?,
        content_model = ?,
        content_tokens_input = ?,
        content_tokens_output = ?
      WHERE id = ?
    `).bind(
      (c.title || article.title || "").slice(0, 250),
      (c.slug || article.slug || "").slice(0, 200),
      (c.meta_description || "").slice(0, 200),
      (c.excerpt || "").slice(0, 500),
      contentHtml,
      c.content_markdown,
      JSON.stringify(c.faq || []),
      JSON.stringify(schemas),
      JSON.stringify(c.internal_links || []),
      JSON.stringify(c.external_links || []),
      wordCount,
      readingTime,
      (c.image_prompt || "").slice(0, 1000),
      (c.image_alt_vi || "").slice(0, 250),
      JSON.stringify(c.wp_categories_suggest || []),
      JSON.stringify(c.wp_tags_suggest || []),
      now,
      result.cost_usd,
      result.cost_usd,
      result.model,
      result.tokens_input,
      result.tokens_output,
      articleId
    ).run();

    return jsonResponse({
      article_id: articleId,
      status: "pending_review",
      title: c.title,
      slug: c.slug,
      word_count: wordCount,
      reading_time_min: readingTime,
      faq_count: (c.faq || []).length,
      has_comparison_table: !!c.comparison_table,
      image_prompt: c.image_prompt,
      cost_usd: result.cost_usd,
      model: result.model,
      tokens: { input: result.tokens_input, output: result.tokens_output },
    });

  } catch (err) {
    const errMsg = String(err?.message || err).slice(0, 500);
    await env.DB.prepare(
      `UPDATE geo_content_queue SET status='failed', last_error=? WHERE id=?`
    ).bind(errMsg, articleId).run();
    return jsonResponse({ error: errMsg, article_id: articleId }, 500);
  }
}
