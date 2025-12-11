/**
 * Image Generator - handles AI image generation with multiple providers
 * Supports: Google Gemini, Yunwu, GPTGod, OpenRouter, Seedream, ComfyUI
 */
const { Z_IMAGE_TURBO_WORKFLOW, QWEN_IMAGE_EDIT_WORKFLOW } = require('./workflow_templates.js');

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
        const payload = await this._buildPayload(
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
            return await this._processResponse(responseData, providerType, provider);

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
        } else if (nameLower.includes("comfyui") || urlLower.includes(":8188")) {
            return "comfyui";
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
        } else if (providerType === "comfyui") {
            // ComfyUI uses /prompt for queuing
            return `${url}/prompt`;
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
        } else if (providerType === "comfyui") {
            return this._buildComfyUIPayload(prompt, aspectRatio, resolution, provider, mode, inputImage, sourceImage, referenceImage);
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
     * Build ComfyUI payload
     * Uses Z-Image for text2img and Qwen Image Edit for imgedit mode.
     */
    async _buildComfyUIPayload(prompt, aspectRatio, resolution, provider, mode = 'text2img', inputImage = null, sourceImage = null, referenceImage = null) {
        // Calculate dimensions
        const { width, height } = this._getPixelDimensions(resolution, aspectRatio);
        const seed = Math.floor(Math.random() * 1000000000);
        const baseUrl = provider.baseUrl.endsWith("/") ? provider.baseUrl.slice(0, -1) : provider.baseUrl;

        let workflow;

        if (mode === 'imgedit' && (inputImage || sourceImage)) {
            // === Image Edit Mode: Use Qwen Image Edit Workflow ===
            console.log("[ComfyUI] Using Qwen Image Edit workflow for imgedit mode.");
            workflow = JSON.parse(JSON.stringify(QWEN_IMAGE_EDIT_WORKFLOW)); // Deep copy

            // Determine which images to upload
            // Priority: sourceImage (from layer groups) > inputImage (single image mode)
            const primaryImage = sourceImage || inputImage;

            // Upload primary image (Source) to node 78
            let sourceFilename;
            try {
                console.log("[ComfyUI] Uploading source image...");
                sourceFilename = await this._uploadImageToComfyUI(primaryImage, baseUrl);
                console.log("[ComfyUI] Source image uploaded:", sourceFilename);
            } catch (uploadError) {
                console.error("[ComfyUI] Source image upload failed:", uploadError);
                throw new Error(`Failed to upload source image to ComfyUI: ${uploadError.message}`);
            }

            // Inject source image into LoadImage node (78)
            if (workflow["78"] && workflow["78"].inputs) {
                workflow["78"].inputs.image = sourceFilename;
            }

            // Upload reference image to node 120 (if provided)
            if (referenceImage) {
                let referenceFilename;
                try {
                    console.log("[ComfyUI] Uploading reference image...");
                    referenceFilename = await this._uploadImageToComfyUI(referenceImage, baseUrl);
                    console.log("[ComfyUI] Reference image uploaded:", referenceFilename);
                } catch (uploadError) {
                    console.error("[ComfyUI] Reference image upload failed:", uploadError);
                    throw new Error(`Failed to upload reference image to ComfyUI: ${uploadError.message}`);
                }

                // Inject reference image into LoadImage node (120)
                if (workflow["120"] && workflow["120"].inputs) {
                    workflow["120"].inputs.image = referenceFilename;
                }
            } else {
                // No reference image - set image2 to null in TextEncode nodes
                console.log("[ComfyUI] No reference image provided, disabling image2.");
                if (workflow["110"] && workflow["110"].inputs) {
                    workflow["110"].inputs.image2 = null;
                }
                if (workflow["111"] && workflow["111"].inputs) {
                    workflow["111"].inputs.image2 = null;
                }
                // Remove node 120 since it's not needed
                delete workflow["120"];
            }

            // Inject prompt into positive TextEncodeQwenImageEditPlus node (111)
            if (workflow["111"] && workflow["111"].inputs) {
                workflow["111"].inputs.prompt = prompt;
            }

            // Inject seed into KSampler (3)
            if (workflow["3"] && workflow["3"].inputs) {
                workflow["3"].inputs.seed = seed;
            }

            // Note: Qwen workflow uses ImageScaleToTotalPixels (93) which scales to 1MP,
            // so we don't need to inject width/height directly for image edit.
            // Using 4-step Lightning LoRA for ~5x faster generation.

        } else {
            // === Text to Image Mode: Use Z-Image Turbo Workflow ===
            console.log("[ComfyUI] Using Z-Image Turbo workflow for text2img mode.");

            // 1. Try to load custom workflow from Workflows/comfy_t2i_workflow.json
            workflow = await this.fileManager.loadWorkflowFile('comfy_t2i_workflow.json');

            if (!workflow) {
                // 2. If not found, use built-in Z-Image Turbo workflow
                console.log("[ComfyUI] Custom T2I workflow not found, using built-in Z-Image Turbo.");
                workflow = JSON.parse(JSON.stringify(Z_IMAGE_TURBO_WORKFLOW)); // Deep copy

                // Inject parameters
                // Prompt (node 45)
                if (workflow["45"] && workflow["45"].inputs) {
                    workflow["45"].inputs.text = prompt;
                }

                // Dimensions (node 41)
                if (workflow["41"] && workflow["41"].inputs) {
                    workflow["41"].inputs.width = width;
                    workflow["41"].inputs.height = height;
                }

                // Seed (node 44)
                if (workflow["44"] && workflow["44"].inputs) {
                    workflow["44"].inputs.seed = seed;
                }

                // Save as template for user to customize
                await this.fileManager.saveWorkflowFile('comfy_t2i_workflow.json', workflow);
            } else {
                console.log("[ComfyUI] Loaded custom T2I workflow. Injecting parameters...");
                // Inject parameters into custom workflow
                this._injectParamsIntoWorkflow(workflow, prompt, width, height, seed, null);
            }
        }

        return {
            "prompt": workflow,
            "client_id": "ps_banana_uxp_" + Date.now()
        };
    }

    /**
     * Upload image to ComfyUI server - Manual Multipart Construction
     * Bypassing UXP FormData issues by constructing the body manually
     * @param {string} base64Image - Base64 encoded image (without data: prefix)
     * @param {string} baseUrl - ComfyUI base URL
     * @returns {Promise<string>} - Filename of uploaded image
     */
    async _uploadImageToComfyUI(base64Image, baseUrl) {
        const uploadUrl = `${baseUrl}/upload/image`;
        const filename = `ps_banana_input_${Date.now()}.png`;

        // Generate a random boundary
        const boundary = "----BananaBoundary" + Math.random().toString(36).substring(2);

        // 1. Prepare Multipart Header and Footer
        // Note: Using \r\n for line breaks as required by HTTP spec
        const preAmble = `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="image"; filename="${filename}"\r\n` +
            `Content-Type: image/png\r\n\r\n`;

        const postAmble = `\r\n--${boundary}--\r\n`;

        // 2. Decode base64 image to binary bytes
        const binaryString = atob(base64Image);
        const imageBytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            imageBytes[i] = binaryString.charCodeAt(i);
        }

        // 3. Convert Header/Footer strings to bytes
        // Using simple charCodeAt for ASCII headers is safe and robust without TextEncoder dependency
        const preBytes = new Uint8Array(preAmble.length);
        for (let i = 0; i < preAmble.length; i++) preBytes[i] = preAmble.charCodeAt(i);

        const postBytes = new Uint8Array(postAmble.length);
        for (let i = 0; i < postAmble.length; i++) postBytes[i] = postAmble.charCodeAt(i);

        // 4. Combine all parts into one buffer
        const totalLength = preBytes.length + imageBytes.length + postBytes.length;
        const fullBody = new Uint8Array(totalLength);

        fullBody.set(preBytes, 0);
        fullBody.set(imageBytes, preBytes.length);
        fullBody.set(postBytes, preBytes.length + imageBytes.length);

        console.log(`[ComfyUI] Uploading image (manual multipart) to: ${uploadUrl}`);
        console.log(`[ComfyUI] Filename: ${filename}, Size: ${totalLength} bytes`);

        // 5. Send Request
        const response = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`
            },
            body: fullBody.buffer // Send as ArrayBuffer
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Upload failed: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log(`[ComfyUI] Image uploaded successfully:`, result);

        return result.name;
    }

    /**
     * @deprecated Legacy function, use Z_IMAGE_TURBO_WORKFLOW instead
     */
    _getZImageTurboWorkflow(seed, width, height, prompt) {
        return {
            "9": { "class_type": "SaveImage", "inputs": { "filename_prefix": "PSBanana_Z_Turbo", "images": ["43", 0] } },
            "39": { "class_type": "CLIPLoader", "inputs": { "clip_name": "qwen_3_4b.safetensors", "type": "lumina2", "device": "default" } },
            "40": { "class_type": "VAELoader", "inputs": { "vae_name": "ae.safetensors" } },
            "41": { "class_type": "EmptySD3LatentImage", "inputs": { "width": width, "height": height, "batch_size": 1 } },
            "42": { "class_type": "ConditioningZeroOut", "inputs": { "conditioning": ["45", 0] } },
            "43": { "class_type": "VAEDecode", "inputs": { "samples": ["44", 0], "vae": ["40", 0] } },
            "44": { "class_type": "KSampler", "inputs": { "cfg": 1, "denoise": 1, "latent_image": ["41", 0], "model": ["47", 0], "negative": ["42", 0], "positive": ["45", 0], "sampler_name": "res_multistep", "scheduler": "simple", "seed": seed, "steps": 8 } },
            "45": { "class_type": "CLIPTextEncode", "inputs": { "clip": ["39", 0], "text": prompt } },
            "46": { "class_type": "UNETLoader", "inputs": { "unet_name": "z_image_turbo_bf16.safetensors", "weight_dtype": "default" } },
            "47": { "class_type": "ModelSamplingAuraFlow", "inputs": { "model": ["48", 0], "shift": 3 } },
            "48": { "class_type": "LoraLoaderModelOnly", "inputs": { "lora_name": "pixel_art_style_z_image_turbo.safetensors", "model": ["46", 0], "strength_model": 1 } }
        };
    }

    /**
     * Smartly inject parameters into a ComfyUI workflow
     */
    _injectParamsIntoWorkflow(workflow, prompt, width, height, seed, defaultCkptName) {
        let kSamplerNode = null;
        let positiveNodeId = null;
        let negativeNodeId = null;

        // 1. Find KSampler (to set Seed/Steps and find Prompts)
        for (const [id, node] of Object.entries(workflow)) {
            if (node.class_type === 'KSampler' || node.class_type === 'KSamplerAdvanced') {
                kSamplerNode = node;
                // Inject Seed
                if (node.inputs) {
                    node.inputs.seed = seed;
                    // Keep original steps from workflow, don't override
                    // node.inputs.cfg = 8; // Maybe keep user's CFG
                }

                // Trace Prompts
                if (node.inputs.positive && Array.isArray(node.inputs.positive)) {
                    positiveNodeId = node.inputs.positive[0];
                }
                if (node.inputs.negative && Array.isArray(node.inputs.negative)) {
                    negativeNodeId = node.inputs.negative[0];
                }
                break; // Assume main KSampler
            }
        }

        // 2. Inject Dimensions (EmptyLatentImage)
        for (const [id, node] of Object.entries(workflow)) {
            if (node.class_type.startsWith('EmptyLatentImage') || node.class_type.includes('EmptySD3Latent')) {
                if (node.inputs) {
                    node.inputs.width = width;
                    node.inputs.height = height;
                }
            }
        }

        // 3. Inject Prompts (using traced IDs)
        if (positiveNodeId && workflow[positiveNodeId]) {
            if (workflow[positiveNodeId].inputs) {
                workflow[positiveNodeId].inputs.text = prompt;
            }
        }
        if (negativeNodeId && workflow[negativeNodeId]) {
            if (workflow[negativeNodeId].inputs) {
                // Keep existing negative prompt if distinct, or hardcode generic?
                // Let's NOT overwrite negative prompt if it's a custom workflow, 
                // UNLESS we want to support a negative prompt field in UI later.
                // For now, let's leave negative prompt alone in custom workflows, 
                // assuming the user configured it in the JSON.
                // Or maybe just append? No.
                // User context: "text, watermark" IS hardcoded in my default. 
                // If they supplied a custom workflow, probably they want THEIR negative prompt.
                // So I will NOT touch negative prompt here.
            }
        }

        // 4. Inject Model Name?
        // Only if we find a CheckpointLoaderSimple AND it matches the specific "CheckpointLoaderSimple" class.
        // If the user uses UNetLoader (like the error case), we DO NOT touch it, avoiding the "value_not_in_list" error.
        for (const [id, node] of Object.entries(workflow)) {
            if (node.class_type === 'CheckpointLoaderSimple') {
                // Check if the current value is valid or placeholder?
                // Strategy: If user explicitly set a model in Settings, and this is a CheckpointLoaderSimple, update it.
                // But if they use a custom workflow, they might have set a specific model there.
                // Given the error "value_not_in_list", better to trust the File if it's custom.
                // So I will NOT update ckpt_name in custom workflows.
                // console.log("Keeping custom workflow checkpoint...");
            }
        }
    }

    /**
     * Get pixel dimensions from Resolution (1K/2K/4K) and Aspect Ratio string
     */
    _getPixelDimensions(resolution, aspectRatio) {
        // Base sizes for "1K" (approx 1MP), "2K" (approx 4MP), "4K" (approx 16MP)
        // Usually 1K = 1024x1024 base.
        let baseSize = 1024;

        if (typeof resolution === 'string') {
            if (resolution.includes("2K")) baseSize = 2048;
            if (resolution.includes("4K")) baseSize = 4096;
        } else if (typeof resolution === 'number') {
            baseSize = resolution;
        }

        // Parse Aspect Ratio
        let ratioVal = 1.0;
        if (aspectRatio && aspectRatio.includes(":")) {
            const [w, h] = aspectRatio.split(":").map(Number);
            if (h !== 0) ratioVal = w / h;
        }

        // Calculate W/H maintaining area roughly equal to baseSize * baseSize
        // W * H = Base^2
        // W / H = Ratio
        // H * Ratio * H = Base^2 => H^2 = Base^2 / Ratio => H = Base / sqrt(Ratio)

        let h = Math.round(baseSize / Math.sqrt(ratioVal));
        let w = Math.round(h * ratioVal);

        // Ensure multiple of 8 (standard for diffusion models)
        w = Math.round(w / 8) * 8;
        h = Math.round(h / 8) * 8;

        return { width: w, height: h };
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
    async _processResponse(responseData, providerType, provider) {
        if (providerType === "google_official" || providerType === "yunwu") {
            return await this._processGeminiResponse(responseData);
        } else if (providerType === "gptgod") {
            return await this._processGPTGodResponse(responseData);
        } else if (providerType === "openrouter") {
            return await this._processOpenRouterResponse(responseData);
        } else if (providerType === "seedream") {
            return await this._processSeedreamResponse(responseData);
        } else if (providerType === "comfyui") {
            return await this._processComfyUIResponse(responseData, provider);
            // Note: I need to access provider config to get baseUrl for history polling. 
            // Since _processResponse signature doesn't pass it, I'll assume I can pass it or fix the architecture. 
            // Wait, I can just change _processResponse signature in the next step or rely on a class property? 
            // Actually, I should pass provider to _processResponse in the main generate method.
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
     * Process ComfyUI response
     * 1. Get prompt_id from response
     * 2. Poll history until done
     * 3. Download image
     */
    async _processComfyUIResponse(responseData, provider) {
        if (!responseData.prompt_id) {
            throw new Error("ComfyUI did not return a prompt_id");
        }

        const promptId = responseData.prompt_id;
        const baseUrl = provider.baseUrl.endsWith("/") ? provider.baseUrl.slice(0, -1) : provider.baseUrl;

        console.log(`[ComfyUI] Queued prompt: ${promptId}. Waiting for generation...`);

        // Poll history
        // Max wait: 5 minutes (300 seconds)
        const maxRetries = 300;
        let retries = 0;
        let outputImages = null;

        while (retries < maxRetries) {
            await new Promise(r => setTimeout(r, 1000)); // Wait 1 sec

            try {
                const historyUrl = `${baseUrl}/history/${promptId}`;
                const historyRes = await fetch(historyUrl);

                if (historyRes.ok) {
                    const historyData = await historyRes.json();
                    if (historyData[promptId]) {
                        // Job done!
                        const outputs = historyData[promptId].outputs;
                        // Find the output from SaveImage node (usually "9" in our workflow)
                        for (const nodeId in outputs) {
                            if (outputs[nodeId].images && outputs[nodeId].images.length > 0) {
                                outputImages = outputs[nodeId].images;
                                break;
                            }
                        }
                        break;
                    }
                }
            } catch (e) {
                console.warn("[ComfyUI] Polling error:", e);
            }
            retries++;
        }

        if (!outputImages || outputImages.length === 0) {
            throw new Error("ComfyUI generation timed out or returned no images.");
        }

        // Get the first image
        const imgInfo = outputImages[0];
        // ComfyUI View URL: /view?filename=...&subfolder=...&type=...
        const viewUrl = `${baseUrl}/view?filename=${encodeURIComponent(imgInfo.filename)}&subfolder=${encodeURIComponent(imgInfo.subfolder)}&type=${encodeURIComponent(imgInfo.type)}`;

        console.log(`[ComfyUI] Downloading image from: ${viewUrl}`);
        return await this.fileManager.downloadImage(viewUrl);
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
