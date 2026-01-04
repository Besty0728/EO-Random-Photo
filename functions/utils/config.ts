export interface Config {
    publicAccess: boolean;
    whitelist: string[];
    adminPassword?: string;
    source: 'KV' | 'ENV';
    ddosMode: boolean;
    ddosCacheTimeout: number; // in seconds
    publicImages: string[]; // List of filenames that are public
}

const DEFAULT_CONFIG: Config = {
    publicAccess: false,
    whitelist: [],
    source: 'ENV',
    ddosMode: false,
    ddosCacheTimeout: 5,
    publicImages: []
};

export async function getConfig(env: any): Promise<Config> {
    // 1. Try KV
    if (env.CONFIG) {
        try {
            // EdgeOne KV get method might differ slightly, but usually it's await env.NAMESPACE.get('KEY')
            // Assuming 'CONFIG' is the KV Namespace binding, and we store data under key 'SETTINGS'?
            // Or 'CONFIG' is the Namespace, key is 'MAIN'? 
            // Plan said: Key `CONFIG` in KV. So env.KV_NAMESPACE_NAME.get('CONFIG')
            // Let's assume the Namespace binding is named `EO_KV` for clarity, and key is `CONFIG`.
            // BUT, usually users bind a KV Namespace to a variable like `MY_KV`.
            // Let's assume `env.EO_KV` exists.

            const kvValue = await env.EO_KV?.get('CONFIG');
            if (kvValue) {
                const parsed = JSON.parse(kvValue);
                return {
                    ...DEFAULT_CONFIG,
                    ...parsed,
                    source: 'KV'
                };
            }
        } catch (e) {
            console.warn('Failed to read from KV:', e);
        }
    }

    // 2. Fallback to Env
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
        ddosMode,
        ddosCacheTimeout,
        publicImages
    };
}

export async function saveConfig(env: any, newConfig: Partial<Config>): Promise<boolean> {
    if (!env.EO_KV) {
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
        await env.EO_KV.put('CONFIG', JSON.stringify(toSave));
        return true;
    } catch (e) {
        console.error('Failed to write to KV:', e);
        return false;
    }
}
