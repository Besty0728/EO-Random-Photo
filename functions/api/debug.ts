import { getConfig } from '../utils/config';

/**
 * 调试端点：显示当前生效的配置
 * GET /api/debug
 * 
 * ⚠️ 生产环境使用后请删除此文件！
 */
export const onRequest: PagesFunction<Env> = async (context) => {
    const { request, env } = context;
    
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json; charset=utf-8',
    };

    try {
        const config = await getConfig(env);
        const referer = request.headers.get('Referer') || '(none)';
        const url = new URL(request.url);
        
        // 检查 referer 是否在白名单
        let refererHostname = '(none)';
        let isInWhitelist = false;
        let isSameHost = false;
        
        if (referer !== '(none)') {
            try {
                const refererUrl = new URL(referer);
                refererHostname = refererUrl.hostname;
                isSameHost = refererHostname === url.hostname;
                isInWhitelist = config.whitelist.some(
                    domain => refererHostname === domain || refererHostname.endsWith('.' + domain)
                );
            } catch (e) {
                refererHostname = '(invalid URL)';
            }
        }

        const debugInfo = {
            message: '🔍 EO-Random-Photo Debug Info',
            warning: '⚠️ 请在调试完成后删除 functions/api/debug.ts',
            config: {
                source: config.source,
                publicAccess: config.publicAccess,
                whitelist: config.whitelist,
                ddosMode: config.ddosMode,
                ddosCacheTimeout: config.ddosCacheTimeout,
                publicImages: config.publicImages,
            },
            request: {
                referer: referer,
                refererHostname: refererHostname,
                requestHost: url.hostname,
            },
            analysis: {
                isSameHost: isSameHost,
                isInWhitelist: isInWhitelist,
                wouldBeAllowed: config.publicAccess || isSameHost || isInWhitelist,
            },
            envVarsPresent: {
                EO_PUBLIC_ACCESS: typeof env.EO_PUBLIC_ACCESS !== 'undefined',
                EO_WHITELIST: typeof env.EO_WHITELIST !== 'undefined',
                EO_DDOS_MODE: typeof env.EO_DDOS_MODE !== 'undefined',
                EO_KV: typeof env.EO_KV !== 'undefined',
            }
        };

        return new Response(JSON.stringify(debugInfo, null, 2), {
            status: 200,
            headers: corsHeaders
        });

    } catch (err: any) {
        return new Response(JSON.stringify({
            error: err.message,
            stack: err.stack
        }, null, 2), {
            status: 500,
            headers: corsHeaders
        });
    }
};
