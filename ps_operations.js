const { app } = require("photoshop");
const { batchPlay } = require("photoshop").action;
const { executeAsModal } = require("photoshop").core;
const fs = require("uxp").storage.localFileSystem;
const { calculateAspectRatio, ASPECT_RATIOS } = require('./aspect_ratio');

/**
 * Photoshop operations for image generation
 * Uses batchPlay for performance-critical operations
 */
class PSOperations {
    /**
     * Get current canvas info (width, height)
     * Must be called within executeAsModal
     */
    static async getCanvasInfo() {
        try {
            const doc = app.activeDocument;
            if (!doc) {
                throw new Error("No active document");
            }

            return {
                width: doc.width,
                height: doc.height,
                documentId: doc.id
            };
        } catch (e) {
            console.error("Error getting canvas info:", e);
            throw e;
        }
    }

    /**
     * 获取当前选区信息
     * 必须在executeAsModal中调用
     * @returns {Promise<Object>} - 返回选区边界和状态
     */
    static async getSelectionInfo() {
        try {
            const doc = app.activeDocument;
            if (!doc) {
                throw new Error("No active document");
            }

            // 使用batchPlay获取选区边界
            const result = await batchPlay([
                {
                    "_obj": "get",
                    "_target": [
                        {
                            "_property": "selection"
                        },
                        {
                            "_ref": "document",
                            "_enum": "ordinal",
                            "_value": "targetEnum"
                        }
                    ]
                }
            ], {
                "synchronousExecution": true,
                "modalBehavior": "wait"
            });

            // 检查是否有选区
            if (!result || !result[0] || !result[0].selection) {
                return { hasSelection: false };
            }

            const selection = result[0].selection;
            
            return {
                hasSelection: true,
                bounds: {
                    left: selection.left._value,
                    top: selection.top._value,
                    right: selection.right._value,
                    bottom: selection.bottom._value
                }
            };
        } catch (e) {
            console.error("Error getting selection info:", e);
            // 如果没有选区，返回false
            return { hasSelection: false };
        }
    }

    /**
     * 根据选区边界计算生图区域
     * 找到最接近的标准比例，并确保生图区域包含选区
     * @param {Object} selectionBounds - 选区边界 {left, top, right, bottom}
     * @param {number} canvasWidth - 画布宽度
     * @param {number} canvasHeight - 画布高度
     * @returns {Object} - 生图区域 {left, top, width, height, aspectRatio}
     */
    static calculateGenerationRegion(selectionBounds, canvasWidth, canvasHeight) {
        const { left, top, right, bottom } = selectionBounds;
        const selectionWidth = right - left;
        const selectionHeight = bottom - top;
        
        console.log(`[PS] Selection bounds: ${selectionWidth}x${selectionHeight} at (${left}, ${top})`);
        
        // 计算选区的宽高比
        const selectionRatio = selectionWidth / selectionHeight;
        
        // 找到最接近的标准比例
        let closestRatio = ASPECT_RATIOS[0];
        let minDifference = Math.abs(selectionRatio - closestRatio.value);
        
        for (const ratio of ASPECT_RATIOS) {
            const difference = Math.abs(selectionRatio - ratio.value);
            if (difference < minDifference) {
                minDifference = difference;
                closestRatio = ratio;
            }
        }
        
        console.log(`[PS] Selection ratio: ${selectionRatio.toFixed(4)}, closest: ${closestRatio.name}`);
        
        // 根据标准比例计算生图区域尺寸
        let regionWidth, regionHeight;
        const targetRatio = closestRatio.value;
        
        if (selectionRatio < targetRatio) {
            // 选区太窄，需要扩展宽度
            regionHeight = selectionHeight;
            regionWidth = Math.round(regionHeight * targetRatio);
        } else if (selectionRatio > targetRatio) {
            // 选区太宽，需要扩展高度
            regionWidth = selectionWidth;
            regionHeight = Math.round(regionWidth / targetRatio);
        } else {
            // 已经是目标比例
            regionWidth = selectionWidth;
            regionHeight = selectionHeight;
        }
        
        // 计算生图区域的位置，使其居中包含选区
        const regionLeft = Math.round(left + (selectionWidth - regionWidth) / 2);
        const regionTop = Math.round(top + (selectionHeight - regionHeight) / 2);
        
        // 确保生图区域不超出画布边界
        const finalLeft = Math.max(0, Math.min(regionLeft, canvasWidth - regionWidth));
        const finalTop = Math.max(0, Math.min(regionTop, canvasHeight - regionHeight));
        const finalRight = finalLeft + regionWidth;
        const finalBottom = finalTop + regionHeight;
        
        console.log(`[PS] Generation region: ${regionWidth}x${regionHeight} at (${finalLeft}, ${finalTop})`);
        
        return {
            left: finalLeft,
            top: finalTop,
            right: finalRight,
            bottom: finalBottom,
            width: regionWidth,
            height: regionHeight,
            aspectRatio: closestRatio.name
        };
    }

