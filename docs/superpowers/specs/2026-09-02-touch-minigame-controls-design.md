# 触屏小游戏控制设计

- 日期：2026-09-02
- 状态：待用户审阅
- 关联审查：`docs/reviews/2026-09-02-relationship-ux-review.md` 的 UX-005

## 1. 目标

让没有键盘、鼠标或右键的触屏设备也能完成“逆转的奶”小游戏，同时保持现有 Three.js、Canvas 2D 和 skip 降级链路不变。触屏控制必须适合投屏现场：按钮足够大、操作含义清晰、不会误触跳过或推进剧情。

## 2. 范围

### 包含

- 在小游戏 HUD 增加触屏控制层：虚拟摇杆、紫球、黄球、反向四个语义化控件。
- 通过 Pointer Events 支持触摸和触控笔；保留现有键盘/鼠标事件作为桌面端路径。
- 摇杆同时提供移动向量和朝向；紫球/黄球按钮使用当前朝向发射，反向按钮调用现有 `_reverseOrbs()`。
- 触屏控件只在 `pointer: coarse` 或运行时检测到触摸能力时显示，桌面端默认隐藏。
- Three.js 与 2D 渲染共用 `touchInput` 状态和命令入口，不复制游戏规则。
- 控件提供 `aria-label`、可见焦点和状态公告；`touch-action: none` 只作用于控制区域。

### 不包含

- 不改变小游戏胜负条件、球体方向机制、敌人参数或剧情文案。
- 不移除键盘、鼠标、右键或 Esc 跳过。
- 不在本阶段重构 3D 物理的 `dt` 计时；该项作为下一独立切片。
- 不引入框架、远程依赖或新的音频/图片资源。

## 3. 交互设计

### 虚拟摇杆

- 左下角显示圆形底座和摇杆帽，触点相对底座中心映射到 `[-1, 1]` 的 `x/y` 向量。
- 向量长度超过死区（0.15）后驱动移动；向量归一化后作为当前朝向。
- `pointerdown` 捕获指针；`pointermove` 更新向量；`pointerup`、`pointercancel` 或离开控制区域归零并释放捕获。
- 同时只接受一个摇杆指针，避免多指造成方向跳变。

### 操作按钮

- 紫球按钮：设置紫球发射命令，等价于鼠标左键按下。
- 黄球按钮：设置黄球发射命令，等价于鼠标右键按下；释放后停止连续发射。
- 反向按钮：触发一次现有 `_reverseOrbs()`，等价于键盘 E 的按下/释放边沿，不因长按重复触发。
- 所有按钮阻止默认滚动和事件冒泡，不触发小游戏跳过或剧情推进。

### 可见性与可访问性

- 触屏控件放在 `#mg-wrap` 内，层级高于 Canvas 但低于“跳过”按钮。
- 控件文案使用“移动”“紫球”“黄球”“反向”，不只依赖颜色区分。
- `aria-label` 描述动作；小游戏提示同步说明触屏操作。
- `prefers-reduced-motion` 下关闭摇杆装饰动画，不影响输入反馈。

## 4. 架构与数据流

```text
Pointer Events / Keyboard / Mouse
          │
          ▼
      Minigame.touchInput + existing keys/mouse
          │
          ├─ _readMoveVector()      → _update / _update2D
          ├─ _readAimVector()       → player facing / 2D facing
          ├─ _fireOrb("purple")     → 3D / _fireOrb2D("purple")
          ├─ _fireOrb("yellow")     → 3D / _fireOrb2D("yellow")
          └─ _reverseOrbs()         → shared reverse rule
```

`touchInput` 是一次小游戏运行内的临时状态，在 `reset()` 清零，在 `stop()` 解绑所有 Pointer Event。渲染模式只消费向量和发射状态，不直接读取 DOM 控件。

## 5. 错误处理与兼容

- 找不到触屏控件时，小游戏仍按现有键盘/鼠标路径运行。
- 浏览器不支持 Pointer Events 时不绑定触屏层，保留点击跳过和键盘路径。
- 指针捕获失败或 `pointercancel` 时强制归零按钮状态，避免“卡住持续发射”。
- 触屏事件不得改变 `onEnd` 的结果归一化；`win`、`timeout`、`skipped` 回调契约保持不变。
- 运行时继续只访问同源本地资源。

## 6. 测试策略（先 Red，再 Green）

### 单元测试

- HTML 暴露四个语义化触屏控件，包含标签和最小触控尺寸 class。
- `pointerdown/move/up/cancel` 正确更新并清零摇杆向量。
- 紫球/黄球按钮分别设置对应发射状态，释放后归零。
- 反向按钮只调用一次 `_reverseOrbs()`，长按不重复。
- `reset()`、`stop()` 清理触屏状态和监听器。
- 控件缺失或 Pointer Events 不可用时不抛异常，主线仍可 skip。

### 浏览器回归

- Chromium 触屏模拟：开始页 → `gaming`，仅用摇杆和按钮完成至少一次移动、发射、反向；仍可点击跳过。
- Chromium 触屏模拟：`first_date` 路线不受新增控件影响。
- 强制 2D、强制 skip 和 Three.js 默认模式分别进入并退出小游戏。
- 检查无页面异常、失败请求、外链请求；保留已知 Three.js warning。
- 桌面 1280×720 截图确认触屏控件默认隐藏、跳过按钮仍可用；触屏视口截图确认控件不遮挡关键 HUD。

## 7. 验收标准

1. 触屏设备无需右键、WASD 或 E 即可移动、改变朝向、发射两种球并反向球体。
2. 键盘、鼠标、跳过、Three.js/2D/skip 三条既有路径行为不变。
3. 多指、取消、快速重复点击不会留下卡住的移动或发射状态。
4. 控件在触屏视口可见、尺寸足够、文案可读、焦点和 `aria-label` 完整；桌面端不增加视觉噪声。
5. `npm test`、`npm run check`、`git diff --check` 和触屏无头 smoke 全部通过。

## 8. 后续触发器

- 需要横屏/竖屏专用布局时，单独增加安全区和尺寸规格。
- 需要拖拽瞄准、双指缩放或手柄支持时，重新评估 `touchInput` 命令接口。
- 完成触屏后，再进入 P1-008 的 dt/固定步长物理重构。
