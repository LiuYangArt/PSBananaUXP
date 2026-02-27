/**
 * API Provider 配置模块
 * 统一管理所有支持的 AI 图像生成 API providers
 */

/**
 * Provider 配置定义
 * 每个 provider 包含固定的 endpoint 模板和 URL 拼接规则
 */
const PROVIDER_CONFIGS = {
    google_official: {
        id: 'google_official',
        name: 'Gemini',
        type: 'google_official',
        defaultBaseUrl: 'https://generativelanguage.googleapis.com',
        basePath: '/v1beta', // API 基础路径
        defaultModel: 'gemini-3-pro-image-preview',
        endpoints: {
            generate: '/models/{model}:generateContent',
            test: '/models',
        },
        authType: 'query_param', // API key 通过 query parameter 传递
        requiresAuth: true,
    },
    openrouter: {
        id: 'openrouter',
        name: 'OpenRouter',
        type: 'openrouter',
        defaultBaseUrl: 'https://openrouter.ai',
        basePath: '/api/v1', // API 基础路径
        defaultModel: 'google/gemini-3.1-flash-image-preview',
        endpoints: {
            generate: '/chat/completions',
            test: '/models',
        },
        authType: 'bearer_token',
        requiresAuth: true,
    },
    yunwu: {
        id: 'yunwu',
        name: 'Yunwu',
        type: 'yunwu',
        defaultBaseUrl: 'https://yunwu.zeabur.app',
        basePath: '/v1beta', // API 基础路径
        defaultModel: 'gemini-3-pro-image-preview',
        endpoints: {
            generate: '/models/{model}:generateContent',
            test: '/models',
        },
        authType: 'query_param',
        requiresAuth: true,
    },
    gptgod: {
        id: 'gptgod',
        name: 'GPTGod',
        type: 'gptgod',
        defaultBaseUrl: 'https://api.gptgod.online',
        basePath: '/v1', // API 基础路径
        defaultModel: 'gemini-3.1-flash-image-preview',
        endpoints: {
            generate: '/chat/completions',
            test: '/models',
        },
        authType: 'bearer_token',
        requiresAuth: true,
    },
    seedream: {
        id: 'seedream',
        name: 'Seedream',
        type: 'seedream',
        defaultBaseUrl: 'https://ark.cn-beijing.volces.com',
        basePath: '/api/v3', // API 基础路径
        defaultModel: 'doubao-seedream-4-5-251128',
        endpoints: {
            generate: '/images/generations',
            test: null, // Seedream 不支持 test endpoint
        },
        authType: 'bearer_token',
        requiresAuth: true,
    },
    comfyui: {
        id: 'comfyui',
        name: 'Local ComfyUI',
        type: 'comfyui',
        defaultBaseUrl: 'http://127.0.0.1:8188',
        basePath: '', // ComfyUI 没有 basePath
        defaultModel: 'z_image_turbo_bf16.safetensors',
        endpoints: {
            generate: '/prompt',
            test: '/system_stats',
        },
        authType: 'none',
        requiresAuth: false,
    },
};

/**
 * Provider 配置类
 * 封装单个 provider 的配置和 URL 构建逻辑
 */
class ProviderConfig {
    constructor(configId, userBaseUrl = null) {
        const config = PROVIDER_CONFIGS[configId];
        if (!config) {
            throw new Error(`Unknown provider config: ${configId}`);
        }

        this.id = config.id;
        this.name = config.name;
        this.type = config.type;
        this.defaultBaseUrl = config.defaultBaseUrl;
        this.basePath = config.basePath || '';
        this.defaultModel = config.defaultModel;
        this.endpoints = config.endpoints;
        this.authType = config.authType;
        this.requiresAuth = config.requiresAuth;

        // 使用用户提供的 baseUrl 或默认值
        this.baseUrl = userBaseUrl || this.defaultBaseUrl;
    }

    /**
     * 规范化 Base URL
     * 移除尾部斜杠,保持 scheme://host:port/path 格式
     */
    static normalizeBaseUrl(url) {
        if (!url) return '';
        // 移除尾部斜杠
        return url.replace(/\/+$/, '');
    }

