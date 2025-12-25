const fs = require('uxp').storage.localFileSystem;

/**
 * Manages temporary files for AI image generation
 * Creates and manages files in AppData\Local\PS_Banana
 */
class FileManager {
    constructor() {
        this.logDirName = 'Logs'; // For debug logs only
        this.logDirPath = null;
        this.imageDirName = 'GeneratedImages'; // For generated images
        this.imageDirPath = null;
    }

    /**
     * Get or create the log directory for debug files
     * Uses UXP plugin data folder (no user permission needed)
     * 每次都检查目录是否存在，防止目录被删除后缓存失效
     * @returns {Promise<Folder>}
     */
    async getLogFolder() {
        try {
            // Use getDataFolder() - plugin-specific data folder
            const dataFolder = await fs.getDataFolder();

            // 尝试获取现有目录，如果不存在则创建
            try {
                this.logDirPath = await dataFolder.getEntry(this.logDirName);
            } catch {
                // 目录不存在，创建新目录
                console.log(`[FileManager] Log folder not found, creating: ${this.logDirName}`);
                this.logDirPath = await dataFolder.createFolder(this.logDirName);
            }

            console.log('[FileManager] Log folder path:', this.logDirPath.nativePath);
            return this.logDirPath;
        } catch (e) {
            console.error('[FileManager] Error getting log folder:', e);
            throw e;
        }
    }

    /**
     * Get or create the image directory for generated images
     * Uses plugin data folder (same as logs, no permission needed)
     * 每次都检查目录是否存在，防止目录被删除后缓存失效
     * @returns {Promise<Folder>}
     */
    async getImageFolder() {
        try {
            // Use getDataFolder() for generated images too
            // This ensures no permission issues
            const dataFolder = await fs.getDataFolder();

            // 尝试获取现有目录，如果不存在则创建
            try {
                this.imageDirPath = await dataFolder.getEntry(this.imageDirName);
            } catch {
                // 目录不存在，创建新目录
                console.log(`[FileManager] Image folder not found, creating: ${this.imageDirName}`);
                this.imageDirPath = await dataFolder.createFolder(this.imageDirName);
            }

            console.log('[FileManager] Image folder path:', this.imageDirPath.nativePath);
            return this.imageDirPath;
        } catch (e) {
            console.error('[FileManager] Error getting image folder:', e);
            throw e;
        }
    }

    /**
     * Get or create the workflows directory
     */
    async getWorkflowsFolder() {
        try {
            const dataFolder = await fs.getDataFolder();
            let workflowsFolder;
            try {
                workflowsFolder = await dataFolder.getEntry('Workflows');
            } catch {
                console.log(`[FileManager] Workflows folder not found, creating...`);
                workflowsFolder = await dataFolder.createFolder('Workflows');
            }
            return workflowsFolder;
        } catch (e) {
            console.error('[FileManager] Error getting workflows folder:', e);
            throw e;
        }
    }

    /**
     * Load a workflow JSON file
     */
    async loadWorkflowFile(filename) {
        try {
            const folder = await this.getWorkflowsFolder();
            const entry = await folder.getEntry(filename);
            const content = await entry.read();
            return JSON.parse(content);
        } catch {
            return null; // File not found or error
        }
    }

    /**
     * Save a workflow JSON file
     */
    async saveWorkflowFile(filename, workflowData) {
        try {
            const folder = await this.getWorkflowsFolder();
            const file = await folder.createFile(filename, { overwrite: true });
            await file.write(JSON.stringify(workflowData, null, 4));
            console.log(`[FileManager] Saved workflow: ${filename}`);
            return file.nativePath;
        } catch (e) {
            console.error('[FileManager] Error saving workflow file:', e);
            return null;
        }
    }

    /**
     * Backward compatibility - getTempFolder now returns log folder
     * @deprecated Use getLogFolder() or getImageFolder() instead
     */
    async getTempFolder() {
        return await this.getLogFolder();
    }

    /**
     * Save payload to debug file
     */
    async savePayload(payload, providerName) {
        try {
            const folder = await this.getLogFolder();
            const timestamp = this._getTimestamp();
            const filename = `payload_${providerName.replace(/\s/g, '_')}_${timestamp}.json`;
            const file = await folder.createFile(filename, { overwrite: true });
            const content = JSON.stringify(payload, null, 2);
            await file.write(content);
            console.log(`[DEBUG] Payload saved to: ${file.nativePath}`);
            return file.nativePath;
        } catch (e) {
            console.error('Error saving payload:', e);
            return null;
        }
    }

    /**
     * Save response to debug file
     */
    async saveResponse(response, providerName) {
        try {
            const folder = await this.getLogFolder();
            const timestamp = this._getTimestamp();
            const filename = `response_${providerName.replace(/\s/g, '_')}_${timestamp}.json`;
            const file = await folder.createFile(filename, { overwrite: true });
            const content = JSON.stringify(response, null, 2);
            await file.write(content);
            console.log(`[DEBUG] Response saved to: ${file.nativePath}`);
            return file.nativePath;
        } catch (e) {
            console.error('Error saving response:', e);
            return null;
        }
    }

