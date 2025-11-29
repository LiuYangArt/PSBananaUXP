---
trigger: always_on
alwaysApply: true
---

总是使用中文注释

这是一个Photoshop的UXP插件项目。 调用google nano banana pro模型进行ai生图


#workspace结构
PSBananaUXP 是开发中的插件路径，我们开发插件要写的所有内容都放在下面


api_examples 是ai 生图服务器的api示例



SDBanana 是substance designer的python插件，拥有完备的ai生图功能，作为示例参考

PSBanana 是photoshop jsx script插件， 拥有完备的ai生图功能，作为示例参考

adobe 官方的uxp api文档

https://developer.adobe.com/photoshop/uxp/2022/ps_reference/

https://developer.adobe.com/photoshop/uxp/2022/uxp-api/


# 技术方案参考
ps_uxp_技术方案.md
考虑会有比较多图层合并导出等操作， 以及和ai服务器生图转码的异步操作，尽量优化性能。 

# 注意事项

不同类型的api provider对发送的payload和返回数据格式可能都有不同，需要单独判断处理
参考api_examples 下的示例代码

google 官方的ai图像生成api 文档 (nanobanana api)
https://ai.google.dev/gemini-api/docs/image-generation