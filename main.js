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
let generationMode = 'text2img';  // 'text2img' or 'imgedit'

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

    // Setup Settings Tab UI
    setupSettingsUI();

    // Load selected provider
    const selectedProviderName = settingsManager.get('selected_provider');
    if (selectedProviderName) {
        // We need to wait for dropdown to be populated, but updateProviderDropdown is called in setupSettingsUI
        // Just set the value
        const providerSelect = document.getElementById('providerSelect');
        providerSelect.value = selectedProviderName;
        loadProviderConfig(selectedProviderName);
    }

    // Restore latest prompt
    const latestPrompt = settingsManager.get('latest_prompt', '');
    if (latestPrompt) {
        document.getElementById('promptInput').value = latestPrompt;
        console.log(`[UI] Restored latest prompt: ${latestPrompt.substring(0, 50)}...`);
    }
}

function setupTabs() {
    const tabGenerate = document.getElementById('tabGenerate');
    const tabSettings = document.getElementById('tabSettings');
    const contentGenerate = document.getElementById('contentGenerate');
    const contentSettings = document.getElementById('contentSettings');

    function switchTab(tabId) {
        if (tabId === 'generate') {
            tabGenerate.classList.add('selected');
            tabSettings.classList.remove('selected');
            contentGenerate.classList.remove('hidden');
            contentSettings.classList.add('hidden');
        } else {
            tabGenerate.classList.remove('selected');
            tabSettings.classList.add('selected');
            contentGenerate.classList.add('hidden');
            contentSettings.classList.remove('hidden');
        }
    }

    tabGenerate.addEventListener('click', () => switchTab('generate'));
    tabSettings.addEventListener('click', () => switchTab('settings'));

    // Setup Generation Mode Radio Group
    const generationModeGroup = document.getElementById('generationModeGroup');
    const multiImageModeSection = document.getElementById('multiImageModeSection');

    const savedMode = settingsManager.get('generation_mode', 'text2img');
    generationMode = savedMode;

    function updateModeUI(mode) {
        generationMode = mode;
        if (mode === 'text2img') {
            multiImageModeSection.classList.add('hidden');
        } else {
            multiImageModeSection.classList.remove('hidden');
        }
    }

    // 设置初始选中状态
    setTimeout(() => {
        const radios = generationModeGroup.querySelectorAll('sp-radio');
        radios.forEach(radio => {
            if (radio.value === savedMode) {
                radio.checked = true;
            }
        });
        updateModeUI(savedMode);
    }, 100);

    generationModeGroup.addEventListener('change', async (e) => {
        const mode = e.target.value;
        updateModeUI(mode);
        await settingsManager.set('generation_mode', mode);
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
    const resolutionSelect = document.getElementById('resolutionSelect');
    const btnSmartCanvasRatio = document.getElementById('btnSmartCanvasRatio');

    // 初始化可拖拽调整大小的 Prompt 文本框
    setupResizableTextarea();

    // Selection Mode
    const savedSelectionMode = settingsManager.get('selection_mode', false);
    selectionModeCheckbox.checked = savedSelectionMode;

    selectionModeCheckbox.addEventListener('change', async (e) => {
        await settingsManager.set('selection_mode', e.target.checked);
        console.log(`[UI] Selection mode switched to: ${e.target.checked}`);
    });

    // Search Web Mode
    const savedSearchWebMode = settingsManager.get('search_web_mode', false);
    searchWebCheckbox.checked = savedSearchWebMode;

    searchWebCheckbox.addEventListener('change', async (e) => {
        await settingsManager.set('search_web_mode', e.target.checked);
        console.log(`[UI] Search web mode switched to: ${e.target.checked}`);
    });

    // Multi-Image Mode
    const savedMultiImageMode = settingsManager.get('multi_image_mode', false);
    multiImageModeCheckbox.checked = savedMultiImageMode;

    multiImageModeCheckbox.addEventListener('change', async (e) => {
        await settingsManager.set('multi_image_mode', e.target.checked);
        console.log(`[UI] Multi-image mode switched to: ${e.target.checked}`);
    });

    // Resolution Dropdown
    const savedResolution = settingsManager.get('generation_resolution', '1K');
    resolutionSelect.value = savedResolution;

    resolutionSelect.addEventListener('change', async (e) => {
        const value = e.target.value;
        await settingsManager.set('generation_resolution', value);
        console.log(`[UI] Resolution switched to: ${value}`);
    });

    // Smart Canvas Ratio
    btnSmartCanvasRatio.addEventListener('click', async () => {
        await handleSmartCanvasRatio();
    });

    // Populate preset dropdown
    updatePresetDropdown();

    // Default preset selection
    // Note: sp-dropdown population is async in DOM, might need a small delay or check
    setTimeout(() => {
        const options = presetSelect.querySelectorAll('sp-menu-item');
        if (options.length > 0) {
            presetSelect.value = options[0].value;
            loadPreset(options[0].value);
        }
    }, 100);

    presetSelect.addEventListener('change', (e) => {
        loadPreset(e.target.value);
    });

    // Add Preset
    btnAddPreset.addEventListener('click', async () => {
        const newName = await promptUser('Enter preset name:');
        if (!newName) return;

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

    // Save Preset
    btnSavePreset.addEventListener('click', async () => {
        if (!currentPreset) {
            showGenerateStatus('No preset selected', 'error');
            return;
        }

        const result = await presetManager.updatePreset(currentPreset, promptInput.value);
        if (result.success) {
            showGenerateStatus(result.message, 'success');
        } else {
            showGenerateStatus(result.message, 'error');
        }
    });

    // Rename Preset
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

    // Delete Preset
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
            // Select first item if available
            const options = presetSelect.querySelectorAll('sp-menu-item');
            if (options.length > 0) {
                presetSelect.value = options[0].value;
                loadPreset(options[0].value);
            } else {
                currentPreset = null;
                promptInput.value = '';
            }
            showGenerateStatus(result.message, 'success');
        } else {
            showGenerateStatus(result.message, 'error');
        }
    });

    // Generate Button
    btnGenerate.addEventListener('click', async () => {
        await handleGenerateImage();
    });

    // Test Buttons
    btnTestImport.addEventListener('click', handleTestImport);
    btnTestExport.addEventListener('click', handleTestExport);
    btnEnsureGroups.addEventListener('click', handleEnsureGroups);
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

    // Debug Mode
    debugModeCheckbox.checked = settingsManager.get('debug_mode', false);
    updateDebugFolderPath();

    debugModeCheckbox.addEventListener('change', async (e) => {
        await settingsManager.set('debug_mode', e.target.checked);
        updateDebugFolderPath();

        // Show/Hide debug details section (log path + debug buttons)
        const debugDetailsSection = document.getElementById('debugDetailsSection');
        if (e.target.checked) {
            debugDetailsSection.classList.remove('hidden');
        } else {
            debugDetailsSection.classList.add('hidden');
        }
    });

    // Initialize debug details section visibility
    const debugDetailsSection = document.getElementById('debugDetailsSection');
    if (debugModeCheckbox.checked) {
        debugDetailsSection.classList.remove('hidden');
    }

    // Export Settings
    inputMaxSize.value = settingsManager.get('export_max_size', 2048);
    inputQuality.value = settingsManager.get('export_quality', 80);

    inputMaxSize.addEventListener('change', async (e) => {
        const value = parseInt(e.target.value) || 2048;
        await settingsManager.set('export_max_size', value);
    });

    inputQuality.addEventListener('change', async (e) => {
        const value = parseInt(e.target.value) || 80;
        await settingsManager.set('export_quality', value);
    });

    // Provider Selection
    providerSelect.addEventListener('change', async (e) => {
        loadProviderConfig(e.target.value);
        await settingsManager.set('selected_provider', e.target.value);
    });

    // Add Provider
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

    // Save Provider
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
            await settingsManager.set('selected_provider', currentProvider.name);
            showStatus('Provider saved successfully', 'success');
        } else {
            showStatus(result.message, 'error');
        }
    });

    // Delete Provider
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
            const options = providerSelect.querySelectorAll('sp-menu-item');
            if (options.length > 0) {
                providerSelect.value = options[0].value;
                loadProviderConfig(options[0].value);
            } else {
                clearProviderConfig();
            }
            showStatus(result.message, 'success');
        } else {
            showStatus(result.message, 'error');
        }
    });

    // Test Connection
    btnTestConnection.addEventListener('click', async () => {
        if (!currentProvider) {
            showStatus('No provider selected', 'error');
            return;
        }

        showStatus('Testing connection...', 'info');

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

// Helper Functions

function updatePresetDropdown() {
    const presetSelect = document.getElementById('presetSelect');
    const menu = presetSelect.querySelector('sp-menu');
    menu.innerHTML = '';

    const names = presetManager.getAllNames();
    names.forEach(name => {
        const item = document.createElement('sp-menu-item');
        item.value = name;
        item.textContent = name;
        menu.appendChild(item);
    });
}

function loadPreset(presetName) {
    const prompt = presetManager.getPrompt(presetName);
    currentPreset = presetName;
    document.getElementById('promptInput').value = prompt;
}

function updateProviderDropdown() {
    const providerSelect = document.getElementById('providerSelect');
    const menu = providerSelect.querySelector('sp-menu');
    menu.innerHTML = '';

    const names = providerManager.getAllNames();
    names.forEach(name => {
        const item = document.createElement('sp-menu-item');
        item.value = name;
        item.textContent = name;
        menu.appendChild(item);
    });
}

function loadProviderConfig(providerName) {
    const provider = providerManager.getProvider(providerName);
    if (!provider) {
        clearProviderConfig();
        return;
    }

    currentProvider = provider;
    document.getElementById('inputApiKey').value = provider.apiKey || '';
    document.getElementById('inputBaseUrl').value = provider.baseUrl || '';
    document.getElementById('inputModelId').value = provider.model || '';
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
        statusDiv.classList.add('status-info');
    }

    setTimeout(() => {
        statusDiv.textContent = '';
        statusDiv.className = 'status-message';
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
        statusDiv.classList.add('status-info');
    }

    if (type === 'success' || type === 'error') {
        setTimeout(() => {
            statusDiv.textContent = '';
            statusDiv.className = 'status-message';
        }, 5000);
    }
}

async function handleSmartCanvasRatio() {
    const btnSmartCanvasRatio = document.getElementById('btnSmartCanvasRatio');

    function showCanvasRatioStatus(message, type) {
        showGenerateStatus(message, type);
    }

    try {
        showCanvasRatioStatus('正在分析画布比例...', 'info');
        btnSmartCanvasRatio.disabled = true;

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

async function handleGenerateImage() {
    if (isGenerating) {
        showGenerateStatus('Already generating...', 'error');
        return;
    }

    if (!app.activeDocument) {
        showGenerateStatus('❌ 请先打开一个文档', 'error');
        return;
    }

    const prompt = document.getElementById('promptInput').value.trim();
    if (!prompt) {
        showGenerateStatus('Please enter a prompt', 'error');
        return;
    }

    if (!currentProvider || !currentProvider.apiKey || !currentProvider.baseUrl) {
        showGenerateStatus('Please configure a provider in Settings', 'error');
        return;
    }

    const resolution = document.getElementById('resolutionSelect').value || '1K';
    const debugMode = settingsManager.get('debug_mode', false);
    const mode = generationMode;
    const selectionMode = settingsManager.get('selection_mode', false);
    const searchWebMode = settingsManager.get('search_web_mode', false);
    const multiImageMode = settingsManager.get('multi_image_mode', false);

    isGenerating = true;
    const btnGenerate = document.getElementById('btnGenerate');
    btnGenerate.disabled = true;
    btnGenerate.classList.add('shine-effect');
    const originalBtnText = btnGenerate.textContent;
    btnGenerate.textContent = 'Generating';

    try {
        await settingsManager.set('latest_prompt', prompt);

        showGenerateStatus('获取画布信息...', 'info');

        let aspectRatio = '1:1';
        let canvasInfo = null;
        let exportedImageData = null;
        let selectionRegion = null;
        let sourceImageData = null;
        let referenceImageData = null;

        try {
            const exportData = await executeAsModal(async (executionContext) => {
                const info = await PSOperations.getCanvasInfo();
                let region = null;

                if (selectionMode) {
                    const selectionInfo = await PSOperations.getSelectionInfo();
                    if (selectionInfo && selectionInfo.hasSelection) {
                        region = PSOperations.calculateGenerationRegion(selectionInfo.bounds, info.width, info.height);
                    }
                }

                let imageData = null;
                let sourceData = null;
                let referenceData = null;
                const maxSize = settingsManager.get('export_max_size', 2048);
                const quality = settingsManager.get('export_quality', 80);

                if (mode === 'imgedit' && multiImageMode) {
                    const { sourceGroup, referenceGroup } = await PSOperations.findSourceReferenceGroups();

                    const missingGroups = [];
                    if (!sourceGroup) missingGroups.push('Source');
                    if (!referenceGroup) missingGroups.push('Reference');

                    if (missingGroups.length > 0) {
                        throw new Error(`缺少必需的图层组: ${missingGroups.join(' / ')}`);
                    }

                    const sourceResult = await PSOperations.exportGroupAsWebP(sourceGroup, maxSize, quality, executionContext, region);
                    sourceData = await fileManager.fileToBase64(sourceResult.file);

                    const referenceResult = await PSOperations.exportGroupAsWebP(referenceGroup, maxSize, quality, executionContext, region);
                    referenceData = await fileManager.fileToBase64(referenceResult.file);
                }
                else if (mode === 'imgedit') {
                    const exportResult = await PSOperations.exportVisibleLayersAsWebP(maxSize, quality, executionContext, region);
                    imageData = await fileManager.fileToBase64(exportResult.file);
                }

                return { info, imageData, region, sourceData, referenceData };
            }, { commandName: "Get Canvas Info and Export" });

            canvasInfo = exportData.info;
            exportedImageData = exportData.imageData;
            selectionRegion = exportData.region;
            sourceImageData = exportData.sourceData;
            referenceImageData = exportData.referenceData;

            if (selectionRegion) {
                aspectRatio = selectionRegion.aspectRatio;
            } else {
                aspectRatio = calculateAspectRatio(canvasInfo.width, canvasInfo.height);
            }

        } catch (e) {
            console.error('Failed to get canvas info or export:', e);
            throw e;
        }

        const modeText = mode === 'imgedit' ? 'Image Edit' : 'Text to Image';
        showGenerateStatus(`正在生成图片... (${modeText}, ${resolution}, ${aspectRatio})`, 'info');

        const imageFile = await imageGenerator.generate({
            prompt,
            provider: currentProvider,
            aspectRatio,
            resolution,
            debugMode,
            mode: mode,
            searchWeb: searchWebMode,
            inputImage: exportedImageData,
            sourceImage: sourceImageData,
            referenceImage: referenceImageData
        });

        if (!imageFile || !imageFile.nativePath) {
            throw new Error('Image generation returned invalid file object');
        }

        const fs = require('uxp').storage.localFileSystem;
        const imageToken = fs.createSessionToken(imageFile);

        showGenerateStatus('正在导入图片到Photoshop...', 'info');

        const layerName = await executeAsModal(async () => {
            if (selectionRegion) {
                return await PSOperations.importImageInRegion(imageToken, selectionRegion);
            } else {
                return await PSOperations.importImageByToken(imageToken);
            }
        }, { commandName: "Import Generated Image" });

        showGenerateStatus(`✅ 完成！图层: ${layerName}`, 'success');

    } catch (e) {
        console.error('Generation failed:', e);
        const errorMessage = e?.message || String(e) || 'Unknown error';

        if (debugMode) {
            try {
                const errorLog = `=== Error Log ===\nTime: ${new Date().toISOString()}\nError: ${errorMessage}\nStack: ${e?.stack || 'N/A'}`;
                await fileManager.saveLog(errorLog);
            } catch (logError) {
                console.error('Failed to save error log:', logError);
            }
        }

        showGenerateStatus(`❌ 生成失败: ${errorMessage}`, 'error');
    } finally {
        isGenerating = false;
        const btnGenerate = document.getElementById('btnGenerate');
        btnGenerate.disabled = false;
        btnGenerate.classList.remove('shine-effect');
        btnGenerate.textContent = 'Generate Image';
    }
}

async function promptUser(message, defaultValue = '') {
    return new Promise((resolve) => {
        const dialog = document.createElement('dialog');
        dialog.className = 'custom-dialog';

        const container = document.createElement('div');
        container.className = 'dialog-container';

        // 使用 sp-label
        const title = document.createElement('sp-label');
        title.textContent = message;
        title.setAttribute('size', 'S');
        title.className = 'dialog-title';
        container.appendChild(title);

        // 使用 sp-textfield
        const input = document.createElement('sp-textfield');
        input.value = defaultValue;
        input.className = 'dialog-input';
        input.size = 'S';
        input.setAttribute('placeholder', '输入名称...');

        // 支持回车确认
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const value = input.value.trim();
                dialog.close();
                document.body.removeChild(dialog);
                resolve(value || null);
            }
        });
        container.appendChild(input);

        // 使用 sp-action-button
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'dialog-buttons';

        const cancelBtn = document.createElement('sp-action-button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'dialog-button';
        cancelBtn.size = 'S';
        cancelBtn.addEventListener('click', () => {
            dialog.close();
            document.body.removeChild(dialog);
            resolve(null);
        });
        buttonContainer.appendChild(cancelBtn);

        const okBtn = document.createElement('sp-action-button');
        okBtn.textContent = 'OK';
        okBtn.className = 'dialog-button';
        okBtn.size = 'S';
        okBtn.addEventListener('click', () => {
            const value = input.value.trim();
            dialog.close();
            document.body.removeChild(dialog);
            resolve(value || null);
        });
        buttonContainer.appendChild(okBtn);

        container.appendChild(buttonContainer);
        dialog.appendChild(container);

        document.body.appendChild(dialog);
        dialog.showModal();

        // 自动聚焦输入框
        setTimeout(() => {
            input.focus();
        }, 100);
    });
}

async function confirmUser(message) {
    try {
        return new Promise((resolve) => {
            const dialog = document.createElement('dialog');
            dialog.className = 'custom-dialog';

            const container = document.createElement('div');
            container.className = 'dialog-container';

            // 使用 sp-label 显示消息
            const text = document.createElement('sp-label');
            text.textContent = message;
            text.size = 'S';
            text.className = 'dialog-text';
            container.appendChild(text);

            // 使用 sp-action-button
            const btnContainer = document.createElement('div');
            btnContainer.className = 'dialog-buttons';

            const cancelBtn = document.createElement('sp-action-button');
            cancelBtn.size = 'S';
            cancelBtn.textContent = 'Cancel';
            cancelBtn.className = 'dialog-button';
            cancelBtn.addEventListener('click', () => {
                dialog.close();
                document.body.removeChild(dialog);
                resolve(false);
            });
            btnContainer.appendChild(cancelBtn);

            const okBtn = document.createElement('sp-action-button');
            okBtn.textContent = 'OK';
            okBtn.size = 'S';
            okBtn.className = 'dialog-button';
            okBtn.addEventListener('click', () => {
                dialog.close();
                document.body.removeChild(dialog);
                resolve(true);
            });
            btnContainer.appendChild(okBtn);

            container.appendChild(btnContainer);
            dialog.appendChild(container);

            document.body.appendChild(dialog);
            dialog.showModal();
        });
    } catch (e) {
        console.error(e);
        return false;
    }
}

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
        const token = await fileManager.getLatestImageToken();

        if (!token) {
            showGenerateStatus('⚠️ 没有找到生成的图片，请先生成一张图', 'error');
            return;
        }

        const selectionMode = settingsManager.get('selection_mode', false);
        const regionText = selectionMode ? ' (选区模式)' : '';
        showGenerateStatus(`📥 正在导入图片${regionText}...`, 'info');

        const layerName = await executeAsModal(async () => {
            let region = null;
            if (selectionMode) {
                const doc = app.activeDocument;
                if (doc) {
                    const selectionInfo = await PSOperations.getSelectionInfo();
                    if (selectionInfo && selectionInfo.hasSelection) {
                        region = PSOperations.calculateGenerationRegion(selectionInfo.bounds, doc.width, doc.height);
                    }
                }
            }

            if (region) {
                return await PSOperations.importImageInRegion(token, region);
            } else {
                return await PSOperations.importImageByToken(token);
            }
        }, { commandName: "Test Import Image" });

        showGenerateStatus(`✅ 测试导入成功${regionText}！图层: ${layerName}`, 'success');

    } catch (e) {
        console.error('[TEST] ERROR:', e);
        const errorMessage = e?.message || String(e) || 'Unknown error';
        showGenerateStatus(`❌ 导入失败: ${errorMessage}`, 'error');
    } finally {
        isGenerating = false;
        document.getElementById('btnGenerate').disabled = false;
        document.getElementById('btnTestImport').disabled = false;
    }
}

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

        const exportResults = await executeAsModal(async (executionContext) => {
            let region = null;
            if (selectionMode) {
                const doc = app.activeDocument;
                if (doc) {
                    const selectionInfo = await PSOperations.getSelectionInfo();
                    if (selectionInfo && selectionInfo.hasSelection) {
                        region = PSOperations.calculateGenerationRegion(selectionInfo.bounds, doc.width, doc.height);
                    }
                }
            }

            if (multiImageMode && generationMode === 'imgedit') {
                const { sourceGroup, referenceGroup } = await PSOperations.findSourceReferenceGroups();
                const results = { mode: 'multi' };

                if (sourceGroup) {
                    results.source = await PSOperations.exportGroupAsWebP(sourceGroup, maxSize, quality, executionContext, region);
                }
                if (referenceGroup) {
                    results.reference = await PSOperations.exportGroupAsWebP(referenceGroup, maxSize, quality, executionContext, region);
                }
                return results;
            } else {
                const result = await PSOperations.exportVisibleLayersAsWebP(maxSize, quality, executionContext, region);
                return { mode: 'single', result };
            }
        }, { commandName: "Test Export Layers" });

        const regionText = selectionMode ? ' (选区模式)' : '';

        if (exportResults.mode === 'multi') {
            let message = `✅ 多图导出成功${regionText}！\n`;
            if (exportResults.source) message += `Source: ${exportResults.source.width}x${exportResults.source.height}\n`;
            if (exportResults.reference) message += `Reference: ${exportResults.reference.width}x${exportResults.reference.height}`;
            if (!exportResults.source && !exportResults.reference) message = `⚠️ 未找到Source/Reference组`;
            showGenerateStatus(message, 'success');
        } else {
            const result = exportResults.result;
            showGenerateStatus(`✅ 导出成功${regionText}！\n尺寸: ${result.width}x${result.height}`, 'success');
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

async function handleEnsureGroups() {
    if (isGenerating) {
        showGenerateStatus('正在处理中...', 'error');
        return;
    }

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
            let message = '✅ Reference组(紫色)和Source组(绿色)已存在/更新';
            showGenerateStatus(message, 'success');
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

// ================= 可拖拽调整大小的 Textarea 功能 =================
// 实现 Prompt 文本框可以通过拖拽手柄调整高度

function setupResizableTextarea() {
    const promptInput = document.getElementById('promptInput');
    const resizeHandler = document.getElementById('promptResizeHandler');

    if (!promptInput || !resizeHandler) {
        console.error('[Resizable Textarea] 无法找到 promptInput 或 resizeHandler 元素');
        return;
    }

    const MIN_HEIGHT = 50; // 最小高度 50px
    let isResizing = false;
    let startY = 0;
    let startHeight = 0;

    // 开始拖拽
    resizeHandler.addEventListener('mousedown', (e) => {
        isResizing = true;
        startY = e.clientY;
        startHeight = promptInput.offsetHeight;
        resizeHandler.classList.add('resizing');

        // 阻止默认行为，避免文本选择
        e.preventDefault();
    });

    // 拖拽中
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const deltaY = e.clientY - startY;
        const newHeight = startHeight + deltaY;

        // 限制最小高度
        if (newHeight >= MIN_HEIGHT) {
            promptInput.style.height = newHeight + 'px';
        }
    });

    // 结束拖拽
    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizeHandler.classList.remove('resizing');
        }
    });

    console.log('[Resizable Textarea] 初始化完成');
}

// ================= Reload Plugin 功能 =================
// 用于开发调试时快速重载插件，无需重启Photoshop

function reloadPlugin() {
    console.log('[Reload] 正在重新加载插件...');
    window.location.reload();
}

// 设置 entrypoints - 定义 Reload Plugin 命令和面板
const { entrypoints } = require('uxp');
entrypoints.setup({
    commands: {
        // 注册重载插件命令 - 会出现在插件菜单中
        reloadPlugin: () => reloadPlugin()
    },
    panels: {
        psbanana: {
            show({ node } = {}) {
                // 面板显示时的处理
                // 单面板应用不需要特殊处理，index.html 会自动加载
                console.log('[Panel] PS Banana panel shown');
            }
        }
    }
});
