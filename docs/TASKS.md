# 智能排期优化任务清单

> **状态标记**: ✅ 已完成 — ⚠️ 部分完成 — ❌ 未开始
>
> 更新于 2026-05-11 代码审查后，新增代码质量/架构任务，标记已有实现状态。

---

## 高优先级任务（影响用户体验）

### Task 1: ⚠️ 优化AI调用效率 — 减少收敛循环冗余调用
**优先级**: P0  
**预估工作量**: 2-3天  
**当前状态**: 已实现 `BATCH_SIZE=3` 分批，但收敛循环仍有过量调用

**当前问题**:
- PASS 1 已实现每批 3 个项目的批量调用 ✅
- 但 **PASS 3 收敛循环**（`SchedulingContext.tsx:255-286`）每轮又全量调 AI
- 每轮 dev + test 各调一次（最多 3 轮 = 最多 6 次额外调用）
- 收敛循环中资源/项目状态变化很小，但每次都发送完整数据集

**优化方案**:
1. PASS 3 只发送有 gap 的项目和有 idle 的资源，过滤已满载项
2. **收敛检测提前熔断**：如果某轮 dev 或 test 的 gap 全部为 0，跳过该 phase 的 AI 调用
3. 与 Task 6（资源缓存）联动，收敛循环使用增量状态而非全量重建

**涉及文件**:
- `extension/src/context/SchedulingContext.tsx` — `handleGenerateSchedule` PASS 3 逻辑

---

### Task 2: ❌ 增强错误处理和重试机制
**优先级**: P0  
**预估工作量**: 1-2天  
**当前问题**:
- `SchedulingContext.tsx:292` — catch 直接 `setError(err.message)`，无重试
- `ai.ts:39-44` — `extractJsonArray` 解析失败静默返回 `[]`，无告警
- `ai.ts:24` — `callAI` 中 `response.ok` 失败直接 throw，无退避重试
- PASS 3 收敛循环中如果某次 AI 调用失败，整轮排期中断

**优化方案**:
1. 添加带指数退避的重试包装器：
   ```typescript
   const callAIWithRetry = async (fn, retries = 3) => {
     for (let i = 0; i < retries; i++) {
       try { return await fn(); }
       catch (e) { if (i === retries - 1) throw e; await delay(1000 * 2 ** i); }
     }
   };
   ```
2. `extractJsonArray` 解析失败时 console.warn 原始响应内容
3. PASS 3 中单次 AI 调用失败不应中断整轮，应跳过继续

**涉及文件**:
- `extension/src/services/ai.ts` — `callAI`, `extractJsonArray`
- `extension/src/context/SchedulingContext.tsx` — try/catch 逻辑

---

### Task 3: ✅ 并发控制和状态管理 — 已实现
**优先级**: P1  
**预估工作量**: —  
**当前状态**: ✅ 已实现（`SchedulingContext.tsx`）

**已有实现**:
- `isScheduling` 状态锁，排期中禁用触发按钮 ✅
- `stopScheduling` + `stopRequestedRef` 手动中断 ✅
- 进度步骤指示器（`currentStep` 1-4）✅
- `checkStop()` 在每个异步点植入哨兵检查 ✅

**无需额外改动。**

---

### Task 4: ⚠️ 优化Prompt结构和Token使用
**优先级**: P1  
**预估工作量**: 2-3天  
**当前状态**: 已实现 system/user message 分离，但仍有冗余

**当前问题**:
- `ai.ts:60-68` — `suggestAllocationsForBatch` 中 system message **每次调用都包含完整资源列表**（`JSON.stringify(idleResources)`）
- 同一批排期中，PASS 1 和 PASS 3 的资源列表高度重叠，每次都重复发送
- `idleResources` 对象包含 `scheduleSummary` 等长文本字段，Token 浪费

**优化方案**:
1. system message 只放静态规则，**不放资源数据**
2. user message 中只发送变化的数据（当前 batch 的项目 + 资源摘要）
3. 精简资源字段：只发 `{id, name, role, idleMd, skills}`，去掉 `scheduleSummary`、`utilization` 等 AI 不需要的字段
4. 对于支持 prompt caching 的 API（如 OpenAI），在 system message 中标记可缓存内容

**涉及文件**:
- `extension/src/services/ai.ts` — `suggestAllocationsForBatch`

---

