const fs = require("uxp").storage.localFileSystem;
const { domains } = require("uxp").storage;

class SettingsManager {
    constructor() {
        this.settings = {
            debug_mode: false,
            save_generated_images: false,
            selected_provider: null,
            latest_prompt: '',       // 最近一次生成使用的prompt
            export_max_size: 2048,  // 导出图片长边最大长度
            export_quality: 80,      // WebP压缩质量
            selection_mode: true,   // 使用选区区域生图
            multi_image_mode: false, // 多图生图模式(仅在Image Edit模式下有效)
            search_web_mode: false   // 搜索网络模式(启用Google Search工具)
        };
        this.loaded = false;
    }

    async load() {
        try {
            const dataFolder = await fs.getDataFolder();
            let entry;
            try {
                entry = await dataFolder.getEntry("settings.json");
            } catch (e) {
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
            console.error("Error loading settings:", e);
        }
    }

    async save() {
        try {
            const dataFolder = await fs.getDataFolder();
            const entry = await dataFolder.createFile("settings.json", { overwrite: true });
            await entry.write(JSON.stringify(this.settings, null, 4));
        } catch (e) {
            console.error("Error saving settings:", e);
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

    async load() {
        try {
            const dataFolder = await fs.getDataFolder();
            let entry;
            try {
                entry = await dataFolder.getEntry("providers.json");
            } catch (e) {
                // File doesn't exist, use defaults
                this.providers = [
                    {
                        "name": "Google Gemini",
                        "apiKey": "",
                        "baseUrl": "https://generativelanguage.googleapis.com/v1beta",
                        "model": "models/gemini-3-pro-image-preview"
                    },
                    {
                        "name": "Yunwu Gemini",
                        "apiKey": "",
                        "baseUrl": "https://yunwu.zeabur.app/v1beta",
                        "model": "gemini-3-pro-image-preview"
                    },
                    {
                        "name": "GPTGod NanoBanana Pro",
                        "apiKey": "",
                        "baseUrl": "https://api.gptgod.online/v1/chat/completions",
                        "model": "gemini-3-pro-image-preview"
                    },
                    {
                        "name": "OpenRouter",
                        "apiKey": "",
                        "baseUrl": "https://openrouter.ai/api/v1/chat/completions",
                        "model": "google/gemini-3-pro-image-preview"
                    }
                ];
                await this.save();
                this.loaded = true;
                return;
            }

            const data = await entry.read();
            this.providers = JSON.parse(data);
            this.loaded = true;
        } catch (e) {
            console.error("Error loading providers:", e);
            this.providers = [];
        }
    }

    async save() {
        try {
            const dataFolder = await fs.getDataFolder();
            const entry = await dataFolder.createFile("providers.json", { overwrite: true });
            await entry.write(JSON.stringify(this.providers, null, 4));
        } catch (e) {
            console.error("Error saving providers:", e);
        }
    }

    getProvider(name) {
        return this.providers.find(p => p.name === name);
    }

    async addProvider(name, apiKey = "", baseUrl = "", model = "") {
        if (this.providers.find(p => p.name === name)) {
            return { success: false, message: "Provider name already exists." };
        }
        this.providers.push({ name, apiKey, baseUrl, model });
        await this.save();
        return { success: true, message: "Provider added." };
    }

    async updateProvider(originalName, apiKey, baseUrl, model) {
        const provider = this.providers.find(p => p.name === originalName);
        if (provider) {
            provider.apiKey = apiKey;
            provider.baseUrl = baseUrl;
            provider.model = model;
            await this.save();
            return { success: true, message: "Provider updated." };
        }
        return { success: false, message: "Provider not found." };
    }

    async deleteProvider(name) {
        const index = this.providers.findIndex(p => p.name === name);
        if (index !== -1) {
            this.providers.splice(index, 1);
            await this.save();
            return { success: true, message: "Provider deleted." };
        }
        return { success: false, message: "Provider not found." };
    }

    getAllNames() {
        return this.providers.map(p => p.name);
    }

    async testConnection(providerConfig) {
        const { apiKey, baseUrl, name } = providerConfig;

        if (!apiKey || !baseUrl) {
            return { success: false, message: "Missing API Key or Base URL." };
        }

        let apiUrl = "";
        const headers = { "Content-Type": "application/json" };

        if (name === "Google Gemini" || name === "Yunwu Gemini") {
            let cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
            apiUrl = `${cleanBaseUrl}/models?key=${apiKey}`;
        } else if (name.toLowerCase().includes("gptgod") || baseUrl.toLowerCase().includes("gptgod")) {
            if (baseUrl.includes("/chat/completions")) {
                apiUrl = baseUrl.replace("/chat/completions", "/models");
            } else {
                let cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
                apiUrl = cleanBaseUrl + "models";
            }
            headers["Authorization"] = `Bearer ${apiKey}`;
        } else if (name.toLowerCase().includes("openrouter") || baseUrl.toLowerCase().includes("openrouter.ai")) {
            if (baseUrl.includes("/chat/completions")) {
                apiUrl = baseUrl.replace("/chat/completions", "/models");
            } else {
                let cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
                apiUrl = cleanBaseUrl + "models";
            }
            headers["Authorization"] = `Bearer ${apiKey}`;
        } else {
            // Custom / OpenAI compatible fallback
            if (baseUrl.includes("v1")) {
                apiUrl = baseUrl;
                if (apiUrl.includes("/chat/completions")) {
                    apiUrl = apiUrl.replace("/chat/completions", "");
                }
                if (!apiUrl.endsWith("/")) {
                    apiUrl += "/";
                }
                apiUrl += "models";
                headers["Authorization"] = `Bearer ${apiKey}`;
            } else {
                return { success: true, message: "Custom provider: Cannot automatically test. Please verify manually." };
            }
        }

        try {
            const response = await fetch(apiUrl, {
                method: "GET",
                headers: headers
            });

            if (response.ok) {
                const data = await response.json();
                if (data.error) {
                    return { success: false, message: `API Error: ${data.error.message || 'Unknown error'}` };
                }
                return { success: true, message: "Connection successful!" };
            } else {
                return { success: false, message: `HTTP Error: ${response.status}` };
            }
        } catch (e) {
            return { success: false, message: `Error: ${e.message}` };
        }
    }
}

module.exports = {
    SettingsManager,
    ProviderManager
};
