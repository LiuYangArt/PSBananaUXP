/**
 * Image Generator - handles AI image generation with multiple providers
 * Supports: Google Gemini, Yunwu, GPTGod, OpenRouter, Seedream
 */
class ImageGenerator {
    constructor(fileManager) {
        this.fileManager = fileManager;
    }

    /**
     * Generate image from prompt
     * @param {Object} options
     * @param {string} options.prompt - Text prompt
     * @param {Object} options.provider - Provider config (apiKey, baseUrl, model, name)
     * @param {string} options.aspectRatio - Aspect ratio (e.g., "16:9")
     * @param {string} options.resolution - Resolution (1K, 2K, 4K)
     * @param {boolean} options.debugMode - Save debug files
     * @param {string} options.mode - Generation mode ('text2img' or 'imgedit')
     * @param {boolean} options.searchWeb - Enable Google Search tool
     * @param {string} options.inputImage - Base64 encoded input image (for image edit mode)
     * @param {string} options.sourceImage - Base64 encoded source image (多图模式)
     * @param {string} options.referenceImage - Base64 encoded reference image (多图模式)
     * @returns {Promise<File>} - UXP File object of generated image
     */
    async generate(options) {
        const { 
            prompt, 
            provider, 
            aspectRatio, 
            resolution, 
            debugMode, 
            mode = 'text2img',
            searchWeb = false,
            inputImage,
            sourceImage,
            referenceImage
        } = options;

        if (!provider || !provider.apiKey || !provider.baseUrl) {
            throw new Error("Invalid provider configuration");
        }

        // Detect provider type
        const providerType = this._detectProviderType(provider);
        console.log(`[DEBUG] Provider type detected: ${providerType}`);
        console.log(`[DEBUG] Generation mode: ${mode}`);
        console.log(`[DEBUG] Search web mode: ${searchWeb}`);

        // Build payload
        const payload = this._buildPayload(
            prompt, 
            aspectRatio, 
            resolution, 
            provider, 
            providerType, 
            mode,
            searchWeb,
            inputImage,
            sourceImage,
            referenceImage
        );
        const apiUrl = this._buildApiUrl(provider, providerType);
        const headers = this._buildHeaders(provider, providerType);

        console.log(`[DEBUG] API URL: ${apiUrl}`);
        console.log(`[DEBUG] Headers:`, headers);
        console.log(`[DEBUG] Payload:`, JSON.stringify(payload, null, 2));

        // Debug: Save payload
        if (debugMode) {
            await this.fileManager.savePayload(payload, provider.name);
        }

        try {
            // Make API request
            const response = await fetch(apiUrl, {
                method: "POST",
                headers: headers,
                body: JSON.stringify(payload)
            });

            console.log(`[DEBUG] Response status: ${response.status} ${response.statusText}`);

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[DEBUG] Error response:`, errorText);
                
                if (debugMode) {
                    await this.fileManager.saveLog(
                        `=== HTTP Error ===\n` +
                        `Time: ${new Date().toISOString()}\n` +
                        `Provider: ${provider.name}\n` +
                        `URL: ${apiUrl}\n` +
                        `Status: ${response.status} ${response.statusText}\n` +
                        `Response: ${errorText}\n`
                    );
                }
                
                throw new Error(`HTTP Error: ${response.status} - ${errorText.substring(0, 200)}`);
            }

            const responseData = await response.json();
            console.log(`[DEBUG] Response data:`, JSON.stringify(responseData, null, 2));

            // Debug: Save response
            if (debugMode) {
                await this.fileManager.saveResponse(responseData, provider.name);
            }

            // Process response and download/save image
            return await this._processResponse(responseData, providerType);

        } catch (e) {
            console.error("Image generation failed:", e);
            
            if (debugMode) {
                await this.fileManager.saveLog(
                    `=== Generation Error ===\n` +
                    `Time: ${new Date().toISOString()}\n` +
                    `Provider: ${provider.name} (${providerType})\n` +
                    `Prompt: ${prompt}\n` +
                    `Resolution: ${resolution}\n` +
                    `Aspect Ratio: ${aspectRatio}\n` +
                    `Error: ${e.message}\n` +
                    `Stack: ${e.stack}\n`
                );
            }
            
            throw new Error(`Generation failed: ${e.message}`);
        }
    }

    /**
     * Detect provider type from config
     */
    _detectProviderType(provider) {
        const { name, baseUrl } = provider;
        const nameLower = (name || "").toLowerCase();
        const urlLower = (baseUrl || "").toLowerCase();

        if (urlLower.includes("generativelanguage.googleapis.com")) {
            return "google_official";
        } else if (nameLower.includes("seedream") || urlLower.includes("ark.cn-beijing.volces.com")) {
            return "seedream";
        } else if (nameLower.includes("gptgod") || urlLower.includes("gptgod")) {
            return "gptgod";
        } else if (nameLower.includes("openrouter") || urlLower.includes("openrouter.ai")) {
            return "openrouter";
        } else {
            // Default to Yunwu/Gemini-compatible format
            return "yunwu";
        }
    }

    /**
     * Build API URL
     */
    _buildApiUrl(provider, providerType) {
        const { apiKey, baseUrl, model } = provider;
        let url = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;

        if (providerType === "google_official" || providerType === "yunwu") {
            return `${url}/models/${model}:generateContent?key=${apiKey}`;
        } else {
            // OpenAI-compatible (GPTGod, OpenRouter, Seedream)
            return url;
        }
    }

    /**
     * Build request headers
     */
    _buildHeaders(provider, providerType) {
        const headers = { "Content-Type": "application/json" };

        if (providerType === "gptgod" || providerType === "openrouter" || providerType === "seedream") {
            headers["Authorization"] = `Bearer ${provider.apiKey}`;
        }

        return headers;
    }

    /**
     * Build request payload
     */
    _buildPayload(prompt, aspectRatio, resolution, provider, providerType, mode = 'text2img', searchWeb = false, inputImage = null, sourceImage = null, referenceImage = null) {
        if (providerType === "google_official") {
            return this._buildGooglePayload(prompt, aspectRatio, resolution, mode, searchWeb, inputImage, sourceImage, referenceImage);
        } else if (providerType === "yunwu") {
            return this._buildYunwuPayload(prompt, aspectRatio, resolution, mode, searchWeb, inputImage, sourceImage, referenceImage);
        } else if (providerType === "gptgod") {
            return this._buildGPTGodPayload(prompt, aspectRatio, resolution, provider, mode, searchWeb, inputImage, sourceImage, referenceImage);
        } else if (providerType === "openrouter") {
            return this._buildOpenRouterPayload(prompt, aspectRatio, resolution, provider, mode, searchWeb, inputImage, sourceImage, referenceImage);
        } else if (providerType === "seedream") {
            return this._buildSeedreamPayload(prompt, aspectRatio, resolution, provider, mode, searchWeb, inputImage, sourceImage, referenceImage);
        }
    }

    /**
     * Build Google Official Gemini API payload
     */
    _buildGooglePayload(prompt, aspectRatio, resolution, mode = 'text2img', searchWeb = false, inputImage = null, sourceImage = null, referenceImage = null) {
        const generationConfig = {
            response_modalities: ["IMAGE"],
            image_config: {
                aspect_ratio: aspectRatio
            }
        };

        if (resolution) {
            generationConfig.image_config.image_size = resolution;
        }

        // 构建content parts
        const parts = [];
        
        // 多图模式: 添加system prompt和多张图片
        if (sourceImage || referenceImage) {
            let systemPrompt = "";
            let imageCount = 0;
            
            // 注意：图片顺序是 Reference -> Source
            if (referenceImage) {
                imageCount++;
                systemPrompt += `Image ${imageCount} is the Reference Layer (use this for style/content reference). `;
            }
            
            if (sourceImage) {
                imageCount++;
                systemPrompt += `Image ${imageCount} is the Source Layer (the content to be modified). `;
            }
            
            // 添加system prompt和用户prompt（prompt在最前面）
            parts.push({ text: `System Instruction: ${systemPrompt}\n\nUser Prompt: ${prompt}` });
            
            // 添加图片（顺序: Reference -> Source）
            if (referenceImage) {
                parts.push({
                    inlineData: {
                        mimeType: "image/webp",
                        data: referenceImage
                    }
                });
            }
            
            if (sourceImage) {
                parts.push({
                    inlineData: {
                        mimeType: "image/webp",
                        data: sourceImage
                    }
                });
            }
        }
        // 单图模式: 与之前一致
        else if (mode === 'imgedit' && inputImage) {
            parts.push({
                inlineData: {
                    mimeType: "image/png",
                    data: inputImage
                }
            });
            parts.push({ text: prompt });
        }
        // 文本生图模式
        else {
            parts.push({ text: prompt });
        }

        const payload = {
            contents: [{
                parts: parts
            }],
            generationConfig: generationConfig
        };

        // 如果启用了搜索网络模式，添加google_search工具
        if (searchWeb) {
            payload.generationConfig.tools = [{ google_search: {} }];
        }

        return payload;
    }

    /**
     * Build Yunwu/Gemini-compatible payload
     */
    _buildYunwuPayload(prompt, aspectRatio, resolution, mode = 'text2img', searchWeb = false, inputImage = null, sourceImage = null, referenceImage = null) {
        const generationConfig = {
            responseModalities: ["image"],
            imageConfig: {
                aspectRatio: aspectRatio
            }
        };

        if (resolution) {
            generationConfig.imageConfig.imageSize = resolution;
        }

        // 构建content parts
        const parts = [];
        
        // 多图模式: 添加system prompt和多张图片
        if (sourceImage || referenceImage) {
            let systemPrompt = "";
            let imageCount = 0;
            
            // 注意：图片顺序是 Reference -> Source
            if (referenceImage) {
                imageCount++;
                systemPrompt += `Image ${imageCount} is the Reference Layer (use this for style/content reference). `;
            }
            
            if (sourceImage) {
                imageCount++;
                systemPrompt += `Image ${imageCount} is the Source Layer (the content to be modified). `;
            }
            
            // 添加system prompt和用户prompt（prompt在最前面）
            parts.push({ text: `System Instruction: ${systemPrompt}\n\nUser Prompt: ${prompt}` });
            
            // 添加图片（顺序: Reference -> Source）
            if (referenceImage) {
                parts.push({
                    inlineData: {
                        mimeType: "image/webp",
                        data: referenceImage
                    }
                });
            }
            
            if (sourceImage) {
                parts.push({
                    inlineData: {
                        mimeType: "image/webp",
                        data: sourceImage
                    }
                });
            }
        }
        // 单图模式: 与之前一致
        else if (mode === 'imgedit' && inputImage) {
            parts.push({
                inlineData: {
                    mimeType: "image/png",
                    data: inputImage
                }
            });
            parts.push({ text: prompt });
        }
        // 文本生图模式
        else {
            parts.push({ text: prompt });
        }

        const payload = {
            contents: [{
                parts: parts
            }],
            generationConfig: generationConfig
        };

        // 如果启用了搜索网络模式，添加googleSearch工具
        if (searchWeb) {
            payload.generationConfig.tools = [{ googleSearch: {} }];
        }

        return payload;
    }

    /**
     * Build GPTGod payload (OpenAI-compatible)
     * Resolution handled via model switching
     * Note: GPTGod may not support google_search tool for image generation
     */
    _buildGPTGodPayload(prompt, aspectRatio, resolution, provider, mode = 'text2img', searchWeb = false, inputImage = null, sourceImage = null, referenceImage = null) {
        let model = provider.model;

        // Auto-switch model for resolution if using default gptgod model
        if (provider.baseUrl.includes("gptgod.online") && model === "gemini-3-pro-image-preview") {
            if (resolution === "2K") {
                model = "gemini-3-pro-image-preview-2k";
            } else if (resolution === "4K") {
                model = "gemini-3-pro-image-preview-4k";
            }
        }

        // Append aspect ratio to prompt (GPTGod requires newline + "Aspect Ratio:" format)
        let finalPrompt = prompt;
        if (aspectRatio && aspectRatio !== "1:1") {
            finalPrompt += "\nAspect Ratio: " + aspectRatio;
        }

        // 构建content
        const content = [];
        
        // 多图模式: 添加图片注释到prompt并添加图片
        if (sourceImage || referenceImage) {
            let imageAnnotations = "";
            let imageIndex = 0;
            
            // 注意：图片顺序是 Reference -> Source
            // 先添加文本prompt和图片注释（在最前面）
            if (referenceImage) {
                imageIndex++;
                imageAnnotations += `\n[Attached Image ${imageIndex}: Reference]`;
            }
            
            if (sourceImage) {
                imageIndex++;
                imageAnnotations += `\n[Attached Image ${imageIndex}: Source]`;
            }
            
            // 添加文本prompt和图片注释（在最前面）
            content.push({ type: "text", text: finalPrompt + imageAnnotations });
            
            // 按顺序添加图片（Reference -> Source）
            if (referenceImage) {
                content.push({
                    type: "image_url",
                    image_url: {
                        url: `data:image/webp;base64,${referenceImage}`
                    }
                });
            }
            
            if (sourceImage) {
                content.push({
                    type: "image_url",
                    image_url: {
                        url: `data:image/webp;base64,${sourceImage}`
                    }
                });
            }
        }
        // 单图模式: 与之前一致
        else if (mode === 'imgedit' && inputImage) {
            content.push({
                type: "image_url",
                image_url: {
                    url: `data:image/png;base64,${inputImage}`
                }
            });
            content.push({ type: "text", text: finalPrompt });
        }
        // 文本生图模式
        else {
            content.push({ type: "text", text: finalPrompt });
        }

        return {
            model: model,
            messages: [{
                role: "user",
                content: content
            }],
            stream: false
        };
        // 注：GPTGod的OpenAI兼容格式可能不支持google_search工具，忽略searchWeb参数
    }

    /**
     * Build OpenRouter payload
     * Note: OpenRouter may not support google_search tool for image generation
     */
    _buildOpenRouterPayload(prompt, aspectRatio, resolution, provider, mode = 'text2img', searchWeb = false, inputImage = null, sourceImage = null, referenceImage = null) {
        const imageConfig = {
            aspect_ratio: aspectRatio
        };

        if (resolution) {
            imageConfig.image_size = resolution;
        }

        // 构建message content
        let messageContent;
        
        // 多图模式: 使用数组格式
        if (sourceImage || referenceImage) {
            messageContent = [];
            
            // 先添加文本prompt（在最前面）
            messageContent.push({
                type: "text",
                text: prompt
            });
            
            // 注意：图片顺序是 Reference -> Source
            if (referenceImage) {
                messageContent.push({
                    type: "image_url",
                    image_url: {
                        url: `data:image/webp;base64,${referenceImage}`
                    }
                });
            }
            
            if (sourceImage) {
                messageContent.push({
                    type: "image_url",
                    image_url: {
                        url: `data:image/webp;base64,${sourceImage}`
                    }
                });
            }
        }
        // 单图模式: 与之前一致
        else if (mode === 'imgedit' && inputImage) {
            messageContent = [
                {
                    type: "image_url",
                    image_url: {
                        url: `data:image/png;base64,${inputImage}`
                    }
                },
                {
                    type: "text",
                    text: prompt
                }
            ];
        }
        // 文本生图模式: 直接使用字符串
        else {
            messageContent = prompt;
        }

        return {
            model: provider.model,
            messages: [{
                role: "user",
                content: messageContent
            }],
            modalities: ["image", "text"],
            image_config: imageConfig
        };
        // 注：OpenRouter的格式可能不支持google_search工具，忽略searchWeb参数
    }

    /**
     * Build Seedream payload
     * 根据Seedream API文档构建请求
     * - Seedream 4.5: 支持 2K/4K，不支持 1K
     * - Seedream 4.0: 支持 1K/2K/4K
     * - Seedream 3.0: 支持 1K/2K
     * - 图片通过 base64 或 URL 传递
     * - 需要在 prompt 中描述宽高比
     * Note: Seedream does not support google_search tool
     */
    _buildSeedreamPayload(prompt, aspectRatio, resolution, provider, mode = 'text2img', searchWeb = false, inputImage = null, sourceImage = null, referenceImage = null) {
        // 在 prompt 中添加宽高比描述 (类似 GPTGod)
        let finalPrompt = prompt;
        if (aspectRatio && aspectRatio !== "1:1") {
            // Seedream 推荐在 prompt 中自然语言描述宽高比
            const ratioDescription = this._getAspectRatioDescription(aspectRatio);
            finalPrompt += `. ${ratioDescription}`;
        }

        // 处理分辨率：Seedream 4.5 不支持 1K
        let finalSize = resolution || "2K";
        const modelLower = (provider.model || "").toLowerCase();
        
        // 检查是否是 Seedream 4.5 模型
        if (modelLower.includes("4-5") || modelLower.includes("4.5")) {
            // Seedream 4.5 只支持 2K 和 4K
            if (finalSize === "1K") {
                console.warn("[Seedream] Model 4.5 does not support 1K, using 2K instead");
                finalSize = "2K";
            }
        }

        const payload = {
            model: provider.model,
            prompt: finalPrompt,
            size: finalSize,
            watermark: false  // 默认不添加水印
        };

        // 图生图模式: 添加图片
        // Seedream 支持单张图片输入 (image字段)
        // 多图模式: 只使用第一张图片 (优先使用 sourceImage)
        if (mode === 'imgedit' && inputImage) {
            // 使用 base64 格式 (文档支持)
            payload.image = `data:image/png;base64,${inputImage}`;
        } else if (sourceImage) {
            // 多图模式: 优先使用 source 图片
            payload.image = `data:image/webp;base64,${sourceImage}`;
            // 如果有 reference 图片，在 prompt 中说明
            if (referenceImage) {
                finalPrompt = `[Style Reference: See attached image] ${finalPrompt}`;
                payload.prompt = finalPrompt;
            }
        } else if (referenceImage) {
            // 只有 reference 图片时使用它
            payload.image = `data:image/webp;base64,${referenceImage}`;
        }

        return payload;
    }

    /**
     * Get aspect ratio description for Seedream prompt
     * 获取宽高比的自然语言描述
     */
    _getAspectRatioDescription(aspectRatio) {
        const ratioMap = {
            "16:9": "Aspect ratio 16:9, wide landscape format",
            "9:16": "Aspect ratio 9:16, tall portrait format",
            "4:3": "Aspect ratio 4:3, landscape format",
            "3:4": "Aspect ratio 3:4, portrait format",
            "21:9": "Aspect ratio 21:9, ultra-wide format",
            "3:2": "Aspect ratio 3:2, landscape format",
            "2:3": "Aspect ratio 2:3, portrait format",
            "1:1": "Aspect ratio 1:1, square format"
        };
        return ratioMap[aspectRatio] || `Aspect ratio ${aspectRatio}`;
    }

    /**
     * Process API response and return image file
     */
    async _processResponse(responseData, providerType) {
        if (providerType === "google_official" || providerType === "yunwu") {
            return await this._processGeminiResponse(responseData);
        } else if (providerType === "gptgod") {
            return await this._processGPTGodResponse(responseData);
        } else if (providerType === "openrouter") {
            return await this._processOpenRouterResponse(responseData);
        } else if (providerType === "seedream") {
            return await this._processSeedreamResponse(responseData);
        }
    }

    /**
     * Process Gemini/Yunwu response (base64 inline data)
     */
    async _processGeminiResponse(responseData) {
        if (!responseData.candidates || !responseData.candidates[0]) {
            // 提取服务器返回的文字内容
            const serverMessage = this._extractServerMessage(responseData);
            throw new Error(`No image generated. ${serverMessage}`);
        }

        const parts = responseData.candidates[0].content.parts;
        for (const part of parts) {
            if (part.inlineData) {
                const base64Data = part.inlineData.data;
                const mimeType = part.inlineData.mimeType || "image/png";
                const extension = this._getExtensionFromMimeType(mimeType);

                return await this.fileManager.saveImageFromBase64(base64Data, extension);
            }
        }

        // 如果有parts但没有图片，尝试提取文字内容
        const textContent = this._extractTextFromParts(parts);
        const errorMsg = textContent ? `No image. AI response: ${textContent}` : "No image generated";
        throw new Error(errorMsg);
    }

    /**
     * Process GPTGod response (URL in various formats)
     */
    async _processGPTGodResponse(responseData) {
        let imageUrl = null;

        // Check direct image field
        if (responseData.image) {
            imageUrl = responseData.image;
        }
        // Check images array
        else if (responseData.images && responseData.images.length > 0) {
            imageUrl = responseData.images[0];
        }
        // Check choices format
        else if (responseData.choices && responseData.choices.length > 0) {
            const content = responseData.choices[0].message.content;

            // Extract URL from markdown or plain text
            const urlMatch = content.match(/!\[.*?\]\((https?:\/\/[^)]+)\)/);
            if (urlMatch) {
                imageUrl = urlMatch[1];
            } else {
                const plainUrlMatch = content.match(/(https?:\/\/[^\s]+\.(png|jpg|jpeg|webp))/i);
                if (plainUrlMatch) {
                    imageUrl = plainUrlMatch[1];
                }
            }

            // 如果没有找到URL，尝试从content中提取文字信息
            if (!imageUrl && typeof content === 'string') {
                const serverMessage = this._extractServerMessage(responseData);
                throw new Error(`No image generated. ${serverMessage}`);
            }
        }

        if (!imageUrl) {
            const serverMessage = this._extractServerMessage(responseData);
            throw new Error(`No image generated. ${serverMessage}`);
        }

        // Download image
        return await this.fileManager.downloadImage(imageUrl);
    }

    /**
     * Process OpenRouter response
     */
    async _processOpenRouterResponse(responseData) {
        if (!responseData.choices || !responseData.choices.length === 0) {
            const serverMessage = this._extractServerMessage(responseData);
            throw new Error(`No image generated. ${serverMessage}`);
        }

        const message = responseData.choices[0].message;

        // Check for images array
        if (message.images && message.images.length > 0) {
            const imageInfo = message.images[0];
            if (imageInfo.image_url && imageInfo.image_url.url) {
                const url = imageInfo.image_url.url;

                // Check if it's a data URL or HTTP URL
                if (url.startsWith("data:image")) {
                    const base64Data = url.split(";base64,")[1];
                    const mimeType = url.match(/data:(image\/[^;]+)/)[1];
                    const extension = this._getExtensionFromMimeType(mimeType);
                    return await this.fileManager.saveImageFromBase64(base64Data, extension);
                } else {
                    return await this.fileManager.downloadImage(url);
                }
            }
        }

        const serverMessage = this._extractServerMessage(responseData);
        throw new Error(`No image generated. ${serverMessage}`);
    }

    /**
     * Process Seedream response (URL format)
     * Seedream 返回格式: { data: [{ url: "...", size: "1760x2368" }], usage: {...} }
     */
    async _processSeedreamResponse(responseData) {
        // 检查是否有 data 数组
        if (!responseData.data || !Array.isArray(responseData.data) || responseData.data.length === 0) {
            const serverMessage = this._extractServerMessage(responseData);
            throw new Error(`No image generated. ${serverMessage}`);
        }

        // 获取第一张图片的 URL
        const imageData = responseData.data[0];
        if (!imageData.url) {
            throw new Error("No image URL in Seedream response");
        }

        // 下载图片
        return await this.fileManager.downloadImage(imageData.url);
    }

    /**
     * Get file extension from MIME type
     */
    _getExtensionFromMimeType(mimeType) {
        if (mimeType.includes("webp")) return "webp";
        if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
        return "png";
    }

    /**
     * Extract text content from parts array (Gemini/Yunwu format)
     */
    _extractTextFromParts(parts) {
        if (!parts || !Array.isArray(parts)) return '';
        
        const textParts = parts
            .filter(part => part.text)
            .map(part => part.text)
            .join(' ');
        
        return textParts.trim();
    }

    /**
     * Extract server message from response data
     * 从响应数据中提取服务器返回的文字内容
     */
    _extractServerMessage(responseData) {
        try {
            // Gemini/Yunwu format: candidates[0].content.parts[].text
            if (responseData.candidates && responseData.candidates[0]) {
                const parts = responseData.candidates[0].content?.parts;
                if (parts) {
                    const textContent = this._extractTextFromParts(parts);
                    if (textContent) return `Server message: ${textContent}`;
                }
            }

            // OpenAI/GPTGod format: choices[0].message.content
            if (responseData.choices && responseData.choices[0]) {
                const content = responseData.choices[0].message?.content;
                if (content && typeof content === 'string') {
                    return `Server message: ${content}`;
                }
            }

            // Error message in response
            if (responseData.error) {
                const errorMsg = typeof responseData.error === 'string' 
                    ? responseData.error 
                    : responseData.error.message || JSON.stringify(responseData.error);
                
                // Seedream API 特殊错误提示
                if (errorMsg.includes('AuthenticationError') || errorMsg.includes('API key')) {
                    return `认证错误: ${errorMsg}

请检查:
1. API Key 是否正确填写
2. 是否选择了正确的 Provider (Seedream 4.5)
3. Base URL 是否为: https://ark.cn-beijing.volces.com/api/v3/images/generations`;
                }
                
                // Seedream 分辨率参数错误
                if (errorMsg.includes('size') && (errorMsg.includes('not supported') || errorMsg.includes('not valid'))) {
                    return `分辨率参数错误: ${errorMsg}

提示:
- Seedream 4.5 仅支持 2K 和 4K，不支持 1K
- 请在插件中选择 2K 或 4K 分辨率
- 或使用 Seedream 4.0 模型（支持 1K）`;
                }
                
                return `Error: ${errorMsg}`;
            }

            // Fallback: return truncated JSON
            const jsonStr = JSON.stringify(responseData);
            const truncated = jsonStr.length > 200 ? jsonStr.substring(0, 200) + '...' : jsonStr;
            return `Response: ${truncated}`;
        } catch (e) {
            return 'Unable to parse server response';
        }
    }
}

module.exports = { ImageGenerator };
