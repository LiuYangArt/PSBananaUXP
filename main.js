const { core, app } = require('photoshop');
const { executeAsModal } = core;
const { SettingsManager, ProviderManager } = require('./settings_manager');
const { PresetManager } = require('./presets_manager');
const { ImageGenerator } = require('./image_generator');
const { FileManager } = require('./file_manager');
const { PSOperations } = require('./ps_operations');
const { getProviderConfig } = require('./api_providers');
const { calculateAspectRatio, BANANA_IMAGE_API, GPT_IMAGE_2_API } = require('./aspect_ratio');
const { isGptImage2Api, resolveGptImage2Size } = require('./gpt_image_2');
const translations = require('./localization');

// Localization Helper
let currentLanguage = 'en';

function getText(key, params = {}) {
    const lang = translations[currentLanguage] || translations['en'];
    let text = lang[key] || translations['en'][key] || key;
    for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, v);
    }
    return text;
}

// Initialize managers
const settingsManager = new SettingsManager();
const providerManager = new ProviderManager();
const presetManager = new PresetManager();
const fileManager = new FileManager();
const imageGenerator = new ImageGenerator(fileManager);

// Current state
let currentProvider = null;
let currentPreset = null;
let activeGenerationCount = 0; // 当前正在执行的生成任务数量
let isProcessing = false; // 用于测试操作的锁
let taskIdCounter = 0; // 任务ID计数器，用于调试
const taskLogs = []; // 存储任务日志
let generationMode = 'text2img'; // 'text2img' or 'imgedit'
let currentImageApiKind = BANANA_IMAGE_API;

// 添加任务日志并写入文件
async function logTask(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    taskLogs.push(logEntry);
    console.log(message);

    // Check debug mode
    const debugMode = settingsManager.get('debug_mode', false);
    if (!debugMode) return;

    // 异步写入日志文件
    try {
        await fileManager.saveTaskLog(taskLogs.join('\n'));
    } catch (e) {
        console.error('Failed to save task log:', e);
    }
}

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', async () => {
    await initializeApp();
});

function getSelectedImageApiKind() {
    return currentImageApiKind || settingsManager.get('selected_image_api', BANANA_IMAGE_API);
}

function getEffectiveImageApiKind(imageApiKind = getSelectedImageApiKind()) {
    if (!currentProvider) {
        return imageApiKind;
    }

    const providerConfig = getProviderConfig(currentProvider.name, currentProvider.baseUrl);
    if (providerConfig.supportsImageApi(imageApiKind)) {
        return imageApiKind;
    }

    return providerConfig.supportsImageApi(BANANA_IMAGE_API)
        ? BANANA_IMAGE_API
        : providerConfig.supportedImageApis[0] || BANANA_IMAGE_API;
}

function setDropdownValue(dropdown, value) {
    if (!dropdown) {
        return;
    }

    dropdown.value = value;
    const options = dropdown.querySelectorAll('sp-menu-item');
    options.forEach((option) => {
        option.selected = option.value === value;
    });
}

function setElementDisabled(element, disabled) {
    if (!element) {
        return;
    }

    element.disabled = disabled;
    if (disabled) {
        element.setAttribute('disabled', 'true');
    } else {
        element.removeAttribute('disabled');
    }
}

function updateImageApiDependentUI() {
    const imageApiSelect = document.getElementById('imageApiSelect');
    const searchWebCheckbox = document.getElementById('searchWebCheckbox');
    const gptImage2ModelInput = document.getElementById('inputGptImage2ModelId');
    const preferredKind = getSelectedImageApiKind();
    const effectiveKind = getEffectiveImageApiKind(preferredKind);
    const providerConfig = currentProvider
        ? getProviderConfig(currentProvider.name, currentProvider.baseUrl)
        : null;
    const supportsGptImage2 = providerConfig
        ? providerConfig.supportsImageApi(GPT_IMAGE_2_API)
        : true;
    const gptImage2Option = imageApiSelect?.querySelector('sp-menu-item[value="gpt_image_2"]');
    const gptMode = isGptImage2Api(effectiveKind);

    if (imageApiSelect) {
        setDropdownValue(imageApiSelect, effectiveKind);
        setElementDisabled(imageApiSelect, !supportsGptImage2);
    }

    if (gptImage2Option) {
        setElementDisabled(gptImage2Option, !supportsGptImage2);
    }

    if (gptImage2ModelInput) {
        setElementDisabled(gptImage2ModelInput, !supportsGptImage2);
    }

    if (searchWebCheckbox) {
        setElementDisabled(searchWebCheckbox, gptMode);
    }
}

async function setSelectedImageApiKind(imageApiKind) {
    currentImageApiKind = imageApiKind || BANANA_IMAGE_API;
    await settingsManager.set('selected_image_api', currentImageApiKind);
    updateImageApiDependentUI();
}

function getCurrentProviderModel(imageApiKind) {
    return providerManager.getModelForImageApi(currentProvider, imageApiKind);
}

