const BANANA_IMAGE_API = 'banana';
const GPT_IMAGE_2_API = 'gpt_image_2';

const BANANA_ASPECT_RATIOS = [
    { name: '1:1', value: 1.0 },
    { name: '1:8', value: 1 / 8 },
    { name: '1:4', value: 1 / 4 },
    { name: '2:3', value: 2 / 3 },
    { name: '3:2', value: 3 / 2 },
    { name: '3:4', value: 3 / 4 },
    { name: '4:3', value: 4 / 3 },
    { name: '4:1', value: 4 / 1 },
    { name: '4:5', value: 4 / 5 },
    { name: '5:4', value: 5 / 4 },
    { name: '8:1', value: 8 / 1 },
    { name: '9:16', value: 9 / 16 },
    { name: '16:9', value: 16 / 9 },
    { name: '21:9', value: 21 / 9 },
];

const GPT_IMAGE_2_ASPECT_RATIOS = [
    { name: '1:1', value: 1.0 },
    { name: '2:3', value: 2 / 3 },
    { name: '3:2', value: 3 / 2 },
    { name: '3:4', value: 3 / 4 },
    { name: '4:3', value: 4 / 3 },
    { name: '4:5', value: 4 / 5 },
    { name: '5:4', value: 5 / 4 },
    { name: '9:16', value: 9 / 16 },
    { name: '16:9', value: 16 / 9 },
    { name: '21:9', value: 21 / 9 },
];

const ASPECT_RATIOS = BANANA_ASPECT_RATIOS;

function getAspectRatiosForImageApi(imageApiKind = BANANA_IMAGE_API) {
    if (imageApiKind === GPT_IMAGE_2_API) {
        return GPT_IMAGE_2_ASPECT_RATIOS;
    }
    return BANANA_ASPECT_RATIOS;
}

function calculateClosestAspectRatio(width, height, imageApiKind = BANANA_IMAGE_API) {
    if (!width || !height || width <= 0 || height <= 0) {
        return '1:1';
    }

    const aspectRatios = getAspectRatiosForImageApi(imageApiKind);
    const canvasRatio = width / height;
    let closestRatio = aspectRatios[0];
    let minDifference = Math.abs(canvasRatio - closestRatio.value);

    for (const ratio of aspectRatios) {
        const difference = Math.abs(canvasRatio - ratio.value);
        if (difference < minDifference) {
            minDifference = difference;
            closestRatio = ratio;
        }
    }

    return closestRatio.name;
}

function calculateAspectRatio(width, height, imageApiKind = BANANA_IMAGE_API) {
    return calculateClosestAspectRatio(width, height, imageApiKind);
}

module.exports = {
    ASPECT_RATIOS,
    BANANA_ASPECT_RATIOS,
    GPT_IMAGE_2_ASPECT_RATIOS,
    BANANA_IMAGE_API,
    GPT_IMAGE_2_API,
    getAspectRatiosForImageApi,
    calculateClosestAspectRatio,
    calculateAspectRatio,
};
