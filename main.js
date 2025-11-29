const { core } = require('photoshop');
const { SettingsManager, ProviderManager } = require('./settings_manager');

// Initialize managers
const settingsManager = new SettingsManager();
const providerManager = new ProviderManager();

// Current state
let currentProvider = null;

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', async () => {
    await initializeApp();
});

async function initializeApp() {
    // Load settings and providers
    await settingsManager.load();
    await providerManager.load();

    // Setup tab switching
    setupTabs();

    // Setup settings UI
    setupSettingsUI();

    // Load selected provider
    const selectedProviderName = settingsManager.get('selected_provider');
    if (selectedProviderName) {
        const providerSelect = document.getElementById('providerSelect');
        providerSelect.value = selectedProviderName;
        loadProviderConfig(selectedProviderName);
    }

    // Setup test button (Generate tab)
    document.getElementById('btnTest').addEventListener('click', async () => {
        try {
            await core.showAlert({ message: 'PS Banana: Test Successful!' });
        } catch (e) {
            console.error(e);
        }
    });
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

function setupSettingsUI() {
    const providerSelect = document.getElementById('providerSelect');
    const btnAddProvider = document.getElementById('btnAddProvider');
    const btnSaveProvider = document.getElementById('btnSaveProvider');
    const btnDeleteProvider = document.getElementById('btnDeleteProvider');
    const btnTestConnection = document.getElementById('btnTestConnection');
    const inputApiKey = document.getElementById('inputApiKey');
    const inputBaseUrl = document.getElementById('inputBaseUrl');
    const inputModelId = document.getElementById('inputModelId');

    // Populate provider dropdown
    updateProviderDropdown();

    // Provider selection change
    providerSelect.addEventListener('change', (e) => {
        loadProviderConfig(e.target.value);
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

async function promptUser(message) {
    try {
        const result = await core.showPrompt({ message });
        return result;
    } catch (e) {
        console.error(e);
        return null;
    }
}

async function confirmUser(message) {
    try {
        // Use showConfirm if available, otherwise use showAlert
        if (core.showConfirm) {
            const result = await core.showConfirm({ message });
            return result;
        } else {
            await core.showAlert({ message: message + '\n\nContinue?' });
            return true;
        }
    } catch (e) {
        console.error(e);
        return false;
    }
}
