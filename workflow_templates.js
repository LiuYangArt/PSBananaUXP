/**
 * ComfyUI Workflow Templates
 * Contains default workflows for Text2Image (Z-Image) and Image Edit (Qwen).
 */

/**
 * Z-Image Turbo Workflow for Text2Image
 * Nodes:
 *  - 39: CLIPLoader
 *  - 40: VAELoader
 *  - 41: EmptySD3LatentImage (width/height)
 *  - 42: ConditioningZeroOut
 *  - 45: CLIPTextEncode (prompt)
 *  - 46: UNETLoader
 *  - 47: ModelSamplingAuraFlow
 *  - 44: KSampler (seed/steps)
 *  - 43: VAEDecode
 *  - 9: SaveImage
 */
const Z_IMAGE_TURBO_WORKFLOW = {
    "9": {
        "class_type": "SaveImage",
        "inputs": {
            "filename_prefix": "PSBanana_Z_Image",
            "images": ["43", 0]
        }
    },
    "39": {
        "class_type": "CLIPLoader",
        "inputs": {
            "clip_name": "qwen_3_4b.safetensors",
            "type": "lumina2",
            "device": "default"
        }
    },
    "40": {
        "class_type": "VAELoader",
        "inputs": {
            "vae_name": "ae.safetensors"
        }
    },
    "41": {
        "class_type": "EmptySD3LatentImage",
        "inputs": {
            "width": 1024,
            "height": 1024,
            "batch_size": 1
        }
    },
    "42": {
        "class_type": "ConditioningZeroOut",
        "inputs": {
            "conditioning": ["45", 0]
        }
    },
    "43": {
        "class_type": "VAEDecode",
        "inputs": {
            "samples": ["44", 0],
            "vae": ["40", 0]
        }
    },
    "44": {
        "class_type": "KSampler",
        "inputs": {
            "cfg": 1,
            "denoise": 1,
            "latent_image": ["41", 0],
            "model": ["47", 0],
            "negative": ["42", 0],
            "positive": ["45", 0],
            "sampler_name": "res_multistep",
            "scheduler": "simple",
            "seed": 12345,
            "steps": 9
        }
    },
    "45": {
        "class_type": "CLIPTextEncode",
        "inputs": {
            "clip": ["39", 0],
            "text": ""
        }
    },
    "46": {
        "class_type": "UNETLoader",
        "inputs": {
            "unet_name": "z_image_turbo_bf16.safetensors",
            "weight_dtype": "default"
        }
    },
    "47": {
        "class_type": "ModelSamplingAuraFlow",
        "inputs": {
            "model": ["46", 0],
            "shift": 3
        }
    }
};

/**
 * Qwen Image Edit Workflow - 4-Step Lightning Version
 * Uses Lightning LoRA for ~5x faster generation (4 steps instead of 20).
 * 
 * Supports multi-image input:
 *  - image1 (Source): The main image to be edited
 *  - image2 (Reference): Optional style/content reference
 * 
 * Key Nodes:
 *  - 37: UNETLoader (qwen_image_edit_2509)
 *  - 89: LoraLoaderModelOnly (4-step Lightning LoRA)
 *  - 38: CLIPLoader
 *  - 39: VAELoader
 *  - 66: ModelSamplingAuraFlow
 *  - 75: CFGNorm
 *  - 78: LoadImage (Source - image1, required)
 *  - 120: LoadImage (Reference - image2, optional)
 *  - 93: ImageScaleToTotalPixels (scale to 1MP)
 *  - 88: VAEEncode
 *  - 111: TextEncodeQwenImageEditPlus (Positive prompt)
 *  - 110: TextEncodeQwenImageEditPlus (Negative prompt - empty)
 *  - 3: KSampler (4 steps, cfg 1)
 *  - 8: VAEDecode
 *  - 60: SaveImage
 */
const QWEN_IMAGE_EDIT_WORKFLOW = {
    "37": {
        "class_type": "UNETLoader",
        "inputs": {
            "unet_name": "qwen_image_edit_2509_fp8_e4m3fn.safetensors",
            "weight_dtype": "default"
        }
    },
    "89": {
        "class_type": "LoraLoaderModelOnly",
        "inputs": {
            "model": ["37", 0],
            "lora_name": "Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors",
            "strength_model": 1
        }
    },
    "38": {
        "class_type": "CLIPLoader",
        "inputs": {
            "clip_name": "qwen_2.5_vl_7b_fp8_scaled.safetensors",
            "type": "qwen_image",
            "device": "default"
        }
    },
    "39": {
        "class_type": "VAELoader",
        "inputs": {
            "vae_name": "qwen_image_vae.safetensors"
        }
    },
    "66": {
        "class_type": "ModelSamplingAuraFlow",
        "inputs": {
            "model": ["89", 0],
            "shift": 3
        }
    },
    "75": {
        "class_type": "CFGNorm",
        "inputs": {
            "model": ["66", 0],
            "strength": 1
        }
    },
    "78": {
        "class_type": "LoadImage",
        "inputs": {
            "image": "source.png",
            "upload": "image"
        }
    },
    "120": {
        "class_type": "LoadImage",
        "inputs": {
            "image": "reference.png",
            "upload": "image"
        }
    },
    "93": {
        "class_type": "ImageScaleToTotalPixels",
        "inputs": {
            "image": ["78", 0],
            "upscale_method": "lanczos",
            "megapixels": 1
        }
    },
    "88": {
        "class_type": "VAEEncode",
        "inputs": {
            "pixels": ["93", 0],
            "vae": ["39", 0]
        }
    },
    "110": {
        "class_type": "TextEncodeQwenImageEditPlus",
        "inputs": {
            "clip": ["38", 0],
            "vae": ["39", 0],
            "image1": ["93", 0],
            "image2": ["120", 0],
            "image3": null,
            "prompt": ""
        }
    },
    "111": {
        "class_type": "TextEncodeQwenImageEditPlus",
        "inputs": {
            "clip": ["38", 0],
            "vae": ["39", 0],
            "image1": ["93", 0],
            "image2": ["120", 0],
            "image3": null,
            "prompt": ""
        }
    },
    "3": {
        "class_type": "KSampler",
        "inputs": {
            "cfg": 1,
            "denoise": 1,
            "latent_image": ["88", 0],
            "model": ["75", 0],
            "negative": ["110", 0],
            "positive": ["111", 0],
            "sampler_name": "euler",
            "scheduler": "simple",
            "seed": 12345,
            "steps": 4
        }
    },
    "8": {
        "class_type": "VAEDecode",
        "inputs": {
            "samples": ["3", 0],
            "vae": ["39", 0]
        }
    },
    "60": {
        "class_type": "SaveImage",
        "inputs": {
            "filename_prefix": "PSBanana_QwenEdit",
            "images": ["8", 0]
        }
    }
};

module.exports = {
    Z_IMAGE_TURBO_WORKFLOW,
    QWEN_IMAGE_EDIT_WORKFLOW
};
