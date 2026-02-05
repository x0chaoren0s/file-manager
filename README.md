# File Manager (文件管理器)

这是一个现代化的、模块化的 Web 浏览器端文件管理器。它基于 Vite 构建，支持模块化开发，并能生成单一的 HTML 文件以便于部署。

## 核心功能

- **WebDAV 支持**：完整支持 PROPFIND, PUT, MOVE, DELETE 方法。
- **降级兼容**：当 WebDAV 不可用时，自动尝试解析标准 Nginx/Python 的 HTML 目录索引。
- **模块化结构**：逻辑解耦，分为状态管理、API 交互、UI 渲染、工具函数及文件预览模块。
- **文件预览**：
  - **文本预览**：支持 `.log`, `.sh`, `.py`, `.md` 等格式。
  - **Markdown 渲染**：支持 GFM 语法、代码块及 MathJax 公式。
  - **图片预览**：支持主流图片格式。
- **快速部署**：提供 `deploy.sh` 一键部署脚本，支持自定义端口、域名及子路径配置，并深度适配**宝塔面板** (BT Panel) 环境。

## 开发与构建

项目使用 Node.js (推荐 v24+) 及 Vite 进行开发。

### 1. 安装依赖
```bash
npm install
```

### 2. 开发模式
```bash
npm run dev
```

### 3. 构建单文件
```bash
npm run build
```
产物将生成在 `dist/index.html`。

## 生产部署

您可以直接使用内置的部署脚本：

```bash
chmod +x deploy.sh
./deploy.sh
```

按照提示输入端口、子路径等信息，脚本将自动配置 Nginx 并迁移文件。

## 技术栈

- **构建工具**: Vite + vite-plugin-singlefile
- **前端语言**: Vanilla JavaScript (ES6+)
- **样式**: Vanilla CSS
- **Markdown 引擎**: [marked](https://github.com/markedjs/marked) + [DOMPurify](https://github.com/cure53/dompurify)

## 许可说明

本项目优先使用 WebDAV 方法，建议在 Nginx 环境下配合 `nginx-extras` 使用以获得最佳体验。