    /**
     * Get the next available BananaImage layer name
     * Returns: BananaImage00, BananaImage01, etc.
     */
    static async getNextLayerName() {
        try {
            const doc = app.activeDocument;
            if (!doc) {
                return "BananaImage00";
            }

            let maxNumber = -1;
            const layers = doc.layers;

            for (const layer of layers) {
                if (layer.name.startsWith("BananaImage")) {
                    const numberPart = layer.name.substring(11); // After "BananaImage"
                    const num = parseInt(numberPart, 10);
                    if (!isNaN(num) && num > maxNumber) {
                        maxNumber = num;
                    }
                }
            }

            const nextNumber = maxNumber + 1;
            return `BananaImage${nextNumber.toString().padStart(2, '0')}`;
        } catch (e) {
            console.error("Error getting next layer name:", e);
            return "BananaImage00";
        }
    }

    /**
     * Import image as a new layer
     * Must be called within executeAsModal
     * @param {File} imageFile - UXP File object
     */
    static async importImageAsLayer(imageFile) {
        try {
            // Validate input
            if (!imageFile || !imageFile.nativePath) {
                throw new Error("Invalid image file: file or path is missing");
            }

            const doc = app.activeDocument;
            if (!doc) {
                throw new Error("No active document");
            }

            console.log(`[PS] Importing image from: ${imageFile.nativePath}`);

            const layerName = await this.getNextLayerName();

            // Use batchPlay to place the image
            await batchPlay([
                {
                    "_obj": "placeEvent",
                    "null": {
                        "_path": imageFile.nativePath,
                        "_kind": "local"
                    },
                    "freeTransformCenterState": {
                        "_enum": "quadCenterState",
                        "_value": "QCSAverage"
                    },
                    "_isCommand": true
                }
            ], {
                "synchronousExecution": true,
                "modalBehavior": "wait"
            });

            // Rename the layer
            const newLayer = doc.activeLayers[0];
            if (!newLayer) {
                throw new Error("Failed to get the newly created layer");
            }

            newLayer.name = layerName;
            console.log(`[PS] Layer created: ${layerName}`);

            // Resize to canvas size
            await this.resizeLayerToCanvas(newLayer);

            return layerName;
        } catch (e) {
            console.error("Error importing image:", e);
            const errorMsg = e.message || String(e) || "Unknown error during image import";
            throw new Error(`Failed to import image: ${errorMsg}`);
        }
    }

    /**
     * Import image from session token as a new layer
     * Must be called within executeAsModal
     * @param {string} token - File session token (直接用于 batchPlay)
     */
    static async importImageByToken(token) {
        try {
            // Validate input
            if (!token) {
                throw new Error("Invalid file token");
            }

            const doc = app.activeDocument;
            if (!doc) {
                throw new Error("No active document");
            }

            console.log(`[PS] Importing image using session token`);
            
            const layerName = await this.getNextLayerName();
            console.log(`[PS] Next layer name: ${layerName}`);

            // 直接在 batchPlay 中使用 session token
            // 根据 UXP 文档，session token 可以直接作为 _path 使用
            console.log(`[PS] Calling batchPlay with session token`);
            const result = await batchPlay([
                {
                    "_obj": "placeEvent",
                    "null": {
                        "_path": token,  // 直接使用 session token！
                        "_kind": "local"
                    },
                    "freeTransformCenterState": {
                        "_enum": "quadCenterState",
                        "_value": "QCSAverage"
                    },
                    "_isCommand": true
                }
            ], {
                "synchronousExecution": true,
                "modalBehavior": "wait"
            });
            
            console.log(`[PS] batchPlay completed successfully`);

            // Rename the layer
            const newLayer = doc.activeLayers[0];
            if (!newLayer) {
                throw new Error("Failed to get the newly created layer");
            }

            newLayer.name = layerName;
            console.log(`[PS] Layer created successfully: ${layerName}`);

            // Resize to canvas size
            await this.resizeLayerToCanvas(newLayer);
            
            // 将图层移到最顶层（所有组之外）
            await this.moveLayerToTop(newLayer);
            console.log(`[PS] Layer moved to top of document`);

            return layerName;
        } catch (e) {
            console.error("[PS] ERROR in importImageByToken:", e);
            console.error("[PS] Error message:", e.message);
            console.error("[PS] Token was:", token);
            const errorMsg = e.message || String(e) || "Unknown error during image import";
            throw new Error(`Failed to import image from token: ${errorMsg}`);
        }
    }