function buildGenerationProvider(imageApiKind) {
    if (!currentProvider) {
        return null;
    }

    const selectedModel = getCurrentProviderModel(imageApiKind);
    return {
        ...currentProvider,
        model: selectedModel,
    };
}

async function initializeApp() {
    // Load all managers
    await settingsManager.load();
    await providerManager.load();
    await presetManager.load();
    currentImageApiKind = settingsManager.get('selected_image_api', BANANA_IMAGE_API);

    // Setup tabs
    setupTabs();

    // Setup Generate Tab UI
    setupGenerateUI();

    // Setup Settings Tab UI
    setupSettingsUI();

    // Load language
    currentLanguage = settingsManager.get('language', 'en');
    updateLanguage(currentLanguage);

    // Load selected provider

    // Set Dynamic Version in Footer
    const footerText = document.getElementById('footerText');
    if (footerText) {
        try {
            const manifest = require('./manifest.json');
            const versionText = manifest && manifest.version ? ` v${manifest.version}` : '';
            footerText.textContent = `🍌PSBanana by LiuYang${versionText}`;
        } catch (e) {
            footerText.textContent = '🍌PSBanana by LiuYang';
            console.error('Failed to load version from manifest', e);
        }
    }

    // Restore latest prompt

    // const latestPrompt = settingsManager.get('latest_prompt', '');
    // if (latestPrompt) {
    //     document.getElementById('promptInput').value = latestPrompt;
    //     console.log(`[UI] Restored latest prompt: ${latestPrompt.substring(0, 50)}...`);
    // }
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
        radios.forEach((radio) => {
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
    const multiImageModeCheckbox = document.getElementById('multiImageModeCheckbox');
    const imageApiSelect = document.getElementById('imageApiSelect');
    const resolutionSelect = document.getElementById('resolutionSelect');
    const btnSmartCanvasRatio = document.getElementById('btnSmartCanvasRatio');

    // 初始化可拖拽调整大小的 Prompt 文本框
    setupResizableTextarea();

    // Multi-Image Mode
    const savedMultiImageMode = settingsManager.get('multi_image_mode', false);
    multiImageModeCheckbox.checked = savedMultiImageMode;

    multiImageModeCheckbox.addEventListener('change', async (e) => {
        await settingsManager.set('multi_image_mode', e.target.checked);
        console.log(`[UI] Multi-image mode switched to: ${e.target.checked}`);
    });

    // Image API Dropdown
    setDropdownValue(imageApiSelect, getSelectedImageApiKind());
    imageApiSelect.addEventListener('change', async (e) => {
        await setSelectedImageApiKind(e.target.value);
        console.log(`[UI] Image API switched to: ${e.target.value}`);
    });
    updateImageApiDependentUI();

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
            // Don't auto-select preset content, just set the dropdown value
            presetSelect.value = options[0].value;
            // loadPreset(options[0].value); // Disable auto-load content
        }
    }, 100);

    presetSelect.addEventListener('change', (e) => {
        loadPreset(e.target.value);
    });

    // Add Preset
    btnAddPreset.addEventListener('click', async () => {
        const newName = await promptUser(getText('msg_enter_preset_name'));
        if (!newName) return;

        const currentPrompt = promptInput.value || '';
        const result = await presetManager.addPreset(newName, currentPrompt);

        if (result.success) {
            updatePresetDropdown(newName);
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
            showGenerateStatus(getText('msg_no_preset_selected'), 'error');
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
            showGenerateStatus(getText('msg_no_preset_selected'), 'error');
            return;
        }

        const newName = await promptUser(getText('msg_rename_preset', { name: currentPreset }));
        if (!newName) return;

        const result = await presetManager.renamePreset(currentPreset, newName);
        if (result.success) {
            updatePresetDropdown(newName);
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
            showGenerateStatus(getText('msg_no_preset_selected'), 'error');
            return;
        }

        const confirmed = await confirmUser(getText('msg_delete_preset', { name: currentPreset }));
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
    const selectionModeCheckbox = document.getElementById('selectionModeCheckbox');
    const searchWebCheckbox = document.getElementById('searchWebCheckbox');
    const providerSelect = document.getElementById('providerSelect');
    const btnSaveProvider = document.getElementById('btnSaveProvider');
    const btnTestConnection = document.getElementById('btnTestConnection');
    const inputApiKey = document.getElementById('inputApiKey');
    const inputBaseUrl = document.getElementById('inputBaseUrl');
    const inputBananaModelId = document.getElementById('inputBananaModelId');
    const inputGptImage2ModelId = document.getElementById('inputGptImage2ModelId');
    const debugModeCheckbox = document.getElementById('debugModeCheckbox');
    const inputMaxSize = document.getElementById('inputMaxSize');
    const inputQuality = document.getElementById('inputQuality');
    const languageSelect = document.getElementById('languageSelect');

    // Selection Mode
    const savedSelectionMode = settingsManager.get('selection_mode', true);
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

    // Language Selection
    languageSelect.value = currentLanguage;
    languageSelect.addEventListener('change', async (e) => {
        const lang = e.target.value;
        await settingsManager.set('language', lang);
        updateLanguage(lang);
    });

    // Populate provider dropdown
    const savedProvider = settingsManager.get('selected_provider');
    const providerNames = providerManager.getAllNames();
    const initialProvider = providerNames.includes(savedProvider)
        ? savedProvider
        : providerNames[0] || null;
    updateProviderDropdown(initialProvider);
    if (initialProvider) {
        loadProviderConfig(initialProvider);
        if (initialProvider !== savedProvider) {
            settingsManager.set('selected_provider', initialProvider).catch((err) => {
                console.error('Failed to migrate selected provider:', err);
            });
        }
    }

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
    // Export Settings
    const maxSize = settingsManager.get('export_max_size', 2048);
    const quality = settingsManager.get('export_quality', 80);

    console.log(`[UI] Loading Export Settings - Max Size: ${maxSize}, Quality: ${quality}`);

    inputMaxSize.value = String(maxSize);
    inputQuality.value = String(quality);

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
        console.log(`[Settings] Provider changed to: ${e.target.value}`);
        loadProviderConfig(e.target.value);
        updateImageApiDependentUI();
        await settingsManager.set('selected_provider', e.target.value);
    });

    // Save Provider
    btnSaveProvider.addEventListener('click', async () => {
        if (!currentProvider) {
            showStatus(getText('msg_no_provider_selected'), 'error');
            return;
        }

        const result = await providerManager.updateProvider(
            currentProvider.name,
            inputApiKey.value,
            inputBaseUrl.value,
            inputBananaModelId.value,
            inputGptImage2ModelId.value
        );

        if (result.success) {
            currentProvider.apiKey = inputApiKey.value;
            currentProvider.baseUrl = inputBaseUrl.value;
            currentProvider.models = {
                banana: inputBananaModelId.value,
                gpt_image_2: inputGptImage2ModelId.value,
            };
            currentProvider.model = inputBananaModelId.value;
            await settingsManager.set('selected_provider', currentProvider.name);
            showStatus(getText('msg_provider_saved'), 'success');
        } else {
            showStatus(result.message, 'error');
        }
    });

    // Test Connection
    btnTestConnection.addEventListener('click', async () => {
        if (!currentProvider) {
            showStatus(getText('msg_no_provider_selected'), 'error');
            return;
        }

        showStatus(getText('msg_testing_connection'), 'info');

        const testConfig = {
            name: currentProvider.name,
            apiKey: inputApiKey.value,
            baseUrl: inputBaseUrl.value,
            model: inputBananaModelId.value,
        };

        const result = await providerManager.testConnection(testConfig);
        if (result.success) {
            // 如果返回的是 messageKey，使用 getText 转换为当前语言
            const message = result.messageKey ? getText(result.messageKey) : result.message;
            showStatus(message, 'success');
        } else {
            showStatus(result.message, 'error');
        }
    });
}

