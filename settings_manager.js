const fs = require('uxp').storage.localFileSystem;
const { getAllProviderConfigs, getProviderConfig } = require('./api_providers');
const { requestAny } = require('./network_client');
const { BANANA_IMAGE_API, GPT_IMAGE_2_API } = require('./aspect_ratio');

class SettingsManager {
    constructor() {
        this.settings = {
            debug_mode: false,
            save_generated_images: false,
            selected_provider: null,
            selected_image_api: BANANA_IMAGE_API,
            latest_prompt: '',
            export_max_size: 2048,
            export_quality: 80,
            selection_mode: true,
            multi_image_mode: false,
            search_web_mode: false,
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
                await this.save();
                this.loaded = true;
                return;
            }

            const data = await entry.read();
            const loadedSettings = JSON.parse(data);
            this.settings = { ...this.settings, ...loadedSettings };
            if (!this.settings.selected_image_api) {
                this.settings.selected_image_api = BANANA_IMAGE_API;
            }
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

    _migrateLegacyGptImage2Model(config, savedModel) {
        if (!savedModel) return null;

        const legacyDefaultGptImage2ModelMap = {
            yunwu: 'gpt-image-2',
        };

        const legacyDefaultModel = legacyDefaultGptImage2ModelMap[config.id];
        if (legacyDefaultModel && savedModel === legacyDefaultModel) {
            return config.defaultModels?.[GPT_IMAGE_2_API] || savedModel;
        }

        return savedModel;
    }

    _migrateLegacyBaseUrl(config, savedBaseUrl) {
        if (!savedBaseUrl) return null;

        const normalizedBaseUrl = savedBaseUrl.replace(/\/+$/, '');
        const legacyBaseUrlMap = {
            yunwu: new Set([
                'https://yunwu.zeabur.app',
                'https://yunwu.zeabur.app/v1beta',
                'https://api3.wlai.vip',
                'https://api3.wlai.vip/v1beta',
            ]),
        };

        if (legacyBaseUrlMap[config.id] && legacyBaseUrlMap[config.id].has(normalizedBaseUrl)) {
            return config.defaultBaseUrl;
        }

        return savedBaseUrl;
    }

    _buildProviderRecord(config, saved = {}) {
        const migratedBaseUrl = this._migrateLegacyBaseUrl(config, saved.baseUrl);
        const migratedLegacyBananaModel = this._migrateLegacyDefaultModel(config, saved.model);
        const migratedLegacyGptImage2Model = this._migrateLegacyGptImage2Model(
            config,
            saved.models?.[GPT_IMAGE_2_API]
        );
        const savedModels = saved.models || {};
        const models = {
            [BANANA_IMAGE_API]:
                savedModels[BANANA_IMAGE_API] ||
                migratedLegacyBananaModel ||
                config.defaultModels?.[BANANA_IMAGE_API] ||
                config.defaultModel,
            [GPT_IMAGE_2_API]:
                migratedLegacyGptImage2Model || config.defaultModels?.[GPT_IMAGE_2_API] || '',
        };

        return {
            name: config.name,
            apiKey: saved.apiKey || (config.id === 'comfyui' ? 'not-needed' : ''),
            baseUrl: migratedBaseUrl || config.defaultBaseUrl,
            model: models[BANANA_IMAGE_API],
            models,
        };
    }

    async load() {
        try {
            const dataFolder = await fs.getDataFolder();
            let entry;
            try {
                entry = await dataFolder.getEntry('providers.json');
            } catch {
                const defaultConfigs = getAllProviderConfigs();
                this.providers = defaultConfigs.map((config) => this._buildProviderRecord(config));
                await this.save();
                this.loaded = true;
                return;
            }

            const data = await entry.read();
            const savedProviders = JSON.parse(data);
            const defaultConfigs = getAllProviderConfigs();
            this.providers = defaultConfigs.map((config) => {
                const saved = savedProviders.find((p) => p.name === config.name) || {};
                return this._buildProviderRecord(config, saved);
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

    getModelForImageApi(provider, imageApiKind = BANANA_IMAGE_API) {
        if (!provider) return '';
        if (provider.models && provider.models[imageApiKind] !== undefined) {
            return provider.models[imageApiKind] || '';
        }
        if (imageApiKind === BANANA_IMAGE_API) {
            return provider.model || '';
        }
        return '';
    }

    async updateProvider(originalName, apiKey, baseUrl, bananaModel, gptImage2Model) {
        const provider = this.providers.find((p) => p.name === originalName);
        if (provider) {
            const config = getProviderConfig(originalName, baseUrl);
            provider.apiKey = apiKey;
            provider.baseUrl = this._migrateLegacyBaseUrl(config, baseUrl) || baseUrl;
            provider.models = {
                [BANANA_IMAGE_API]: bananaModel,
                [GPT_IMAGE_2_API]: gptImage2Model,
            };
            provider.model = bananaModel;
            await this.save();
            return { success: true, message: 'Provider updated.' };
        }
        return { success: false, message: 'Provider not found.' };
    }

    getAllNames() {
        return this.providers
            .filter(
                (provider) =>
                    getProviderConfig(provider.name, provider.baseUrl).visibleInUi !== false
            )
            .map((provider) => provider.name);
    }

    async testConnection(providerConfig) {
        const { apiKey, baseUrl, name, model } = providerConfig;

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
            const config = getProviderConfig(name, baseUrl);

            if (config.type === 'seedream') {
                return { success: true, messageKey: 'msg_seedream_test_success' };
            }

            const apiUrls = config.buildApiUrls('test', { model, apiKey });
            const headers = config.buildHeaders(apiKey, { endpointType: 'test' });

            await logToFile(`Provider type: ${config.type}`);
            await logToFile(`API URLs: ${apiUrls.join(', ')}`);

            await logToFile('Attempting network request...');
            const { response, url, attempts } = await requestAny(apiUrls, {
                method: 'GET',
                headers,
            });

            if (attempts.length > 0) {
                await logToFile(`Fallback attempts: ${JSON.stringify(attempts)}`);
            }

            await logToFile(`Request succeeded - URL: ${url}, Status: ${response.status}`);

            if (response.ok) {
                const data = await response.json();
                if (data.error) {
                    return {
                        success: false,
                        message: `API Error: ${data.error.message || 'Unknown error'}`,
                    };
                }
                return { success: true, message: 'Connection successful!' };
            }

            if (config.type === 'yunwu' && response.status === 404) {
                return {
                    success: true,
                    message:
                        'Connection reachable. Yunwu model list endpoint is unavailable on this host, generation endpoint will be used.',
                };
            }

            const errorText = await response.text();
            return {
                success: false,
                message: errorText
                    ? `HTTP Error: ${response.status} - ${errorText.substring(0, 200)}`
                    : `HTTP Error: ${response.status}`,
            };
        } catch (e) {
            return {
                success: false,
                message: e?.message || String(e) || 'Unknown error',
            };
        }
    }
}

module.exports = { SettingsManager, ProviderManager };
