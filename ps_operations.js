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
}

module.exports = { PSOperations };