// Helper Functions

function updatePresetDropdown(selectedName = null) {
    const presetSelect = document.getElementById('presetSelect');
    const menu = presetSelect.querySelector('sp-menu');
    menu.innerHTML = '';

    const names = presetManager.getAllNames();

    // Use DocumentFragment to minimize reflows
    const fragment = document.createDocumentFragment();

    names.forEach((name) => {
        const item = document.createElement('sp-menu-item');
        item.value = name;
        item.textContent = name;
        if (selectedName && name === selectedName) {
            item.selected = true;
        }
        fragment.appendChild(item);
    });

    menu.appendChild(fragment);

    // Explicitly set value on the dropdown if provided
    if (selectedName) {
        presetSelect.value = selectedName;
    }
}

function loadPreset(presetName) {
    const prompt = presetManager.getPrompt(presetName);
    currentPreset = presetName;
    document.getElementById('promptInput').value = prompt;
}

function updateProviderDropdown(selectedName = null) {
    const providerSelect = document.getElementById('providerSelect');
    const menu = providerSelect.querySelector('sp-menu');
    menu.innerHTML = '';

    const names = providerManager.getAllNames();
    names.forEach((name) => {
        const item = document.createElement('sp-menu-item');
        item.value = name;
        item.textContent = name;
        if (selectedName && name === selectedName) {
            item.selected = true;
        }
        menu.appendChild(item);
    });

    if (selectedName) {
        providerSelect.value = selectedName;
    }
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
    document.getElementById('inputBananaModelId').value = providerManager.getModelForImageApi(
        provider,
        BANANA_IMAGE_API
    );
    document.getElementById('inputGptImage2ModelId').value = providerManager.getModelForImageApi(
        provider,
        GPT_IMAGE_2_API
    );
    updateImageApiDependentUI();
}

