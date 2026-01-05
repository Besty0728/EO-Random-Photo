import { getConfig, type Config } from './utils/config';

export const onRequest: PagesFunction<Env, any, { config: Config }> = async (context) => {
    const { request, env, next, data } = context;
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

        // 加载配置
        const config = await getConfig(env);
        data.config = config;

        // 提取文件名
        const lastSlash = pathname.lastIndexOf('/');
        const filename = lastSlash >= 0 ? pathname.slice(lastSlash + 1) : pathname;

        // 检查公开图片
        const publicImagesSet = new Set(config.publicImages || []);
        if (filename && publicImagesSet.has(filename)) {
            const response = await next();
            const newHeaders = new Headers(response.headers);
            Object.entries(corsHeaders).forEach(([k, v]) => newHeaders.set(k, v));
            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: newHeaders
            });
        }

        const referer = request.headers.get('Referer');

        // DDoS 模式检查
        if (config.ddosMode && !referer && !config.publicAccess) {
            return new Response('Access Denied (DDoS Protection)', { status: 403, headers: corsHeaders });
        }

        let isAllowed = false;
        if (config.publicAccess) {
            isAllowed = true;
        }

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
            } catch (e) { }
        }

        if (isAllowed) {
            const response = await next();

            // 关键修复：Pages 的静态资源 Response Headers 通常是不可变的。
            // 我们必须创建一个新的 Response 对象来注入跨域头。
            const newHeaders = new Headers(response.headers);
            Object.entries(corsHeaders).forEach(([k, v]) => newHeaders.set(k, v));

            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: newHeaders
            });
        }

        return new Response('Access Denied: Protected Resource', { status: 403, headers: corsHeaders });

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
