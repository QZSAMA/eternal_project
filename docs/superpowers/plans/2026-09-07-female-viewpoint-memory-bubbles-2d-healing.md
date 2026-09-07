# 女生视角回忆泡泡与 2D「我需要治疗」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** 将故事改为女生第一人称线性回忆，并把小游戏改成固定镜头 2D 雾子求治疗玩法。

**Architecture:** `storyData.js` 作为剧情和本地素材唯一事实源；`Engine` 管理线性章节、自动回忆泡泡和“但是…”终止动作；`Minigame` 只保留 Canvas 2D、莫伊拉自动投球、X 请求治疗、紫球转黄球和 skip fallback。所有模式共享同一状态规则。

**Tech Stack:** 原生 JavaScript、Canvas 2D、Web Audio 合成音效、Node 内置测试、Playwright 静默 Chromium。

## Global Constraints

- 不使用 Three.js、WebGL、3D 模型或 3D 相机；Canvas 2D 为主模式。
- 保留 skip fallback；Canvas 不可用时剧情必须继续。
- 不新增 CDN、远程字体、在线 API 或运行时网络图片。
- 角色图片和未来真实照片仅通过本地路径配置注入。
- 行为变更遵循 TDD：先写失败测试，再实现，再重构。
- 所有可见真名完整显示为“朱盈畅”。

---

### Task 1: 更新失败测试契约

**Files:**
- Modify: `tests/story-content-update.test.js`
- Modify: `tests/minigame-physics.test.js`
- Modify: `tests/minigame-touch-controls.test.js`
- Create: `tests/engine-memory-bubbles.test.js`

- [ ] **Step 1: 写测试**：断言 story 不含 `branch` 菜单，不含“选择再来一局/见一面”，包含线下展览、演唱会重放、脱口秀、X118、2025 年 5 月 20 日、《情书》和 `Will you marry me`；断言 `memoryBubbles` 存在且为数组。
- [ ] **Step 2: 写小游戏失败测试**：断言 `mode` 默认 2D、`requestHealing()` 首次返回 true、第二次返回 false、所有 `purple` orb 转为 `yellow`，并由 `_healKiriko()` 将 hp 设为最大值。
- [ ] **Step 3: 写回忆泡泡失败测试**：构造 Fake DOM，断言 `Engine.startMemoryBubbles()` 创建第一个泡泡，`finishMemoryBubbles()` 清理 timer 并显示最终文案。
- [ ] **Step 4: 运行 Red**：`npm test -- --test-name-pattern="memory|healing|linear story"`；确认失败来自缺少新接口/旧剧情。

### Task 2: 重写故事数据为女生视角线性时间线

**Files:**
- Modify: `js/storyData.js`
- Modify: `README.md`
- Modify: `docs/story-script.md`

- [ ] **Step 1: 更新配置**：移除 `branch`、旧 `first_date`/`gaming` 二选一入口，增加 `memoryBubbles`、`memoryBubbleInterval` 和 2D `healingGame` 参数。
- [ ] **Step 2: 编写线性章节**：使用“我”叙述展览、演唱会重放、脱口秀、X118、餐馆、2025-05-20 花束告白、《情书》和后续旅行回忆。
- [ ] **Step 3: 保留完整姓名**：`realHeroineName` 固定为 `朱盈畅`，男方在对白中使用 `赵启志`。
- [ ] **Step 4: 运行数据契约测试**：`npm test -- --test-name-pattern="config|linear story"`。

### Task 3: 实现 Engine 自动回忆泡泡

**Files:**
- Modify: `js/engine.js`
- Modify: `index.html`
- Modify: `css/style.css`

- [ ] **Step 1: 实现最小接口**：增加 `startMemoryBubbles(bubbles)`, `_renderMemoryBubble(index)`, `finishMemoryBubbles()`；timer 使用单一句柄，结束时清理。
- [ ] **Step 2: 绑定“但是…”**：按钮点击只执行一次，停止轮播并把 `但是，他想继续和你创造更多回忆，所以——Will you marry me?` 放入可读容器。
- [ ] **Step 3: 增加缺图和 reduced-motion 行为**：图片失败显示占位文本；动画由 CSS 媒体查询关闭。
- [ ] **Step 4: 运行回忆测试**：`npm test -- --test-name-pattern="memory bubbles"`。

### Task 4: 重写 2D 求治疗小游戏

**Files:**
- Modify: `js/minigame.js`
- Modify: `index.html`
- Modify: `css/style.css`

- [ ] **Step 1: 实现状态**：`mode="2d"`、`needsHealing`、`healingRequestedAt`、`kiriko.hp`、`moira` 和 orb 集合。
- [ ] **Step 2: 实现请求治疗**：`requestHealing()` 播放合成提示/字幕并调用 `_convertPurpleOrbsToYellow()`。
- [ ] **Step 3: 实现自动投球和碰撞**：莫伊拉按间隔生成紫球；球在边界反弹；黄球命中雾子时调用 `_healKiriko()` 并成功结束。
- [ ] **Step 4: 绑定输入**：`X` 与 `#mgNeedHealing` 触发同一方法；保留 Escape/skip。
- [ ] **Step 5: 更新 2D 绘制**：本地角色贴图槽位失败时使用几何占位；显示莫伊拉、雾子、球色、血条和语音反馈。
- [ ] **Step 6: 运行物理与触屏测试**：`npm test -- --test-name-pattern="healing|touch"`。

### Task 5: 接回主线和本地素材槽位

**Files:**
- Modify: `js/engine.js`
- Modify: `js/storyData.js`
- Modify: `index.html`
- Modify: `docs/project-memory.md`
- Create: `docs/decisions/2026-09-07-female-viewpoint-memory-bubbles-2d-healing.md`
- Create: `docs/reviews/2026-09-07-female-viewpoint-memory-bubbles-2d-healing.md`

- [ ] **Step 1: 小游戏回调**：小游戏完成后进入回忆泡泡，不再进入旧 gaming follow-up。
- [ ] **Step 2: 素材路径**：增加 `kiriko`/`moira` 本地贴图字段，默认指向仓库占位图；不添加外链。
- [ ] **Step 3: 文档和记忆**：记录 2D-only 决策、输入契约、回忆素材替换方式和复查触发器。
- [ ] **Step 4: 运行完整门禁**：`npm test`、`npm run check`、`git diff --check`。

### Task 6: 静默浏览器回归与提交

**Files:**
- Modify: `tests/smoke-relationship-ux.py`
- Modify: `tests/smoke-touch-minigame.py`

- [ ] **Step 1: 更新主线 smoke**：验证无选择卡片、自动泡泡轮播、“但是…”按钮进入英文求婚句、求婚层和结尾层。
- [ ] **Step 2: 更新小游戏 smoke**：强制 2D，按 X 后检查语音状态、紫球全变黄、黄球命中后成功；触屏按钮复用同一请求治疗接口。
- [ ] **Step 3: 静默运行**：`python C:\Users\kotei\.codex\skills\webapp-testing\scripts\with_server.py --server "python -m http.server 18080" --port 18080 -- python tests/smoke-relationship-ux.py` 与 `smoke-touch-minigame.py`。
- [ ] **Step 4: 提交**：`git add ... && git commit -m "feat: switch to female viewpoint and 2d healing game"`。
