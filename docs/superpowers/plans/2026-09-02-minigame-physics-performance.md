# 小游戏物理与性能优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 3D 小游戏按受限 `dt` 更新并降低碰撞/粒子循环的临时分配，同时保持原有规则和离线降级。

**Architecture:** 在 `Minigame` 内增加纯时间换算与位置积分辅助方法，3D 更新使用它们；2D 继续使用现有秒级逻辑。碰撞改平方距离，粒子和拖尾采用固定上限与最旧回收，不改变对象生命周期接口。

**Tech Stack:** 原生 JavaScript、Three.js r160（本地 vendored）、Node 内置测试、Playwright Chromium。

## Global Constraints

- 运行时继续零网络依赖，不新增 npm 依赖。
- 行为变更遵循 Red → Green → Refactor。
- 不改变 `storyData.js` 数值、胜负条件、`win/timeout/skipped` 契约或 Three.js/2D/skip 选择。
- 所有 `dt` 输入先限制到 `[0, 50]` 毫秒；无效输入按 `0` 处理。

### Task 1: 时间换算与积分契约

**Files:**
- Modify: `tests/minigame-physics.test.js`
- Modify: `js/minigame.js`

- [ ] **Step 1: 写失败测试**：断言 `_dtSeconds()`、`_frameScale()` 对 60/30 FPS 和异常输入的结果，并断言 `_integrateVector()` 在不同步长下总位移一致。
- [ ] **Step 2: 运行 `node --test tests/minigame-physics.test.js` 确认失败**。
- [ ] **Step 3: 实现最小辅助方法**：限制 `dt`、换算秒/60 FPS 比例，并用秒积分位置。
- [ ] **Step 4: 运行目标测试与 `npm test` 确认通过**。
- [ ] **Step 5: 提交 `feat: add frame-rate independent physics helpers`**。

### Task 2: 接入 3D 更新循环

**Files:**
- Modify: `js/minigame.js`
- Modify: `tests/minigame-physics.test.js`

- [ ] **Step 1: 写失败测试**：用最小 Three.js fake 对象验证玩家、球体、敌人和粒子在相同总时长下不随步长改变结果。
- [ ] **Step 2: 运行目标测试确认失败**。
- [ ] **Step 3: 将玩家、球体、敌人、光环、旋转、粒子、拖尾更新改为 `_dtSeconds()`/`_frameScale()`，并在 `_update()` 复用单次 `now`。
- [ ] **Step 4: 运行 `npm test`、`npm run check` 确认通过**。
- [ ] **Step 5: 提交 `feat: make 3d minigame simulation dt driven`**。

### Task 3: 低风险循环性能优化

**Files:**
- Modify: `js/minigame.js`
- Modify: `tests/minigame-physics.test.js`

- [ ] **Step 1: 写失败测试**：断言平方距离碰撞阈值和粒子/拖尾上限回收行为。
- [ ] **Step 2: 运行目标测试确认失败**。
- [ ] **Step 3: 删除碰撞路径中的 `Vector3.clone()`，缓存 `performance.now()`，增加数量上限和最旧对象回收。
- [ ] **Step 4: 运行完整 Node/浏览器 smoke，检查无页面异常、失败请求和主线回调回归**。
- [ ] **Step 5: 提交 `perf: cap minigame transient effects`**。

### Task 4: 文档与发布门禁

**Files:**
- Modify: `docs/project-memory.md`
- Modify: `docs/reviews/2026-09-02-relationship-ux-review.md`
- Modify: `docs/decisions/2026-09-02-touch-input-controls.md`

- [ ] **Step 1: 记录 `dt` 物理和上限策略、测试证据及剩余 Three.js ES Module 迁移风险**。
- [ ] **Step 2: 运行 `npm test`、`npm run check`、关系体验 smoke、触屏 smoke、`git diff --check`**。
- [ ] **Step 3: 提交 `docs: record minigame physics performance guardrails` 并推送分支**。