### Task 5: ❌ 改进AI约束传递机制
**优先级**: P1  
**预估工作量**: 1天  
**当前状态**: 有 `Math.min` 截断但 AI 不知道约束边界

**当前问题**:
- `SchedulingContext.tsx:189` — `finalMd = Math.min(sug.allocatedMd, targetGap, rIdle.idleMd)` — AI 建议经常被截断
- AI 不知道项目的**精确剩余 gap** 和资源的**精确空闲天数**
- AI 浪费推理能力做出超出边界的建议

**优化方案**:
1. 传给 AI 的数据中明确标注 `maxAllocatable`（`= Math.min(projectGap, resourceIdle)`）
2. 在 prompt 中添加约束说明：「每个建议的 `allocatedMd` 不得超过对应资源的剩余 idle 和项目的剩余 gap」
3. `applySuggestions` 中如果截断发生（`finalMd !== sug.allocatedMd`），记录 warning 到日志

**涉及文件**:
- `extension/src/services/ai.ts` — prompt template
- `extension/src/context/SchedulingContext.tsx` — `applySuggestions`

---

### Task N1: 🔴 新增 — `applySuggestions` 中 runAudit 过度调用（性能瓶颈）
**优先级**: P0  
**预估工作量**: 1天  
**当前问题**:
- `SchedulingContext.tsx:183-186` — `applySuggestions` 的 for 循环中**每条 AI 建议都全量跑一次 `runAudit`**
  ```typescript
  for (const sug of suggestions) {
    const { gaps: cGaps, idle: cIdle } = runAudit(readyProjects, resources, currentAllocations, ...)
    // 每条建议 → O(projects × resources × allocations) 全量计算
  }
  ```
- PASS 1 中 3 个项目 × 多次建议 → 几十次全量 audit
- PASS 3 收敛循环同样有此问题

**优化方案**:
1. 在 `applySuggestions` 调用前计算一次 audit，作为参数传入
2. 分配每条建议后，只增量更新被影响的项目和资源的 audit 值（`O(1)`），不做全量重算
3. 或：在 batch 级别调用 audit，而非 per-suggestion

**涉及文件**:
- `extension/src/context/SchedulingContext.tsx` — `applySuggestions`

---

## 中优先级任务（降低成本和优化性能）

### Task 6: ❌ 性能优化 — 资源 Calendar 缓存与增量更新
**优先级**: P2  
**预估工作量**: 1-2天  
**当前问题**:
- `SchedulingContext.tsx:49-74` — `generateResourceCalendar` 每次调用遍历排期窗口全部天数
- 在 `runAudit` 中为每个资源调用此函数（`runAudit` 又被 `applySuggestions` 每条建议调用）
- 收敛循环中重复数千次迭代，O(days × resources × suggestions) 爆炸

**优化方案**:
1. 在 `handleGenerateSchedule` 开始时一次性构建所有资源的 DailySlot 矩阵，存入 Map
2. 后续分配新 allocation 后只更新受影响的日期槽位（增量），不做全量重建
3. `runAudit` 改为从缓存 Map 读取，不再重新生成

**技术要点**:
```typescript
const calendarCache = new Map<number, DailySlot[]>();

const buildCalendar = (res, allocations, year, startM, endM) => {
  // 只构建一次，缓存
}

const updateCalendar = (resId, newAlloc) => {
  // 只更新受影响日期范围
}
```

**涉及文件**:
- `extension/src/context/SchedulingContext.tsx` — `generateResourceCalendar`, `runAudit`, `getAvailableWindows`

---

### Task 7: ✅ 日期配置化 — 支持动态假期管理
**优先级**: P2  
**预估工作量**: —  
**当前状态**: ✅ 已实现

**已有实现**:
- `Holidays.tsx` 独立页面 ✅
- 存储到 IndexedDB `settings` 表 ✅
- `updateHolidaysConfig` 同步到 `dateUtils.ts` ✅

**潜在改进**（可选）:
- `dateUtils.ts:4` 仍用 `let` 导出可变全局变量，多页面环境有竞态风险

**涉及文件**:
- `extension/src/options/pages/Holidays.tsx`
- `extension/src/utils/dateUtils.ts`

---

### Task 8: ❌ 排期结果报告与后置验证
**优先级**: P2  
**预估工作量**: 2天  
**当前问题**:
- 排期完成后没有任何结构化反馈，只有文案 `scheduleStatus`
- 用户不知道哪些项目排上了、哪些没排上、哪些部分完成
- 没有资源利用率总览

