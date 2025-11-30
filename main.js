const { core, app } = require('photoshop');
const { executeAsModal } = core;
const { SettingsManager, ProviderManager } = require('./settings_manager');
const { PresetManager } = require('./presets_manager');
const { ImageGenerator } = require('./image_generator');
const { FileManager } = require('./file_manager');
const { PSOperations } = require('./ps_operations');
const { calculateAspectRatio } = require('./aspect_ratio');

// Initialize managers
const settingsManager = new SettingsManager();
const providerManager = new ProviderManager();
const presetManager = new PresetManager();
const fileManager = new FileManager();
const imageGenerator = new ImageGenerator(fileManager);

// Current state
let currentProvider = null;
let currentPreset = null;
let isGenerating = false;
let generationMode = 'text2img';  // 'text2img' 或 'imgedit'

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', async () => {
    await initializeApp();
});

async function initializeApp() {
    // Load all managers
    await settingsManager.load();
    await providerManager.load();
    await presetManager.load();

    // Setup tabs
    setupTabs();

    // Setup Generate Tab UI
    setupGenerateUI();

    // Setup Utilities Tab UI
    setupUtilitiesUI();

    // Setup Settings Tab UI
    setupSettingsUI();

    // Load selected provider
    const selectedProviderName = settingsManager.get('selected_provider');
    if (selectedProviderName) {
        const providerSelect = document.getElementById('providerSelect');
        providerSelect.value = selectedProviderName;
        loadProviderConfig(selectedProviderName);
    }

    // 恢复最近一次的prompt
    const latestPrompt = settingsManager.get('latest_prompt', '');
    if (latestPrompt) {
        document.getElementById('promptInput').value = latestPrompt;
        console.log(`[UI] Restored latest prompt: ${latestPrompt.substring(0, 50)}...`);
    }

    // 不在初始化时更新 Aspect Ratio，避免闪烁
    // Aspect Ratio 会在生成图片时自动获取
}

function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');

            // Remove active from all tabs
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Add active to clicked tab
            button.classList.add('active');
            document.getElementById(targetTab + 'Tab').classList.add('active');
        });
    });
}

