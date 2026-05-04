const test = require('node:test');
const assert = require('node:assert/strict');

const {
    getProviderConfig,
    detectProviderType,
    getAllProviderConfigs,
} = require('../api_providers');
const { GPT_IMAGE_2_API } = require('../aspect_ratio');

test('Gemini provider name should force google_official even with localhost proxy baseUrl', () => {
    assert.equal(detectProviderType('Gemini', 'http://localhost:8045'), 'google_official');
    const config = getProviderConfig('Gemini', 'http://localhost:8045');
    assert.equal(config.type, 'google_official');
    assert.equal(config.supportsImageApi(GPT_IMAGE_2_API), false);
});

test('Yunwu GPT Image 2 default model should be gpt-image-2-all', () => {
    const config = getProviderConfig('Yunwu', 'https://yunwu.ai');
    assert.equal(config.getDefaultModel(GPT_IMAGE_2_API), 'gpt-image-2-all');
});

test('Seedream and ComfyUI should stay hidden from provider UI list', () => {
    const configs = getAllProviderConfigs();
    const visibility = new Map(
        configs.map((config) => [config.name, config.visibleInUi !== false])
    );
    assert.equal(visibility.get('Seedream'), false);
    assert.equal(visibility.get('Local ComfyUI'), false);
    assert.equal(visibility.get('Gemini'), true);
    assert.equal(visibility.get('Yunwu'), true);
});
