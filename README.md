# File Manager (文件管理器)

这是一个轻量级、响应式的单文件 Web 浏览器端文件管理器。它旨在通过 WebDAV 协议或解析 HTTP 目录索引来管理远程服务器上的文件。

## 核心功能

- **WebDAV 支持**：完整支持 PROPFIND, PUT, MOVE, DELETE 方法。
- **降级兼容**：当 WebDAV 不可用时，自动尝试解析 HTML 目录索引（如 Python `http.server` 的输出）。
- **文件预览**：
  - **文本预览**：支持 `.log`, `.sh`, `.py`, `.md` 等格式。
  - **Markdown 渲染**：内置 Markdown 渲染引擎，支持 GFM 语法、任务列表、代码块以及 MathJax 公式（动态加载）。
  - **图片预览**：支持预览主流图片格式。
- **移动端友好**：响应式设计，在大屏幕和小屏幕上均有良好的交互体验。
- **大文件优化**：对大型文本文件自动进行切片预览（仅加载前 512KB）。
- **功能全面**：支持文件上传、下载、重命名、删除、面包屑导航和刷新。

## 快速开始

将 `files.html` 放置在您的静态文件服务器根目录下，并确保服务器已启用 WebDAV 或支持生成目录索引页面。

### 服务端建议

1. **Python HTTP Server**:
   ```bash
   python -m http.server 8000
   ```
   *注意：`http.server` 默认不支持 PUT/DELETE 等修改操作。*

2. **Nginx with WebDAV Module**:
   配置 Nginx 以启用 WebDAV 模块，可以获得完整的新建、删除、重命名和上传体验。

## 技术栈

- **前端**：vanilla HTML5/CSS3/JavaScript (ES6+)
- **外部依赖**（按需动态加载）：
  - [marked](https://github.com/markedjs/marked)
  - [DOMPurify](https://github.com/cure53/dompurify)
  - [MathJax](https://www.mathjax.org/)

## 截图提示

*(如需截图，请使用浏览器打开 `files.html` 并进行相应操作)*

## 说明

本项目优先使用 WebDAV 方法。如果您的服务器不支持，请确保目录索引功能已开启。若看到“检测到服务器返回的是本页面而非目录索引”，请确认本文件名称不是服务器默认的 `index.html`。