function setupGenerateUI() {
    const presetSelect = document.getElementById('presetSelect');
    const btnAddPreset = document.getElementById('btnAddPreset');
    const btnSavePreset = document.getElementById('btnSavePreset');
    const btnRenamePreset = document.getElementById('btnRenamePreset');
    const btnDeletePreset = document.getElementById('btnDeletePreset');
    const promptInput = document.getElementById('promptInput');
    const btnGenerate = document.getElementById('btnGenerate');
    const btnTestImport = document.getElementById('btnTestImport');
    const btnTestExport = document.getElementById('btnTestExport');
    const btnEnsureGroups = document.getElementById('btnEnsureGroups');
    const selectionModeCheckbox = document.getElementById('selectionModeCheckbox');
    const searchWebCheckbox = document.getElementById('searchWebCheckbox');
    const multiImageModeCheckbox = document.getElementById('multiImageModeCheckbox');
    const multiImageModeSection = document.getElementById('multiImageModeSection');

    // 选区模式复选框
    const savedSelectionMode = settingsManager.get('selection_mode', false);
    selectionModeCheckbox.checked = savedSelectionMode;
    console.log(`[UI] Restored selection mode: ${savedSelectionMode}`);

    selectionModeCheckbox.addEventListener('change', async (e) => {
        await settingsManager.set('selection_mode', e.target.checked);
        console.log(`[UI] Selection mode switched to: ${e.target.checked}`);
    });

    // 搜索网络模式复选框
    const savedSearchWebMode = settingsManager.get('search_web_mode', false);
    searchWebCheckbox.checked = savedSearchWebMode;
    console.log(`[UI] Restored search web mode: ${savedSearchWebMode}`);

    searchWebCheckbox.addEventListener('change', async (e) => {
        await settingsManager.set('search_web_mode', e.target.checked);
        console.log(`[UI] Search web mode switched to: ${e.target.checked}`);
    });

    // 多图生图模式复选框（仅在Image Edit模式下有效）
    const savedMultiImageMode = settingsManager.get('multi_image_mode', false);
    multiImageModeCheckbox.checked = savedMultiImageMode;
    console.log(`[UI] Restored multi-image mode: ${savedMultiImageMode}`);

    multiImageModeCheckbox.addEventListener('change', async (e) => {
        await settingsManager.set('multi_image_mode', e.target.checked);
        console.log(`[UI] Multi-image mode switched to: ${e.target.checked}`);
    });

    // 生图模式按钮
    const btnModeText2Img = document.getElementById('btnModeText2Img');
    const btnModeImgEdit = document.getElementById('btnModeImgEdit');
    const modeButtons = [btnModeText2Img, btnModeImgEdit];

    // 从设置中恢复上次选择的模式
    const savedMode = settingsManager.get('generation_mode', 'text2img');
    generationMode = savedMode;
    
    // 设置按钮状态
    modeButtons.forEach(btn => {
        if (btn.dataset.mode === savedMode) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // 根据当前模式显示/隐藏多图生图模式开关
    if (generationMode === 'imgedit') {
        multiImageModeSection.style.display = 'flex';
    } else {
        multiImageModeSection.style.display = 'none';
    }
    
    console.log(`[UI] Restored generation mode: ${generationMode}`);

    // 生图模式按钮点击事件
    modeButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            // 移除所有 active 状态
            modeButtons.forEach(b => b.classList.remove('active'));
            // 添加当前 active 状态
            btn.classList.add('active');
            // 保存选中的模式
            generationMode = btn.dataset.mode;
            await settingsManager.set('generation_mode', generationMode);
            console.log(`[UI] Generation mode switched to: ${generationMode}`);
            
            // 根据模式显示/隐藏多图生图模式开关
            if (generationMode === 'imgedit') {
                multiImageModeSection.style.display = 'flex';
            } else {
                multiImageModeSection.style.display = 'none';
            }
        });
    });

    // 分辨率按钮
    const btnRes1K = document.getElementById('btnRes1K');
    const btnRes2K = document.getElementById('btnRes2K');
    const btnRes4K = document.getElementById('btnRes4K');
    const resolutionButtons = [btnRes1K, btnRes2K, btnRes4K];
    let selectedResolution = '1K';

    // 从设置中恢复上次选择的分辨率
    const savedResolution = settingsManager.get('generation_resolution', '1K');
    selectedResolution = savedResolution;
    
    // 设置按钮状态
    resolutionButtons.forEach(btn => {
        if (btn.dataset.resolution === savedResolution) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    console.log(`[UI] Restored resolution: ${selectedResolution}`);

    // 分辨率按钮点击事件
    resolutionButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            // 移除所有 active 状态
            resolutionButtons.forEach(b => b.classList.remove('active'));
            // 添加当前 active 状态
            btn.classList.add('active');
            // 保存选中的分辨率
            selectedResolution = btn.dataset.resolution;
            await settingsManager.set('generation_resolution', selectedResolution);
            console.log(`[UI] Resolution switched to: ${selectedResolution}`);
        });
    });

    // Populate preset dropdown
    updatePresetDropdown();

    // 默认选中第一个 preset
    if (presetSelect.options.length > 0) {
        presetSelect.selectedIndex = 0;
        loadPreset(presetSelect.value);
    }

    // Preset selection change
    presetSelect.addEventListener('change', (e) => {
        loadPreset(e.target.value);
    });

    // Add preset
    btnAddPreset.addEventListener('click', async () => {
        const newName = await promptUser('Enter preset name:');
        if (!newName) return;

        const promptInput = document.getElementById('promptInput');
        const currentPrompt = promptInput.value || '';
        const result = await presetManager.addPreset(newName, currentPrompt);

        if (result.success) {
            updatePresetDropdown();
            presetSelect.value = newName;
            currentPreset = newName;
            showGenerateStatus(result.message, 'success');
        } else {
            showGenerateStatus(result.message, 'error');
        }
    });

    // Save preset (update prompt)
    btnSavePreset.addEventListener('click', async () => {
        if (!currentPreset) {
            showGenerateStatus('No preset selected', 'error');
            return;
        }

        const promptInput = document.getElementById('promptInput');
        const result = await presetManager.updatePreset(currentPreset, promptInput.value);
        if (result.success) {
            showGenerateStatus(result.message, 'success');
        } else {
            showGenerateStatus(result.message, 'error');
        }
    });

    // Rename preset
    btnRenamePreset.addEventListener('click', async () => {
        if (!currentPreset) {
            showGenerateStatus('No preset selected', 'error');
            return;
        }

        const newName = await promptUser(`Rename "${currentPreset}" to:`);
        if (!newName) return;

        const result = await presetManager.renamePreset(currentPreset, newName);
        if (result.success) {
            updatePresetDropdown();
            presetSelect.value = newName;
            currentPreset = newName;
            showGenerateStatus(result.message, 'success');
        } else {
            showGenerateStatus(result.message, 'error');
        }
    });

    // Delete preset
    btnDeletePreset.addEventListener('click', async () => {
        if (!currentPreset) {
            showGenerateStatus('No preset selected', 'error');
            return;
        }

        const confirmed = await confirmUser(`Delete preset "${currentPreset}"?`);
        if (!confirmed) return;

        const result = await presetManager.deletePreset(currentPreset);
        if (result.success) {
            updatePresetDropdown();
            if (presetSelect.options.length > 0) {
                presetSelect.selectedIndex = 0;
                loadPreset(presetSelect.value);
            } else {
                currentPreset = null;
                document.getElementById('promptInput').value = '';
            }
            showGenerateStatus(result.message, 'success');
        } else {
            showGenerateStatus(result.message, 'error');
        }
    });

    // Generate button
    btnGenerate.addEventListener('click', async () => {
        await handleGenerateImage();
    });

    // Test Import button
    btnTestImport.addEventListener('click', async () => {
        await handleTestImport();
    });

    // Test Export button
    btnTestExport.addEventListener('click', async () => {
        await handleTestExport();
    });

    // Ensure Groups button
    btnEnsureGroups.addEventListener('click', async () => {
        await handleEnsureGroups();
    });
}

