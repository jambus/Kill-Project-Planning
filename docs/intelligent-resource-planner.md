# 智能研发资源排期系统 (Intelligent Resource Planner) - 规划文档

## 一、 产品需求文档 (PRD)

### 1.1 项目背景与目标
在软件开发过程中，项目经理和资源主管经常面临多项目并行、资源瓶颈难以识别的痛点。尤其是在季度规划时，开发、测试等研发资源的分配需要平衡项目优先级和人员技能。本项目旨在打造一款 AI 辅助的资源排期与预警系统，帮助团队合理调配资源，提前发现过载风险。

### 1.2 目标用户
*   **项目经理 (PM) / 敏捷教练 (Scrum Master)**：负责项目整体排期，监控资源使用情况。
*   **研发主管 / 测试主管 (Resource Managers)**：管理团队成员技能标签，分配具体人员到项目。

### 1.3 核心业务流程
1.  **数据同步**：系统定期从 Jira 拉取进行中的项目状态、任务进度和已登记工时。
2.  **资源图谱**：主管维护团队成员在不同产品域的开发/测试能力标签及当前可用性。
3.  **智能排期**：在季度规划期间，PM 输入待办项目和优先级，AI 根据优先级规则、资源技能标签和当前负荷，推荐季度资源排期方案。
4.  **实时预警**：Chrome 插件在 PM 浏览 Jira 页面时，实时提示当前项目或指派人的资源超载/闲置风险。

### 1.4 核心功能模块 (Core Features)
*   **全局仪表盘 (Dashboard)**：显示季度所有项目的资源分配大盘，以甘特图/热力图形式展现资源使用率。
*   **智能排期引擎 (AI Scheduler)**：支持用户配置“优先级规则”，一键生成排期建议，支持人工微调。
*   **资源图谱与技能管理**：人员画像，包含：角色、职级、领域能力标签（如前端、后端、特定业务线经验）。
*   **Jira 联动同步 (Jira Sync)**：对接 Jira API，同步 Issue 状态、估算工时与实际 Worklog。
*   **预警机制 (Alerts)**：对资源超量分配进行红绿灯预警，并在 Chrome 插件中悬浮展示。

---

## 二、 系统架构图 (Architecture)

本系统采用全栈 TypeScript 架构，前后端分离，结合浏览器插件扩展 Jira 的原生体验。

```mermaid
graph TD
    %% 外部系统
    Jira[Jira Server / Cloud API]
    LLM[AI 大模型服务 / OpenAI API]
    
    %% 前端层
    subgraph Frontend [前端层 (React / Next.js)]
        WebApp[Web 管理后台]
        ChromeExt[Chrome 浏览器插件]
    end
    
    %% 后端层
    subgraph Backend [后端层 (Node.js / NestJS)]
        API[REST / GraphQL API]
        AIService[AI 排期编排服务]
        JiraService[Jira 数据同步与缓存服务]
        Scheduler[定时任务调度 Scheduler]
    end
    
    %% 数据层
    subgraph Database [数据存储层 (PostgreSQL)]
        DB[(PostgreSQL)]
        Redis[(Redis 缓存/队列)]
    end
    
    %% 连接关系
    WebApp <--> API
    ChromeExt <--> API
    API <--> DB
    API <--> Redis
    Scheduler --> JiraService
    JiraService <--> Jira
    JiraService <--> DB
    AIService <--> LLM
    API --> AIService
```

---

## 三、 技术设计文档 (Technical Design)

### 3.1 技术栈选择 (Tech Stack)
*   **前端 Web**：Next.js (React), Tailwind CSS, Ant Design / MUI (中后台 UI 组件库), Apache ECharts (甘特图与资源热力图)。
*   **Chrome 插件**：React + Vite (CRXjs 插件构建工具)。
*   **后端服务**：NestJS (Node.js 框架), TypeORM / Prisma, BullMQ (用于处理 Jira 同步异步任务)。
*   **数据库**：PostgreSQL (关系型数据存储)，Redis (缓存 Jira 频繁查询、任务队列)。
*   **AI 引擎**：LangChain.js / OpenAI API SDK，用于处理排期 Prompt 并结构化输出排期结果。

### 3.2 核心数据模型 (Database Schema - 核心表设计)
*   `User`: 系统用户表（PM、主管）。
*   `Resource`: 研发人员表（包含姓名、角色、可用工时、能力标签 JSON）。
*   `Project`: 项目表（包含 Jira Project ID、优先级、周期、状态）。
*   `Allocation`: 资源分配表（关联 Resource ID, Project ID，分配的开始-结束日期，预计投入工时比例）。
*   `JiraWorklog`: 缓存从 Jira 同步的实际工时消耗日志。

### 3.3 关键技术方案 (Key Technical Solutions)
#### 3.3.1 AI 排期算法实现逻辑
1.  **数据组装**：后端收集当前季度所有待排期项目（含优先级）、所有可用资源（含技能标签与剩余容量）。
2.  **Prompt 构建**：将上述数据序列化为 JSON 或精简文本，注入到系统预设的 System Prompt 中，明确排期约束条件（如：前端开发不能分配测试任务，单一人员某周总负荷不超过 100%）。
3.  **大模型推理**：调用 LLM 接口，要求返回符合 JSON Schema 的结构化排期方案。
4.  **校验与存储**：后端接收 JSON 后，校验合法性（如时间有无重叠），并转换为待确认的排期草稿保存，供 PM 调整。

#### 3.3.2 Jira 数据同步机制
*   **全量同步**：夜间低峰期触发，通过 Jira API 分批拉取更新所有关联项目的 Issue 和 Worklog。
*   **增量同步 (Webhook)**：在 Jira 配置 Webhook，当 Issue 状态变更或登记工时时，实时推送到 NestJS 的 Webhook 接收端点，更新数据库状态，触发预警重新计算。

#### 3.3.3 Chrome 插件与 Jira 交互
*   **Content Script**：注入到 Jira 页面，识别当前 URL 中的 Project Key 或 Issue Key。
*   **API 请求**：插件向 NestJS 后端发送带身份验证的请求，获取该 Issue 关联人员的本周负荷。
*   **UI 注入**：在 Jira 原生界面的侧边栏或用户信息卡片上悬浮展示红/黄/绿的负荷状态，并提供快捷操作入口。
