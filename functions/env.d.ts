interface Env {
    ADMIN_PASSWORD: string;
    EO_PUBLIC_ACCESS: string; // Environment variables are strings
    EO_WHITELIST: string;
    EO_DDOS_MODE: string;
    EO_CACHE_TIMEOUT: string;
    EO_PUBLIC_IMAGES: string;
}

// EdgeOne KV 通过全局变量访问，而非 env 对象
// 变量名在 EdgeOne 控制台绑定时指定
declare const EO_KV: KVNamespace | undefined;

// 帮助编译器识别 PagesFunction 的泛型
declare type Config = import('./utils/config').Config;