/**
 * 获取当前选中的分辨率
 */
function getSelectedResolution() {
    // 只选择分辨率按钮,不包括模式按钮
    const resolutionButtons = document.querySelectorAll('#btnRes1K, #btnRes2K, #btnRes4K');
    for (let btn of resolutionButtons) {
        if (btn.classList.contains('active')) {
            return btn.dataset.resolution;
        }
    }
    return '1K';  // 默认值
}

function setupUtilitiesUI() {
    const btnSmartCanvasRatio = document.getElementById('btnSmartCanvasRatio');
    const canvasRatioStatus = document.getElementById('canvasRatioStatus');

    // Smart Canvas Ratio 按钮
    btnSmartCanvasRatio.addEventListener('click', async () => {
        await handleSmartCanvasRatio();
    });

    /**
     * 显示 Canvas Ratio 状态消息
     */
    function showCanvasRatioStatus(message, type) {
        canvasRatioStatus.textContent = message;
        canvasRatioStatus.className = 'status-message';

        if (type === 'success') {
            canvasRatioStatus.classList.add('status-success');
        } else if (type === 'error') {
            canvasRatioStatus.classList.add('status-error');
        } else {
            // info or other
            canvasRatioStatus.style.backgroundColor = '#2d4050';
            canvasRatioStatus.style.color = '#a8c5e0';
        }

        // Auto-clear after 5 seconds for success/error
        if (type === 'success' || type === 'error') {
            setTimeout(() => {
                canvasRatioStatus.textContent = '';
                canvasRatioStatus.className = '';
            }, 5000);
        }
    }

    /**
     * 处理智能画布比例调整
     */
    async function handleSmartCanvasRatio() {
        try {
            showCanvasRatioStatus('正在分析画布比例...', 'info');
            btnSmartCanvasRatio.disabled = true;

            // 在 executeAsModal 中执行画布调整
            const result = await executeAsModal(async () => {
                return await PSOperations.applySmartCanvasRatio();
            }, { commandName: "Smart Canvas Ratio" });

            if (!result.changed) {
                showCanvasRatioStatus(
                    `✅ 画布已经是 ${result.targetRatio} 比例 (${result.newWidth}x${result.newHeight})`,
                    'success'
                );
            } else {
                showCanvasRatioStatus(
                    `✅ 画布已调整到 ${result.targetRatio} 比例\n` +
                    `原始: ${result.originalWidth}x${result.originalHeight} → ` +
                    `新尺寸: ${result.newWidth}x${result.newHeight}`,
                    'success'
                );
            }

        } catch (e) {
            console.error('Smart Canvas Ratio failed:', e);
            const errorMessage = e?.message || String(e) || 'Unknown error';
            showCanvasRatioStatus(`❌ 调整失败: ${errorMessage}`, 'error');
        } finally {
            btnSmartCanvasRatio.disabled = false;
        }
    }
}

function setupSettingsUI() {
    const providerSelect = document.getElementById('providerSelect');
    const btnAddProvider = document.getElementById('btnAddProvider');
    const btnSaveProvider = document.getElementById('btnSaveProvider');
    const btnDeleteProvider = document.getElementById('btnDeleteProvider');
    const btnTestConnection = document.getElementById('btnTestConnection');
    const inputApiKey = document.getElementById('inputApiKey');
    const inputBaseUrl = document.getElementById('inputBaseUrl');
    const inputModelId = document.getElementById('inputModelId');
    const debugModeCheckbox = document.getElementById('debugModeCheckbox');
    const debugFolderPathInput = document.getElementById('debugFolderPath');
    const inputMaxSize = document.getElementById('inputMaxSize');
    const inputQuality = document.getElementById('inputQuality');

    // Populate provider dropdown
    updateProviderDropdown();

    // Load debug mode setting
    debugModeCheckbox.checked = settingsManager.get('debug_mode', false);
    
    // Load export settings
    inputMaxSize.value = settingsManager.get('export_max_size', 2048);
    inputQuality.value = settingsManager.get('export_quality', 80);
    
    // Display debug folder path when debug mode is enabled
    updateDebugFolderPath();
    
    debugModeCheckbox.addEventListener('change', async (e) => {
        await settingsManager.set('debug_mode', e.target.checked);
        updateDebugFolderPath();
    });

    // Save export settings on change
    inputMaxSize.addEventListener('change', async (e) => {
        const value = parseInt(e.target.value) || 2048;
        await settingsManager.set('export_max_size', value);
        console.log(`[Settings] Export max size set to: ${value}`);
    });

    inputQuality.addEventListener('change', async (e) => {
        const value = parseInt(e.target.value) || 80;
        await settingsManager.set('export_quality', value);
        console.log(`[Settings] Export quality set to: ${value}`);
    });

    // Provider selection change
    providerSelect.addEventListener('change', async (e) => {
        loadProviderConfig(e.target.value);
        // 立即保存选中的 Provider
        await settingsManager.set('selected_provider', e.target.value);
    });

    // Add new provider
    btnAddProvider.addEventListener('click', async () => {
        const newName = await promptUser('Enter new provider name:');
        if (!newName) return;

        const result = await providerManager.addProvider(newName, '', '', '');
        if (result.success) {
            updateProviderDropdown();
            providerSelect.value = newName;
            loadProviderConfig(newName);
            showStatus(result.message, 'success');
        } else {
            showStatus(result.message, 'error');
        }
    });

    // Save provider
    btnSaveProvider.addEventListener('click', async () => {
        if (!currentProvider) {
            showStatus('No provider selected', 'error');
            return;
        }

        const result = await providerManager.updateProvider(
            currentProvider.name,
            inputApiKey.value,
            inputBaseUrl.value,
            inputModelId.value
        );

        if (result.success) {
            currentProvider.apiKey = inputApiKey.value;
            currentProvider.baseUrl = inputBaseUrl.value;
            currentProvider.model = inputModelId.value;

            // Save as selected provider
            await settingsManager.set('selected_provider', currentProvider.name);
            showStatus('Provider saved successfully', 'success');
        } else {
            showStatus(result.message, 'error');
        }
    });

    // Delete provider
    btnDeleteProvider.addEventListener('click', async () => {
        if (!currentProvider) {
            showStatus('No provider selected', 'error');
            return;
        }

        const confirmed = await confirmUser(`Delete provider "${currentProvider.name}"?`);
        if (!confirmed) return;

        const result = await providerManager.deleteProvider(currentProvider.name);
        if (result.success) {
            updateProviderDropdown();
            if (providerSelect.options.length > 0) {
                providerSelect.selectedIndex = 0;
                loadProviderConfig(providerSelect.value);
            } else {
                clearProviderConfig();
            }
            showStatus(result.message, 'success');
        } else {
            showStatus(result.message, 'error');
        }
    });

    // Test connection
    btnTestConnection.addEventListener('click', async () => {
        if (!currentProvider) {
            showStatus('No provider selected', 'error');
            return;
        }

        showStatus('Testing connection...', 'info');

        // Get current values from input fields
        const testConfig = {
            name: currentProvider.name,
            apiKey: inputApiKey.value,
            baseUrl: inputBaseUrl.value,
            model: inputModelId.value
        };

        const result = await providerManager.testConnection(testConfig);
        if (result.success) {
            showStatus(result.message, 'success');
        } else {
            showStatus(result.message, 'error');
        }
    });
}

