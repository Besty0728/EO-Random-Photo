import manifest from '../data/manifest.json';
import { getConfig } from '../utils/config';

export const onRequest: PagesFunction = async (context) => {
    const { request, env } = context;
    const url = new URL(request.url);

    // 1. Get Configuration
    constconfig = await getConfig(env);

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
    if (images.length === 0) {
        return new Response('No images found for this category', { status: 404 });
    }

    const randomImage = images[Math.floor(Math.random() * images.length)];
    const redirectUrl = new URL(randomImage, url.origin).toString();

    // 5. Redirect & Cache Headers
    const headers = new Headers();
    headers.set('Location', redirectUrl);

    if (config.ddosMode) {
        // Cache the 302 Redirect at Edge for 'ddosCacheTimeout' seconds
        // 'public' allows shared cache (CDN), 's-maxage' controls CDN cache time
        headers.set('Cache-Control', `public, s-maxage=${config.ddosCacheTimeout}, max-age=${config.ddosCacheTimeout}`);
        headers.set('X-DDoS-Protection', 'Active');
    } else {
        // No caching for maximum randomness
        headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        headers.set('X-DDoS-Protection', 'Inactive');
    }

    return new Response(null, { status: 302, headers });
};
