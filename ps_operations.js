const { app } = require("photoshop");
const { batchPlay } = require("photoshop").action;
const { executeAsModal } = require("photoshop").core;
const fs = require("uxp").storage.localFileSystem;

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

            // Calculate scale to fill canvas
            const scaleX = (canvasWidth / layerWidth) * 100;
            const scaleY = (canvasHeight / layerHeight) * 100;

            // Use the larger scale to ensure it fills
            const scale = Math.max(scaleX, scaleY);

            console.log(`[PS] Scaling layer to ${scale.toFixed(2)}%`);

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
     * Move layer to top
     */
    static async moveLayerToTop(layer) {
        try {
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
     * @returns {Promise<Object>} - 包含file和token的对象
     */
    static async exportVisibleLayersAsWebP(maxSize = 2048, quality = 80, executionContext = null) {
        try {
            const doc = app.activeDocument;
            if (!doc) {
                throw new Error("No active document");
            }

            console.log(`[PS] Exporting visible layers as WebP (maxSize: ${maxSize}, quality: ${quality})`);

            // 获取画布尺寸
            const canvasWidth = doc.width;
            const canvasHeight = doc.height;
            console.log(`[PS] Original canvas size: ${canvasWidth}x${canvasHeight}`);

            // 计算导出尺寸,保持宽高比
            let exportWidth = canvasWidth;
            let exportHeight = canvasHeight;
            const maxDimension = Math.max(canvasWidth, canvasHeight);
            
            if (maxDimension > maxSize) {
                const scale = maxSize / maxDimension;
                exportWidth = Math.round(canvasWidth * scale);
                exportHeight = Math.round(canvasHeight * scale);
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

            // 挂起历史记录,提升性能并避免污染用户的历史面板
            let suspensionID = null;
            if (executionContext && executionContext.hostControl) {
                suspensionID = await executionContext.hostControl.suspendHistory({
                    "documentID": doc.id,
                    "name": "Banana Export"
                });
                console.log('[PS] History suspended for export operation');
            }

            try {
                // 如果需要缩放,先复制文档
                let targetDoc = doc;
                let needsCleanup = false;
                
                if (maxDimension > maxSize) {
                    console.log('[PS] Creating duplicate document for resize...');
                    // 复制文档并合并图层
                    targetDoc = await doc.duplicate(`temp_export_${timestamp}`, true);
                    needsCleanup = true;
                    
                    // 调整图像大小 - 使用resizeImage而不是resizeCanvas
                    await targetDoc.resizeImage(exportWidth, exportHeight);
                }

                // 使用batchPlay保存WebP格式
                // 必须先创建session token,因为batchPlay不接受直接的file对象
                const fileToken = fs.createSessionToken(webpFile);
                
                await batchPlay([
                {
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
                        "_path": fileToken,  // 使用session token而不是nativePath
                        "_kind": "local"
                    },
                    "copy": needsCleanup ? false : true,  // 临时文档无需copy,节省内存
                    "lowerCase": true,
                    "_isCommand": true
                }
                ], {
                    "synchronousExecution": true,
                    "modalBehavior": "wait"
                });

                // 清理临时文档
                if (needsCleanup) {
                    await targetDoc.closeWithoutSaving();
                }

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
                // 恢复历史记录
                if (suspensionID !== null && executionContext && executionContext.hostControl) {
                    await executionContext.hostControl.resumeHistory(suspensionID);
                    console.log('[PS] History resumed');
                }
            }

        } catch (e) {
            console.error("[PS] Error exporting visible layers:", e);
            const errorMsg = e.message || String(e) || "Unknown error during export";
            throw new Error(`Failed to export visible layers: ${errorMsg}`);
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