/**
 * Main image generation function - implements 3-stage async processing
 */
async function handleGenerateImage() {
    if (isGenerating) {
        showGenerateStatus('Already generating...', 'error');
        return;
    }

    // 检查是否有打开的文档
    if (!app.activeDocument) {
        showGenerateStatus('❌ 请先打开一个文档', 'error');
        return;
    }

    // Validate inputs
    const prompt = document.getElementById('promptInput').value.trim();
    if (!prompt) {
        showGenerateStatus('Please enter a prompt', 'error');
        return;
    }

    if (!currentProvider || !currentProvider.apiKey || !currentProvider.baseUrl) {
        showGenerateStatus('Please configure a provider in Settings', 'error');
        return;
    }

    const resolution = getSelectedResolution();
    const debugMode = settingsManager.get('debug_mode', false);
    const mode = generationMode;  // 'text2img' 或 'imgedit'
    const selectionMode = settingsManager.get('selection_mode', false);
    const searchWebMode = settingsManager.get('search_web_mode', false);  // 搜索网络模式
    const multiImageMode = settingsManager.get('multi_image_mode', false);  // 多图生图模式

    isGenerating = true;
    document.getElementById('btnGenerate').disabled = true;

    try {
        // 保存当前的prompt到settings
        await settingsManager.set('latest_prompt', prompt);
        console.log(`[UI] Saved latest prompt: ${prompt.substring(0, 50)}...`);

        // STAGE 1: Get canvas info and export image if in image edit mode
        showGenerateStatus('获取画布信息...', 'info');

        let aspectRatio = '1:1';
        let canvasInfo = null;
        let exportedImageData = null;  // base64编码的图片数据
        let selectionRegion = null;     // 选区生图区域信息
        let sourceImageData = null;     // 多图模式: source image
        let referenceImageData = null;  // 多图模式: reference image

        try {
            const exportData = await executeAsModal(async (executionContext) => {
                const info = await PSOperations.getCanvasInfo();
                let region = null;
                
                // 如果启用了选区模式，获取选区信息并计算生图区域
                if (selectionMode) {
                    const selectionInfo = await PSOperations.getSelectionInfo();
                    if (selectionInfo && selectionInfo.hasSelection) {
                        // 根据选区计算生图区域
                        region = PSOperations.calculateGenerationRegion(selectionInfo.bounds, info.width, info.height);
                        console.log('[MAIN] Selection region calculated:', region);
                    }
                }
                
                let imageData = null;
                let sourceData = null;
                let referenceData = null;
                const maxSize = settingsManager.get('export_max_size', 2048);
                const quality = settingsManager.get('export_quality', 80);
                
                // 多图模式: 导出Source和Reference组
                if (mode === 'imgedit' && multiImageMode) {
                    console.log('[MAIN] Multi-image mode: Finding Source/Reference groups...');
                    const { sourceGroup, referenceGroup } = await PSOperations.findSourceReferenceGroups();
                    
                    // 导出Source组
                    if (sourceGroup) {
                        console.log('[MAIN] Exporting Source group...');
                        const sourceResult = await PSOperations.exportGroupAsWebP(
                            sourceGroup,
                            maxSize,
                            quality,
                            executionContext,
                            region
                        );
                        sourceData = await fileManager.fileToBase64(sourceResult.file);
                        console.log('[MAIN] Source group exported, base64 length:', sourceData?.length || 0);
                    } else {
                        console.warn('[MAIN] Source group not found');
                    }
                    
                    // 导出Reference组
                    if (referenceGroup) {
                        console.log('[MAIN] Exporting Reference group...');
                        const referenceResult = await PSOperations.exportGroupAsWebP(
                            referenceGroup,
                            maxSize,
                            quality,
                            executionContext,
                            region
                        );
                        referenceData = await fileManager.fileToBase64(referenceResult.file);
                        console.log('[MAIN] Reference group exported, base64 length:', referenceData?.length || 0);
                    } else {
                        console.warn('[MAIN] Reference group not found');
                    }
                }
                // 单图模式: 导出所有可见图层
                else if (mode === 'imgedit') {
                    // 如果有选区区域，导出该区域；否则导出整个画布
                    const exportResult = await PSOperations.exportVisibleLayersAsWebP(
                        maxSize, 
                        quality, 
                        executionContext,
                        region  // 传递选区区域信息
                    );
                    
                    // 转换为base64
                    const base64 = await fileManager.fileToBase64(exportResult.file);
                    imageData = base64;
                }
                
                return { info, imageData, region, sourceData, referenceData };
            }, { commandName: "Get Canvas Info and Export" });

            canvasInfo = exportData.info;
            exportedImageData = exportData.imageData;
            selectionRegion = exportData.region;
            sourceImageData = exportData.sourceData;
            referenceImageData = exportData.referenceData;
            
            // 如果有选区区域，使用选区区域的比例；否则使用整个画布的比例
            if (selectionRegion) {
                aspectRatio = selectionRegion.aspectRatio;
                console.log(`[MAIN] Using selection region aspect ratio: ${aspectRatio}`);
            } else {
                aspectRatio = calculateAspectRatio(canvasInfo.width, canvasInfo.height);
            }
            
            if (mode === 'imgedit') {
                console.log('[MAIN] Image exported, base64 length:', exportedImageData?.length || 0);
            }
        } catch (e) {
            console.warn('Could not get canvas info:', e);
            showGenerateStatus('警告: 无法获取画布信息,使用默认比例 1:1', 'info');
        }

        // STAGE 2: AI generation (NOT in executeAsModal - UI stays responsive)
        const modeText = mode === 'imgedit' ? 'Image Edit' : 'Text to Image';
        const modeDetail = multiImageMode && mode === 'imgedit' ? ' (多图模式)' : '';
        const aspectRatioText = aspectRatio || '1:1';  // 使用默认值避免undefined
        showGenerateStatus(`正在生成图片... (${modeText}${modeDetail}, ${resolution}, ${aspectRatioText})`, 'info');

        const imageFile = await imageGenerator.generate({
            prompt,
            provider: currentProvider,
            aspectRatio,
            resolution,
            debugMode,
            mode: mode,
            searchWeb: searchWebMode,           // 传递搜索网络模式
            inputImage: exportedImageData,      // base64编码的输入图片(仅单图image edit模式)
            sourceImage: sourceImageData,        // base64编码的source图片(多图模式)
            referenceImage: referenceImageData   // base64编码的reference图片(多图模式)
        });

        console.log('[MAIN] Image file generated:', imageFile);
        console.log('[MAIN] Image path:', imageFile?.nativePath);

        if (!imageFile || !imageFile.nativePath) {
            throw new Error('Image generation returned invalid file object');
        }

        // 创建 session token 用于跨上下文传递
        const fs = require('uxp').storage.localFileSystem;
        const imageToken = fs.createSessionToken(imageFile);
        console.log('[MAIN] Created session token for generated image');

        // STAGE 3: Import to Photoshop (needs executeAsModal)
        showGenerateStatus('正在导入图片到Photoshop...', 'info');

        const layerName = await executeAsModal(async () => {
            // 如果有选区区域，使用选区区域导入；否则使用普通导入
            if (selectionRegion) {
                return await PSOperations.importImageInRegion(imageToken, selectionRegion);
            } else {
                return await PSOperations.importImageByToken(imageToken);
            }
        }, { commandName: "Import Generated Image" });

        showGenerateStatus(`✅ 完成！图层: ${layerName}`, 'success');

    } catch (e) {
        console.error('Generation failed:', e);

        // Ensure error message is always a string
        const errorMessage = e?.message || String(e) || 'Unknown error';

        // Debug mode: Save error log
        if (debugMode) {
            try {
                const errorLog = `=== Error Log ===
Time: ${new Date().toISOString()}
Provider: ${currentProvider?.name || 'Unknown'}
Mode: ${mode}
Prompt: ${prompt}
Resolution: ${resolution}
Aspect Ratio: ${aspectRatio || '1:1'}
Error: ${errorMessage}
Stack:
${e?.stack || 'N/A'}
`;
                const logPath = await fileManager.saveLog(errorLog);
                console.log(`[DEBUG] Error log saved to: ${logPath}`);
            } catch (logError) {
                console.error('Failed to save error log:', logError);
            }
        }

        showGenerateStatus(`❌ 生成失败: ${errorMessage}`, 'error');
    } finally {
        isGenerating = false;
        document.getElementById('btnGenerate').disabled = false;
    }
}

