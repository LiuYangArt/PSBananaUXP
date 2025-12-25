const fs = require('uxp').storage.localFileSystem;

/**
 * Manages prompt presets for image generation
 * Stores presets in UXP DataFolder as presets.json
 */
class PresetManager {
    constructor() {
        this.presets = [];
        this.loaded = false;
    }

    /**
     * Load presets from file
     */
    async load() {
        try {
            const dataFolder = await fs.getDataFolder();
            let entry;
            try {
                entry = await dataFolder.getEntry('presets.json');
            } catch (e) {
                // File doesn't exist, use defaults
                this.presets = [
                    { name: 'Photorealistic', prompt: 'A highly detailed, photorealistic image' },
                    { name: 'Artistic', prompt: 'An artistic and creative interpretation' },
                    { name: 'Concept Art', prompt: 'Professional concept art style' },
                ];
                await this.save();
                this.loaded = true;
                return;
            }

            const data = await entry.read();
            this.presets = JSON.parse(data);
            this.loaded = true;
        } catch (e) {
            console.error('Error loading presets:', e);
            this.presets = [];
        }
    }

    /**
     * Save presets to file
     */
    async save() {
        try {
            const dataFolder = await fs.getDataFolder();
            const entry = await dataFolder.createFile('presets.json', { overwrite: true });
            await entry.write(JSON.stringify(this.presets, null, 4));
        } catch (e) {
            console.error('Error saving presets:', e);
        }
    }

    /**
     * Get all preset names
     */
    getAllNames() {
        return this.presets.map((p) => p.name);
    }

    /**
     * Get prompt text for a preset
     */
    getPrompt(name) {
        const preset = this.presets.find((p) => p.name === name);
        return preset ? preset.prompt : '';
    }

    /**
     * Add a new preset
     */
    async addPreset(name, prompt) {
        if (this.presets.find((p) => p.name === name)) {
            return { success: false, message: 'Preset name already exists.' };
        }

        this.presets.push({ name, prompt });
        await this.save();
        return { success: true, message: 'Preset added.' };
    }

    /**
     * Update an existing preset's prompt
     */
    async updatePreset(name, newPrompt) {
        const preset = this.presets.find((p) => p.name === name);
        if (preset) {
            preset.prompt = newPrompt;
            await this.save();
            return { success: true, message: 'Preset saved.' };
        }
        return { success: false, message: 'Preset not found.' };
    }

    /**
     * Rename a preset
     */
    async renamePreset(oldName, newName) {
        if (oldName === newName) {
            return { success: true, message: 'Name unchanged.' };
        }

        if (this.presets.find((p) => p.name === newName)) {
            return { success: false, message: 'New name already exists.' };
        }

        const preset = this.presets.find((p) => p.name === oldName);
        if (preset) {
            preset.name = newName;
            await this.save();
            return { success: true, message: 'Preset renamed.' };
        }
        return { success: false, message: 'Preset not found.' };
    }

    /**
     * Delete a preset
     */
    async deletePreset(name) {
        const index = this.presets.findIndex((p) => p.name === name);
        if (index !== -1) {
            this.presets.splice(index, 1);
            await this.save();
            return { success: true, message: 'Preset deleted.' };
        }
        return { success: false, message: 'Preset not found.' };
    }
}

module.exports = { PresetManager };