**优化方案**:
1. 添加 `ScheduleReport` 接口：
   ```typescript
   interface ScheduleReport {
     totalProjects: number;
     fullyAllocated: number;    // 开发+测试均已满足
     partialAllocated: number;  // 部分满足
     notAllocated: number;      // 完全未排上
     resourceUtilization: Array<{ name: string; role: string; utilization: number }>;
   }
   ```
2. 排期完成后在 Dashboard 顶部展示结果卡片
3. 区分「AI 未排」和「资源不足」两种失败原因

**涉及文件**:
- `extension/src/context/SchedulingContext.tsx` — `handleGenerateSchedule` 返回值
- `extension/src/options/pages/Dashboard.tsx` — UI 展示

---

### Task N2: 🔴 新增 — 审计逻辑重复（runAudit 双实现）
**优先级**: P1  
**预估工作量**: 0.5天  
**当前问题**:
- `Dashboard.tsx:38-69` 的 `runAuditForUI` 和 `SchedulingContext.tsx:96-120` 的 `runAudit` 本质相同
- 但一个用 `calculateMonthlyMD`，一个用 `generateResourceCalendar`，结果不一致
- 修复 bug 需要改两处，很容易遗漏

**优化方案**:
1. 将审计逻辑抽取到 `utils/` 或 `services/` 下的共享模块
2. 统一使用同一种计算方法（推荐 `generateResourceCalendar` 方式，精度更高）
3. Dashboard 和 SchedulingContext 都引用同一函数

**涉及文件**:
- `extension/src/context/SchedulingContext.tsx` — `runAudit`
- `extension/src/options/pages/Dashboard.tsx` — `runAuditForUI`

---

### Task N3: 🟡 新增 — 开发者角色列表硬编码 5 处
**优先级**: P1  
**预估工作量**: 0.5天  
**当前问题**:
- `['前端工程师', '后端工程师', 'APP工程师', '全栈工程师']` 在以下位置重复硬编码：
  - `SchedulingContext.tsx:219, 220, 266`
  - `Dashboard.tsx:86-87, 101`
- 新增角色（如「算法工程师」）需要改 5 个文件，容易遗漏

**优化方案**:
1. 在 `src/utils/constants.ts` 中定义：
   ```typescript
   export const DEV_ROLES = ['前端工程师', '后端工程师', 'APP工程师', '全栈工程师'] as const;
   export const TEST_ROLES = ['测试工程师'] as const;
   export const ALL_ROLES = [...DEV_ROLES, ...TEST_ROLES] as const;
   ```
2. 所有文件统一引用常量

---

### Task N4: 🟡 新增 — DB Schema 索引字段名不匹配
**优先级**: P2  
**预估工作量**: 0.5天  

**当前问题**:
- `db/index.ts:42` — version 1 的 store 配置声明了 `jiraProjectId, jiraProjectKey` 索引
- 但 `Project` 接口中字段是 `jiraEpicKey`，数据结构中没有 `jiraProjectId`/`jiraProjectKey`
- Dexie 索引绑定的是运行时的字段名，索引实际不生效且不报错

**优化方案**:
1. 删除无效索引声明，或统一字段名
2. 创建新的 schema 版本号（version 5）修正

**涉及文件**:
- `extension/src/db/index.ts`

---

## 低优先级任务（可维护性和长期优化）

### Task 9: ❌ 增强可观测性和调试能力
**优先级**: P3  
**预估工作量**: 1-2天  
**当前问题**:
- 只有 `console.log`，没有结构化日志
- `ai.ts` 有 `console.log('[AI Debug]')` 但在生产环境中也输出
- 无法追踪 AI 调用耗时和 Token 使用量
- 没有排期决策过程的记录

**优化方案**:
1. 添加 `Logger` 工具类，支持级别控制（debug/info/warn/error）
2. 记录每次 AI 调用的耗时、请求和响应摘要
3. 可选：将排期日志持久化到 IndexedDB `logs` 表

**涉及文件**:
- `extension/src/services/ai.ts`
- `extension/src/context/SchedulingContext.tsx`

---

