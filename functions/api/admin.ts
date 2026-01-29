import { getConfig, saveConfig, type Config } from '../utils/config';

export const onRequest: PagesFunction<Env> = async (context) => {
    const { request, env } = context;

    // 1. Auth Check (Basic for now, or via Header)
    // We expect an 'Authorization' header or a query param for simplicity in this demo?
    // Better: Authorization: Bearer <PASSWORD>

    const authHeader = request.headers.get('Authorization');
    const providedPass = authHeader ? authHeader.replace('Bearer ', '') : null;

    const currentConfig = await getConfig(env);

    // 双密码验证：KV 密码或环境变量密码均可登录
    const isPasswordValid = providedPass && (
        providedPass === currentConfig.adminPassword ||
        providedPass === currentConfig.fallbackPassword
    );

    if (currentConfig.adminPassword && !isPasswordValid) {
        return new Response('Unauthorized', { status: 401 });
    }

    if (request.method === 'GET') {
        // Return current config
        // Mask password in response? Maybe not needed if we are admin.
        return new Response(JSON.stringify(currentConfig), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (request.method === 'POST') {
        // 根据 kvBound 判断是否允许保存（config.ts 已通过全局变量检查 KV 可用性）
        if (!currentConfig.kvBound) {
            return new Response('Configuration is Read-Only: No KV binding. Please bind EO_KV in EdgeOne console.', { status: 403 });
        }

        try {
            const body = await request.json() as Partial<Config>;
            const success = await saveConfig(env, body);
            if (success) {
                return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
            } else {
                return new Response('Failed to save config', { status: 500 });
            }
        } catch (e) {
            return new Response('Invalid JSON', { status: 400 });
        }
    }

    return new Response('Method Not Allowed', { status: 405 });
};
