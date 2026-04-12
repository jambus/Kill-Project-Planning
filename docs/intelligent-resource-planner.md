# 智能研发资源排期系统 (Intelligent Resource Planner) - 规划文档

## 一、 产品需求文档 (PRD)

### 1.1 项目背景与目标
在软件开发过程中，项目经理和资源主管经常面临多项目并行、资源瓶颈难以识别的痛点。尤其是在季度规划时，开发、测试等研发资源的分配需要平衡项目优先级和人员技能。本项目旨在打造一款 AI 辅助的资源排期与预警系统，帮助团队合理调配资源，提前发现过载风险。

### 1.2 目标用户
*   **项目经理 (PM) / 敏捷教练 (Scrum Master)**：负责项目整体排期，监控资源使用情况。
*   **研发主管 / 测试主管 (Resource Managers)**：管理团队成员技能标签，分配具体人员到项目。

### 1.3 核心业务流程
1.  **数据拉取**：Chrome 插件在后台定期或按需通过用户的 Jira 登录态或 Token 从 Jira 拉取项目状态、任务进度和已登记工时。
2.  **资源图谱**：主管在插件的独立管理页（Options Page）中维护团队成员在不同产品域的开发/测试能力标签及当前可用性，数据存储在本地。
3.  **智能排期**：在季度规划期间，PM 在插件看板输入待办项目和优先级，插件直接调用大模型 API（如 OpenAI），根据优先级规则、资源技能标签和当前负荷，推荐排期方案。
4.  **实时预警**：当 PM 浏览 Jira 页面时，插件的 Content Script 实时读取本地缓存的排期数据，在页面上注入并提示当前项目或指派人的资源超载/闲置风险。

### 1.4 核心功能模块 (Core Features)
*   **全局仪表盘 (Dashboard)**：作为插件的 Options/New Tab 页面存在，显示资源的甘特图/热力图大盘。
*   **智能排期引擎 (AI Scheduler)**：纯前端组装 Prompt，直接调用 LLM 接口，生成排期建议。
*   **资源图谱与技能管理**：本地化的人员画像管理。
*   **Jira 联动 (Jira Integration)**：利用 Chrome 插件跨域请求能力，直接调用 Jira REST API。
*   **预警机制 (Alerts)**：对资源超量分配进行红绿灯预警，并在 Jira 原生页面中悬浮展示。

---

## 二、 系统架构图 (Local-first Chrome Extension Architecture)

本系统采用纯客户端（Local-first）架构，所有数据存储在用户的浏览器本地缓存中，无独立后端服务器。

```mermaid
graph TD
    %% 外部系统
    Jira[Jira Server / Cloud API]
    LLM[AI 大模型服务 / OpenAI API]
    
    %% Chrome 插件内部架构
    subgraph ChromeExtension [Chrome 浏览器插件环境]
        
        %% UI 视图层
        subgraph Views [视图层 (React)]
            OptionsPage[全局仪表盘 / 管理后台 (Options Page)]
            Popup[快捷操作面板 (Popup)]
            ContentScript[Jira 页面 UI 注入 (Content Script)]
        end
        
        %% 后台服务层
        subgraph Background [后台进程 (Service Worker)]
            SyncEngine[Jira 数据同步引擎]
            AIEngine[AI 排期调度引擎]
        end
        
        %% 本地数据层
        subgraph LocalStorage [浏览器本地存储]
            IndexedDB[(IndexedDB - 大容量关系数据)]
            ChromeStorage[(Chrome.storage.local - 配置项)]
        end
        
    end
    
    %% 内部流转
    Views <--> LocalStorage
    Views <--> Background
    Background <--> LocalStorage
    
    %% 外部交互
    SyncEngine <--> Jira
    ContentScript -.-> Jira页面DOM
    AIEngine <--> LLM
```

---

## 三、 技术设计文档 (Technical Design)

### 3.1 技术栈选择 (Tech Stack)
*   **核心框架**：React + Vite + CRXjs (现代 Chrome 插件构建工具)。
*   **UI 组件库**：Tailwind CSS (轻量级样式), Ant Design / Radix UI (构建复杂表单与仪表盘), Apache ECharts (排期甘特图与资源热力图)。
*   **本地数据库**：Dexie.js (对 IndexedDB 的极简封装，支持类似于关系型数据库的查询操作)，用于存储结构化的项目和资源数据。
*   **状态与配置管理**：`chrome.storage.local` 用于存储用户配置、Jira API Token、OpenAI API Key 等。
*   **AI 接口**：直接使用 Fetch API 调用 OpenAI 或其他兼容的 LLM REST API。

### 3.2 核心数据模型 (IndexedDB Schema - Dexie.js)
因为没有后端，数据结构需要在前端的 IndexedDB 中定义。
*   `Settings`: 存储配置（Jira URL, API Keys, 同步频率等，也可以放 `chrome.storage`）。
*   `Resources`: 研发人员表（包含姓名、角色、可用工时、能力标签 JSON）。
*   `Projects`: 项目表（包含 Jira Project ID、优先级、周期、状态）。
*   `Allocations`: 资源分配表（关联 Resource ID, Project ID，分配的开始-结束日期，投入工时比例）。
*   `JiraWorklogs`: 从 Jira 拉取并缓存的工时日志，用于比对计划与实际进度。

### 3.3 关键技术方案 (Key Technical Solutions)
#### 3.3.1 Local-first 数据同步策略 (Jira Sync)
*   **免密码认证**：由于是 Chrome 插件，如果用户在浏览器中已经登录了 Jira，可以直接复用 Cookie 访问 Jira 接口；或者引导用户在插件设置中填入 Jira Personal Access Token (PAT) 以保证稳定性。
*   **后台定时器**：利用 Chrome Service Worker 的 `chrome.alarms` API 设置定时任务，每隔一段时间（如 1 小时）在后台静默拉取 Jira 数据并更新 IndexedDB。

#### 3.3.2 安全的 AI 调用
*   **API Key 存储**：引导用户输入其私有的 OpenAI API Key，并安全地存储在 `chrome.storage.local` 中（该存储空间不与网页共享，相对安全）。
*   **前端组装 Prompt**：在前端提取 IndexedDB 中的资源和项目信息，构建成 JSON Prompt。
*   **流式响应 (Streaming)**：在 Options Page 触发排期时，使用 Server-Sent Events (SSE) 接收 AI 的流式响应，提升用户等待体验。

#### 3.3.3 Content Script 性能与预警注入
*   插件的 Content Script 会监听页面 URL 的变化（特别是 Jira Issue 页面）。
*   当进入特定 Issue 页面时，Content Script 异步查询 Dexie.js (IndexedDB) 中关于该 Issue 负责人当前的排期负荷状态。
*   将计算后的负荷情况（例如：本周已分配 120% 属于超载），以不侵入原有 DOM 结构的方式（如绝对定位的悬浮卡片、或特定的 Header 注入）展示给 PM 预警。