/**
 * Test import - import the most recent generated image
 */
async function handleTestImport() {
    if (isGenerating) {
        showGenerateStatus('正在处理中...', 'error');
        return;
    }

    isGenerating = true;
    document.getElementById('btnGenerate').disabled = true;
    document.getElementById('btnTestImport').disabled = true;

    try {
        showGenerateStatus('🔍 查找最近生成的图片...', 'info');

        // Get the latest image session token
        console.log('[TEST] Step 1: Getting latest image token...');
        const token = await fileManager.getLatestImageToken();

        if (!token) {
            showGenerateStatus('⚠️ 没有找到生成的图片，请先生成一张图', 'error');
            return;
        }

        console.log('[TEST] Step 2: Got token:', token);
        
        const selectionMode = settingsManager.get('selection_mode', false);
        const regionText = selectionMode ? ' (选区模式)' : '';
        showGenerateStatus(`📥 正在导入图片${regionText}...`, 'info');

        // Import to Photoshop using token
        console.log('[TEST] Step 3: Calling executeAsModal...');
        const layerName = await executeAsModal(async () => {
            console.log('[TEST] Step 4: Inside executeAsModal...');
            
            let region = null;
            
            // 如果启用了选区模式，获取选区信息
            if (selectionMode) {
                const doc = app.activeDocument;
                if (doc) {
                    const selectionInfo = await PSOperations.getSelectionInfo();
                    if (selectionInfo && selectionInfo.hasSelection) {
                        region = PSOperations.calculateGenerationRegion(selectionInfo.bounds, doc.width, doc.height);
                        console.log('[TEST] Using selection region:', region);
                    }
                }
            }
            
            // 根据是否有选区区域选择导入方法
            if (region) {
                return await PSOperations.importImageInRegion(token, region);
            } else {
                return await PSOperations.importImageByToken(token);
            }
        }, { commandName: "Test Import Image" });

        console.log('[TEST] Step 5: Import completed, layerName:', layerName);
        showGenerateStatus(`✅ 测试导入成功${regionText}！图层: ${layerName}`, 'success');

    } catch (e) {
        console.error('[TEST] ERROR in handleTestImport:', e);
        console.error('[TEST] Error message:', e?.message);
        console.error('[TEST] Error stack:', e?.stack);
        const errorMessage = e?.message || String(e) || 'Unknown error';
        showGenerateStatus(`❌ 导入失败: ${errorMessage}`, 'error');
    } finally {
        isGenerating = false;
        document.getElementById('btnGenerate').disabled = false;
        document.getElementById('btnTestImport').disabled = false;
    }
}

