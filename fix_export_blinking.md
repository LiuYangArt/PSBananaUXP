# 导出图片时避免界面闪烁的解决方案

## 问题描述

导出图片时，PS文档会有界面闪烁现象。这是因为：

1. **图层合并或导出操作**：这些操作会影响文档的显示状态，PS会在后台执行命令并更新图像，导致界面刷新和闪烁。
2. **历史记录创建**：PS每次执行操作时都会生成历史记录。如果没有正确处理，频繁的历史记录更新会导致UI闪烁。
3. **新建文档操作**：如果在导出时创建了新的临时文件或复制了图层，这也会导致PS文档的显示和历史记录状态被重新创建。

## 解决方案

### ✅ 正确的实现（UXP API）

使用 UXP 的 `suspendHistory` 和 `resumeHistory` API：

```javascript
const { executeAsModal } = require("photoshop").core;
const { batchPlay } = require("photoshop").action;

async function exportWithoutBlinking(executionContext) {
    const hostControl = executionContext.hostControl;
    const doc = app.activeDocument;
    const documentID = doc.id;
    
    // 1. 挂起历史记录 - 将所有后续操作合并为一个历史状态
    const suspensionID = await hostControl.suspendHistory({
        documentID: documentID,
        name: "导出图片"  // 历史记录名称
    });
    
    try {
        // 2. 在原文档上执行所有操作（合并、裁切、缩放、导出）
        //    避免创建新文档，减少界面刷新
        
        // 2.1 合并可见图层到新图层（duplicate: true 避免破坏原图层）
        await batchPlay([{
            "_obj": "mergeVisible",
            "duplicate": true,
            "_isCommand": true
        }], {
            "synchronousExecution": true,
            "modalBehavior": "wait"
        });
        
        // 2.2 裁切到指定区域（如需要）
        if (region) {
            await doc.crop({
                left: region.left,
                top: region.top,
                right: region.right,
                bottom: region.bottom
            });
        }
        
        // 2.3 缩放文档（如需要）
        if (needResize) {
            await doc.resizeImage(exportWidth, exportHeight);
        }
        
        // 2.4 导出为 WebP
        const fileToken = fs.createSessionToken(webpFile);
        await batchPlay([{
            "_obj": "save",
            "as": {
                "_obj": "WebPFormat",
                "compression": {
                    "_enum": "WebPCompression",
                    "_value": "compressionLossy"
                },
                "quality": 80
            },
            "in": {
                "_path": fileToken,
                "_kind": "local"
            },
            "copy": true,
            "_isCommand": true
        }], {
            "synchronousExecution": true,
            "modalBehavior": "wait"
        });
        
    } finally {
        // 3. 回滚所有更改（commit = false）
        //    这会撤销所有操作，恢复到挂起历史记录前的状态
        await hostControl.resumeHistory(suspensionID, false);
        console.log('[PS] 文档已恢复到导出前的状态');
    }
}

// 在 executeAsModal 中调用
await executeAsModal(
    exportWithoutBlinking,
    { commandName: "导出图片" }
);
```

## 核心优势

1. ✅ **减少闪烁**：`suspendHistory` 会暂停界面更新，所有操作在内部执行，用户不会看到中间状态
2. ✅ **操作原子性**：配合 `executeAsModal` 确保操作不被中断
3. ✅ **状态恢复**：`resumeHistory(id, false)` 可以完全回滚所有更改，不污染用户的历史面板
4. ✅ **性能优化**：避免创建临时文档，减少内存开销和文档切换
5. ✅ **历史记录干净**：所有临时操作都不会留在历史记录中

## API 参数说明

### suspendHistory(options)

挂起历史记录，将后续操作合并为一个历史状态。

```javascript
const suspensionID = await hostControl.suspendHistory({
    documentID: doc.id,    // 文档ID
    name: "操作名称"        // 历史记录显示的名称
});
```

### resumeHistory(suspensionID, commit)

恢复历史记录。

```javascript
// commit = true: 提交更改，保留在历史记录中
await hostControl.resumeHistory(suspensionID, true);

// commit = false: 回滚更改，撤销所有操作（推荐用于临时导出）
await hostControl.resumeHistory(suspensionID, false);
```

## ❌ 错误的方案（ExtendScript API）

以下 API 是 **ExtendScript** 的，**不适用于 UXP**：

```javascript
// ❌ 错误：UXP 中不存在这些方法
const historyState = app.activeDocument.historyStates.add();
app.activeDocument.historyStates.remove(historyState);
```

## 实际应用

已在以下函数中实现：

- `PSOperations.exportVisibleLayersAsWebP()` - 导出所有可见图层
- `PSOperations.exportGroupAsWebP()` - 导出指定组

这两个函数都使用 `suspendHistory` + `resumeHistory(false)` 来避免闪烁和历史记录污染。

## 参考文档

- [UXP executeAsModal](https://developer.adobe.com/photoshop/uxp/2022/ps_reference/media/executeasmodal)
- [UXP ExecutionContext](https://developer.adobe.com/photoshop/uxp/2022/ps_reference/objects/options/executioncontext)
- [Google Gemini Image Generation API](https://ai.google.dev/gemini-api/docs/image-generation)