    /**
     * 在指定区域导入图片并调整到区域大小
     * 必须在executeAsModal中调用
     * @param {string} token - File session token
     * @param {Object} region - 生图区域 {left, top, width, height}
     */
    static async importImageInRegion(token, region) {
        try {
            if (!token) {
                throw new Error("Invalid file token");
            }
            if (!region) {
                throw new Error("Invalid region");
            }

            const doc = app.activeDocument;
            if (!doc) {
                throw new Error("No active document");
            }

            console.log(`[PS] Importing image in region: ${region.width}x${region.height} at (${region.left}, ${region.top})`);
            
            const layerName = await this.getNextLayerName();

            // 导入图片
            await batchPlay([
                {
                    "_obj": "placeEvent",
                    "null": {
                        "_path": token,
                        "_kind": "local"
                    },
                    "freeTransformCenterState": {
                        "_enum": "quadCenterState",
                        "_value": "QCSAverage"
                    },
                    "_isCommand": true
                }
            ], {
                "synchronousExecution": true,
                "modalBehavior": "wait"
            });

            const newLayer = doc.activeLayers[0];
            if (!newLayer) {
                throw new Error("Failed to get the newly created layer");
            }

            newLayer.name = layerName;
            console.log(`[PS] Layer created: ${layerName}`);

            // 调整图层到区域大小和位置
            await this.resizeLayerToRegion(newLayer, region);
            
            // 将图层移到最顶层（所有组之外）
            await this.moveLayerToTop(newLayer);
            console.log(`[PS] Layer moved to top of document`);

            return layerName;
        } catch (e) {
            console.error("[PS] ERROR in importImageInRegion:", e);
            const errorMsg = e.message || String(e) || "Unknown error";
            throw new Error(`Failed to import image in region: ${errorMsg}`);
        }
    }

    /**
     * Resize layer to fill canvas
     * Must be called within executeAsModal
     */
    static async resizeLayerToCanvas(layer) {
        try {
            const doc = app.activeDocument;
            const canvasWidth = doc.width;
            const canvasHeight = doc.height;

            // Get layer bounds
            const layerBounds = layer.bounds;
            const layerWidth = layerBounds.right - layerBounds.left;
            const layerHeight = layerBounds.bottom - layerBounds.top;

            console.log(`[PS] Canvas: ${canvasWidth}x${canvasHeight}, Layer: ${layerWidth}x${layerHeight}`);

            // 使用高度进行缩放计算（测试表明这样最准确）
            // 例如: 目标1800x2048，1K生成896x1024，应使用1024->2048的比例
            const scale = (canvasHeight / layerHeight) * 100;

            console.log(`[PS] Scaling layer by height: ${scale.toFixed(2)}%`);

            // Transform layer using batchPlay
            await batchPlay([
                {
                    "_obj": "transform",
                    "_target": [
                        {
                            "_ref": "layer",
                            "_enum": "ordinal",
                            "_value": "targetEnum"
                        }
                    ],
                    "freeTransformCenterState": {
                        "_enum": "quadCenterState",
                        "_value": "QCSAverage"
                    },
                    "width": {
                        "_unit": "percentUnit",
                        "_value": scale
                    },
                    "height": {
                        "_unit": "percentUnit",
                        "_value": scale
                    },
                    "interfaceIconFrameDimmed": {
                        "_enum": "interpolationType",
                        "_value": "bicubic"
                    },
                    "_isCommand": true
                }
            ], {
                "synchronousExecution": true,
                "modalBehavior": "wait"
            });

            // Center the layer
            await this.centerLayer(layer);

        } catch (e) {
            console.error("Error resizing layer:", e);
            const errorMsg = e.message || String(e) || "Unknown error during resize";
            throw new Error(`Failed to resize layer: ${errorMsg}`);
        }
    }

    /**
     * 调整图层到指定区域的大小和位置
     * 必须在executeAsModal中调用
     * @param {Layer} layer - 要调整的图层
     * @param {Object} region - 目标区域 {left, top, width, height}
     */
    static async resizeLayerToRegion(layer, region) {
        try {
            // 获取图层边界
            const layerBounds = layer.bounds;
            const layerWidth = layerBounds.right - layerBounds.left;
            const layerHeight = layerBounds.bottom - layerBounds.top;

            console.log(`[PS] Region: ${region.width}x${region.height}, Layer: ${layerWidth}x${layerHeight}`);

            // 使用高度进行缩放计算（测试表明这样最准确）
            // 例如: 目标1800x2048，1K生成896x1024，应使用1024->2048的比例
            const scale = (region.height / layerHeight) * 100;

            console.log(`[PS] Scaling layer by height: ${scale.toFixed(2)}%`);

            // 缩放图层
            await batchPlay([
                {
                    "_obj": "transform",
                    "_target": [
                        {
                            "_ref": "layer",
                            "_enum": "ordinal",
                            "_value": "targetEnum"
                        }
                    ],
                    "freeTransformCenterState": {
                        "_enum": "quadCenterState",
                        "_value": "QCSAverage"
                    },
                    "width": {
                        "_unit": "percentUnit",
                        "_value": scale
                    },
                    "height": {
                        "_unit": "percentUnit",
                        "_value": scale
                    },
                    "interfaceIconFrameDimmed": {
                        "_enum": "interpolationType",
                        "_value": "bicubic"
                    },
                    "_isCommand": true
                }
            ], {
                "synchronousExecution": true,
                "modalBehavior": "wait"
            });

            // 将图层居中到区域
            await this.centerLayerToRegion(layer, region);

        } catch (e) {
            console.error("Error resizing layer to region:", e);
            const errorMsg = e.message || String(e) || "Unknown error";
            throw new Error(`Failed to resize layer to region: ${errorMsg}`);
        }
    }