/**
 * Test export - 测试导出当前可见图层
 */
async function handleTestExport() {
    if (isGenerating) {
        showGenerateStatus('正在处理中...', 'error');
        return;
    }

    isGenerating = true;
    document.getElementById('btnGenerate').disabled = true;
    document.getElementById('btnTestExport').disabled = true;

    try {
        showGenerateStatus('📤 正在导出图层...', 'info');

        const maxSize = settingsManager.get('export_max_size', 2048);
        const quality = settingsManager.get('export_quality', 80);
        const selectionMode = settingsManager.get('selection_mode', false);
        const multiImageMode = settingsManager.get('multi_image_mode', false);

        console.log(`[TEST EXPORT] Exporting with maxSize=${maxSize}, quality=${quality}, selectionMode=${selectionMode}, multiImageMode=${multiImageMode}`);

        const exportResults = await executeAsModal(async (executionContext) => {
            let region = null;
            
            // 如果启用了选区模式，获取选区信息
            if (selectionMode) {
                const doc = app.activeDocument;
                if (doc) {
                    const selectionInfo = await PSOperations.getSelectionInfo();
                    if (selectionInfo && selectionInfo.hasSelection) {
                        region = PSOperations.calculateGenerationRegion(selectionInfo.bounds, doc.width, doc.height);
                        console.log('[TEST EXPORT] Using selection region:', region);
                    }
                }
            }
            
            // 多图模式: 分别导出Source和Reference组
            if (multiImageMode && generationMode === 'imgedit') {
                console.log('[TEST EXPORT] Multi-image mode: Finding Source/Reference groups...');
                const { sourceGroup, referenceGroup } = await PSOperations.findSourceReferenceGroups();
                
                const results = { mode: 'multi' };
                
                if (sourceGroup) {
                    console.log('[TEST EXPORT] Exporting Source group...');
                    results.source = await PSOperations.exportGroupAsWebP(sourceGroup, maxSize, quality, executionContext, region);
                }
                
                if (referenceGroup) {
                    console.log('[TEST EXPORT] Exporting Reference group...');
                    results.reference = await PSOperations.exportGroupAsWebP(referenceGroup, maxSize, quality, executionContext, region);
                }
                
                return results;
            }
            // 单图模式: 导出所有可见图层
            else {
                const result = await PSOperations.exportVisibleLayersAsWebP(maxSize, quality, executionContext, region);
                return { mode: 'single', result };
            }
        }, { commandName: "Test Export Layers" });

        // 显示结果
        const regionText = selectionMode ? ' (选区模式)' : '';
        
        if (exportResults.mode === 'multi') {
            let message = `✅ 多图导出成功${regionText}！\n`;
            
            if (exportResults.source) {
                console.log('[TEST EXPORT] Source exported:', exportResults.source.file.nativePath);
                message += `Source: ${exportResults.source.file.nativePath}\n尺寸: ${exportResults.source.width}x${exportResults.source.height}\n`;
            }
            
            if (exportResults.reference) {
                console.log('[TEST EXPORT] Reference exported:', exportResults.reference.file.nativePath);
                message += `Reference: ${exportResults.reference.file.nativePath}\n尺寸: ${exportResults.reference.width}x${exportResults.reference.height}`;
            }
            
            if (!exportResults.source && !exportResults.reference) {
                message = `⚠️ 未找到Source/Reference组`;
            }
            
            showGenerateStatus(message, 'success');
        } else {
            const result = exportResults.result;
            console.log('[TEST EXPORT] Export completed:', result);
            console.log('[TEST EXPORT] File path:', result.file.nativePath);
            console.log('[TEST EXPORT] Export size:', result.width, 'x', result.height);
            showGenerateStatus(`✅ 导出成功${regionText}！\n路径: ${result.file.nativePath}\n尺寸: ${result.width}x${result.height}`, 'success');
        }

    } catch (e) {
        console.error('[TEST EXPORT] ERROR:', e);
        const errorMessage = e?.message || String(e) || 'Unknown error';
        showGenerateStatus(`❌ 导出失败: ${errorMessage}`, 'error');
    } finally {
        isGenerating = false;
        document.getElementById('btnGenerate').disabled = false;
        document.getElementById('btnTestExport').disabled = false;
    }
}

