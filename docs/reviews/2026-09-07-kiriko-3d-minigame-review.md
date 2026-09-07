# 2026-09-07 雾子剧情与 3D 小游戏审查

## 结论

本轮已完成剧情迁移、结尾确认、姓名显示修复和小游戏交互重构。运行时仍是离线静态页面，Three.js 使用本地 vendored 版本，并保留 2D/skip fallback。

## 功能审查

| 项目 | 结果 |
|---|---|
| 开场笔记/评论 | 已改为“大龄游戏宅, 喜欢玩OW”与“戳戳,🙋‍♀️” |
| 女主角色 | 剧情、HUD、脚本与配置统一为雾子 |
| 真名显示 | 配置与 reveal 使用完整“朱盈畅”；姓名标签 nowrap |
| 结尾停留 | 接受后停留在结尾画面；重新开始需显式确认 |
| 球体交互 | E 选球/回头，A/D 切换，左键发射；触屏按钮语义一致 |
| 渲染降级 | Three.js → Canvas 2D → skip，均保持可继续剧情 |

## 代码审查

- `Minigame` 将选择、发射、反转规则集中在 `_selectOrbType`、`_fireSelectedOrb`、`_handleOrbAction`、`_reverseOrbs`，Three.js 与 2D 共用。
- 3D 场景使用程序化墙体、掩体、发光边界和信标；无外部素材请求。
- 边界反射夹回球体并翻转速度，避免球体因出界直接消失。
- 触屏绑定先解绑旧监听，按钮缺失或无 Pointer Events 时安全隐藏并保留 skip。

## 验证

- `npm test`
- `npm run check`
- `git diff --check`
- `tests/smoke-touch-minigame.py`（静默 Chromium，2D 触屏与桌面可见性）

## 后续建议

1. 在目标真实触屏设备上验证按钮尺寸、横竖屏和 WebGL 帧率。
2. 如需更强空间感，可增加程序化高度差或目标无人机动画，但继续限制在无外部素材范围内。
3. 远程部署前先完成分支门禁，再合并 `main`。