    /**
     * Center layer on canvas
     */
    static async centerLayer(layer) {
        try {
            const doc = app.activeDocument;
            const canvasWidth = doc.width;
            const canvasHeight = doc.height;

            const layerBounds = layer.bounds;
            const layerWidth = layerBounds.right - layerBounds.left;
            const layerHeight = layerBounds.bottom - layerBounds.top;

            const offsetX = (canvasWidth - layerWidth) / 2 - layerBounds.left;
            const offsetY = (canvasHeight - layerHeight) / 2 - layerBounds.top;

            await batchPlay([
                {
                    "_obj": "move",
                    "_target": [
                        {
                            "_ref": "layer",
                            "_enum": "ordinal",
                            "_value": "targetEnum"
                        }
                    ],
                    "to": {
                        "_obj": "offset",
                        "horizontal": {
                            "_unit": "pixelsUnit",
                            "_value": offsetX
                        },
                        "vertical": {
                            "_unit": "pixelsUnit",
                            "_value": offsetY
                        }
                    },
                    "_isCommand": true
                }
            ], {
                "synchronousExecution": true,
                "modalBehavior": "wait"
            });
        } catch (e) {
            console.error("Error centering layer:", e);
        }
    }

    /**
     * 将图层居中到指定区域
     * 必须在executeAsModal中调用
     * @param {Layer} layer - 要移动的图层
     * @param {Object} region - 目标区域 {left, top, width, height}
     */
    static async centerLayerToRegion(layer, region) {
        try {
            // 获取缩放后的图层边界
            const layerBounds = layer.bounds;
            const layerWidth = layerBounds.right - layerBounds.left;
            const layerHeight = layerBounds.bottom - layerBounds.top;

            // 计算区域中心
            const regionCenterX = region.left + region.width / 2;
            const regionCenterY = region.top + region.height / 2;

            // 计算需要的偏移量，使图层中心对齐区域中心
            const offsetX = regionCenterX - (layerBounds.left + layerWidth / 2);
            const offsetY = regionCenterY - (layerBounds.top + layerHeight / 2);

            console.log(`[PS] Centering layer to region: offset (${offsetX.toFixed(2)}, ${offsetY.toFixed(2)})`);

            await batchPlay([
                {
                    "_obj": "move",
                    "_target": [
                        {
                            "_ref": "layer",
                            "_enum": "ordinal",
                            "_value": "targetEnum"
                        }
                    ],
                    "to": {
                        "_obj": "offset",
                        "horizontal": {
                            "_unit": "pixelsUnit",
                            "_value": offsetX
                        },
                        "vertical": {
                            "_unit": "pixelsUnit",
                            "_value": offsetY
                        }
                    },
                    "_isCommand": true
                }
            ], {
                "synchronousExecution": true,
                "modalBehavior": "wait"
            });
        } catch (e) {
            console.error("Error centering layer to region:", e);
        }
    }

    /**
     * Move layer to top of document (outside all groups)
     * 将图层移到文档最顶层（所有组之外）
     */
    static async moveLayerToTop(layer) {
        try {
            const doc = app.activeDocument;
            
            // 先将图层移出组（如果在组内）
            if (layer.parent && layer.parent.typename === "LayerSet") {
                console.log(`[PS] Layer is inside group '${layer.parent.name}', moving out...`);
                // 将图层移到文档根层级
                await batchPlay([
                    {
                        "_obj": "move",
                        "_target": [
                            {
                                "_ref": "layer",
                                "_enum": "ordinal",
                                "_value": "targetEnum"
                            }
                        ],
                        "to": {
                            "_ref": "document",
                            "_enum": "ordinal",
                            "_value": "targetEnum"
                        },
                        "_isCommand": true
                    }
                ], {
                    "synchronousExecution": true,
                    "modalBehavior": "wait"
                });
            }
            
            // 然后移到最顶层
            await batchPlay([
                {
                    "_obj": "move",
                    "_target": [
                        {
                            "_ref": "layer",
                            "_enum": "ordinal",
                            "_value": "targetEnum"
                        }
                    ],
                    "to": {
                        "_ref": "layer",
                        "_enum": "ordinal",
                        "_value": "front"
                    },
                    "_isCommand": true
                }
            ], {
                "synchronousExecution": true,
                "modalBehavior": "wait"
            });
        } catch (e) {
            console.error("Error moving layer to top:", e);
        }
    }