/**
 * 创建/更新Reference和Source组并设置颜色
 */
async function handleEnsureGroups() {
    if (isGenerating) {
        showGenerateStatus('正在处理中...', 'error');
        return;
    }

    // 检查是否有打开的文档
    if (!app.activeDocument) {
        showGenerateStatus('❌ 请先打开一个文档', 'error');
        return;
    }

    isGenerating = true;
    const btnEnsureGroups = document.getElementById('btnEnsureGroups');
    btnEnsureGroups.disabled = true;

    try {
        showGenerateStatus('🔧 正在创建/更新图层组...', 'info');

        const result = await executeAsModal(async () => {
            return await PSOperations.ensureSourceReferenceGroups();
        }, { commandName: "Ensure Reference/Source Groups" });

        if (result.success) {
            const parts = [];
            if (result.referenceCreated) {
                parts.push('Reference组(紫色)');
            }
            if (result.sourceCreated) {
                parts.push('Source组(绿色)');
            }
            
            let message;
            if (parts.length > 0) {
                message = `✅ 已创建: ${parts.join(', ')}`;
            } else {
                message = '✅ Reference组(紫色)和Source组(绿色)已存在,颜色已更新';
            }
            
            showGenerateStatus(message, 'success');
            console.log('[UI] Groups ensured:', result);
        }

    } catch (e) {
        console.error('[UI] Error ensuring groups:', e);
        const errorMessage = e?.message || String(e) || 'Unknown error';
        showGenerateStatus(`❌ 操作失败: ${errorMessage}`, 'error');
    } finally {
        isGenerating = false;
        btnEnsureGroups.disabled = false;
    }
}

function updatePresetDropdown() {
    const presetSelect = document.getElementById('presetSelect');
    presetSelect.innerHTML = '';

    const names = presetManager.getAllNames();
    names.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        presetSelect.appendChild(option);
    });
}

function loadPreset(presetName) {
    const prompt = presetManager.getPrompt(presetName);
    currentPreset = presetName;
    document.getElementById('promptInput').value = prompt;
}

function updateProviderDropdown() {
    const providerSelect = document.getElementById('providerSelect');
    providerSelect.innerHTML = '';

    const names = providerManager.getAllNames();
    names.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        providerSelect.appendChild(option);
    });
}

function loadProviderConfig(providerName) {
    const provider = providerManager.getProvider(providerName);
    if (!provider) {
        clearProviderConfig();
        return;
    }

    currentProvider = provider;

    const inputApiKey = document.getElementById('inputApiKey');
    const inputBaseUrl = document.getElementById('inputBaseUrl');
    const inputModelId = document.getElementById('inputModelId');

    inputApiKey.value = provider.apiKey || '';
    inputBaseUrl.value = provider.baseUrl || '';
    inputModelId.value = provider.model || '';
}

function clearProviderConfig() {
    currentProvider = null;
    document.getElementById('inputApiKey').value = '';
    document.getElementById('inputBaseUrl').value = '';
    document.getElementById('inputModelId').value = '';
}

