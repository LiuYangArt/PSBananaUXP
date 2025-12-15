---
trigger: always_on
---

这是一个Photoshop的UXP插件项目。 调用google nano banana pro模型进行ai生图
photoshop 2023 版本

# 编码规则 (Coding Rules)

## 通用规则
- **注释**: 总是使用中文注释 (Always use Chinese comments).
- **API 查询**: 优先使用 context 7 mcp 查找最新 API。
- **参考文档**: 严格遵循 Adobe 官方 UXP 文档 (Photoshop 2022+)。

## UXP 核心机制 (Critical UXP Mechanisms)
### 1. ExecuteAsModal (模态执行)
- **强制要求**: 所有修改 Photoshop 状态的操作 (如创建文档、修改图层、应用滤镜等) **必须** 包裹在 `executeAsModal` 中执行。
  - 这是 Photoshop 2022+ (API Version 2) 的硬性要求。
- **代码范式**:
  ```javascript
  const { core } = require('photoshop');
  await core.executeAsModal(async (executionContext) => {
      // 在这里执行修改状态的操作
      // executionContext.hostControl.suspendHistory(...) 可用于合并历史记录
  }, { commandName: "操作名称(显示在进度条)" });
  ```
- **注意事项**:
  - `targetFunction` (回调函数) 必须是 `async` 的。
  - 必须 `await` `executeAsModal` 的调用，防止代码继续执行导致状态冲突。
  - 如果需要用户交互 (如弹窗输入)，在 `options` 中设置 `interactive: true`。

### 2. Manifest 配置 (manifest.json)
- **Manifest Version**: 推荐使用 `5` (最新标准)，但也兼容 `4`。
- **Host 结构 (关键)**: 必须使用 **对象 (Object)** 结构而非数组结构，以确保在 Photoshop 2023 及 UXP Developer Tool 中的兼容性。
- **API Version**: 必须在 `host` 对象中显式设置 `apiVersion: 2` 以启用现代 Modal JS Scope (对于 executeAsModal 是必须的)。
  **推荐配置**:
  ```json
  "host": {
      "app": "PS",
      "minVersion": "23.0.0",
      "apiVersion": 2
  },
  "manifestVersion": 5,
  ```

### 3. 同步 vs 异步 (Sync vs Async)
- **方法调用**: UXP 中的大多数方法 (如 `doc.createLayer()`) 都是异步的，**必须使用 `await`**。
- **属性访问**: 属性的 get/set 看起来是同步语法，但底层是异步通信。尽量避免在紧密循环中频繁读写属性，应批量处理。

### 4. BatchPlay (底层动作)
- **适用场景**: 当标准 DOM API 不满足需求时，使用 `batchPlay` 执行底层 Action Descriptor。
- **用法**:
  - `batchPlay` 也应包含在 `executeAsModal` 作用域内。
  - 接受 Action Descriptor 对象数组 (JSON 格式)。

# workspace结构
PSBananaUXP 是开发中的插件路径，我们开发插件要写的所有内容都放在下面


api_examples 是ai 生图服务器的api示例

uxp-photoshop-plugin-samples-main 是一些adobe官方的uxp示例

SDBanana 是substance designer的python插件，拥有完备的ai生图功能，作为示例参考

PSBanana 是photoshop jsx script插件， 拥有完备的ai生图功能，作为示例参考

adobe 官方的uxp api文档

https://developer.adobe.com/photoshop/uxp/2022/ps_reference/

https://developer.adobe.com/photoshop/uxp/2022/uxp-api/

uxp spectrum ui 参考

https://developer.adobe.com/photoshop/uxp/2022/uxp-api/reference-spectrum/


# 技术方案参考
ps_uxp_技术方案.md
考虑会有比较多图层合并导出等操作， 以及和ai服务器生图转码的异步操作，尽量优化性能。 

# 注意事项

不同类型的api provider对发送的payload和返回数据格式可能都有不同，需要单独判断处理
参考api_examples 下的示例代码

google 官方的ai图像生成api 文档 (nanobanana api)
https://ai.google.dev/gemini-api/docs/image-generation