import manifest from './data/manifest.json';

/**
 * 健康检查端点
 * GET /health
 * 
 * 用于 UptimeKuma 等监控服务检测服务状态
 * 实际验证随机图 API 和图片可用性，使用 HEAD 请求不消耗流量
 */
export const onRequest: PagesFunction<Env> = async (context) => {
    const { request } = context;
    const url = new URL(request.url);
    const startTime = Date.now();

    const checks = {
        manifest: false,
        randomApi: false,
        imageAccess: false,
    };

    let imageUrl = '';
    let errorDetail = '';

    try {
        // 1. 检查 manifest 是否有图片
        const horizontalCount = manifest.horizontal?.length || 0;
        const verticalCount = manifest.vertical?.length || 0;
        checks.manifest = horizontalCount > 0 || verticalCount > 0;

        if (!checks.manifest) {
            errorDetail = 'manifest 为空';
        } else {
            // 2. 随机选取一张图片进行 HEAD 请求验证
            const allImages = [...(manifest.horizontal || []), ...(manifest.vertical || [])];
            const randomImage = allImages[(Math.random() * allImages.length) | 0];
            imageUrl = new URL(randomImage, url.origin).toString();

            // 使用 HEAD 请求验证图片可访问性（不消耗流量）
            const imageResponse = await fetch(imageUrl, {
                method: 'HEAD',
                headers: { 'X-Internal-Request': 'true' }
            });

            checks.imageAccess = imageResponse.ok;
            checks.randomApi = checks.manifest && checks.imageAccess;

            if (!imageResponse.ok) {
                errorDetail = `图片返回 ${imageResponse.status}`;
            }
        }
    } catch (err: any) {
        errorDetail = err.message;
    }

    const allHealthy = checks.manifest && checks.randomApi && checks.imageAccess;
    const responseTime = Date.now() - startTime;

    return new Response(JSON.stringify({
        status: allHealthy ? 'ok' : 'error',
        timestamp: Date.now(),
        responseTime: `${responseTime}ms`,
        checks,
        ...(errorDetail && { error: errorDetail }),
    }), {
        status: allHealthy ? 200 : 503,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store'
        }
    });
};
