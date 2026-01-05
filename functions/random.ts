import manifest from './data/manifest.json';
import { getConfig, type Config } from './utils/config';

export const onRequest: PagesFunction<Env, any, { config: Config }> = async (context) => {
    const { request, env, data = {} as any } = context;
    const url = new URL(request.url);

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
    };

    try {
        // 获取配置（优先从 Middleware 传递的数据中获取，保证一致性与性能）
        const config = (context.data as any)?.config || await getConfig(env);

        // 解析图片类型参数 (h=横屏, v=竖屏，默认自适应)
        const typeParam = url.searchParams.get('type');
        const userAgent = request.headers.get('User-Agent') || '';

        let targetType: 'vertical' | 'horizontal' = 'horizontal';

        if (typeParam === 'v') {
            targetType = 'vertical';
        } else if (typeParam === 'h') {
            targetType = 'horizontal';
        } else {
            // 自适应逻辑：检测移动设备
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
            targetType = isMobile ? 'vertical' : 'horizontal';
        }

        // 选择随机图片
        const images = manifest[targetType] || [];

        if (images.length === 0) {
            return new Response(JSON.stringify({ error: 'No images found', targetType }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 使用更高效的随机选择
        const randomIndex = (Math.random() * images.length) | 0;
        const randomImage = images[randomIndex];
        const redirectUrl = new URL(randomImage, url.origin).toString();

        // 判断响应策略
        const accept = request.headers.get('Accept') || '';
        const isBrowserNav = accept.includes('text/html');
        const paramRedirect = url.searchParams.get('redirect');

        let shouldRedirect = false;

        if (paramRedirect === 'true') {
            shouldRedirect = true;
        } else if (paramRedirect === 'false') {
            shouldRedirect = false;
        } else {
            // 默认：浏览器导航使用代理模式，img 标签使用重定向意识
            shouldRedirect = !isBrowserNav;
        }

        // 构建响应头
        const headers = new Headers();
        Object.entries(corsHeaders).forEach(([k, v]) => headers.set(k, v));

        // 添加 Vary 头优化缓存命中率
        headers.set('Vary', 'Accept, User-Agent');

        if (config.ddosMode) {
            // DDoS 模式：启用边缘缓存
            headers.set('Cache-Control', `public, s-maxage=${config.ddosCacheTimeout}, max-age=${config.ddosCacheTimeout}`);
            headers.set('X-DDoS-Protection', 'Active');
        } else {
            // 正常模式：禁用缓存以确保随机性
            headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            headers.set('X-DDoS-Protection', 'Inactive');
        }

        // 302 重定向模式
        if (shouldRedirect) {
            headers.set('Location', redirectUrl);
            return new Response(null, { status: 302, headers });
        }

        // 代理模式：直接返回图片内容
        // 使用 Edge 缓存加速图片获取
        const fetchOptions: RequestInit = {
            headers: {
                // 标记为内部请求，允许 Middleware 放行
                'X-Internal-Request': 'true',
                // 传递原始 UA 以供日志（如有需）
                'User-Agent': userAgent
            },
            cf: {
                // 在边缘缓存图片 1 小时
                cacheTtl: 3600,
                cacheEverything: true
            }
        };

        const imageResponse = await fetch(redirectUrl, fetchOptions);

        if (!imageResponse.ok) {
            return new Response(`Source Error: ${imageResponse.status} ${imageResponse.statusText}`, {
                status: 502,
                headers: corsHeaders
            });
        }

        // 转发关键响应头
        const mergedHeaders = new Headers();
        Object.entries(corsHeaders).forEach(([k, v]) => mergedHeaders.set(k, v));

        const copyHeaders = ['Content-Type', 'Content-Length', 'ETag', 'Last-Modified'];
        copyHeaders.forEach(h => {
            const val = imageResponse.headers.get(h);
            if (val) mergedHeaders.set(h, val);
        });

        // 确保 Vary 头包含我们依赖的因素
        mergedHeaders.set('Vary', 'Accept, User-Agent');

        return new Response(imageResponse.body, { status: 200, headers: mergedHeaders });

    } catch (err: any) {
        return new Response(`Random API Error: ${err.message}\nStack: ${err.stack}`, {
            status: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'text/plain'
            }
        });
    }
};
