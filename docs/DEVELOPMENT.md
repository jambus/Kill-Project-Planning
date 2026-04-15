# 智能研发资源排期系统 - 本地开发与环境搭建指南 (Development Guide)

本文档记录了本项目的本地开发环境搭建步骤、运行方式以及打包构建流程。

**⚠️ 重要维护说明 (For Developers & AI Agents):**
> 随着项目的迭代，如果引入了新的核心依赖（例如新的数据库、外部服务 SDK）、修改了构建脚本（如 `package.json` 中的 scripts）或更改了目录结构，**请务必同步更新本文档**，以确保新加入的开发者能够顺利运行项目。

---

## 1. 环境要求 (Prerequisites)

*   **Node.js**: v18.0.0 或更高版本 (推荐使用 LTS 版本)。
*   **包管理器**: npm 或 pnpm。
*   **浏览器**: Google Chrome (用于加载和调试插件)。

## 2. 本地开发启动步骤 (Local Development Setup)

1.  **克隆或进入项目目录**:
    ```bash
    # 假设已经在项目根目录
    cd extension
    ```

2.  **安装依赖 (Install Dependencies)**:
    ```bash
    npm install
    ```

3.  **启动开发服务器 (Start Dev Server)**:
    执行以下命令，Vite 将会启动热更新 (HMR) 服务，并实时编译插件代码到 `dist` 目录。
    ```bash
    npm run dev
    ```

4.  **在 Chrome 中加载插件**:
    *   打开 Chrome 浏览器，在地址栏输入 `chrome://extensions/` 并回车。
    *   开启页面右上角的 **“开发者模式” (Developer mode)**。
    *   点击左上角的 **“加载已解压的扩展程序” (Load unpacked)**。
    *   在弹出的文件选择窗口中，选择本项目下的 `extension/dist` 文件夹。
    *   加载成功后，您应该能在扩展栏看到蓝色的“智能排期系统”图标。由于启用了热更新，后续修改代码后，大部分情况下浏览器会自动重新加载插件（若未生效，可在扩展管理页点击刷新按钮）。

## 3. 生产环境构建与打包 (Production Build & Packaging)

**⚠️ 交付要求 (Delivery Requirement):**
> **每次修改完核心功能代码后，必须重新执行生产构建并更新 release 目录下的 ZIP 包**，以确保分发产物与最新代码同步。

1.  **执行构建命令**:
    ```bash
    cd extension
    npm run build
    ```
    此命令会先执行 TypeScript 类型检查 (`tsc -b`)，然后使用 Vite 进行生产级别压缩和打包。产物将生成在 `extension/dist` 目录下。

2. **打包为 ZIP 并更新 Release**:
    ```bash
    cd extension/dist
    mkdir -p ../release
    # 覆盖更新 release 目录下的压缩包
    zip -r ../release/intelligent-resource-planner-v1.0.0.zip .
    ```
    生成的 ZIP 文件位于 `extension/release/` 目录下，即可用于上传至 Chrome Web Store 或直接分发给用户进行本地拖拽安装。

## 4. 技术栈速览 (Tech Stack Overview)

*   **框架**: React 19 + TypeScript + Vite 4
*   **插件构建**: `@crxjs/vite-plugin` (Manifest V3)
*   **样式**: Tailwind CSS v3
*   **本地存储**: IndexedDB (通过 `dexie` 和 `dexie-react-hooks` 驱动)
*   **图标库**: `lucide-react`
*   **路由**: `react-router-dom` (用于 Options 管理后台页面)
