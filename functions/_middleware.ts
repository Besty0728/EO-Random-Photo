import { getConfig, type Config } from './utils/config';

export const onRequest: PagesFunction<Env, any, { config: Config }> = async (context) => {
    const { request, env, next, data } = context;
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 快速跳过：Admin 路径
    if (pathname.startsWith('/api/admin') || pathname.startsWith('/admin')) {
        return next();
    }

    // 加载配置
    const config = await getConfig(env);

    // 将配置传递给后续函数（如 random.ts）以避免重复读取
    data.config = config;

    // 提取文件名（优化：避免重复计算）
    const lastSlash = pathname.lastIndexOf('/');
    const filename = lastSlash >= 0 ? pathname.slice(lastSlash + 1) : pathname;

    // 使用 Set 提高公开图片匹配性能
    const publicImagesSet = new Set(config.publicImages);

    // 检查公开图片（最高优先级）
    if (filename && publicImagesSet.has(filename)) {
        const response = await next();
        response.headers.set('Access-Control-Allow-Origin', '*');
        return response;
    }

    const referer = request.headers.get('Referer');

    // DDoS 模式下严格检查 Referer
    if (config.ddosMode && !referer && !config.publicAccess) {
        return new Response('Access Denied (DDoS Protection)', { status: 403 });
    }

    // ============================================
    // 3. Permission Check Logic
    // ============================================
    let isAllowed = false;

    // Rule A: Global Public Access is ON
    if (config.publicAccess) {
        isAllowed = true;
    }

    // Rule B: Referer Whitelist
    if (!isAllowed && referer) {
        try {
            const refererUrl = new URL(referer);
            const hostname = refererUrl.hostname;

            // Allow self
            if (hostname === url.hostname) {
                isAllowed = true;
            }

            // Check Whitelist
            if (config.whitelist.some(domain => hostname === domain || hostname.endsWith('.' + domain))) {
                isAllowed = true;
            }
        } catch (e) {
            // Invalid referer URL, treat as empty
        }
    }

    // ============================================
    // 4. Final Decision
    // ============================================

    if (isAllowed) {
        // Pass to next handler
        const response = await next();
        response.headers.set('Access-Control-Allow-Origin', '*');
        return response;
    }

    // Blocked
    return new Response('Access Denied: Protected Resource', { status: 403 });
};