### Task 10: ❌ AI响应格式标准化与校验
**优先级**: P3  
**预估工作量**: 1天  
**当前问题**:
- `ai.ts:28-34` 的 `extractJsonArray` 仅靠 `indexOf('[')` + `lastIndexOf(']')` + `JSON.parse`
- AI 返回格式稍有不规范（注释、尾逗号、嵌套大括号）就静默返回 `[]`
- 无 Schema 验证，`any` 类型无法保证字段完整性

**优化方案**:
1. 更健壮的 JSON 提取：支持 markdown code block、尾逗号清洗
2. 添加运行时字段校验（手动检查必填字段）：`projectId`, `resourceId`, `allocatedMd`
3. 校验失败时 console.warn 原始响应，帮助调试

**涉及文件**:
- `extension/src/services/ai.ts` — `extractJsonArray`, `suggestAllocationsForBatch`

---

### Task N5: ⚪ 新增 — 死代码清理
**优先级**: P3  
**预估工作量**: 0.5天  

**清理清单**:
1. **`extension/src/App.tsx`** — 整文件是 Vite 脚手架示例页，`main.tsx` 和 `options/index.tsx`/`popup/index.tsx` 各自独立挂载，此文件无引用
2. **`extension/src/services/googleSheets.ts`** — Google Sheets 同步功能，未接入任何 UI，也未在 AGENTS.md 中提及
3. **`extension/src/db/services.ts:48-54`** — `getAllocationsByResourceId` 和 `getAllocationsByProjectId` 未在任何地方调用

---

### Task N6: ⚪ 新增 — 全局可变状态改进（dateUtils 副作用）
**优先级**: P3  
**预估工作量**: 0.5天  

**当前问题**:
- `dateUtils.ts:12,21` — `let HOLIDAYS` / `let SPECIAL_WORKDAYS` 是模块级可变导出
- `updateHolidaysConfig()` 直接修改全局变量，是副作用函数
- React 并发模式下多个组件同时调用可能互相覆盖

**优化方案**:
1. 改为类或对象封装，通过实例传递
2. 或：将日历配置作为参数传入计算函数，而非全局变量

**涉及文件**:
- `extension/src/utils/dateUtils.ts`

---

### Task N7: ⚪ 新增 — 表单输入回车提交
**优先级**: P3  
**预估工作量**: 0.5天  

**当前问题**:
- `Holidays.tsx:99` — 添加日期按钮点击添加，但输入框不支持回车提交
- `Skills.tsx:247` — 同理，新增技能输入框不支持回车

**优化方案**:
- 给 `<input>` 添加 `onKeyDown={e => e.key === 'Enter' && handleAdd()}`

---

## 实施建议

### 第一阶段（立即执行）— 1-2周
| 排序 | Task | 理由 |
|------|------|------|
| 1 | **N1**: `applySuggestions` audit 调用优化 | 改动最小，性能提升最大 |
| 2 | **2**: 错误重试 | +30 行代码，大幅提升成功率 |
| 3 | **N2**: 审计逻辑合并 | 消除 bug 源，后续改动不再重复 |
| 4 | **N3**: DEV_ROLES 常量抽取 | 简单重构，消除 5 处重复 |

**目标**: 消除性能瓶颈，提升稳定性和可维护性

### 第二阶段（1个月内）— 2周
| 排序 | Task | 理由 |
|------|------|------|
| 5 | **6**: Calendar 缓存 | 配合 N1 进一步优化 |
| 6 | **4**: Prompt 精简 | 降低 Token 成本 40-60% |
| 7 | **5**: AI 约束传递 | 更准确的分配建议 |
| 8 | **8**: 排期结果报告 | 用户可见的最大改进 |

**目标**: 降低成本，提升排期质量和可感知体验

### 第三阶段（长期优化）— 按需
- **N4**: DB Schema 索引修复
- **N5**: 死代码清理
- **N6**: dateUtils 重构
- **9-10**: 可观测性 / 格式校验

**目标**: 提升系统质量和可维护性

---

## 风险和注意事项

1. **向后兼容**: 所有数据结构和 DB schema 改动必须创建新 version，不走迁移
2. **渐进式优化**: 每个 task 独立验证，按 `npm run build` 通过为验收标准
3. **Task N1 风险**: 增量更新 audit 逻辑需确保与全量计算结果一致，对比测试后再上线

---

*最后更新: 2026-05-11 | 基于代码审查 + TASKS.md + PRD 综合梳理*
