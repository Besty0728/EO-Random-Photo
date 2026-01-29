export interface Config {
    publicAccess: boolean;
    whitelist: string[];
    adminPassword?: string;
    fallbackPassword?: string; // 环境变量中的兜底密码，始终可用于登录
    source: 'KV' | 'ENV';
    kvBound: boolean; // KV 是否已绑定（即使数据为空也为 true）
    ddosMode: boolean;
    ddosCacheTimeout: number; // in seconds
    publicImages: string[]; // List of filenames that are public
}

// 全局变量缓存，利用 Isolate 复用机制提升性能（仅针对 ENV 模式）
let globalConfigCache: Config | null = null;

const DEFAULT_CONFIG: Config = {
    publicAccess: false,
    whitelist: [],
    source: 'ENV',
    kvBound: false,
    ddosMode: false,
    ddosCacheTimeout: 5,
    publicImages: []
};

// 检查 KV 是否可用（EdgeOne 通过全局变量访问 KV）
function isKVAvailable(): boolean {
    return typeof EO_KV !== 'undefined' && EO_KV !== null;
}

export async function getConfig(env: Env): Promise<Config> {
    // 0. 优先尝试全局变量缓存 (针对纯环境变量部署的极致优化)
    // 仅在未配置 KV 时使用全局缓存，因为 ENV 在单次部署中是不变的
    if (!isKVAvailable() && globalConfigCache) {
        return globalConfigCache;
    }

    // 1. Try KV (EdgeOne KV 通过全局变量访问)
    if (isKVAvailable()) {
        try {
            const kvValue = await EO_KV!.get('CONFIG');
            if (kvValue) {
                const parsed = JSON.parse(kvValue);
                return {
                    ...DEFAULT_CONFIG,
                    ...parsed,
                    source: 'KV',
                    kvBound: true,
                    // 始终保留环境变量密码作为兜底（即使 KV 中有密码）
                    fallbackPassword: env.ADMIN_PASSWORD
                };
            }
            // KV 已绑定但数据为空，返回 ENV 配置但标记 kvBound = true
            const publicAccess = env.EO_PUBLIC_ACCESS === 'true';
            const whitelist = env.EO_WHITELIST ? env.EO_WHITELIST.split(',') : [];
            const adminPassword = env.ADMIN_PASSWORD;
            const ddosMode = env.EO_DDOS_MODE === 'true';
            const ddosCacheTimeout = env.EO_CACHE_TIMEOUT ? parseInt(env.EO_CACHE_TIMEOUT, 10) : 5;
            const publicImages = env.EO_PUBLIC_IMAGES ? env.EO_PUBLIC_IMAGES.split(',') : [];

            return {
                publicAccess,
                whitelist,
                adminPassword,
                source: 'ENV',
                kvBound: true, // KV 已绑定，允许初始化保存
                ddosMode,
                ddosCacheTimeout: isNaN(ddosCacheTimeout) ? 5 : ddosCacheTimeout,
                publicImages
            };
        } catch (e) {
            console.warn('Failed to read from KV:', e);
        }
    }

    // 2. Fallback to Env (KV 未绑定)
    const publicAccess = env.EO_PUBLIC_ACCESS === 'true';
    const whitelist = env.EO_WHITELIST ? env.EO_WHITELIST.split(',') : [];
    const adminPassword = env.ADMIN_PASSWORD;
    const ddosMode = env.EO_DDOS_MODE === 'true';
    const ddosCacheTimeout = env.EO_CACHE_TIMEOUT ? parseInt(env.EO_CACHE_TIMEOUT, 10) : 5;
    const publicImages = env.EO_PUBLIC_IMAGES ? env.EO_PUBLIC_IMAGES.split(',') : [];

    const config: Config = {
        publicAccess,
        whitelist,
        adminPassword,
        source: 'ENV',
        kvBound: false, // KV 未绑定
        ddosMode,
        ddosCacheTimeout: isNaN(ddosCacheTimeout) ? 5 : ddosCacheTimeout,
        publicImages
    };

    // 存入全局变量缓存，以便后续请求直接复用已解析的结果
    globalConfigCache = config;

    return config;
}

export async function saveConfig(env: Env, newConfig: Partial<Config>): Promise<boolean> {
    if (!isKVAvailable()) {
        return false; // Cannot save if KV is not configured
    }

    // Merge with existing or default
    const current = await getConfig(env);
    // We don't save 'source'
    const toSave = {
        publicAccess: newConfig.publicAccess ?? current.publicAccess,
        whitelist: newConfig.whitelist ?? current.whitelist,
        adminPassword: newConfig.adminPassword ?? current.adminPassword,
        ddosMode: newConfig.ddosMode ?? current.ddosMode,
        ddosCacheTimeout: newConfig.ddosCacheTimeout ?? current.ddosCacheTimeout,
        publicImages: newConfig.publicImages ?? current.publicImages
    };

    try {
        await EO_KV!.put('CONFIG', JSON.stringify(toSave));
        return true;
    } catch (e) {
        console.error('Failed to write to KV:', e);
        return false;
    }
}
