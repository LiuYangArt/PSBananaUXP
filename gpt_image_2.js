const { GPT_IMAGE_2_API } = require('./aspect_ratio');

// GPT Image 2 默认参数
const GPT_IMAGE_2_DEFAULT_QUALITY = 'high';
const GPT_IMAGE_2_DEFAULT_COUNT = 1;
const GPT_IMAGE_2_SUPPORTED_RESOLUTIONS = ['1K', '2K', '4K'];

// 显式尺寸映射表
// 注意：这里必须使用静态映射，禁止在运行时根据相邻尺寸做兜底或猜测。
const GPT_IMAGE_2_SIZE_MATRIX = {
    '1K': {
        '1:1': '1024x1024',
        '2:3': '840x1256',
        '3:2': '1256x840',
        '3:4': '888x1184',
        '4:3': '1184x888',
        '4:5': '920x1144',
        '5:4': '1144x920',
        '9:16': '768x1368',
        '16:9': '1368x768',
        '21:9': '1568x672',
    },
    '2K': {
        '1:1': '2048x2048',
        '2:3': '1672x2512',
        '3:2': '2512x1672',
        '3:4': '1776x2368',
        '4:3': '2368x1776',
        '4:5': '1832x2288',
        '5:4': '2288x1832',
        '9:16': '1536x2728',
        '16:9': '2728x1536',
        '21:9': '3128x1344',
    },
    '4K': {
        '1:1': '4096x4096',
        '2:3': '3344x5016',
        '3:2': '5016x3344',
        '3:4': '3544x4728',
        '4:3': '4728x3544',
        '4:5': '3664x4576',
        '5:4': '4576x3664',
        '9:16': '3072x5464',
        '16:9': '5464x3072',
        '21:9': '6256x2680',
    },
};

function getSupportedGptImage2AspectRatios(resolution) {
    const ratios = GPT_IMAGE_2_SIZE_MATRIX[resolution];
    if (!ratios) {
        throw new Error(`Unsupported GPT Image 2 resolution: ${resolution}`);
    }
    return Object.keys(ratios);
}

function isSupportedGptImage2Combination(resolution, aspectRatio) {
    return Boolean(GPT_IMAGE_2_SIZE_MATRIX[resolution] && GPT_IMAGE_2_SIZE_MATRIX[resolution][aspectRatio]);
}

function resolveGptImage2Size(resolution, aspectRatio) {
    if (!GPT_IMAGE_2_SUPPORTED_RESOLUTIONS.includes(resolution)) {
        throw new Error(`Unsupported GPT Image 2 resolution: ${resolution}`);
    }

    if (!isSupportedGptImage2Combination(resolution, aspectRatio)) {
        throw new Error(`Failed to resolve GPT Image 2 size for ${resolution} / ${aspectRatio}`);
    }

    return GPT_IMAGE_2_SIZE_MATRIX[resolution][aspectRatio];
}

function isGptImage2Api(imageApiKind) {
    return imageApiKind === GPT_IMAGE_2_API;
}

module.exports = {
    GPT_IMAGE_2_API,
    GPT_IMAGE_2_DEFAULT_QUALITY,
    GPT_IMAGE_2_DEFAULT_COUNT,
    GPT_IMAGE_2_SUPPORTED_RESOLUTIONS,
    GPT_IMAGE_2_SIZE_MATRIX,
    getSupportedGptImage2AspectRatios,
    isSupportedGptImage2Combination,
    resolveGptImage2Size,
    isGptImage2Api,
};