    /**
     * 导出所有可见图层的合并结果为PNG/WebP图片
     * 必须在executeAsModal中调用
     * @param {number} maxSize - 导出图片长边最大长度
     * @param {number} quality - 压缩质量 (0-100)
     * @param {Object} executionContext - executeAsModal的执行上下文
     * @param {Object} region - 可选，需要导出的区域 {left, top, width, height}
     * @returns {Promise<Object>} - 包含file和token的对象
     */
    static async exportVisibleLayersAsWebP(maxSize = 2048, quality = 80, executionContext = null, region = null) {
        try {
            const doc = app.activeDocument;
            if (!doc) {
                throw new Error("No active document");
            }

            console.log(`[PS] Exporting visible layers as WebP (maxSize: ${maxSize}, quality: ${quality})`);

            // 获取导出区域尺寸
            let exportSourceWidth, exportSourceHeight;
            if (region) {
                // 如果指定了区域，使用区域尺寸
                exportSourceWidth = region.width;
                exportSourceHeight = region.height;
                console.log(`[PS] Exporting region: ${exportSourceWidth}x${exportSourceHeight} at (${region.left}, ${region.top})`);
            } else {
                // 否则使用画布尺寸
                exportSourceWidth = doc.width;
                exportSourceHeight = doc.height;
                console.log(`[PS] Exporting full canvas: ${exportSourceWidth}x${exportSourceHeight}`);
            }

            // 计算导出尺寸,保持宽高比
            let exportWidth = exportSourceWidth;
            let exportHeight = exportSourceHeight;
            const maxDimension = Math.max(exportSourceWidth, exportSourceHeight);
            
            if (maxDimension > maxSize) {
                const scale = maxSize / maxDimension;
                exportWidth = Math.round(exportSourceWidth * scale);
                exportHeight = Math.round(exportSourceHeight * scale);
                console.log(`[PS] Scaled export size: ${exportWidth}x${exportHeight}`);
            }

            // 创建临时文件 - 放在ExportedImages文件夹下
            const dataFolder = await fs.getDataFolder();
            // 获取或创建ExportedImages文件夹
            let exportFolder;
            try {
                exportFolder = await dataFolder.getEntry('ExportedImages');
            } catch (e) {
                // 文件夹不存在,创建新的
                exportFolder = await dataFolder.createFolder('ExportedImages');
            }
            const timestamp = Date.now();
            const webpFileName = `ps_export_${timestamp}.webp`;
            const webpFile = await exportFolder.createFile(webpFileName, { overwrite: true });

            console.log(`[PS] Export file path: ${webpFile.nativePath}`);

            // 挂起历史记录,将所有操作合并为一个历史状态,避免界面闪烁
            let suspensionID = null;
            if (executionContext && executionContext.hostControl) {
                suspensionID = await executionContext.hostControl.suspendHistory({
                    "documentID": doc.id,
                    "name": "导出图片"
                });
                console.log('[PS] History suspended - all export operations will be combined');
            }

            try {
                // 如果需要裁切区域或缩放,在原文档上操作
                // 操作完成后会回滚,避免创建新文档产生闪烁
                if (region || maxDimension > maxSize) {
                    console.log('[PS] Performing temporary modifications on original document...');
                    
                    // 合并可见图层到新图层
                    console.log('[PS] Merging visible layers...');
                    await batchPlay([{
                        "_obj": "mergeVisible",
                        "duplicate": true,
                        "_isCommand": true
                    }], {
                        "synchronousExecution": true,
                        "modalBehavior": "wait"
                    });
                    
                    // 如果有区域，先裁切到区域
                    if (region) {
                        console.log(`[PS] Cropping to region: ${region.width}x${region.height}`);
                        await doc.crop({
                            left: region.left,
                            top: region.top,
                            right: region.right,
                            bottom: region.bottom
                        });
                    }
                    
                    // 如果需要缩放
                    if (maxDimension > maxSize) {
                        console.log(`[PS] Resizing to: ${exportWidth}x${exportHeight}`);
                        await doc.resizeImage(exportWidth, exportHeight);
                    }
                }
                
                // 展平图像（自动将透明背景填充为白色）
                console.log('[PS] Flattening image (transparent areas will be filled with white)...');
                await doc.flatten();
                console.log('[PS] Image flattened with white background');

                // 使用batchPlay保存WebP格式
                console.log('[PS] Saving WebP file...');
                const fileToken = fs.createSessionToken(webpFile);
                
                await batchPlay([{
                    "_obj": "save",
                    "as": {
                        "_obj": "WebPFormat",
                        "compression": {
                            "_enum": "WebPCompression",
                            "_value": "compressionLossy"
                        },
                        "quality": quality,
                        "includeXMPData": false,
                        "includeEXIFData": false,
                        "includePsExtras": false
                    },
                    "in": {
                        "_path": fileToken,
                        "_kind": "local"
                    },
                    "copy": true,
                    "lowerCase": true,
                    "_isCommand": true
                }], {
                    "synchronousExecution": true,
                    "modalBehavior": "wait"
                });

                console.log(`[PS] Export completed: ${webpFile.nativePath}`);

                // 创建session token供后续使用
                const token = fs.createSessionToken(webpFile);
                
                return {
                    file: webpFile,
                    token: token,
                    width: exportWidth,
                    height: exportHeight
                };

            } finally {
                // 回滚所有历史记录,恢复文档到导出前的状态
                // commit=false表示不提交更改,相当于撤销所有操作
                if (suspensionID !== null && executionContext && executionContext.hostControl) {
                    await executionContext.hostControl.resumeHistory(suspensionID, false);
                    console.log('[PS] History rolled back - document restored to original state');
                }
            }

        } catch (e) {
            console.error("[PS] Error exporting visible layers:", e);
            const errorMsg = e.message || String(e) || "Unknown error during export";
            throw new Error(`Failed to export visible layers: ${errorMsg}`);
        }
    }
    /**
     * 查找Source和Reference组
     * 大小写不敏感,只查找顶层组
     * 必须在executeAsModal中调用
     * @returns {Promise<Object>} - 返回 {sourceGroup, referenceGroup}
     */
    static async findSourceReferenceGroups() {
        try {
            const doc = app.activeDocument;
            if (!doc) {
                throw new Error("No active document");
            }

            let sourceGroup = null;
            let referenceGroup = null;

            // 遍历顶层图层查找Source和Reference组
            for (const layer of doc.layers) {
                if (layer.kind === "group") {
                    const layerName = layer.name.toLowerCase();
                    if (layerName === "source") {
                        sourceGroup = layer;
                    } else if (layerName === "reference") {
                        referenceGroup = layer;
                    }
                }
            }

            console.log(`[PS] Found Source group: ${sourceGroup ? sourceGroup.name : 'None'}`);
            console.log(`[PS] Found Reference group: ${referenceGroup ? referenceGroup.name : 'None'}`);

            return { sourceGroup, referenceGroup };
        } catch (e) {
            console.error("Error finding source/reference groups:", e);
            throw e;
        }
    }

