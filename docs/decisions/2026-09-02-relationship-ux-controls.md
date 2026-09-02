# ADR：第一阶段关系体验控制

- 日期：2026-09-02
- 状态：已采用

## 决策

第一阶段继续保持 `Engine` 作为唯一剧情生命周期协调者，并加入四项现场可靠性控制：

1. 求婚按钮不再自动聚焦；“让我想想…”保持原位并提供中性反馈，Escape 只显示等待提示。
2. 小游戏结束结果在 `Engine.lastMinigameResult` 中规范化为 `win`、`skipped` 或 `timeout`，后续文案不把跳过/超时说成成功。
3. 开始层提供静音按钮，与 HUD 通过 `_syncMuteButtons()` 共享 `GameAudio.muted`、视觉 class 和 `aria-pressed`。
4. 蒙太奇使用单一可恢复计时器记录当前动作和剩余时间；暂停时清除计时器并冻结视觉，继续时从剩余时间恢复。控制缺失时仍保持自动播放。

## 原因

求婚现场的输入设备、音频环境和观看节奏不可控。接受按钮的隐式焦点可能造成误触，小游戏跳过后继续声称成功会破坏叙事可信度，开始后才可静音不适合现场，照片长动画也需要可暂停的讲解窗口。将状态集中在引擎可以避免多个层各自维护定时器或音频状态。

## 结果与代价

- 运行时仍为静态文件、无新增网络或第三方依赖。
- 蒙太奇增加一个 `montage` 会话对象和一个 pending action；结束时显式清理定时器、视觉 class 和状态引用，避免重复运行残留。
- 为冻结 CSS 过渡，暂停瞬间会把图片/字幕当前 opacity 写入 inline style；继续或结束时清除该样式。
- 控件提供按钮、Space/Enter 等价操作和 `aria-live="polite"` 状态；以后增加重播、进度条或焦点陷阱时需沿用同一生命周期入口。

## 验证

- `tests/engine-proposal-consent.test.js`
- `tests/minigame-result.test.js`
- `tests/start-mute.test.js`
- `tests/montage-controls.test.js`
- `tests/smoke-relationship-ux.py`：静音无头 Chromium 下 `gaming`（跳过）与 `first_date` 均完成暂停/继续并进入求婚层。
- `npm test` 28/28、`npm run check`、`git diff --check` 通过。

## 复查触发器

- 蒙太奇增加重播、手动选片、进度条或媒体预加载。
- 开始页引入持久化音频偏好或新增音频输出设备适配。
- 求婚按钮改为多步确认、远程控制器或触屏专用交互。
