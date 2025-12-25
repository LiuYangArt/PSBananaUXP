/**
 * Calculate the closest aspect ratio from a predefined list
 */

const ASPECT_RATIOS = [
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

/**
 * Calculate the closest aspect ratio for given dimensions
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @returns {string} - Closest aspect ratio (e.g., "16:9")
 */
function calculateAspectRatio(width, height) {
    if (!width || !height || width <= 0 || height <= 0) {
        return '1:1'; // Default fallback
    }

    const canvasRatio = width / height;
    let closestRatio = ASPECT_RATIOS[0];
    let minDifference = Math.abs(canvasRatio - closestRatio.value);

    for (const ratio of ASPECT_RATIOS) {
        const difference = Math.abs(canvasRatio - ratio.value);
        if (difference < minDifference) {
            minDifference = difference;
            closestRatio = ratio;
        }
    }

    return closestRatio.name;
}

module.exports = { calculateAspectRatio, ASPECT_RATIOS };
