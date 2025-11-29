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

    // Load selected provider and preset
    const selectedProviderName = settingsManager.get('selected_provider');
    if (selectedProviderName) {
        const providerSelect = document.getElementById('providerSelect');
        providerSelect.value = selectedProviderName;
        loadProviderConfig(selectedProviderName);
    }

    const selectedPresetName = settingsManager.get('selected_preset');
    if (selectedPresetName) {
        const presetSelect = document.getElementById('presetSelect');
        presetSelect.value = selectedPresetName;
        loadPreset(selectedPresetName);
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
    const presetSelectButton = document.getElementById('presetSelectButton');
    const presetSelectText = document.getElementById('presetSelectText');
    const btnAddPreset = document.getElementById('btnAddPreset');
    const btnSavePreset = document.getElementById('btnSavePreset');
    const btnRenamePreset = document.getElementById('btnRenamePreset');
    const btnDeletePreset = document.getElementById('btnDeletePreset');
    const promptInput = document.getElementById('promptInput');
    const btnGenerate = document.getElementById('btnGenerate');
    const btnTestImport = document.getElementById('btnTestImport');

    // 分辨率按钮
    const btnRes1K = document.getElementById('btnRes1K');
    const btnRes2K = document.getElementById('btnRes2K');
    const btnRes4K = document.getElementById('btnRes4K');
    const resolutionButtons = [btnRes1K, btnRes2K, btnRes4K];
    let selectedResolution = '1K';

    // 分辨率按钮点击事件
    resolutionButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // 移除所有 active 状态
            resolutionButtons.forEach(b => b.classList.remove('active'));
            // 添加当前 active 状态
            btn.classList.add('active');
            // 保存选中的分辨率
            selectedResolution = btn.dataset.resolution;
        });
    });

    // Populate preset dropdown
    updatePresetDropdown();

    // 自定义下拉按钮点击事件
    presetSelectButton.addEventListener('click', () => {
        showSelectDialog('Select Preset', presetManager.getAllNames(), presetSelect.value, (selected) => {
            presetSelect.value = selected;
            presetSelectText.textContent = selected;
            loadPreset(selected);
            settingsManager.set('selected_preset', selected);
        });
    });

    // Preset selection change
    presetSelect.addEventListener('change', (e) => {
        presetSelectText.textContent = e.target.value;
        loadPreset(e.target.value);
        settingsManager.set('selected_preset', e.target.value);
    });

    // Add preset
    btnAddPreset.addEventListener('click', async () => {
        const newName = await promptUser('Enter preset name:');
        if (!newName) return;

        const currentPrompt = promptInput.value || '';
        const result = await presetManager.addPreset(newName, currentPrompt);

        if (result.success) {
            updatePresetDropdown();
            presetSelect.value = newName;
            document.getElementById('presetSelectText').textContent = newName;
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
            document.getElementById('presetSelectText').textContent = newName;
            currentPreset = newName;
            await settingsManager.set('selected_preset', newName);
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
                document.getElementById('presetSelectText').textContent = presetSelect.value;
                loadPreset(presetSelect.value);
            } else {
                currentPreset = null;
                document.getElementById('presetSelectText').textContent = '-';
                promptInput.value = '';
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
}

/**
 * 获取当前选中的分辨率
 */
function getSelectedResolution() {
    const activeBtn = document.querySelector('.resolution-buttons button.active');
    return activeBtn ? activeBtn.dataset.resolution : '1K';
}

function setupSettingsUI() {
    const providerSelect = document.getElementById('providerSelect');
    const providerSelectButton = document.getElementById('providerSelectButton');
    const providerSelectText = document.getElementById('providerSelectText');
    const btnAddProvider = document.getElementById('btnAddProvider');
    const btnSaveProvider = document.getElementById('btnSaveProvider');
    const btnDeleteProvider = document.getElementById('btnDeleteProvider');
    const btnTestConnection = document.getElementById('btnTestConnection');
    const inputApiKey = document.getElementById('inputApiKey');
    const inputBaseUrl = document.getElementById('inputBaseUrl');
    const inputModelId = document.getElementById('inputModelId');
    const debugModeCheckbox = document.getElementById('debugModeCheckbox');
    const debugFolderPathInput = document.getElementById('debugFolderPath');

    // Populate provider dropdown
    updateProviderDropdown();

    // Load debug mode setting
    debugModeCheckbox.checked = settingsManager.get('debug_mode', false);
    
    // Display debug folder path when debug mode is enabled
    updateDebugFolderPath();
    
    debugModeCheckbox.addEventListener('change', async (e) => {
        await settingsManager.set('debug_mode', e.target.checked);
        updateDebugFolderPath();
    });

    // 自定义下拉按钮点击事件
    providerSelectButton.addEventListener('click', () => {
        showSelectDialog('Select Provider', providerManager.getAllNames(), providerSelect.value, async (selected) => {
            providerSelect.value = selected;
            providerSelectText.textContent = selected;
            loadProviderConfig(selected);
            // 立即保存选中的 Provider
            await settingsManager.set('selected_provider', selected);
        });
    });

    // Provider selection change
    providerSelect.addEventListener('change', async (e) => {
        providerSelectText.textContent = e.target.value;
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
            document.getElementById('providerSelectText').textContent = newName;
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
                document.getElementById('providerSelectText').textContent = providerSelect.value;
                loadProviderConfig(providerSelect.value);
            } else {
                document.getElementById('providerSelectText').textContent = '-';
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

    isGenerating = true;
    document.getElementById('btnGenerate').disabled = true;

    try {
        // STAGE 1: Get canvas info (needs executeAsModal)
        showGenerateStatus('获取画布信息...', 'info');

        let aspectRatio = '1:1';
        let canvasInfo = null;

        try {
            canvasInfo = await executeAsModal(async () => {
                return await PSOperations.getCanvasInfo();
            }, { commandName: "Get Canvas Info" });

            aspectRatio = calculateAspectRatio(canvasInfo.width, canvasInfo.height);
        } catch (e) {
            console.warn('Could not get canvas info:', e);
            showGenerateStatus('警告: 无法获取画布信息，使用默认比例 1:1', 'info');
        }

        // STAGE 2: AI generation (NOT in executeAsModal - UI stays responsive)
        showGenerateStatus(`正在生成图片... (${resolution}, ${aspectRatio})`, 'info');

        const imageFile = await imageGenerator.generate({
            prompt,
            provider: currentProvider,
            aspectRatio,
            resolution,
            debugMode
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
            // 使用 token 方式导入，和 Test Import 一致
            return await PSOperations.importImageByToken(imageToken);
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
        showGenerateStatus(`📥 正在导入图片...`, 'info');

        // Import to Photoshop using token
        console.log('[TEST] Step 3: Calling executeAsModal...');
        const layerName = await executeAsModal(async () => {
            console.log('[TEST] Step 4: Inside executeAsModal, calling importImageByToken...');
            // 直接传递 token，不需要 fileManager
            return await PSOperations.importImageByToken(token);
        }, { commandName: "Test Import Image" });

        console.log('[TEST] Step 5: Import completed, layerName:', layerName);
        showGenerateStatus(`✅ 测试导入成功！图层: ${layerName}`, 'success');

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

function updatePresetDropdown() {
    const presetSelect = document.getElementById('presetSelect');
    const presetSelectText = document.getElementById('presetSelectText');
    presetSelect.innerHTML = '';

    const names = presetManager.getAllNames();
    names.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        presetSelect.appendChild(option);
    });

    // 更新按钮显示文本
    if (names.length > 0 && presetSelect.value) {
        presetSelectText.textContent = presetSelect.value;
    } else if (names.length > 0) {
        presetSelectText.textContent = names[0];
    } else {
        presetSelectText.textContent = '-';
    }
}

function loadPreset(presetName) {
    const prompt = presetManager.getPrompt(presetName);
    currentPreset = presetName;
    document.getElementById('promptInput').value = prompt;
}

function updateProviderDropdown() {
    const providerSelect = document.getElementById('providerSelect');
    const providerSelectText = document.getElementById('providerSelectText');
    providerSelect.innerHTML = '';

    const names = providerManager.getAllNames();
    names.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        providerSelect.appendChild(option);
    });

    // 更新按钮显示文本
    if (names.length > 0 && providerSelect.value) {
        providerSelectText.textContent = providerSelect.value;
    } else if (names.length > 0) {
        providerSelectText.textContent = names[0];
    } else {
        providerSelectText.textContent = '-';
    }
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
 * 显示自定义选择对话框
 * @param {string} title - 对话框标题
 * @param {Array<string>} options - 选项列表
 * @param {string} currentValue - 当前选中值
 * @param {Function} onSelect - 选择回调函数
 */
function showSelectDialog(title, options, currentValue, onSelect) {
    // 创建对话框
    const dialog = document.createElement('dialog');
    dialog.className = 'select-dialog';

    // 标题
    const header = document.createElement('div');
    header.className = 'select-dialog-header';
    header.textContent = title;
    dialog.appendChild(header);

    // 选项列表
    const list = document.createElement('div');
    list.className = 'select-dialog-list';

    options.forEach(option => {
        const btn = document.createElement('button');
        btn.className = 'select-option';
        btn.textContent = option;
        
        if (option === currentValue) {
            btn.classList.add('selected');
        }

        btn.addEventListener('click', () => {
            onSelect(option);
            dialog.close();
        });

        list.appendChild(btn);
    });

    dialog.appendChild(list);

    // 关闭时清理
    dialog.addEventListener('close', () => {
        dialog.remove();
    });

    // 点击外部关闭
    dialog.addEventListener('cancel', (e) => {
        e.preventDefault();
        dialog.close();
    });

    // 显示对话框
    document.body.appendChild(dialog);
    dialog.showModal();
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
