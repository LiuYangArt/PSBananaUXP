/**
 * Image Generator - handles AI image generation with multiple providers
 * Supports: Google Gemini, Yunwu, GPTGod, OpenRouter
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

        // Build payload
        const payload = this._buildPayload(
            prompt, 
            aspectRatio, 
            resolution, 
            provider, 
            providerType, 
            mode, 
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
            // OpenAI-compatible (GPTGod, OpenRouter)
            return url;
        }
    }

    /**
     * Build request headers
     */
    _buildHeaders(provider, providerType) {
        const headers = { "Content-Type": "application/json" };

        if (providerType === "gptgod" || providerType === "openrouter") {
            headers["Authorization"] = `Bearer ${provider.apiKey}`;
        }

        return headers;
    }

    /**
     * Build request payload
     */
    _buildPayload(prompt, aspectRatio, resolution, provider, providerType, mode = 'text2img', inputImage = null, sourceImage = null, referenceImage = null) {
        if (providerType === "google_official") {
            return this._buildGooglePayload(prompt, aspectRatio, resolution, mode, inputImage, sourceImage, referenceImage);
        } else if (providerType === "yunwu") {
            return this._buildYunwuPayload(prompt, aspectRatio, resolution, mode, inputImage, sourceImage, referenceImage);
        } else if (providerType === "gptgod") {
            return this._buildGPTGodPayload(prompt, aspectRatio, resolution, provider, mode, inputImage, sourceImage, referenceImage);
        } else if (providerType === "openrouter") {
            return this._buildOpenRouterPayload(prompt, aspectRatio, resolution, provider, mode, inputImage, sourceImage, referenceImage);
        }
    }

    /**
     * Build Google Official Gemini API payload
     */
    _buildGooglePayload(prompt, aspectRatio, resolution, mode = 'text2img', inputImage = null, sourceImage = null, referenceImage = null) {
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

        return {
            contents: [{
                parts: parts
            }],
            generationConfig: generationConfig
        };
    }

    /**
     * Build Yunwu/Gemini-compatible payload
     */
    _buildYunwuPayload(prompt, aspectRatio, resolution, mode = 'text2img', inputImage = null, sourceImage = null, referenceImage = null) {
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

        return {
            contents: [{
                parts: parts
            }],
            generationConfig: generationConfig
        };
    }

    /**
     * Build GPTGod payload (OpenAI-compatible)
     * Resolution handled via model switching
     */
    _buildGPTGodPayload(prompt, aspectRatio, resolution, provider, mode = 'text2img', inputImage = null, sourceImage = null, referenceImage = null) {
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
    }

    /**
     * Build OpenRouter payload
     */
    _buildOpenRouterPayload(prompt, aspectRatio, resolution, provider, mode = 'text2img', inputImage = null, sourceImage = null, referenceImage = null) {
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
        }
    }

    /**
     * Process Gemini/Yunwu response (base64 inline data)
     */
    async _processGeminiResponse(responseData) {
        if (!responseData.candidates || !responseData.candidates[0]) {
            throw new Error("No image in response");
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

        throw new Error("No image found in response");
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
        }

        if (!imageUrl) {
            throw new Error("No image URL found in response");
        }

        // Download image
        return await this.fileManager.downloadImage(imageUrl);
    }

    /**
     * Process OpenRouter response
     */
    async _processOpenRouterResponse(responseData) {
        if (!responseData.choices || !responseData.choices.length === 0) {
            throw new Error("No image in response");
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

        throw new Error("No image found in response");
    }

    /**
     * Get file extension from MIME type
     */
    _getExtensionFromMimeType(mimeType) {
        if (mimeType.includes("webp")) return "webp";
        if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
        return "png";
    }
}

module.exports = { ImageGenerator };
