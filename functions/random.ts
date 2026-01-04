import manifest from './data/manifest.json';
import { getConfig } from './utils/config';

export const onRequest: PagesFunction<Env> = async (context) => {
    const { request, env } = context;
    const url = new URL(request.url);

    // 1. Get Configuration
    const config = await getConfig(env);

    // 3. Determine Image Type (Horizontal/Vertical)
    // Access control is handled by _middleware.ts
    const typeParam = url.searchParams.get('type');
    const userAgent = request.headers.get('User-Agent') || '';

    let targetType: 'vertical' | 'horizontal' = 'horizontal';

    if (typeParam === 'v') {
        targetType = 'vertical';
    } else if (typeParam === 'h') {
        targetType = 'horizontal';
    } else {
        // Adaptive logic: Check Mobile/Tablet User Agent
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
        targetType = isMobile ? 'vertical' : 'horizontal';
    }

    // 4. Select Random Image
    const images = manifest[targetType] || [];

    // DEBUG LOG
    console.log(`[DEBUG] targetType: ${targetType}, images count: ${images.length}`);

    if (images.length === 0) {
        // Debug: Return manifest content to see what's wrong
        return new Response(JSON.stringify({ error: 'No images found', targetType, manifestKeys: Object.keys(manifest), manifest }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const randomImage = images[Math.floor(Math.random() * images.length)];
    const redirectUrl = new URL(randomImage, url.origin).toString();

    // 5. Response Strategy (Hybrid)
    // Goal: Browser address bar stays /random (Proxy), but <img> tags get 302 (Better Caching/Performance)

    const accept = request.headers.get('Accept') || '';
    // Browsers navigating to a page send 'text/html'
    // <img> tags send 'image/*', '*/*', but NOT 'text/html'
    const isBrowserNav = accept.includes('text/html');

    // Query param overrides everything: ?redirect=true or ?redirect=false
    const paramRedirect = url.searchParams.get('redirect');

    let shouldRedirect = false;

    if (paramRedirect === 'true') {
        shouldRedirect = true;
    } else if (paramRedirect === 'false') {
        shouldRedirect = false;
    } else {
        // Default behavior if no param:
        // If it's a browser navigation, Stay (Proxy 200).
        // If it's an image tag/api call, Jump (Redirect 302).
        shouldRedirect = !isBrowserNav;
    }

    // Headers construction
    const headers = new Headers();

    if (config.ddosMode) {
        // Cache at Edge (Both 302 and 200 body can be cached)
        headers.set('Cache-Control', `public, s-maxage=${config.ddosCacheTimeout}, max-age=${config.ddosCacheTimeout}`);
        headers.set('X-DDoS-Protection', 'Active');
    } else {
        headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        headers.set('X-DDoS-Protection', 'Inactive');
    }

    if (shouldRedirect) {
        headers.set('Location', redirectUrl);
        return new Response(null, { status: 302, headers });
    } else {
        // Proxy Mode
        try {
            const imageResponse = await fetch(redirectUrl);

            // Forward Content-Type
            const contentType = imageResponse.headers.get('Content-Type');
            if (contentType) headers.set('Content-Type', contentType);

            // Forward ETag
            const etag = imageResponse.headers.get('ETag');
            if (etag) headers.set('ETag', etag);

            return new Response(imageResponse.body, { status: 200, headers });
        } catch (e) {
            console.error('Proxy fetch failed:', e);
            return new Response('Failed to fetch image', { status: 502 });
        }
    }
};
