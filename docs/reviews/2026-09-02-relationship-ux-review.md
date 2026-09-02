# 第一阶段关系体验优化复审

- 日期：2026-09-02
- 范围：`feat/cover-character-layering` 在 `4674f8d` 之后的关系体验与触屏小游戏改动
- 结论：第一阶段五项现场可靠性问题已关闭；正式公开前仍需完成素材授权/脱敏和低端设备帧率验收。

## 验证摘要

| 检查 | 结果 |
|---|---|
| `npm test` | 35/35 通过 |
| `npm run check` | 通过 |
| `git diff --check` | 通过（仅换行格式提示） |
| 静音无头 Chromium | `tests/smoke-relationship-ux.py` 通过：`gaming`（跳过小游戏）和 `first_date` 均能暂停/继续蒙太奇并进入求婚层 |
| 触屏无头 Chromium | `tests/smoke-touch-minigame.py` 通过：触屏 2D 模式摇杆、紫球/黄球、反向、跳过；桌面端控件隐藏 |
| 网络/异常 | 无外链请求、页面异常、失败请求；保留已知 Three.js classic 弃用和 headless WebGL `ReadPixels` 性能 warning |

## 已关闭问题

### UX-001 [P1] 求婚接受按钮会因隐式焦点被误触

- 文件/位置：`js/engine.js:650-664`、`index.html:108-111`
- 可复现步骤：进入求婚层，按钮出现后直接按 Enter 或点击“让我想想…”。
- 原实际结果：旧实现会自动聚焦接受按钮，拒绝按钮可能随机位移，用户无法可靠地保留选择。
- 影响：现场误接受、焦点不可预测，破坏同意语义。
- 修复：移除自动 `focus()` 和随机逃跑；拒绝点击及 Escape 只显示“没关系，我们可以慢慢来。”并保持按钮原位。
- 验证：`tests/engine-proposal-consent.test.js` 两项通过；键盘回归未触发接受。

### UX-002 [P1] 跳过/超时小游戏后文案声称成功

- 文件/位置：`js/engine.js:429-438`、`js/storyData.js:144-153`
- 可复现步骤：进入 `gaming`，点击跳过或等待超时，观察后续对白。
- 原实际结果：引擎丢弃结束结果，文案固定为“真的奶到/一定奶到”。
- 影响：叙事与实际操作不一致，用户会误以为系统伪造结果。
- 修复：记录 `lastMinigameResult`，未知值安全归一为 `skipped`；后续文案改为三种结果都成立的陪伴式表达。
- 验证：`tests/minigame-result.test.js` 通过；`gaming + skip` 浏览器路线进入蒙太奇。

### UX-003 [P1] 开始前无法静音

- 文件/位置：`index.html:54-56,148`、`js/engine.js:35,58-67,229-236`
- 可复现步骤：打开开始页，在不启动剧情的情况下寻找音频控制。
- 原实际结果：只有剧情 HUD 静音按钮，开始页无法在现场预先关闭声音。
- 影响：投屏/公共场合可能在启动瞬间产生不合适的音效。
- 修复：新增 `#startMuteBtn`；开始页和 HUD 复用 `_syncMuteButtons()`，同步文本、`is-muted` 与 `aria-pressed`；点击停止冒泡，不会启动剧情。
- 验证：`tests/start-mute.test.js` 通过；静音无头 smoke 证实开始页点击后 `Engine.state` 仍为 `idle` 且 HUD 同步。

### UX-004 [P1] 照片蒙太奇不可暂停

- 文件/位置：`index.html:59-66`、`js/engine.js:472-635`、`css/style.css:242-265`
- 可复现步骤：进入照片蒙太奇，在字幕出现或讲解过程中尝试暂停。
- 原实际结果：旧实现只有两个独立 `setTimeout`，照片和字幕持续推进，无法为现场讲解留出时间。
- 影响：观众可能错过私人照片或字幕，长动画也无法适配不同节奏。
- 修复：引入单一可恢复 pending action 和剩余时间；按钮、Space、Enter 均可切换，暂停冻结计时和视觉，结束清理定时器/class；缺少控制节点时仍自动播放。
- 验证：`tests/montage-controls.test.js` 通过；静音无头 smoke 暂停 900ms 状态不变，继续后两条主线均进入 `in_proposal`。

### UX-005 [P1] 触屏小游戏缺少等价输入

- 文件/位置：`js/minigame.js` 输入绑定段、`index.html:72-87`
- 可复现步骤：在触屏设备进入小游戏，尝试仅用触控完成移动、发射和反向。
- 实际结果：触屏设备可见虚拟摇杆、紫球/黄球发射按钮和反向按钮；桌面端保持隐藏，键鼠和跳过路径不变。
- 影响：移动端或触屏投屏无需依赖跳过即可完成小游戏核心操作。
- 修复：以 Pointer Events 写入共享 `touchInput` 状态；Three.js 与 2D 更新循环通过 `_readMoveVector()` / `_readAimVector()` 消费同一输入，反向动作按下边沿触发；指针取消、能力缺失和重复绑定均安全处理。
- 验证：`tests/minigame-touch-controls.test.js` 与 `tests/smoke-touch-minigame.py` 通过，`npm test` 35/35、`npm run check` 通过；真实 iOS/Android 实机仍建议在发布前抽验。

## 未关闭问题与后续推进

### CONTENT-006 [P1] 角色 JPG 带矩形背景/水印，个人素材授权未留证

- 文件/位置：`assets/images/characters/*.jpg`、`js/storyData.js:54-67`
- 可复现步骤：进入任一角色对白或查看资产清单。
- 实际结果：立绘可见矩形底色/“AI生成”水印；仓库含真实姓名和照片路径。
- 影响：视觉完成度下降，并有隐私、版权和现场公开展示风险。
- 建议修复：仅在获得授权后替换为透明 PNG/WebP，或提供明确抠图策略；发布包和截图脱敏。
- 验证方式：机器检查尺寸/透明通道/水印，人工确认授权记录；未获授权前不把该项标记为已关闭。

### PERF-007 [P2] Three.js classic build 与帧率耦合仍有维护成本

- 文件/位置：`vendor/three-r160.min.js`、`js/minigame.js` 主循环
- 可复现步骤：在 Chromium 控制台运行两条主线并观察 warning/低端设备帧率。
- 实际结果：保留官方弃用 warning；3D 物理仍需持续按帧更新。
- 影响：warning 增加排障噪声，低帧率设备上小游戏手感可能漂移。
- 建议修复：后续迁移 ES module 并以 `dt` 驱动物理；保持当前 2D/skip 兜底。
- 验证方式：升级后重新计算 vendored 哈希，并在高/低帧率模拟下比较速度与碰撞结果。

## 发布建议

本阶段代码可用于安静的现场体验预演；正式公开发布前先完成素材授权/脱敏、真实触屏实机抽验和低端设备帧率验收。任何新增媒体、输入方式或蒙太奇控制都必须遵守 `docs/review-rules.md` 的 Red → Green → Refactor 与无网络发布门禁。
