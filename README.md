# PDF Auto Translator (Chrome 扩展)

这个项目是一个 Chrome 插件：在浏览器里打开 PDF 时自动跳转到插件翻译阅读器，并将内容默认从英文翻译成中文。

## 已实现能力

- 自动识别并处理 `.pdf` 链接。
- 默认翻译方向：`en -> zh-CN`。
- 支持在插件设置中切换源语言和目标语言。
- 提供手动“翻译当前标签页 PDF”按钮。
- 翻译阅读页展示逐页原文与译文，并显示进度。

## 目录结构

```text
extension/
  manifest.json
  background.js
  popup.html
  popup.css
  popup.js
  options.html
  options.css
  options.js
  viewer.html
  viewer.css
  viewer.js
  languages.js
  lib/
    pdf.mjs
    pdf.worker.min.mjs
```

## 使用方式

1. 在 Chrome 打开 `chrome://extensions/`。
2. 开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择本项目下的 `extension` 目录。
4. 可在扩展“选项”里设置翻译语言和自动翻译开关。

## 本地 PDF 说明

如果你要翻译本地文件（`file://`），需要在扩展详情页打开：

- “允许访问文件网址”

否则扩展无法读取本地 PDF 地址。

## 注意

- 当前自动识别规则基于 URL 中包含 `.pdf`。
- 少数不带 `.pdf` 后缀但实际返回 `application/pdf` 的地址，可能不会被自动接管，此时可用弹窗里的“翻译当前标签页 PDF”。
