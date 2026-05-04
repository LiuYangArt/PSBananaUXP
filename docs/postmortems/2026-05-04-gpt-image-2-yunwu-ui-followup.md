# 2026-05-04 GPT Image 2 / Yunwu / Gemini UI Follow-up

## 症状

- Yunwu `gpt-image-2-all` 初始请求返回 `401 未提供令牌`。
- 修复鉴权后，Yunwu GPT Image 2 返回图片 URL，但插件在 UXP 内下载失败，报 `Manifest entry not found`。
- 图生图场景里，中文 prompt 表面上已写入 debug payload，但效果疑似不生效。
- 选择 `Gemini` provider 时，Generate 页的 `Image API` 没有按预期自动禁用 `GPT Image 2`。

## 根因

1. Yunwu 的 Gemini 兼容接口与 GPT Image 2 接口鉴权方式不同。
    - Gemini 路线使用 query `?key=`。
    - GPT Image 2 路线要求 `Authorization: Bearer <apiKey>`。
2. Yunwu GPT Image 2 有时返回外链 URL，插件 manifest 缺少 `filenest` 下载域名白名单。
3. 手工构造 multipart 时，文本字段使用 `charCodeAt` 写入，中文 prompt 没有按 UTF-8 编码。
4. `Gemini` provider 的类型识别过度依赖 baseUrl；当用户填的是本地代理地址时，会被误判成 `yunwu`，导致 UI 误以为支持 `GPT Image 2`。

## 修复

- 在 provider 配置层引入 endpoint 级鉴权，Yunwu 的 `gptImage2Generate` / `gptImage2Edit` 改用 Bearer。
- GPT Image 2 请求默认带 `response_format: 'b64_json'`，同时 manifest 补充 `oss.filenest.top` / `*.filenest.top`。
- multipart 文本字段改为 UTF-8 编码，确保中文 prompt 被正确发送。
- provider 识别逻辑新增基于 provider 名称的 `Gemini` 判定，兼容本地代理 baseUrl。
- Generate 页的 `Image API`、Settings 页的 `GPT Image 2 Model` 输入框，会根据 provider 能力自动禁用。
- `Seedream` / `Local ComfyUI` 先从 UI provider 列表隐藏。

## 验证

- `node -c` 验证：`api_providers.js`、`settings_manager.js`、`main.js`、`image_generator.js`。
- 真实 Yunwu `gpt-image-2-all` 图生图测试通过：绿色小猫成功改成红色小猫，说明 prompt 生效。
- Photoshop 插件内实测：`Gemini` provider 现在会正确禁用 `GPT Image 2` 相关 UI。

## 经验

- provider 类型识别不能只依赖 baseUrl，尤其在允许代理地址时，必须把“用户选择的 provider 名称”纳入判定。
- debug payload 只能证明“JS 对象构造正确”，不能证明“最终网络字节流正确”；multipart 场景需要重点关注编码。
- UXP / Spectrum 控件禁用状态要同时考虑 property 与 attribute，避免只改一种导致 UI 外观不同步。
- 不同 provider、不同 image API 路线的鉴权、payload、响应格式都应独立建模，避免“一个默认逻辑跑所有接口”。