    /**
     * Save log message to debug file
     */
    async saveLog(message) {
        try {
            const folder = await this.getLogFolder();
            const timestamp = this._getTimestamp();
            const filename = `error_${timestamp}.txt`;
            const file = await folder.createFile(filename, { overwrite: true });
            await file.write(message);
            console.log(`[DEBUG] Log saved to: ${file.nativePath}`);
            return file.nativePath;
        } catch (e) {
            console.error('Error saving log:', e);
            return null;
        }
    }

    /**
     * 保存任务日志到固定文件（用于多任务调试）
     * @param {string} content - 日志内容
     * @returns {Promise<string|null>} 文件路径
     */
    async saveTaskLog(content) {
        try {
            const folder = await this.getLogFolder();
            const filename = `task_debug_log.txt`;
            const file = await folder.createFile(filename, { overwrite: true });
            await file.write(content);
            return file.nativePath;
        } catch (e) {
            console.error('Error saving task log:', e);
            return null;
        }
    }

    /**
     * Save image data (base64 or binary) to file
     * @param {string} base64Data - Base64 image data (without data:image prefix)
     * @param {string} extension - File extension (png, jpg, webp)
     * @returns {Promise<File>}
     */
    async saveImageFromBase64(base64Data, extension = 'png') {
        try {
            const folder = await this.getImageFolder();
            const timestamp = this._getTimestamp();
            const filename = `generated_image_${timestamp}.${extension}`;

            // Decode base64 to binary
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            const file = await folder.createFile(filename, { overwrite: true });
            await file.write(bytes.buffer, { format: require('uxp').storage.formats.binary });

            console.log(`[IMAGE] Image saved to: ${file.nativePath}`);
            return file;
        } catch (e) {
            console.error('Error saving image from base64:', e);
            throw e;
        }
    }

