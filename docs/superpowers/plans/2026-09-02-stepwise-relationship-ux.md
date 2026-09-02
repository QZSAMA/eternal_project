# 第一阶段关系体验优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** 让真实求婚现场的同意、静音、小游戏结果和照片回放都可控且不误导，同时保持离线主线可达。

**Architecture:** 继续由 `Engine` 管理状态和生命周期；只增加局部 UI 状态，不引入框架或运行时依赖。求婚交互和蒙太奇控制都通过现有 DOM 层与明确的事件监听器接入，小游戏结果以一次运行内的 `lastMinigameResult` 传递。

**Tech Stack:** 原生 JavaScript、HTML、CSS、Node 内置测试、Playwright smoke。

## Global Constraints

- 运行时继续零网络依赖；不新增 npm runtime dependency。
- 行为变更遵循 Red → Green → Refactor。
- 个人姓名、日期、台词和媒体路径仍只从 `js/storyData.js` 注入。
- 现有 Three.js、2D、skip 降级和两条主线不能回归。

### Task 1: 求婚同意交互

**Files:**
- Modify: `js/engine.js:510-548,578-620`
- Modify: `index.html:54-56,104-109`
- Modify: `css/style.css:386-413`
- Test: `tests/engine-proposal-consent.test.js`

**Interfaces:**
- `Engine._proposal()` 不自动调用接受按钮的 `focus()`。
- `Engine._startRejectEscape()` 改为稳定的 `handleProposalHold()` 语义：不移动按钮，显示中性提示。
- `Engine` 在 `in_proposal` 状态处理 Escape 而不接受求婚。

- [ ] 写失败测试：构造最小 fake DOM，运行 `_startRejectEscape()` 的 click 回调，断言 reject 的 `style.transform` 不变、提示包含“慢慢”；运行 `_proposal()` 的定时器，断言 `btnAccept.focus` 未调用。
- [ ] 运行 `node --test tests/engine-proposal-consent.test.js`，确认当前实现因自动 focus 和随机 transform 失败。
- [ ] 删除自动 `focus()`，移除随机位移/逃跑文案，改为稳定提示并保留按钮可见。
- [ ] 给两个按钮增加 `aria-label`/必要的 `aria-pressed` 状态，Escape 只显示等待提示。
- [ ] 运行单测和完整 `npm test`，确认所有既有剧情测试仍通过。
- [ ] 提交：`fix: make proposal response reversible and explicit`。

### Task 2: 小游戏结果与真实文案

**Files:**
- Modify: `js/engine.js:7-18,402-414`
- Modify: `js/storyData.js:144-153`
- Test: `tests/minigame-result.test.js`

**Interfaces:**
- 新增 `Engine.lastMinigameResult`，值为 `win`、`skipped`、`timeout` 或规范化后的 `skipped`。
- `_call` 回调接收小游戏结果并在推进下一条指令前写入该值。

- [ ] 写失败测试：fake `callMinigame` 回调 `"skipped"` 和 `"timeout"`，断言 `lastMinigameResult` 被保存；读取 gaming 文案并断言不再声称“真的奶到/一定奶到”。
- [ ] 运行该测试确认当前实现失败，因为 `_call` 丢弃结果且文案固定为成功。
- [ ] 实现结果保存和安全默认值；把 gaming 后续三句改为三种结果都成立的陪伴式文案。
- [ ] 运行单测、`npm test` 和 `npm run check`。
- [ ] 提交：`fix: keep minigame outcome honest`。

### Task 3: 封面静音入口

**Files:**
- Modify: `index.html:54-56,132-141`
- Modify: `js/engine.js:20-78`
- Modify: `css/style.css:220-228,470-520`
- Test: `tests/start-mute.test.js`

**Interfaces:**
- `Engine._syncMuteButtons()` 同步 HUD 和开始层两个按钮的文本、class、`aria-pressed`。
- 两个按钮都调用同一 `GameAudio.setMuted` 状态，不重复实现音频逻辑。

- [ ] 写失败测试：断言开始层存在 `#startMuteBtn`，且引擎存在同步两个按钮的绑定。
- [ ] 运行测试确认当前 HTML/Engine 缺少开始层入口而失败。
- [ ] 添加开始层按钮，初始化 `aria-pressed`，抽取同步函数并在两个按钮点击时调用。
- [ ] 运行完整单测和 `npm run check`，确认启动层按钮不会触发剧情推进。
- [ ] 提交：`feat: add pre-start mute control`。

### Task 4: 蒙太奇暂停/继续

**Files:**
- Modify: `index.html:58-62`
- Modify: `css/style.css:231-244`
- Modify: `js/engine.js:10-37,447-500,578-620`
- Test: `tests/engine-montage-controls.test.js`

**Interfaces:**
- 新增 `Engine._toggleMontagePause()`、`_clearMontageTimers()`、`_playMontageSlide()`、`_finishMontageSlide()`。
- 新增 DOM：`#montageToggle`、`#montageStatus`；缺少这些节点时继续自动播放。
- 暂停保存当前 slide 的剩余展示时间和字幕延迟，继续后从剩余时间恢复。

- [ ] 写失败测试：fake timer 驱动首张 slide，暂停后断言不会执行推进回调，继续后会按剩余时间推进；断言按钮文案和 status 更新。
- [ ] 运行测试确认当前 `_montage` 没有控制接口而失败。
- [ ] 添加语义化按钮和 live 状态，拆分蒙太奇定时器并实现暂停/继续/结束清理。
- [ ] 运行完整测试、语法检查，并用 Playwright 验证暂停期间 caption 和图片不变、恢复后仍进入 proposal。
- [ ] 提交：`feat: add pauseable photo montage`。

### Task 5: 集成验证与记忆更新

**Files:**
- Modify: `docs/project-memory.md`
- Create: `docs/decisions/2026-09-02-relationship-ux-controls.md`
- Create: `docs/reviews/2026-09-02-relationship-ux-review.md`

- [ ] 运行 `npm test`、`npm run check`、`git diff --check`。
- [ ] 在无头 Chromium 静默模式跑 `gaming → skip → montage → proposal → ending` 和 `first_date → montage → proposal → ending`。
- [ ] 记录零页面异常、零 4xx/5xx、零外链请求和已知 warning。
- [ ] 更新项目记忆、决策记录和审查状态，注明仍未处理的素材水印、触屏小游戏和女主内容 agency。
- [ ] 提交：`docs: record relationship UX controls baseline`，然后推送功能分支。
