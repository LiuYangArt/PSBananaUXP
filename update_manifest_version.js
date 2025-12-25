const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, 'package.json');
const manifestJsonPath = path.join(__dirname, 'manifest.json');

try {
    const packageJson = require(packageJsonPath);
    const manifestJson = require(manifestJsonPath);

    const oldVersion = manifestJson.version;
    const newVersion = packageJson.version;

    if (oldVersion !== newVersion) {
        manifestJson.version = newVersion;
        fs.writeFileSync(manifestJsonPath, JSON.stringify(manifestJson, null, 4));
        console.log(`Updated manifest.json version from ${oldVersion} to ${newVersion}`);
    } else {
        console.log('manifest.json version is already up to date.');
    }
} catch (error) {
    console.error('Error updating manifest version:', error);
    process.exit(1);
}
