# ADR：触屏小游戏输入与降级

- 日期：2026-09-02
- 状态：已采用

## 决策

小游戏继续以 Three.js/WebGL 为主渲染，并保留 Canvas 2D 与 skip 降级。触屏输入通过 Pointer Events 接入一份共享的 `Minigame.touchInput` 状态：

1. 虚拟摇杆输出经过 0.15 死区处理的 `moveX/moveY`，同时驱动移动和朝向。
2. 紫球、黄球按钮使用按下/释放状态，沿用现有发射冷却和规则。
3. 反向按钮使用按下边沿触发 `_reverseOrbs()`，长按不会重复反向。
4. 触屏控件仅在 `maxTouchPoints` 或 coarse pointer 可用且 Pointer Events 存在时显示；缺少 DOM、指针 API 或捕获失败时回到键鼠路径，仍可 skip。
5. 每次重新绑定前先解绑旧监听器，保证小游戏重启不会叠加动作。

## 原因

现场可能使用触屏笔记本、平板或投屏设备，只有跳过会让小游戏失去互动价值。将输入映射集中在 `touchInput`，可让 Three.js 和 2D 共享同一规则；Pointer Events 覆盖触摸和笔并保留键鼠兼容。能力探测和幂等解绑降低了设备差异、重复启动和指针取消造成的卡死风险。

## 结果与代价

- 新增 `#mgTouchControls`、虚拟摇杆和三个最小 72px 触控按钮；桌面端默认隐藏，支持键盘焦点和 reduced-motion。
- `_readMoveVector()`、`_readAimVector()` 在两种渲染模式复用触屏状态，未复制游戏胜负逻辑。
- Pointer cancel/up 会清理摇杆捕获与发射状态；控件缺失时不抛异常。
- 触屏 smoke 使用 Playwright 设备模拟；真实 iOS/Android 浏览器仍需在发布前做一次实机验收。

## 验证

- `tests/minigame-touch-controls.test.js`：向量死区、按钮状态、反向边沿、指针生命周期、重复绑定和安全回退。
- `tests/smoke-touch-minigame.py`：触屏 2D 模式完成摇杆、发射、反向、跳过；桌面控件隐藏。
- `npm test` 35/35、`npm run check`、`git diff --check` 通过。

## 复查触发器

- 调整摇杆死区、按钮尺寸或改用手势/多指输入。
- 迁移 Three.js 版本、改变 2D/skip 能力探测或小游戏规则。
- 增加真实移动端适配、横竖屏布局或无障碍输入模式。