    /**
     * 导出指定组中的可见图层为合并图片
     * 支持选区模式
     * 必须在executeAsModal中调用
     * @param {LayerGroup} group - 要导出的组
     * @param {number} maxSize - 导出图片长边最大长度
     * @param {number} quality - 压缩质量 (0-100)
     * @param {Object} executionContext - executeAsModal的执行上下文
     * @param {Object} region - 可选,需要导出的区域 {left, top, width, height}
     * @returns {Promise<Object>} - 包含file和base64的对象
     */
    static async exportGroupAsWebP(group, maxSize = 2048, quality = 80, executionContext = null, region = null) {
        try {
            const doc = app.activeDocument;
            if (!doc || !group) {
                throw new Error("Invalid document or group");
            }

            console.log(`[PS] Exporting group: ${group.name} (maxSize: ${maxSize}, quality: ${quality})`);

            // 获取导出区域尺寸
            let exportSourceWidth, exportSourceHeight;
            if (region) {
                exportSourceWidth = region.width;
                exportSourceHeight = region.height;
                console.log(`[PS] Export region: ${exportSourceWidth}x${exportSourceHeight}`);
            } else {
                exportSourceWidth = doc.width;
                exportSourceHeight = doc.height;
                console.log(`[PS] Export full canvas: ${exportSourceWidth}x${exportSourceHeight}`);
            }

            // 计算导出尺寸,保持宽高比
            let exportWidth = exportSourceWidth;
            let exportHeight = exportSourceHeight;
            const maxDimension = Math.max(exportSourceWidth, exportSourceHeight);
            
            if (maxDimension > maxSize) {
                const scale = maxSize / maxDimension;
                exportWidth = Math.round(exportSourceWidth * scale);
                exportHeight = Math.round(exportSourceHeight * scale);
                console.log(`[PS] Scaled export size: ${exportWidth}x${exportHeight}`);
            }

            // 创建临时文件
            const dataFolder = await fs.getDataFolder();
            let exportFolder;
            try {
                exportFolder = await dataFolder.getEntry('ExportedImages');
            } catch (e) {
                exportFolder = await dataFolder.createFolder('ExportedImages');
            }
            const timestamp = Date.now();
            const webpFileName = `ps_export_group_${group.name}_${timestamp}.webp`;
            const webpFile = await exportFolder.createFile(webpFileName, { overwrite: true });

            console.log(`[PS] Export file path: ${webpFile.nativePath}`);

            // 挂起历史记录,将所有操作合并为一个历史状态,避免界面闪烁
            let suspensionID = null;
            if (executionContext && executionContext.hostControl) {
                suspensionID = await executionContext.hostControl.suspendHistory({
                    "documentID": doc.id,
                    "name": `导出组: ${group.name}`
                });
                console.log('[PS] History suspended - all export operations will be combined');
            }

            try {
                // 保存当前图层可见性状态
                const layerVisibilityStates = new Map();
                for (const layer of doc.layers) {
                    layerVisibilityStates.set(layer.id, layer.visible);
                }
                
                // 隐藏所有其他图层,只保留目标组可见
                console.log('[PS] Setting layer visibility for group export...');
                for (const layer of doc.layers) {
                    if (layer.id !== group.id) {
                        layer.visible = false;
                    } else {
                        layer.visible = true;
                    }
                }

                // 合并可见图层到新图层
                console.log('[PS] Merging visible layers in group...');
                await batchPlay([{
                    "_obj": "mergeVisible",
                    "duplicate": true,
                    "_isCommand": true
                }], {
                    "synchronousExecution": true,
                    "modalBehavior": "wait"
                });
                
                // 如果有区域,裁切到区域
                if (region) {
                    console.log(`[PS] Cropping to region: ${region.width}x${region.height}`);
                    await doc.crop({
                        left: region.left,
                        top: region.top,
                        right: region.right,
                        bottom: region.bottom
                    });
                }
                
                // 如果需要缩放
                if (maxDimension > maxSize) {
                    console.log(`[PS] Resizing to: ${exportWidth}x${exportHeight}`);
                    await doc.resizeImage(exportWidth, exportHeight);
                }
                
                // 展平图像（自动将透明背景填充为白色）
                console.log('[PS] Flattening image (transparent areas will be filled with white)...');
                await doc.flatten();
                console.log('[PS] Image flattened with white background');

                // 保存为WebP
                console.log('[PS] Saving as WebP...');
                const fileToken = fs.createSessionToken(webpFile);
                await batchPlay([{
                    "_obj": "save",
                    "as": {
                        "_obj": "WebPFormat",
                        "compression": {
                            "_enum": "WebPCompression",
                            "_value": "compressionLossy"
                        },
                        "quality": quality,
                        "includeXMPData": false,
                        "includeEXIFData": false,
                        "includePsExtras": false
                    },
                    "in": {
                        "_path": fileToken,
                        "_kind": "local"
                    },
                    "copy": true,
                    "lowerCase": true,
                    "_isCommand": true
                }], {
                    "synchronousExecution": true,
                    "modalBehavior": "wait"
                });

                console.log(`[PS] Group export completed: ${webpFile.nativePath}`);

                return {
                    file: webpFile,
                    width: exportWidth,
                    height: exportHeight
                };

            } finally {
                // 回滚所有历史记录,恢复文档到导出前的状态
                // commit=false表示不提交更改,相当于撤销所有操作
                if (suspensionID !== null && executionContext && executionContext.hostControl) {
                    await executionContext.hostControl.resumeHistory(suspensionID, false);
                    console.log('[PS] History rolled back - document restored to original state');
                }
            }

        } catch (e) {
            console.error("[PS] Error exporting group:", e);
            const errorMsg = e.message || String(e) || "Unknown error during group export";
            throw new Error(`Failed to export group: ${errorMsg}`);
        }
    }

