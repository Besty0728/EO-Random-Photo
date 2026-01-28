import { getConfig, type Config } from './utils/config';

export const onRequest: PagesFunction<Env, any, { config: Config }> = async (context) => {
    // 显式初始化 data，防止解构或后续访问失败
    context.data = context.data || {};

    const { request, env, next } = context;
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 允许跨域
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Internal-Request',
    };

    // 处理预检请求
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        // 内部请求放行（防止 random.ts 中的 fetch 被拦截或死循环）
        if (request.headers.get('X-Internal-Request') === 'true') {
            return next();
        }

        // 快速跳过：Admin 路径
        if (pathname.startsWith('/api/admin') || pathname.startsWith('/admin')) {
            return next();
        }

        // 🎯 关键修复：/images/* 静态资源需要无条件添加 CORS 头
        // 当 /random API 302 重定向到 /images/xxx.webp 时，浏览器会检查最终资源的 CORS 头
        // 此时请求可能没有 referer（或 referer 是调用方站点），必须直接放行并添加 CORS
        if (pathname.startsWith('/images/')) {
            const response = await next();
            const newResponse = new Response(response.body, response);
            Object.entries(corsHeaders).forEach(([k, v]) => newResponse.headers.set(k, v));
            return newResponse;
        }

        // 加载配置
        const config = await getConfig(env);
        (context.data as any).config = config;

        // 提取文件名
        const lastSlash = pathname.lastIndexOf('/');
        const filename = lastSlash >= 0 ? pathname.slice(lastSlash + 1) : pathname;

        // 检查公开图片
        const publicImagesSet = new Set(config.publicImages || []);
        if (filename && publicImagesSet.has(filename)) {
            const response = await next();

            // 安全注入 Headers
            const newResponse = new Response(response.body, response);
            Object.entries(corsHeaders).forEach(([k, v]) => newResponse.headers.set(k, v));
            return newResponse;
        }

        const referer = request.headers.get('Referer');

        // DDoS 模式检查
        if (config.ddosMode && !referer && !config.publicAccess) {
            return new Response('Access Denied (DDoS Protection)', { status: 403, headers: corsHeaders });
        }

        let isAllowed = config.publicAccess;

        if (!isAllowed && referer) {
            try {
                const refererUrl = new URL(referer);
                const hostname = refererUrl.hostname;
                if (hostname === url.hostname) {
                    isAllowed = true;
                }
                if (config.whitelist.some(domain => hostname === domain || hostname.endsWith('.' + domain))) {
                    isAllowed = true;
                }
            } catch (e) { /* 忽略无效 referer */ }
        }

        if (isAllowed) {
            const response = await next();
            const newResponse = new Response(response.body, response);
            Object.entries(corsHeaders).forEach(([k, v]) => newResponse.headers.set(k, v));
            return newResponse;
        }

        return new Response('Access Denied: Protected Resource', { 
            status: 403, 
            headers: corsHeaders 
        });

    } catch (err: any) {
        // 返回详细错误以供调试
        return new Response(`Middleware Error: ${err.message}\nStack: ${err.stack}`, {
            status: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'text/plain'
            }
        });
    }
};
