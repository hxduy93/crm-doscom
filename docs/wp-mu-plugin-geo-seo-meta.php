<?php
/**
 * Plugin Name: GEO Agent — Expose Rank Math / Yoast meta to REST API
 * Description: Cho phép pipeline GEO Agent (Cloudflare Pages) set focus keyword + meta description qua WP REST API. Không có file này, WordPress mặc định bỏ qua các meta key custom khi tạo post qua REST.
 * Author: Doscom GEO Agent
 * Version: 1.0
 *
 * CÁCH CÀI ĐẶT:
 *   1. Upload file này vào thư mục: wp-content/mu-plugins/  (tạo folder nếu chưa có)
 *   2. KHÔNG cần activate — mu-plugin tự load.
 *   3. Đổi tên file thành: geo-seo-meta.php (hoặc bất kỳ tên kết thúc .php)
 *   4. Cài cho CẢ doscom.vn VÀ noma.vn (mỗi site 1 lần).
 *
 * KIỂM TRA HOẠT ĐỘNG:
 *   Sau khi upload, gọi: GET https://doscom.vn/wp-json/wp/v2/types/post
 *   Trong response, field `supports.custom-fields` phải = true, và các meta key bên dưới
 *   phải xuất hiện trong `meta_fields` (nếu WP version hỗ trợ).
 */

if (!defined('ABSPATH')) exit;

add_action('init', function () {

    $auth_cb = function () {
        return current_user_can('edit_posts');
    };

    // ────────────────────────────────────────────────────────────────────
    // Rank Math SEO meta keys
    // ────────────────────────────────────────────────────────────────────
    $rankmath_keys = [
        'rank_math_focus_keyword',
        'rank_math_description',
        'rank_math_title',
        'rank_math_canonical_url',
        'rank_math_robots',
        'rank_math_advanced_robots',
        'rank_math_facebook_title',
        'rank_math_facebook_description',
        'rank_math_twitter_title',
        'rank_math_twitter_description',
        'rank_math_pillar_content',
    ];

    foreach ($rankmath_keys as $key) {
        register_post_meta('post', $key, [
            'show_in_rest' => true,
            'single'       => true,
            'type'         => 'string',
            'auth_callback' => $auth_cb,
        ]);
    }

    // ────────────────────────────────────────────────────────────────────
    // Yoast SEO meta keys (phòng trường hợp site dùng Yoast thay vì Rank Math)
    // ────────────────────────────────────────────────────────────────────
    $yoast_keys = [
        '_yoast_wpseo_focuskw',
        '_yoast_wpseo_metadesc',
        '_yoast_wpseo_title',
        '_yoast_wpseo_canonical',
        '_yoast_wpseo_meta-robots-noindex',
        '_yoast_wpseo_meta-robots-nofollow',
        '_yoast_wpseo_opengraph-title',
        '_yoast_wpseo_opengraph-description',
        '_yoast_wpseo_twitter-title',
        '_yoast_wpseo_twitter-description',
    ];

    foreach ($yoast_keys as $key) {
        register_post_meta('post', $key, [
            'show_in_rest' => true,
            'single'       => true,
            'type'         => 'string',
            'auth_callback' => $auth_cb,
        ]);
    }

}, 100); // priority 100: chạy sau khi Rank Math/Yoast register meta của họ (nếu có)

// ────────────────────────────────────────────────────────────────────
// Trigger Rank Math tính lại điểm SEO sau khi tạo/update post qua REST
// (vì Rank Math thường tính score chỉ khi save qua Gutenberg editor)
// ────────────────────────────────────────────────────────────────────
add_action('rest_after_insert_post', function ($post, $request, $creating) {
    if (!class_exists('RankMath\\Post')) return;
    try {
        // Trigger Rank Math recalculate (đoạn này best-effort, không throw nếu plugin API đổi)
        if (method_exists('RankMath\\Helper', 'update_score')) {
            \RankMath\Helper::update_score($post->ID);
        }
    } catch (\Throwable $e) {
        error_log('[GEO Agent] Rank Math score recalc failed: ' . $e->getMessage());
    }
}, 10, 3);
