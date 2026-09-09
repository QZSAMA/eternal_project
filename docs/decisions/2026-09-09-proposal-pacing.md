# 决策记录：唯一求婚文案与戒指渐显节奏

日期：2026-09-09

## 背景

回忆泡泡结束后，旧流程会先在 `#memoryFinal` 显示完整求婚句，再进入 `proposal` label 播放“他想继续……”对白，并在求婚层保留“嫁给我，好吗？”占位文案。现场观看时会感觉求婚重复、停顿被打断。

## 决策

1. `CONFIG.meta.proposalCopy` 是唯一最终求婚文案来源。回忆层结束时清空并隐藏 `#memoryFinal`，正式求婚层只将该文案写入 `#proposalText` 一次。
2. `proposal` label 只负责切换背景、聚光灯、角色和求婚交互，不再包含重复的 `say` 指令。
3. `Will you marry me?` 出现后保持当前画面；约 500ms 后给 `#ringWrap` 加上 `is-show`，由 CSS 的 2 秒过渡完成戒指缓慢显现；约 3.2s 后显示“我愿意 / 让我想想…”按钮。
4. “但是…”按钮只能结束一次回忆轮播，重复点击不应重新进入求婚流程。

## 验证

- `tests/engine-memory-bubbles.test.js` 覆盖单一文案容器、旧占位文案移除、戒指显现前后顺序。
- `tests/story-content-update.test.js` 检查剧情数据和 HTML 不再包含旧重复对白与“嫁给我，好吗？”占位。
- `tests/smoke-relationship-ux.py` 在静默 Chromium 中检查回忆结束、求婚句唯一可见以及戒指延迟出现。

## 复查触发器

- 修改 `proposalCopy`、求婚层 DOM、回忆层过渡或戒指动画时。
- 增加第二种求婚语言、语音或可跳过的求婚动画时。
