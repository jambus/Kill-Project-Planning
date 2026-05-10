# 智能排期引擎优化任务清单

> 来源：2026-05-10 排期引擎代码审查
> 优先级：P0(最紧急) → P3(可延后)

---

## P0 — 正确性缺陷

### T-001 findEarliestFitDate 只检查首日容量

`extension/src/context/SchedulingContext.tsx:126`
`findEarliestFitDate` 只验证分配首日的可用容量 ≥ allocationPercentage，不检查后续日期的容量是否足够。如果第一天有 50% 空闲但第二天只剩 30%，50% 分配仍会创建，`generateResourceCalendar` 会把该百分比应用到范围内的每一天，导致隐性超分配（被 `Math.max(0, ...)` 掩盖）。

**影响**：后续分配看到偏少的可用容量，降低整体利用率。
**修复方向**：检查从 startDate 到推算的 endDate 之间每一天的容量是否都满足 percentage 要求。或在 `applySuggestions` 中分配后做一次事后验证。

### T-002 截断 endDate 到 scheduleMaxDate 静默吞 MD

`extension/src/context/SchedulingContext.tsx:198`
当 `calculateEndDate` 返回的日期超出排期窗口时，代码直接截断到 `scheduleMaxDate`，不验证截断后的工作天数是否仍能满足 `finalMd` 人天需求。用户最终看到项目有缺口但不知道原因。

**影响**：分配数据不准确，缺口分析可信度降低。
**修复方向**：计算从 startDate 到 scheduleMaxDate 的实际工作天数，如果无法承载 finalMd 则跳过该建议并记录日志。

---

## P1 — 性能优化

### T-003 generateResourceCalendar 反复重建

`extension/src/context/SchedulingContext.tsx:49`
每次 `runAudit()` 调用都重新逐日遍历整个时间窗口为所有资源重建日历矩阵。PASS 1 每批调用 2 次，PASS 2 调用 1 次，PASS 3 每轮调用 2 次，`applySuggestions` 中每个建议都重新调用 `runAudit()`。此外 `findEarliestFitDate` 也独立重建日历。

**影响**：资源多、项目多时排期耗时显著增加。
**修复方向**：实现日历缓存，在 `currentAllocations` 变更时增量更新。

### T-004 runAudit 全量审计粒度太粗

每次审计都计算所有项目和所有资源的缺口/闲置数据，但大多数实体的分配数据并未变化。

**修复方向**：将审计拆分为项目级和资源级，只在对应数据变更时重新计算。

---

## P1 — 鲁棒性

### T-005 AI 中途失败无事务回滚

`extension/src/context/SchedulingContext.tsx:201`
`applySuggestions` 逐条写入 IndexedDB。如果 AI API 在后续批次调用时失败，已分配的批次已持久化。虽然 `db.allocations.clear()` 在每次排期开始时执行，但用户看到的是「排期中」突然崩溃且无结果。

**修复方向**：将快照保留在内存中，失败时恢复。

### T-006 currentAllocations 与 IndexedDB 不同步风险

`applySuggestions` 同时写入内存数组和 DB。如果 `db.allocations.add()` 失败，两者产生分歧。

**修复方向**：用 try/catch 包裹单条写入，失败时回滚本次建议或整批。

---

## P2 — 排期质量

### T-007 PASS 2 完整性回滚未评估剩余窗口

`extension/src/context/SchedulingContext.tsx:242-248`
当前回滚条件是：dev 做了部分但 test 完全没做（或反之），就整体回滚。不评估剩余排期窗口内是否仍有机会完成另一阶段。

**修复方向**：在回滚前判断剩余工作日在窗口内的可用资源是否足以闭环。

### T-008 AI Prompt 存在矛盾指令 + 缺少结构化日期

`extension/src/services/ai.ts`
- 指令 3（用完所有空闲）和指令 4（不要拆分到多人）在资源紧张时冲突
- `scheduleSummary` 是文本格式窗口，AI 需要从自然语言中推理时间关系
- `detailsProductDevMd` 等长文本在 JSON 中压缩，AI 难以有效提取技能匹配信息

**修复方向**：梳理 Prompt 指令优先级，传入结构化日期区间而不是文本描述。

### T-009 AI Prompt 的「最少 3 天」约束在硬逻辑中未落地

`extension/src/context/SchedulingContext.tsx:189` 中 `Math.max(1, ...)` 只保证 ≥1。

**修复方向**：默认情况改为 `Math.max(3, ...)`（除非 targetGap 或 idleMd 小于 3）。

---

## P3 — 可优化项

### T-010 PASS 3 收敛循环无提前终止阈值

`extension/src/context/SchedulingContext.tsx:255`
每轮都向 AI 发送同样的缺口数据（只切到 relaxed 模式）。如果资源技能确实不匹配，3 轮也填不满，浪费 AI 调用。

**修复方向**：如果本轮实际分配 < 3 MD，直接结束收割。

### T-011 getAvailableWindows 窗口碎片化

`extension/src/context/SchedulingContext.tsx:82`
`dailyAvailable` 频繁变化（如 100% → 80% → 100%）时产生大量细碎窗口，增加 LLM 推理负担。

**修复方向**：合并相邻的相似可用度窗口，或设置最小窗口长度阈值。

### T-012 5 秒自动重置排期状态

`extension/src/context/SchedulingContext.tsx:291`
排期完成后 5 秒状态自动归零，用户切回时可能不确定是否已完成。

**修复方向**：改为用户手动关闭或延长显示时间。
