import { getConfig } from './utils/config';

export const onRequest: PagesFunction<Env> = async (context) => {
    const { request, env, next } = context;
    const url = new URL(request.url);

    // Skip middleware for Admin API and Admin Page
    if (url.pathname.startsWith('/api/admin') || url.pathname.startsWith('/admin')) {
        return next();
    }

    // Load Configuration
    const config = await getConfig(env);
    const referer = request.headers.get('Referer');
    const filename = url.pathname.split('/').pop();

    // ============================================
    // 1. Check for "Public Images" (First priority)
    // ============================================
    // If the request targets a specific public image, allow it immediately
    if (filename && config.publicImages.includes(filename)) {
        // Pass to next handler, set CORS
        const response = await next();
        response.headers.set('Access-Control-Allow-Origin', '*');
        // If DDoS mode is ON, we might still want to cache these public images?
        // api/random.ts handles its own headers. 
        // Static assets (images) usually get default cache headers from EdgeOne.
        return response;
    }

    // ============================================
    // 2. DDoS Mode Check (Strict)
    // ============================================
    if (config.ddosMode && !referer && !config.publicAccess) {
        // In DDoS mode, block requests without referer unless it was a public image (handled above)
        // or publicAccess is globally ON.
        return new Response('Access Denied (DDoS Protection: No Referer)', { status: 403 });
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