    /**
     * Download image from URL and save to temp folder
     * @param {string} url - Image URL
     * @returns {Promise<File>}
     */
    async downloadImage(url) {
        try {
            const folder = await this.getImageFolder();
            const timestamp = this._getTimestamp();

            // Determine extension from URL
            let extension = 'png';
            if (url.includes('.webp')) extension = 'webp';
            else if (url.includes('.jpg') || url.includes('.jpeg')) extension = 'jpg';

            const filename = `generated_image_${timestamp}.${extension}`;

            // Fetch the image
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to download image: ${response.status}`);
            }

            const arrayBuffer = await response.arrayBuffer();

            const file = await folder.createFile(filename, { overwrite: true });
            await file.write(arrayBuffer, { format: require('uxp').storage.formats.binary });

            console.log(`[IMAGE] Image downloaded to: ${file.nativePath}`);
            return file;
        } catch (e) {
            console.error('Error downloading image:', e);
            throw e;
        }
    }

    /**
     * Get timestamp string for file naming
     */
    _getTimestamp() {
        const now = new Date();
        return (
            now.getFullYear().toString() +
            (now.getMonth() + 1).toString().padStart(2, '0') +
            now.getDate().toString().padStart(2, '0') +
            now.getHours().toString().padStart(2, '0') +
            now.getMinutes().toString().padStart(2, '0') +
            now.getSeconds().toString().padStart(2, '0')
        );
    }

    /**
     * Clean up old files in both log and image folders
     */
    async cleanupOldFiles(daysOld = 7) {
        try {
            const maxAge = daysOld * 24 * 60 * 60 * 1000;
            const now = Date.now();

            // Clean up log folder
            const logFolder = await this.getLogFolder();
            await this._cleanupFolder(logFolder, now, maxAge);

            // Clean up image folder
            const imageFolder = await this.getImageFolder();
            await this._cleanupFolder(imageFolder, now, maxAge);
        } catch (e) {
            console.error('Error cleaning up files:', e);
        }
    }

    async _cleanupFolder(folder, now, maxAge) {
        try {
            const entries = await folder.getEntries();
            for (const entry of entries) {
                if (!entry.isFile) continue;

                try {
                    const stats = await entry.getMetadata();
                    if (stats.modificationTime && now - stats.modificationTime > maxAge) {
                        await entry.delete();
                    }
                } catch {
                    // Metadata not available, skip
                }
            }
        } catch (e) {
            console.error('Error cleaning folder:', e);
        }
    }

    /**
     * Open the log folder in system file explorer
     * @returns {Promise<boolean>} Success status
     */
    async openLogFolder() {
        try {
            console.log('[FileManager] Opening log folder...');
            const folder = await this.getLogFolder();
            const folderPath = folder.nativePath;
            console.log('[FileManager] Log folder path:', folderPath);

            // 使用 shell.openPath() 打开文件夹
            const shell = require('uxp').shell;

            // 方法 1: 尝试 shell.openPath()
            console.log('[FileManager] Method 1: Attempting shell.openPath...');
            const result = await shell.openPath(folderPath);
            console.log('[FileManager] shell.openPath result:', result, 'type:', typeof result);

            if (result === '') {
                console.log('[FileManager] Folder opened successfully');
                return true;
            }

            // 方法 1 失败，记录详细信息并复制路径到剪贴板
            console.error('[FileManager] shell.openPath failed:', result);
            console.log('[FileManager] Copying path to clipboard as fallback...');

            await navigator.clipboard.writeText(folderPath);
            console.log('[FileManager] Path copied to clipboard');

            throw new Error(`无法自动打开文件夹，路径已复制到剪贴板，请手动打开: ${folderPath}`);
        } catch (e) {
            // 检查是否是我们主动抛出的错误（路径已复制）
            if (e.message && e.message.includes('路径已复制到剪贴板')) {
                throw e;
            }

            // 其他错误，也尝试复制路径
            console.error('[FileManager] Unexpected error in openLogFolder:', e);
            console.error('[FileManager] Error details:', e.message, e.stack);

            try {
                const folder = await this.getLogFolder();
                await navigator.clipboard.writeText(folder.nativePath);
                throw new Error(`发生错误，路径已复制到剪贴板: ${folder.nativePath}`);
            } catch {
                throw new Error(`无法打开文件夹: ${e.message}`);
            }
        }
    }

    /**
     * Get the most recent generated image file token
     * Token can be safely passed across contexts
     * @returns {Promise<string|null>} File session token or null
     */
    async getLatestImageToken() {
        try {
            const folder = await this.getImageFolder();
            const entries = await folder.getEntries();

            // Filter for image files
            const imageFiles = entries.filter((entry) => {
                if (!entry.isFile) return false;
                const name = entry.name.toLowerCase();
                return (
                    name.startsWith('generated_image_') &&
                    (name.endsWith('.png') ||
                        name.endsWith('.jpg') ||
                        name.endsWith('.jpeg') ||
                        name.endsWith('.webp'))
                );
            });

            if (imageFiles.length === 0) {
                console.log('[FileManager] No generated images found');
                return null;
            }

            // 使用文件名中的时间戳排序（更可靠）
            // 文件名格式: generated_image_20251129161530.png
            imageFiles.sort((a, b) => {
                const extractTimestamp = (name) => {
                    const match = name.match(/generated_image_(\d+)\.(png|jpg|jpeg|webp)/);
                    return match ? match[1] : '0';
                };
                const timeA = extractTimestamp(a.name);
                const timeB = extractTimestamp(b.name);
                return timeB.localeCompare(timeA); // 降序排列，最新的在前
            });

            const latestFile = imageFiles[0];

            // Create a session token for the file
            const token = fs.createSessionToken(latestFile);
            console.log('[FileManager] Latest image token created for:', latestFile.name);
            console.log('[FileManager] Token:', token);
            return token;
        } catch (e) {
            console.error('[FileManager] Error getting latest image token:', e);
            return null;
        }
    }

    /**
     * Get file object from session token
     * Must be called in the context where it will be used
     * @param {string} token - Session token
     * @returns {Promise<File>} File object
     */
    async getFileFromToken(token) {
        try {
            console.log('[FileManager] Step A: Getting file from session token:', token);
            // 使用 getEntryForSessionToken 来解析 session token
            const file = await fs.getEntryForSessionToken(token);

            console.log('[FileManager] Step B: Got file object');
            console.log('[FileManager] - File name:', file.name);
            console.log('[FileManager] - File nativePath:', file.nativePath);
            console.log('[FileManager] - File isFile:', file.isFile);

            return file;
        } catch (e) {
            console.error('[FileManager] ERROR getting file from token:', e);
            console.error('[FileManager] - Token:', token);
            console.error('[FileManager] - Error message:', e.message);
            throw new Error(`Cannot access file from token - ${e.message}`);
        }
    }

    /**
     * 将图片文件转换为Base64编码
     * @param {File} file - UXP File对象
     * @returns {Promise<string>} Base64字符串(不包含data:image前缀)
     */
    async fileToBase64(file) {
        try {
            console.log(`[FileManager] Converting file to base64: ${file.name}`);

            // 读取文件为二进制
            const arrayBuffer = await file.read({ format: require('uxp').storage.formats.binary });
            const bytes = new Uint8Array(arrayBuffer);

            // 转换为base64
            let binaryString = '';
            for (let i = 0; i < bytes.length; i++) {
                binaryString += String.fromCharCode(bytes[i]);
            }
            const base64 = btoa(binaryString);

            console.log(`[FileManager] Base64 conversion complete, length: ${base64.length}`);
            return base64;
        } catch (e) {
            console.error('[FileManager] Error converting file to base64:', e);
            throw e;
        }
    }

    /**
     * 将图片文件转换为Data URL(包含mime type)
     * @param {File} file - UXP File对象
     * @returns {Promise<string>} Data URL字符串
     */
    async fileToDataURL(file) {
        try {
            const base64 = await this.fileToBase64(file);

            // 根据文件扩展名确定mime type
            const ext = file.name.split('.').pop().toLowerCase();
            let mimeType = 'image/png';
            if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
            else if (ext === 'webp') mimeType = 'image/webp';

            return `data:${mimeType};base64,${base64}`;
        } catch (e) {
            console.error('[FileManager] Error converting file to data URL:', e);
            throw e;
        }
    }
}

module.exports = { FileManager };