function showStatus(message, type) {
    const statusDiv = document.getElementById('connectionStatus');
    statusDiv.textContent = message;
    statusDiv.className = 'status-message';

    if (type === 'success') {
        statusDiv.classList.add('status-success');
    } else if (type === 'error') {
        statusDiv.classList.add('status-error');
    } else {
        // info or other
        statusDiv.style.backgroundColor = '#2d4050';
        statusDiv.style.color = '#a8c5e0';
    }

    // Auto-clear after 5 seconds
    setTimeout(() => {
        statusDiv.textContent = '';
        statusDiv.className = '';
    }, 5000);
}

function showGenerateStatus(message, type) {
    const statusDiv = document.getElementById('generateStatus');
    statusDiv.textContent = message;
    statusDiv.className = 'status-message';

    if (type === 'success') {
        statusDiv.classList.add('status-success');
    } else if (type === 'error') {
        statusDiv.classList.add('status-error');
    } else {
        // info or other
        statusDiv.style.backgroundColor = '#2d4050';
        statusDiv.style.color = '#a8c5e0';
    }

    // Only auto-clear success/error, keep info
    if (type === 'success' || type === 'error') {
        setTimeout(() => {
            statusDiv.textContent = '';
            statusDiv.className = '';
        }, 5000);
    }
}

/**
 * 显示一个自定义的输入对话框
 * @param {string} message - 提示消息
 * @param {string} defaultValue - 默认值
 * @returns {Promise<string|null>} 用户输入的值或null（取消时）
 */
async function promptUser(message, defaultValue = '') {
    return new Promise((resolve) => {
        // 创建对话框
        const dialog = document.createElement('dialog');
        dialog.style.backgroundColor = '#323232';
        dialog.style.color = '#ffffff';
        dialog.style.border = '1px solid #4a4a4a';
        dialog.style.borderRadius = '6px';
        dialog.style.padding = '0';
        dialog.style.minWidth = '400px';

        // 创建内容容器
        const container = document.createElement('div');
        container.style.padding = '20px';

        // 标题
        const title = document.createElement('h3');
        title.textContent = message;
        title.style.margin = '0 0 16px 0';
        title.style.fontSize = '14px';
        title.style.fontWeight = 'normal';
        container.appendChild(title);

        // 输入框
        const input = document.createElement('input');
        input.type = 'text';
        input.value = defaultValue;
        input.style.width = '100%';
        input.style.padding = '8px';
        input.style.backgroundColor = '#1e1e1e';
        input.style.color = '#fff';
        input.style.border = '1px solid #4a4a4a';
        input.style.borderRadius = '3px';
        input.style.fontSize = '13px';
        input.style.boxSizing = 'border-box';
        input.style.marginBottom = '16px';
        container.appendChild(input);

        // 按钮容器
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '8px';
        buttonContainer.style.justifyContent = 'flex-end';

        // 取消按钮
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'secondary';
        cancelBtn.style.padding = '8px 16px';
        cancelBtn.addEventListener('click', () => {
            dialog.close();
            resolve(null);
        });
        buttonContainer.appendChild(cancelBtn);

        // 确定按钮
        const okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
        okBtn.style.padding = '8px 16px';
        okBtn.addEventListener('click', () => {
            const value = input.value.trim();
            dialog.close();
            resolve(value || null);
        });
        buttonContainer.appendChild(okBtn);

        container.appendChild(buttonContainer);
        dialog.appendChild(container);

        // 处理对话框关闭事件
        dialog.addEventListener('close', () => {
            dialog.remove();
        });

        // 处理ESC键取消
        dialog.addEventListener('cancel', (e) => {
            e.preventDefault();
            dialog.close();
            resolve(null);
        });

        // 处理回车键确认
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const value = input.value.trim();
                dialog.close();
                resolve(value || null);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                dialog.close();
                resolve(null);
            }
        });

        // 显示对话框
        document.body.appendChild(dialog);
        dialog.showModal();
        
        // 聚焦输入框并选中默认值
        setTimeout(() => {
            input.focus();
            if (defaultValue) {
                input.select();
            }
        }, 50);
    });
}

async function confirmUser(message) {
    try {
        // 使用 UXP 的 confirm() 函数
        // 返回 true 表示用户点击确定，false 表示取消
        const result = confirm(message + '\n\nContinue?');
        return result;
    } catch (e) {
        console.error(e);
        return false;
    }
}

/**
 * Update debug folder path display
 */
async function updateDebugFolderPath() {
    const debugModeEnabled = settingsManager.get('debug_mode', false);
    const pathInput = document.getElementById('debugFolderPath');
    
    if (!debugModeEnabled) {
        pathInput.value = '';
        pathInput.placeholder = '启用 Debug Mode 后显示路径';
        return;
    }
    
    try {
        const folder = await fileManager.getLogFolder();
        pathInput.value = folder.nativePath;
        pathInput.placeholder = '';
    } catch (e) {
        console.error('Failed to get debug folder path:', e);
        pathInput.value = '';
        pathInput.placeholder = `⚠️ 无法获取路径: ${e.message}`;
    }
}