function clearProviderConfig() {
    currentProvider = null;
    document.getElementById('inputApiKey').value = '';
    document.getElementById('inputBaseUrl').value = '';
    document.getElementById('inputBananaModelId').value = '';
    document.getElementById('inputGptImage2ModelId').value = '';
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

// 更新生成按钮的状态和文本
function updateGeneratingButton() {
    const btnGenerate = document.getElementById('btnGenerate');

    if (activeGenerationCount > 0) {
        btnGenerate.classList.add('shine-effect');
        btnGenerate.textContent = getText('btn_generating_count', { count: activeGenerationCount });
    } else {
        btnGenerate.classList.remove('shine-effect');
        btnGenerate.textContent = getText('btn_generate');
    }
}

async function handleSmartCanvasRatio() {
    const btnSmartCanvasRatio = document.getElementById('btnSmartCanvasRatio');

    function showCanvasRatioStatus(message, type) {
        showGenerateStatus(message, type);
    }

    try {
        showCanvasRatioStatus(getText('msg_analyzing_ratio'), 'info');
        btnSmartCanvasRatio.disabled = true;

        const imageApiKind = getEffectiveImageApiKind();
        const result = await executeAsModal(
            async () => {
                return await PSOperations.applySmartCanvasRatio(imageApiKind);
            },
            { commandName: 'Smart Canvas Ratio' }
        );

        if (!result.changed) {
            showCanvasRatioStatus(
                getText('msg_ratio_unchanged', {
                    ratio: result.targetRatio,
                    width: result.newWidth,
                    height: result.newHeight,
                }),
                'success'
            );
        } else {
            showCanvasRatioStatus(
                getText('msg_ratio_adjusted', {
                    ratio: result.targetRatio,
                    oldWidth: result.originalWidth,
                    oldHeight: result.originalHeight,
                    newWidth: result.newWidth,
                    newHeight: result.newHeight,
                }),
                'success'
            );
        }
    } catch (e) {
        console.error('Smart Canvas Ratio failed:', e);
        const errorMessage = e?.message || String(e) || 'Unknown error';
        showCanvasRatioStatus(getText('msg_adjustment_failed', { error: errorMessage }), 'error');
    } finally {
        btnSmartCanvasRatio.disabled = false;
    }
}

async function handleGenerateImage() {
    // 不再阻止并发请求，允许同时执行多个生成任务

    if (!app.activeDocument) {
        showGenerateStatus(getText('msg_open_document_first'), 'error');
        return;
    }

    const targetDocument = app.activeDocument;

    const prompt = document.getElementById('promptInput').value.trim();
    if (!prompt) {
        showGenerateStatus(getText('msg_enter_prompt'), 'error');
        return;
    }

    if (!currentProvider || !currentProvider.apiKey || !currentProvider.baseUrl) {
        showGenerateStatus(getText('msg_configure_provider'), 'error');
        return;
    }

    const resolution = document.getElementById('resolutionSelect').value || '1K';
    const imageApiKind = getEffectiveImageApiKind();
    const providerConfig = getProviderConfig(currentProvider.name, currentProvider.baseUrl);

    if (!providerConfig.supportsImageApi(imageApiKind)) {
        showGenerateStatus(
            getText('msg_provider_image_api_not_supported', {
                provider: currentProvider.name,
                imageApi: isGptImage2Api(imageApiKind)
                    ? getText('option_image_api_gpt_image_2')
                    : getText('option_image_api_banana'),
            }),
            'error'
        );
        return;
    }

    const providerForGeneration = buildGenerationProvider(imageApiKind);

    if (!providerForGeneration || !providerForGeneration.model) {
        const messageKey = isGptImage2Api(imageApiKind)
            ? 'msg_gpt_model_missing'
            : 'msg_banana_model_missing';
        showGenerateStatus(getText(messageKey), 'error');
        return;
    }

    const debugMode = settingsManager.get('debug_mode', false);
    const mode = generationMode;
    const selectionMode = settingsManager.get('selection_mode', false);
    const searchWebMode = settingsManager.get('search_web_mode', false);
    const multiImageMode = settingsManager.get('multi_image_mode', false);
    const saveGeneratedImages = settingsManager.get('save_generated_images', false);

    // 增加任务计数并更新按钮状态
    activeGenerationCount++;
    const taskId = ++taskIdCounter; // 为此任务分配唯一ID
    logTask(`[Task ${taskId}] Started - Active tasks: ${activeGenerationCount}`);
    updateGeneratingButton();

    try {
        await settingsManager.set('latest_prompt', prompt);

        showGenerateStatus(getText('msg_getting_canvas_info'), 'info');

        let aspectRatio = '1:1';
        let canvasInfo = null;
        let exportedImageData = null;
        let selectionRegion = null;
        let sourceImageData = null;
        let referenceImageData = null;

        try {
            const exportData = await executeAsModal(
                async (executionContext) => {
                    const info = await PSOperations.getCanvasInfo();
                    let region = null;

                    if (selectionMode) {
                        const selectionInfo = await PSOperations.getSelectionInfo();
                        if (selectionInfo && selectionInfo.hasSelection) {
                            region = PSOperations.calculateGenerationRegion(
                                selectionInfo.bounds,
                                info.width,
                                info.height,
                                imageApiKind
                            );
                            // 在 executeAsModal 内部，先保存到临时变量，稍后记录到日志
                        }
                    }

                    let imageData = null;
                    let sourceData = null;
                    let referenceData = null;
                    const maxSize = settingsManager.get('export_max_size', 2048);
                    const quality = settingsManager.get('export_quality', 80);

                    if (mode === 'imgedit' && multiImageMode) {
                        const { sourceGroup, referenceGroup } =
                            await PSOperations.findSourceReferenceGroups();

                        const missingGroups = [];
                        if (!sourceGroup) missingGroups.push('Source');
                        if (!referenceGroup) missingGroups.push('Reference');

                        if (missingGroups.length > 0) {
                            throw new Error(
                                `Missing required layer groups: ${missingGroups.join(' / ')}`
                            );
                        }

                        const sourceResult = await PSOperations.exportGroupAsWebP(
                            sourceGroup,
                            maxSize,
                            quality,
                            executionContext,
                            region
                        );
                        sourceData = await fileManager.fileToBase64(sourceResult.file);
                        // Only delete if debug mode is OFF
                        if (!debugMode) {
                            try {
                                await sourceResult.file.delete();
                                console.log(
                                    `[Cleanup] Deleted temporary source file: ${sourceResult.file.nativePath}`
                                );
                            } catch (e) {
                                console.error(`[Cleanup] Failed to delete source file:`, e);
                            }
                        }

                        const referenceResult = await PSOperations.exportGroupAsWebP(
                            referenceGroup,
                            maxSize,
                            quality,
                            executionContext,
                            region
                        );
                        referenceData = await fileManager.fileToBase64(referenceResult.file);
                        // Only delete if debug mode is OFF
                        if (!debugMode) {
                            try {
                                await referenceResult.file.delete();
                                console.log(
                                    `[Cleanup] Deleted temporary reference file: ${referenceResult.file.nativePath}`
                                );
                            } catch (e) {
                                console.error(`[Cleanup] Failed to delete reference file:`, e);
                            }
                        }
                    } else if (mode === 'imgedit') {
                        const exportResult = await PSOperations.exportVisibleLayersAsWebP(
                            maxSize,
                            quality,
                            executionContext,
                            region
                        );
                        imageData = await fileManager.fileToBase64(exportResult.file);
                        // Only delete if debug mode is OFF
                        if (!debugMode) {
                            try {
                                await exportResult.file.delete();
                                console.log(
                                    `[Cleanup] Deleted temporary export file: ${exportResult.file.nativePath}`
                                );
                            } catch (e) {
                                console.error(`[Cleanup] Failed to delete export file:`, e);
                            }
                        }
                    }

                    return { info, imageData, region, sourceData, referenceData };
                },
                { commandName: 'Get Canvas Info and Export' }
            );

            canvasInfo = exportData.info;
            exportedImageData = exportData.imageData;
            selectionRegion = exportData.region;
            sourceImageData = exportData.sourceData;
            referenceImageData = exportData.referenceData;

            // 记录选区信息到日志文件
            if (selectionRegion) {
                logTask(
                    `[Task ${taskId}] Captured selection region: ${JSON.stringify(selectionRegion)}`
                );
                aspectRatio = selectionRegion.aspectRatio;
            } else {
                logTask(`[Task ${taskId}] No selection, using full canvas`);
                aspectRatio = calculateAspectRatio(
                    canvasInfo.width,
                    canvasInfo.height,
                    imageApiKind
                );
            }
        } catch (e) {
            console.error('Failed to get canvas info or export:', e);
            throw e;
        }

        const modeText = mode === 'imgedit' ? getText('radio_imgedit') : getText('radio_text2img');
        showGenerateStatus(
            getText('msg_generating_image', {
                mode: modeText,
                resolution: resolution,
                ratio: aspectRatio,
            }),
            'info'
        );

        if (isGptImage2Api(imageApiKind)) {
            resolveGptImage2Size(resolution, aspectRatio);
        }

        const imageFile = await imageGenerator.generate({
            prompt,
            provider: providerForGeneration,
            imageApiKind,
            aspectRatio,
            resolution,
            debugMode,
            mode: mode,
            searchWeb: searchWebMode,
            inputImage: exportedImageData,
            sourceImage: sourceImageData,
            referenceImage: referenceImageData,
        });

        if (!imageFile || !imageFile.nativePath) {
            throw new Error('Image generation returned invalid file object');
        }

        const fs = require('uxp').storage.localFileSystem;
        const imageToken = fs.createSessionToken(imageFile);

        showGenerateStatus(getText('msg_importing_image'), 'info');

        // 在 executeAsModal 外部记录导入信息
        if (selectionRegion) {
            logTask(`[Task ${taskId}] Importing with region: ${JSON.stringify(selectionRegion)}`);
        } else {
            logTask(`[Task ${taskId}] Importing without region (full canvas)`);
        }

        // Ensure we are in the correct document
        const targetDocumentId = targetDocument.id;
        logTask(
            `[Task ${taskId}] Target document ID: ${targetDocumentId}, Current active: ${app.activeDocument?.id}`
        );

        const layerName = await executeAsModal(
            async (executionContext) => {
                if (selectionRegion) {
                    return await PSOperations.importImageInRegion(
                        imageToken,
                        selectionRegion,
                        executionContext,
                        targetDocumentId
                    );
                } else {
                    return await PSOperations.importImageByToken(
                        imageToken,
                        executionContext,
                        targetDocumentId
                    );
                }
            },
            { commandName: 'Import Generated Image' }
        );

        logTask(`[Task ${taskId}] Completed successfully - Layer: ${layerName}`);
        showGenerateStatus(getText('msg_complete', { layer: layerName }), 'success');

        // Cleanup generated file if not debugging and not configured to save
        if (!debugMode && !saveGeneratedImages) {
            try {
                await imageFile.delete();
                console.log(`[Cleanup] Deleted generated image file: ${imageFile.nativePath}`);
                logTask(`[Cleanup] Deleted generated image file`);
            } catch (e) {
                console.error(`[Cleanup] Failed to delete generated image:`, e);
            }
        }
    } catch (e) {
        logTask(`[Task ${taskId}] Generation failed: ${e?.message || String(e)}`);
        const errorMessage = e?.message || String(e) || 'Unknown error';

        if (debugMode) {
            try {
                const errorLog = `=== Error Log ===
Time: ${new Date().toISOString()}
Task ID: ${taskId}
Error: ${errorMessage}
Stack: ${e?.stack || 'N/A'}`;
                await fileManager.saveLog(errorLog);
            } catch (logError) {
                console.error('Failed to save error log:', logError);
            }
        }

        showGenerateStatus(getText('msg_generation_failed', { error: errorMessage }), 'error');
    } finally {
        // 减少任务计数并更新按钮状态
        logTask(`[Task ${taskId}] Finished - Remaining active tasks: ${activeGenerationCount - 1}`);
        activeGenerationCount--;
        updateGeneratingButton();
    }
}

function promptUser(message, defaultValue = '') {
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
        input.setAttribute('placeholder', getText('dialog_placeholder_name'));

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
        cancelBtn.textContent = getText('dialog_cancel');
        cancelBtn.className = 'dialog-button';
        cancelBtn.size = 'S';
        cancelBtn.addEventListener('click', () => {
            dialog.close();
            document.body.removeChild(dialog);
            resolve(null);
        });
        buttonContainer.appendChild(cancelBtn);

        const okBtn = document.createElement('sp-action-button');
        okBtn.textContent = getText('dialog_ok');
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

function confirmUser(message) {
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
            cancelBtn.textContent = getText('dialog_cancel');
            cancelBtn.className = 'dialog-button';
            cancelBtn.addEventListener('click', () => {
                dialog.close();
                document.body.removeChild(dialog);
                resolve(false);
            });
            btnContainer.appendChild(cancelBtn);

            const okBtn = document.createElement('sp-action-button');
            okBtn.textContent = getText('dialog_ok');
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
        pathInput.placeholder = 'Enable Debug Mode to show path';
        return;
    }

    try {
        const folder = await fileManager.getLogFolder();
        pathInput.value = folder.nativePath;
        pathInput.placeholder = '';
    } catch (e) {
        console.error('Failed to get debug folder path:', e);
        pathInput.value = '';
        pathInput.placeholder = `⚠️ Unable to get path: ${e.message}`;
    }
}

async function handleTestImport() {
    if (isProcessing) {
        showGenerateStatus('Processing...', 'error');
        return;
    }

    isProcessing = true;
    document.getElementById('btnTestImport').disabled = true;

    try {
        showGenerateStatus('🔍 Finding latest generated image...', 'info');
        const token = await fileManager.getLatestImageToken();

        if (!token) {
            showGenerateStatus('⚠️ No generated image found, please generate one first', 'error');
            return;
        }

        const selectionMode = settingsManager.get('selection_mode', false);
        const regionText = selectionMode ? ' (Selection Mode)' : '';
        showGenerateStatus(`📥 Importing image${regionText}...`, 'info');

        const layerName = await executeAsModal(
            async () => {
                let region = null;
                if (selectionMode) {
                    const doc = app.activeDocument;
                    if (doc) {
                        const selectionInfo = await PSOperations.getSelectionInfo();
                        if (selectionInfo && selectionInfo.hasSelection) {
                            region = PSOperations.calculateGenerationRegion(
                                selectionInfo.bounds,
                                doc.width,
                                doc.height,
                                getSelectedImageApiKind()
                            );
                        }
                    }
                }

                if (region) {
                    return await PSOperations.importImageInRegion(token, region);
                } else {
                    return await PSOperations.importImageByToken(token);
                }
            },
            { commandName: 'Test Import Image' }
        );

        showGenerateStatus(
            `✅ Test import successful${regionText}! Layer: ${layerName}`,
            'success'
        );
    } catch (e) {
        console.error('[TEST] ERROR:', e);
        const errorMessage = e?.message || String(e) || 'Unknown error';
        showGenerateStatus(`❌ Import failed: ${errorMessage}`, 'error');
    } finally {
        isProcessing = false;
        document.getElementById('btnTestImport').disabled = false;
    }
}

async function handleTestExport() {
    if (isProcessing) {
        showGenerateStatus('Processing...', 'error');
        return;
    }

    isProcessing = true;
    document.getElementById('btnTestExport').disabled = true;

    try {
        showGenerateStatus('📤 Exporting layers...', 'info');

        const maxSize = settingsManager.get('export_max_size', 2048);
        const quality = settingsManager.get('export_quality', 80);
        const selectionMode = settingsManager.get('selection_mode', false);
        const multiImageMode = settingsManager.get('multi_image_mode', false);

        const exportResults = await executeAsModal(
            async (executionContext) => {
                let region = null;
                if (selectionMode) {
                    const doc = app.activeDocument;
                    if (doc) {
                        const selectionInfo = await PSOperations.getSelectionInfo();
                        if (selectionInfo && selectionInfo.hasSelection) {
                            region = PSOperations.calculateGenerationRegion(
                                selectionInfo.bounds,
                                doc.width,
                                doc.height,
                                getSelectedImageApiKind()
                            );
                        }
                    }
                }

                if (multiImageMode && generationMode === 'imgedit') {
                    const { sourceGroup, referenceGroup } =
                        await PSOperations.findSourceReferenceGroups();
                    const results = { mode: 'multi' };

                    if (sourceGroup) {
                        results.source = await PSOperations.exportGroupAsWebP(
                            sourceGroup,
                            maxSize,
                            quality,
                            executionContext,
                            region
                        );
                    }
                    if (referenceGroup) {
                        results.reference = await PSOperations.exportGroupAsWebP(
                            referenceGroup,
                            maxSize,
                            quality,
                            executionContext,
                            region
                        );
                    }
                    return results;
                } else {
                    const result = await PSOperations.exportVisibleLayersAsWebP(
                        maxSize,
                        quality,
                        executionContext,
                        region
                    );
                    return { mode: 'single', result };
                }
            },
            { commandName: 'Test Export Layers' }
        );

        const regionText = selectionMode ? ' (Selection Mode)' : '';

        if (exportResults.mode === 'multi') {
            let message = `✅ Multi-image export successful${regionText}!\n`;
            if (exportResults.source)
                message += `Source: ${exportResults.source.width}x${exportResults.source.height}\n`;
            if (exportResults.reference)
                message += `Reference: ${exportResults.reference.width}x${exportResults.reference.height}`;
            if (!exportResults.source && !exportResults.reference)
                message = `⚠️ Source/Reference groups not found`;
            showGenerateStatus(message, 'success');
        } else {
            const result = exportResults.result;
            showGenerateStatus(
                `✅ Export successful${regionText}!\nSize: ${result.width}x${result.height}`,
                'success'
            );
        }
    } catch (e) {
        console.error('[TEST EXPORT] ERROR:', e);
        const errorMessage = e?.message || String(e) || 'Unknown error';
        showGenerateStatus(`❌ Export failed: ${errorMessage}`, 'error');
    } finally {
        isProcessing = false;
        document.getElementById('btnTestExport').disabled = false;
    }
}

async function handleEnsureGroups() {
    if (isProcessing) {
        showGenerateStatus('Processing...', 'error');
        return;
    }

    if (!app.activeDocument) {
        showGenerateStatus('❌ Please open a document first', 'error');
        return;
    }

    isProcessing = true;
    const btnEnsureGroups = document.getElementById('btnEnsureGroups');
    btnEnsureGroups.disabled = true;

    try {
        showGenerateStatus('🔧 Creating/updating layer groups...', 'info');

        const result = await executeAsModal(
            async () => {
                return await PSOperations.ensureSourceReferenceGroups();
            },
            { commandName: 'Ensure Reference/Source Groups' }
        );

        if (result.success) {
            const message = '✅ Reference (purple) and Source (green) groups exist/updated';
            showGenerateStatus(message, 'success');
        }
    } catch (e) {
        console.error('[UI] Error ensuring groups:', e);
        const errorMessage = e?.message || String(e) || 'Unknown error';
        showGenerateStatus(`❌ Operation failed: ${errorMessage}`, 'error');
    } finally {
        isProcessing = false;
        btnEnsureGroups.disabled = false;
    }
}

// ================= 可拖拽调整大小的 Textarea 功能 =================
// 实现 Prompt 文本框可以通过拖拽手柄调整高度

function setupResizableTextarea() {
    const promptInput = document.getElementById('promptInput');
    const resizeHandler = document.getElementById('promptResizeHandler');

    if (!promptInput || !resizeHandler) {
        console.error('[Resizable Textarea] Cannot find promptInput or resizeHandler element');
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

    console.log('[Resizable Textarea] Initialization complete');
}

// Update UI language
function updateLanguage(lang) {
    currentLanguage = lang;

    // Update tabs
    document.getElementById('labelTabGenerate').textContent = getText('tab_generate');
    document.getElementById('labelTabSettings').textContent = getText('tab_settings');

    // Update Generate tab
    document.getElementById('labelPromptPresets').textContent = getText('label_prompt_presets');
    document.getElementById('presetSelect').placeholder = getText('placeholder_select_preset');
    document.getElementById('btnAddPreset').textContent = getText('btn_add');
    document.getElementById('btnSavePreset').textContent = getText('btn_save');
    document.getElementById('btnRenamePreset').textContent = getText('btn_rename');
    document.getElementById('btnDeletePreset').textContent = getText('btn_del');
    document.getElementById('promptInput').placeholder = getText('placeholder_prompt');
    document.getElementById('labelImageApi').textContent = getText('label_image_api');
    document.getElementById('imageApiSelect').placeholder = getText('placeholder_select');
    document.querySelector('#imageApiSelect sp-menu-item[value="banana"]').textContent =
        getText('option_image_api_banana');
    document.querySelector('#imageApiSelect sp-menu-item[value="gpt_image_2"]').textContent =
        getText('option_image_api_gpt_image_2');
    document.getElementById('labelResolution').textContent = getText('label_resolution');
    document.getElementById('resolutionSelect').placeholder = getText('placeholder_select');
    document.getElementById('btnSmartCanvasRatio').textContent = getText('btn_smart_ratio');
    document.getElementById('searchWebCheckbox').textContent = getText('checkbox_search_web');
    document.getElementById('selectionModeCheckbox').textContent =
        getText('checkbox_selection_mode');
    document.getElementById('btnGenerate').textContent = getText('btn_generate');
    document.getElementById('radioText2Img').textContent = getText('radio_text2img');
    document.getElementById('radioImgEdit').textContent = getText('radio_imgedit');
    document.getElementById('multiImageModeCheckbox').textContent =
        getText('checkbox_layer_groups');
    document.getElementById('btnEnsureGroups').textContent = getText('btn_add_groups');

    // Update Settings tab
    document.getElementById('languageSelect').placeholder = getText('placeholder_language_select');
    document.getElementById('labelExtraSettings').textContent = getText('label_extra_settings');
    document.getElementById('labelLanguage').textContent = getText('label_language');
    document.getElementById('labelProvider').textContent = getText('label_provider');
    document.getElementById('providerSelect').placeholder = getText('placeholder_select_provider');
    const btnAddProvider = document.getElementById('btnAddProvider');
    if (btnAddProvider) btnAddProvider.textContent = getText('btn_add');
    document.getElementById('btnSaveProvider').textContent = getText('btn_save');
    const btnDeleteProvider = document.getElementById('btnDeleteProvider');
    if (btnDeleteProvider) btnDeleteProvider.textContent = getText('btn_del');
    document.getElementById('btnTestConnection').textContent = getText('btn_test_connection');
    document.getElementById('labelApiKey').textContent = getText('label_api_key');
    document.getElementById('inputApiKey').placeholder = getText('placeholder_api_key');
    document.getElementById('labelBaseUrl').textContent = getText('label_base_url');
    document.getElementById('inputBaseUrl').placeholder = getText('placeholder_base_url');
    document.getElementById('labelBananaModelId').textContent = getText('label_banana_model_id');
    document.getElementById('inputBananaModelId').placeholder = getText(
        'placeholder_banana_model_id'
    );
    document.getElementById('labelGptImage2ModelId').textContent = getText(
        'label_gpt_image_2_model_id'
    );
    document.getElementById('inputGptImage2ModelId').placeholder = getText(
        'placeholder_gpt_image_2_model_id'
    );
    document.getElementById('labelExportSettings').textContent = getText('label_export_settings');
    document.getElementById('labelMaxSize').textContent = getText('label_max_size');
    document.getElementById('labelQuality').textContent = getText('label_quality');
    document.getElementById('debugModeCheckbox').textContent = getText('checkbox_debug_mode');
    document.getElementById('labelLogPath').textContent = getText('label_log_path');
    document.getElementById('debugFolderPath').placeholder = getText('placeholder_log_path');
    document.getElementById('btnTestExport').textContent = getText('btn_test_export');
    document.getElementById('btnTestImport').textContent = getText('btn_test_import');
    // document.getElementById('footerText').textContent = getText('footer_text');

    console.log(`[UI] Language updated to: ${lang}`);
}

// ================= Reload Plugin 功能 =================
// 用于开发调试时快速重载插件，无需重启Photoshop

function reloadPlugin() {
    console.log('[Reload] Reloading plugin...');
    window.location.reload();
}

// 设置 entrypoints - 定义 Reload Plugin 命令和面板
const { entrypoints } = require('uxp');
entrypoints.setup({
    commands: {
        // 注册重载插件命令 - 会出现在插件菜单中
        reloadPlugin: () => reloadPlugin(),
    },
    panels: {
        psbanana: {
            show({ node: _node } = {}) {
                // 面板显示时的处理
                // 单面板应用不需要特殊处理，index.html 会自动加载
                console.log('[Panel] PS Banana panel shown');
            },
        },
    },
});
