/**
 * API Provider 配置模块
 * 统一管理所有支持的 AI 图像生成 API providers
 */

const { BANANA_IMAGE_API, GPT_IMAGE_2_API } = require('./aspect_ratio');

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
        basePath: '/v1beta',
        defaultModel: 'gemini-3.1-flash-image-preview',
        defaultModels: {
            [BANANA_IMAGE_API]: 'gemini-3.1-flash-image-preview',
            [GPT_IMAGE_2_API]: '',
        },
        endpoints: {
            generate: '/models/{model}:generateContent',
            gptImage2Generate: null,
            gptImage2Edit: null,
            test: '/models',
        },
        supportedImageApis: [BANANA_IMAGE_API],
        authType: 'query_param',
        requiresAuth: true,
    },
    openrouter: {
        id: 'openrouter',
        name: 'OpenRouter',
        type: 'openrouter',
        defaultBaseUrl: 'https://openrouter.ai',
        basePath: '/api/v1',
        defaultModel: 'google/gemini-3.1-flash-image-preview',
        defaultModels: {
            [BANANA_IMAGE_API]: 'google/gemini-3.1-flash-image-preview',
            [GPT_IMAGE_2_API]: 'gpt-image-2',
        },
        endpoints: {
            generate: '/chat/completions',
            gptImage2Generate: '/images/generations',
            gptImage2Edit: '/images/edits',
            test: '/models',
        },
        supportedImageApis: [BANANA_IMAGE_API, GPT_IMAGE_2_API],
        authType: 'bearer_token',
        requiresAuth: true,
    },
    yunwu: {
        id: 'yunwu',
        name: 'Yunwu',
        type: 'yunwu',
        defaultBaseUrl: 'https://yunwu.ai',
        preferredBaseUrl: 'https://yunwu.ai',
        legacyBaseUrls: ['https://api3.wlai.vip', 'https://yunwu.zeabur.app'],
        basePath: '/v1beta',
        defaultModel: 'gemini-3.1-flash-image-preview',
        defaultModels: {
            [BANANA_IMAGE_API]: 'gemini-3.1-flash-image-preview',
            [GPT_IMAGE_2_API]: 'gpt-image-2-all',
        },
        endpoints: {
            generate: '/models/{model}:generateContent',
            gptImage2Generate: '/v1/images/generations',
            gptImage2Edit: '/v1/images/edits',
            test: '/models',
        },
        supportedImageApis: [BANANA_IMAGE_API, GPT_IMAGE_2_API],
        authType: 'query_param',
        // Yunwu 的 GPT Image 接口实际要求 Bearer；Gemini 兼容接口仍走 query key。
        endpointAuthTypes: {
            gptImage2Generate: 'bearer_token',
            gptImage2Edit: 'bearer_token',
        },
        requiresAuth: true,
    },
    gptgod: {
        id: 'gptgod',
        name: 'GPTGod',
        type: 'gptgod',
        defaultBaseUrl: 'https://api.gptgod.online',
        basePath: '/v1',
        defaultModel: 'gemini-3.1-flash-image-preview',
        defaultModels: {
            [BANANA_IMAGE_API]: 'gemini-3.1-flash-image-preview',
            [GPT_IMAGE_2_API]: 'gpt-image-2',
        },
        endpoints: {
            generate: '/chat/completions',
            gptImage2Generate: '/images/generations',
            gptImage2Edit: '/images/edits',
            test: '/models',
        },
        supportedImageApis: [BANANA_IMAGE_API, GPT_IMAGE_2_API],
        authType: 'bearer_token',
        requiresAuth: true,
    },
    seedream: {
        id: 'seedream',
        name: 'Seedream',
        type: 'seedream',
        defaultBaseUrl: 'https://ark.cn-beijing.volces.com',
        basePath: '/api/v3',
        defaultModel: 'doubao-seedream-4-5-251128',
        defaultModels: {
            [BANANA_IMAGE_API]: 'doubao-seedream-4-5-251128',
            [GPT_IMAGE_2_API]: '',
        },
        endpoints: {
            generate: '/images/generations',
            gptImage2Generate: null,
            gptImage2Edit: null,
            test: null,
        },
        supportedImageApis: [BANANA_IMAGE_API],
        authType: 'bearer_token',
        requiresAuth: true,
        visibleInUi: false,
    },
    comfyui: {
        id: 'comfyui',
        name: 'Local ComfyUI',
        type: 'comfyui',
        defaultBaseUrl: 'http://127.0.0.1:8188',
        basePath: '',
        defaultModel: 'z_image_turbo_bf16.safetensors',
        defaultModels: {
            [BANANA_IMAGE_API]: 'z_image_turbo_bf16.safetensors',
            [GPT_IMAGE_2_API]: '',
        },
        endpoints: {
            generate: '/prompt',
            gptImage2Generate: null,
            gptImage2Edit: null,
            test: '/system_stats',
        },
        supportedImageApis: [BANANA_IMAGE_API],
        authType: 'none',
        requiresAuth: false,
        visibleInUi: false,
    },
};

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
        this.preferredBaseUrl = config.preferredBaseUrl || config.defaultBaseUrl;
        this.legacyBaseUrls = config.legacyBaseUrls || [];
        this.basePath = config.basePath || '';
        this.defaultModel = config.defaultModel;
        this.defaultModels = config.defaultModels || {
            [BANANA_IMAGE_API]: config.defaultModel,
            [GPT_IMAGE_2_API]: '',
        };
        this.endpoints = config.endpoints;
        this.supportedImageApis = config.supportedImageApis || [BANANA_IMAGE_API];
        this.authType = config.authType;
        this.endpointAuthTypes = config.endpointAuthTypes || {};
        this.requiresAuth = config.requiresAuth;
        this.visibleInUi = config.visibleInUi !== false;
        this.baseUrl = userBaseUrl || this.defaultBaseUrl;
    }

    static normalizeBaseUrl(url) {
        if (!url) return '';
        return url.replace(/\/+$/, '');
    }

    _extractDomain(url) {
        const normalized = ProviderConfig.normalizeBaseUrl(url);

        if (this.basePath && normalized.endsWith(this.basePath)) {
            return normalized.slice(0, -this.basePath.length);
        }

        const apiPathPatterns = [
            '/chat/completions',
            '/images/generations',
            '/images/edits',
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

        return normalized;
    }

    getRequestBaseUrls() {
        const currentDomain = this._extractDomain(this.baseUrl);

        if (this.type !== 'yunwu') {
            return [currentDomain];
        }

        const legacyDomains = this.legacyBaseUrls.map((url) => this._extractDomain(url));
        const uniqueBaseUrls = new Set();

        if (legacyDomains.includes(currentDomain)) {
            uniqueBaseUrls.add(this.preferredBaseUrl);
        }

        uniqueBaseUrls.add(currentDomain);

        if (currentDomain === this.preferredBaseUrl) {
            legacyDomains.forEach((url) => uniqueBaseUrls.add(url));
        }

        return [...uniqueBaseUrls];
    }

    supportsImageApi(imageApiKind) {
        return this.supportedImageApis.includes(imageApiKind);
    }

    getDefaultModel(imageApiKind = BANANA_IMAGE_API) {
        return this.defaultModels[imageApiKind] || '';
    }

    getAuthType(endpointType) {
        return this.endpointAuthTypes[endpointType] || this.authType;
    }

    _buildApiUrlForBase(baseUrl, endpointType, params = {}) {
        const { model, apiKey } = params;
        const domain = this._extractDomain(baseUrl);
        const endpoint = this.endpoints[endpointType];
        const authType = this.getAuthType(endpointType);

        if (endpointType === 'test' && this.type === 'seedream') {
            return null;
        }

        if (!endpoint) {
            return null;
        }

        let fullUrl = domain;

        if (endpoint.startsWith('/v1/')) {
            fullUrl += endpoint;
        } else {
            if (this.basePath) {
                fullUrl += this.basePath;
            }
            fullUrl += endpoint;
        }

        if (model) {
            fullUrl = fullUrl.replace('{model}', model || this.defaultModel);
        }

        if (authType === 'query_param' && apiKey) {
            fullUrl += `?key=${apiKey}`;
        }

        return fullUrl;
    }

    buildApiUrl(endpointType, params = {}) {
        return this._buildApiUrlForBase(this.baseUrl, endpointType, params);
    }

    buildApiUrls(endpointType, params = {}) {
        return [
            ...new Set(
                this.getRequestBaseUrls()
                    .map((baseUrl) => this._buildApiUrlForBase(baseUrl, endpointType, params))
                    .filter(Boolean)
            ),
        ];
    }

    buildHeaders(apiKey, options = {}) {
        const { includeContentType = true, endpointType = null } = options;
        const authType = this.getAuthType(endpointType);
        const headers = {};

        if (includeContentType) {
            headers['Content-Type'] = 'application/json';
        }

        if (authType === 'bearer_token' && apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        return headers;
    }
}

function detectProviderType(name, baseUrl) {
    const nameLower = (name || '').toLowerCase();
    const urlLower = (baseUrl || '').toLowerCase();

    if (
        nameLower === 'gemini' ||
        nameLower.includes('google official') ||
        urlLower.includes('generativelanguage.googleapis.com')
    ) {
        return 'google_official';
    }
    if (nameLower.includes('seedream') || urlLower.includes('ark.cn-beijing.volces.com')) {
        return 'seedream';
    }
    if (nameLower.includes('gptgod') || urlLower.includes('gptgod')) {
        return 'gptgod';
    }
    if (nameLower.includes('openrouter') || urlLower.includes('openrouter.ai')) {
        return 'openrouter';
    }
    if (nameLower.includes('comfyui') || urlLower.includes(':8188')) {
        return 'comfyui';
    }
    return 'yunwu';
}

function getProviderConfig(name, baseUrl) {
    const type = detectProviderType(name, baseUrl);
    return new ProviderConfig(type, baseUrl);
}

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
