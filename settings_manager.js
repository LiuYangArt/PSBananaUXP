const fs = require('uxp').storage.localFileSystem;
const { getAllProviderConfigs, getProviderConfig } = require('./api_providers');

class SettingsManager {
    constructor() {
        this.settings = {
            debug_mode: false,
            save_generated_images: false,
            selected_provider: null,
            latest_prompt: '', // 最近一次生成使用的prompt
            export_max_size: 2048, // 导出图片长边最大长度
            export_quality: 80, // WebP压缩质量
            selection_mode: true, // 使用选区区域生图
            multi_image_mode: false, // 多图生图模式(仅在Image Edit模式下有效)
            search_web_mode: false, // 搜索网络模式(启用Google Search工具)
        };
        this.loaded = false;
    }

    async load() {
        try {
            const dataFolder = await fs.getDataFolder();
            let entry;
            try {
                entry = await dataFolder.getEntry('settings.json');
            } catch {
                // File doesn't exist
                await this.save();
                this.loaded = true;
                return;
            }

            const data = await entry.read();
            const loadedSettings = JSON.parse(data);
            this.settings = { ...this.settings, ...loadedSettings };
            this.loaded = true;
        } catch (e) {
            console.error('Error loading settings:', e);
        }
    }

    async save() {
        try {
            const dataFolder = await fs.getDataFolder();
            const entry = await dataFolder.createFile('settings.json', { overwrite: true });
            await entry.write(JSON.stringify(this.settings, null, 4));
        } catch (e) {
            console.error('Error saving settings:', e);
        }
    }

    get(key, defaultValue = null) {
        return this.settings[key] !== undefined ? this.settings[key] : defaultValue;
    }

    async set(key, value) {
        this.settings[key] = value;
        await this.save();
    }
}

class ProviderManager {
    constructor() {
        this.providers = [];
        this.loaded = false;
    }

    /**
     * 迁移历史默认模型到新默认模型
     * 仅在用户未自定义（仍是旧默认值）时替换
     */
    _migrateLegacyDefaultModel(config, savedModel) {
        if (!savedModel) return null;

        const legacyDefaultModelMap = {
            openrouter: 'google/gemini-3-pro-image-preview',
            gptgod: 'gemini-3-pro-image-preview',
        };

        const legacyDefaultModel = legacyDefaultModelMap[config.id];
        if (legacyDefaultModel && savedModel === legacyDefaultModel) {
            return config.defaultModel;
        }

        return savedModel;
    }

    async load() {
        try {
            const dataFolder = await fs.getDataFolder();
            let entry;
            try {
                entry = await dataFolder.getEntry('providers.json');
            } catch {
                // File doesn't exist, initialize with default provider configs
                const defaultConfigs = getAllProviderConfigs();
                this.providers = defaultConfigs.map((config) => ({
                    name: config.name,
                    apiKey: config.id === 'comfyui' ? 'not-needed' : '',
                    baseUrl: config.defaultBaseUrl,
                    model: config.defaultModel,
                }));
                await this.save();
                this.loaded = true;
                return;
            }

            const data = await entry.read();
            const savedProviders = JSON.parse(data);

            // 合并保存的配置和默认配置
            // 确保所有预定义的 providers 都存在
            const defaultConfigs = getAllProviderConfigs();
            this.providers = defaultConfigs.map((config) => {
                const saved = savedProviders.find((p) => p.name === config.name);
                const migratedModel = this._migrateLegacyDefaultModel(config, saved?.model);
                return {
                    name: config.name,
                    apiKey: saved?.apiKey || (config.id === 'comfyui' ? 'not-needed' : ''),
                    baseUrl: saved?.baseUrl || config.defaultBaseUrl,
                    model: migratedModel || config.defaultModel,
                };
            });

            this.loaded = true;
        } catch (e) {
            console.error('Error loading providers:', e);
            this.providers = [];
        }
    }

    async save() {
        try {
            const dataFolder = await fs.getDataFolder();
            const entry = await dataFolder.createFile('providers.json', { overwrite: true });
            await entry.write(JSON.stringify(this.providers, null, 4));
        } catch (e) {
            console.error('Error saving providers:', e);
        }
    }

    getProvider(name) {
        return this.providers.find((p) => p.name === name);
    }

    async updateProvider(originalName, apiKey, baseUrl, model) {
        const provider = this.providers.find((p) => p.name === originalName);
        if (provider) {
            provider.apiKey = apiKey;
            provider.baseUrl = baseUrl;
            provider.model = model;
            await this.save();
            return { success: true, message: 'Provider updated.' };
        }
        return { success: false, message: 'Provider not found.' };
    }

    getAllNames() {
        return this.providers.map((p) => p.name);
    }

    async testConnection(providerConfig) {
        const { apiKey, baseUrl, name, model } = providerConfig;

        // 日志输出函数 - 写入文件
        const logToFile = async (message) => {
            console.log(`[TestConnection] ${message}`);
            try {
                const dataFolder = await fs.getDataFolder();
                const logFile = await dataFolder.createFile('connection_test.log', {
                    overwrite: true,
                });
                const timestamp = new Date().toISOString();
                await logFile.write(`[${timestamp}] ${message}`);
            } catch (e) {
                console.error('Failed to write log:', e);
            }
        };

        await logToFile(`Testing connection - Name: ${name}, BaseUrl: ${baseUrl}`);

        if (!apiKey || !baseUrl) {
            await logToFile('Error: Missing API Key or Base URL');
            return { success: false, message: 'Missing API Key or Base URL.' };
        }

        try {
            // 使用 ProviderConfig 构建 URL 和 headers
            const config = getProviderConfig(name, baseUrl);

            // Seedream 特殊处理:不支持测试端点
            if (config.type === 'seedream') {
                return { success: true, messageKey: 'msg_seedream_test_success' };
            }

            const apiUrl = config.buildApiUrl('test', { model, apiKey });
            const headers = config.buildHeaders(apiKey);

            await logToFile(`Provider type: ${config.type}`);
            await logToFile(`API URL: ${apiUrl}`);

            // 发送测试请求
            await logToFile('Attempting real fetch...');
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: headers,
            });

            await logToFile(`Fetch succeeded - Status: ${response.status}`);

            if (response.ok) {
                const data = await response.json();
                if (data.error) {
                    return {
                        success: false,
                        message: `API Error: ${data.error.message || 'Unknown error'}`,
                    };
                }
                return { success: true, message: 'Connection successful!' };
            } else {
                return { success: false, message: `HTTP Error: ${response.status}` };
            }
        } catch (e) {
            await logToFile(`Fetch FAILED: ${e.message}`);
            return { success: false, message: `Error: ${e.message}` };
        }
    }
}

module.exports = {
    SettingsManager,
    ProviderManager,
};