    /**
     * 创建或更新Reference和Source图层组并设置颜色
     * Reference组 -> 紫色
     * Source组 -> 绿色
     * 必须在executeAsModal中调用
     * @returns {Promise<Object>} - 返回创建/更新结果
     */
    static async ensureSourceReferenceGroups() {
        try {
            const doc = app.activeDocument;
            if (!doc) {
                throw new Error("No active document");
            }

            console.log('[PS] Checking for Reference/Source groups...');

            // 查找现有的组
            let referenceGroup = null;
            let sourceGroup = null;

            for (const layer of doc.layers) {
                if (layer.kind === "group") {
                    const layerName = layer.name.toLowerCase();
                    if (layerName === "reference") {
                        referenceGroup = layer;
                    } else if (layerName === "source") {
                        sourceGroup = layer;
                    }
                }
            }

            let referenceCreated = false;
            let sourceCreated = false;

            // 先创建Source组（如果不存在），因为后创建的会在上面
            if (!sourceGroup) {
                console.log('[PS] Creating Source group...');
                sourceGroup = await doc.createLayerGroup({
                    name: "Source"
                });
                sourceCreated = true;
            }

            // 后创建Reference组（如果不存在），这样Reference会在Source上面
            if (!referenceGroup) {
                console.log('[PS] Creating Reference group...');
                referenceGroup = await doc.createLayerGroup({
                    name: "Reference"
                });
                referenceCreated = true;
            }

            // 设置Reference组颜色为紫色
            console.log('[PS] Setting Reference group color to violet...');
            await batchPlay([{
                "_obj": "set",
                "_target": [{
                    "_ref": "layer",
                    "_id": referenceGroup.id
                }],
                "to": {
                    "_obj": "layer",
                    "color": {
                        "_enum": "color",
                        "_value": "violet"
                    }
                }
            }], {
                "synchronousExecution": true,
                "modalBehavior": "wait"
            });

            // 设置Source组颜色为绿色
            console.log('[PS] Setting Source group color to green...');
            await batchPlay([{
                "_obj": "set",
                "_target": [{
                    "_ref": "layer",
                    "_id": sourceGroup.id
                }],
                "to": {
                    "_obj": "layer",
                    "color": {
                        "_enum": "color",
                        "_value": "green"
                    }
                }
            }], {
                "synchronousExecution": true,
                "modalBehavior": "wait"
            });

            console.log('[PS] Reference/Source groups ready');

            return {
                success: true,
                referenceCreated,
                sourceCreated,
                referenceGroup: referenceGroup.name,
                sourceGroup: sourceGroup.name
            };

        } catch (e) {
            console.error("[PS] Error ensuring source/reference groups:", e);
            const errorMsg = e.message || String(e) || "Unknown error";
            throw new Error(`Failed to ensure source/reference groups: ${errorMsg}`);
        }
    }

