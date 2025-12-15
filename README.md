
<img width="512" height="512" alt="generated_image_20251129224205" src="https://github.com/user-attachments/assets/54661238-b11e-40be-ab12-4a49f6a036dd" />

photoshop + Google nano banana pro

## 免责声明
本插件功能依赖第三方 API 服务。在使用过程中，您的数据（包括但不限于图片、提示词）将被发送至第三方服务器进行处理。开发者不对第三方服务的数据安全性、隐私保护或服务稳定性承担任何责任。请勿上传包含敏感个人信息的内容，使用本插件产生的任何数据泄露风险由用户自行承担。

## 插件下载
在release中下载最新版本的插件zip包
[https://github.com/LiuYangArt/PSBananaUXP/releases/](https://github.com/LiuYangArt/PSBananaUXP/releases/)


## 插件安装

### 手动安装
- 解压放到 C:\Program Files\Adobe\Adobe Photoshop 202x\Plug-ins\
<img width="1051" height="240" alt="image" src="https://github.com/user-attachments/assets/c8353ef4-0ff2-4db6-a699-c48efd0765c4" />
- plugins>PSBanana
<br>
<img width="481" height="178" alt="image" src="https://github.com/user-attachments/assets/451513f8-da4b-4b26-9232-36701bbdb479" />
<br>
<img width="481" height="925" alt="image" src="https://github.com/user-attachments/assets/594c51fe-ef4e-4d82-a294-3bc1aba5d711" />



## 使用
- 在Settings页面填入API。目前只在yunwu/gptgod/openrouter跑通，google 官方的API我这边没有条件测。
  [yunwu](https://yunwu.ai/register?aff=VE3i) | [gptgod](https://gptgod.site/#/register?invite_code=5ax35dxlk4bys0j7jnzqypwkc)

### 提示词参考
[https://github.com/ZeroLu/awesome-nanobanana-pro](https://github.com/ZeroLu/awesome-nanobanana-pro)<br>
[https://ai.google.dev/gemini-api/docs/image-generation#prompt-guide](https://ai.google.dev/gemini-api/docs/image-generation#prompt-guide)

## 功能
- 支持图层模式， 使用 source  / reference  命名图层组， 可以得到类似chat中发送两张图的效果
- 文生图，图生图
- 选区模式，可只把选区区域发送给ai进行生图
- Prompt预设
- 同时处理多生图任务功能
- 
## 增加了对comfyui的支持
使用z-image-turbo 和 qwen-image-edit 实现文生图/图生图。 后续z-image-edit 出来之后再考虑替换图生图方式。 
在高端显卡上速度极快，适合本地处理一些较简单的任务。 
<br><img width="470" height="338" alt="image" src="https://github.com/user-attachments/assets/32069c58-6bf0-4970-8958-a0dcbc9e8c08" />
<br>comfyui中对应的工作流，在template中搜索安装。并安装对应的模型。
<br><img width="602" height="144" alt="image" src="https://github.com/user-attachments/assets/daa0c418-2cef-459e-83e5-37890c7f667c" />