    /**
     * 智能提取域名部分
     * 如果用户输入包含 API 路径,只保留域名部分
     * 例如: https://yunwu.zeabur.app/v1beta -> https://yunwu.zeabur.app
     */
    _extractDomain(url) {
        const normalized = ProviderConfig.normalizeBaseUrl(url);
        
        // 如果 URL 已经包含 basePath,移除它
        if (this.basePath && normalized.endsWith(this.basePath)) {
            return normalized.slice(0, -this.basePath.length);
        }
        
        // 检查是否包含其他已知的 API 路径模式
        // 按长度从长到短排序,优先匹配更具体的路径
        const apiPathPatterns = [
            '/chat/completions',
            '/images/generations',
            '/api/v3',
            '/api/v1',
            '/v1beta',
            '/v1',
        ];
        
        for (const pattern of apiPathPatterns) {
            if (normalized.includes(pattern)) {
                const index = normalized.indexOf(pattern);
                return normalized.substring(0, index);
            }
        }
        
        // 如果没有匹配到任何模式,返回原始 URL
        return normalized;
    }

    /**
     * 构建 API URL
     * @param {string} endpointType - 'generate' 或 'test'
     * @param {Object} params - URL 参数 { model, apiKey }
     */
    buildApiUrl(endpointType, params = {}) {
        const { model, apiKey } = params;
        
        // 提取域名部分(移除可能的 API 路径)
        const domain = this._extractDomain(this.baseUrl);
        const endpoint = this.endpoints[endpointType];

        // 特殊处理: Seedream 的 test (不支持)
        if (endpointType === 'test' && this.type === 'seedream') {
            return null; // 返回 null 表示不支持测试
        }

        // 构建完整 URL: domain + basePath + endpoint
        let fullUrl = domain;
        
        // 添加 basePath
        if (this.basePath) {
            fullUrl += this.basePath;
        }
        
        // 添加 endpoint
        if (endpoint) {
            // 替换 {model} 占位符
            const processedEndpoint = endpoint.replace('{model}', model || this.defaultModel);
            fullUrl += processedEndpoint;
        }

        // 添加 API key (如果是 query_param 类型)
        if (this.authType === 'query_param' && apiKey) {
            fullUrl += `?key=${apiKey}`;
        }

        return fullUrl;
    }

    /**
     * 构建请求头
     * @param {string} apiKey - API Key
     */
    buildHeaders(apiKey) {
        const headers = { 'Content-Type': 'application/json' };

        if (this.authType === 'bearer_token' && apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        return headers;
    }
}

/**
 * 根据 provider name 检测 provider 类型
 * @param {string} name - Provider 名称
 * @param {string} baseUrl - Base URL
 */
function detectProviderType(name, baseUrl) {
    const nameLower = (name || '').toLowerCase();
    const urlLower = (baseUrl || '').toLowerCase();

    if (urlLower.includes('generativelanguage.googleapis.com')) {
        return 'google_official';
    } else if (nameLower.includes('seedream') || urlLower.includes('ark.cn-beijing.volces.com')) {
        return 'seedream';
    } else if (nameLower.includes('gptgod') || urlLower.includes('gptgod')) {
        return 'gptgod';
    } else if (nameLower.includes('openrouter') || urlLower.includes('openrouter.ai')) {
        return 'openrouter';
    } else if (nameLower.includes('comfyui') || urlLower.includes(':8188')) {
        return 'comfyui';
    } else {
        // 默认为 Yunwu/Gemini-compatible 格式
        return 'yunwu';
    }
}

/**
 * 获取 Provider 配置实例
 * @param {string} name - Provider 名称
 * @param {string} baseUrl - Base URL
 */
function getProviderConfig(name, baseUrl) {
    const type = detectProviderType(name, baseUrl);
    return new ProviderConfig(type, baseUrl);
}

/**
 * 获取所有预定义的 provider 列表
 */
function getAllProviderConfigs() {
    return Object.values(PROVIDER_CONFIGS);
}

module.exports = {
    PROVIDER_CONFIGS,
    ProviderConfig,
    detectProviderType,
    getProviderConfig,
    getAllProviderConfigs,
};