    /**
     * 智能画布比例调整
     * 根据当前画布尺寸,找到最接近的标准比例并扩展画布
     * 不裁切内容,仅在需要时扩展画布
     * 必须在executeAsModal中调用
     * @returns {Promise<Object>} - 返回原始尺寸、新尺寸和目标比例
     */
    static async applySmartCanvasRatio() {
        try {
            const doc = app.activeDocument;
            if (!doc) {
                throw new Error("No active document");
            }

            const currentWidth = doc.width;
            const currentHeight = doc.height;
            console.log(`[PS] Current canvas: ${currentWidth}x${currentHeight}`);

            // 支持的标准比例列表
            const standardRatios = [
                { name: "1:1", ratio: 1/1 },
                { name: "2:3", ratio: 2/3 },
                { name: "3:2", ratio: 3/2 },
                { name: "3:4", ratio: 3/4 },
                { name: "4:3", ratio: 4/3 },
                { name: "4:5", ratio: 4/5 },
                { name: "5:4", ratio: 5/4 },
                { name: "9:16", ratio: 9/16 },
                { name: "16:9", ratio: 16/9 },
                { name: "21:9", ratio: 21/9 }
            ];

            // 计算当前画布的宽高比
            const currentRatio = currentWidth / currentHeight;
            console.log(`[PS] Current ratio: ${currentRatio.toFixed(4)}`);

            // 找到最接近的标准比例
            let closestRatio = standardRatios[0];
            let minDifference = Math.abs(currentRatio - closestRatio.ratio);

            for (const standardRatio of standardRatios) {
                const difference = Math.abs(currentRatio - standardRatio.ratio);
                if (difference < minDifference) {
                    minDifference = difference;
                    closestRatio = standardRatio;
                }
            }

            console.log(`[PS] Closest ratio: ${closestRatio.name} (${closestRatio.ratio.toFixed(4)})`);

            // 计算新的画布尺寸(只扩展,不缩小)
            let newWidth = currentWidth;
            let newHeight = currentHeight;

            const targetRatio = closestRatio.ratio;
            if (currentRatio < targetRatio) {
                // 当前太窄,需要扩展宽度
                newWidth = Math.round(currentHeight * targetRatio);
            } else if (currentRatio > targetRatio) {
                // 当前太宽,需要扩展高度
                newHeight = Math.round(currentWidth / targetRatio);
            } else {
                // 已经是目标比例
                console.log(`[PS] Canvas already matches ${closestRatio.name}`);
                return {
                    originalWidth: currentWidth,
                    originalHeight: currentHeight,
                    newWidth: currentWidth,
                    newHeight: currentHeight,
                    targetRatio: closestRatio.name,
                    changed: false
                };
            }

            console.log(`[PS] New canvas size: ${newWidth}x${newHeight}`);

            // 使用resizeCanvas扩展画布(居中,不裁切)
            await doc.resizeCanvas(newWidth, newHeight, "center");

            console.log(`[PS] Canvas resized successfully to ${closestRatio.name}`);

            return {
                originalWidth: currentWidth,
                originalHeight: currentHeight,
                newWidth: newWidth,
                newHeight: newHeight,
                targetRatio: closestRatio.name,
                changed: true
            };

        } catch (e) {
            console.error("[PS] Error applying smart canvas ratio:", e);
            const errorMsg = e.message || String(e) || "Unknown error";
            throw new Error(`Failed to apply smart canvas ratio: ${errorMsg}`);
        }
    }
}

module.exports = { PSOperations };
