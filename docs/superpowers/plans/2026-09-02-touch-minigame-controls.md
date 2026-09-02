# 触屏小游戏控制实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变小游戏规则和离线降级链路的前提下，为触屏设备增加可完成游戏的虚拟摇杆、发射和反向控制。

**Architecture:** `Minigame` 继续负责输入绑定和渲染模式调度，新增一次运行内的 `touchInput` 状态。Pointer Events 只负责把摇杆向量和按钮命令写入该状态；Three.js 与 2D 更新循环通过同一组读取辅助函数消费状态，规则实现不复制。触屏控件由 HTML/CSS 提供，在触屏能力存在时显示，在桌面端隐藏。

**Tech Stack:** 原生 JavaScript、HTML/CSS、Pointer Events、Node 内置测试、Playwright Chromium。

## Global Constraints

- 运行时继续零网络依赖；不新增 npm runtime dependency。
- 行为变更遵循 Red → Green → Refactor。
- 不改变 `win`、`timeout`、`skipped` 结果契约、小游戏胜负条件或现有剧情脚本。
- 键盘、鼠标、右键和 Esc 跳过路径必须保持可用。
- Three.js、Canvas 2D 和 skip 三种模式必须共享触屏命令并分别通过回归。
- 触屏控件缺失、Pointer Events 不可用或指针捕获失败时必须安全回退到现有路径。
- 文案、姓名、日期、媒体路径仍只从 `js/storyData.js` 注入；不新增个人信息。

## 文件结构与职责

| 文件 | 变更职责 |
|---|---|
| `index.html` | 在 `#mg-wrap` 增加触屏控件 DOM、语义标签和可访问属性 |
| `css/style.css` | 触屏控件布局、触控尺寸、焦点、触屏可见性和低动效规则 |
| `js/minigame.js` | `touchInput` 生命周期、Pointer Events 绑定、输入读取和两种渲染模式接入 |
| `tests/minigame-touch-controls.test.js` | DOM 契约、向量/按钮状态、清理和兼容回退单测 |
| `tests/smoke-touch-minigame.py` | Playwright 触屏模拟、Three.js/2D/skip 和主线回归 |
| `docs/project-memory.md` | 更新模块地图、状态、验证证据和风险 |
| `docs/reviews/2026-09-02-relationship-ux-review.md` | 将 UX-005 从未关闭更新为已关闭，并保留素材/帧率问题 |

---

### Task 1: 建立触屏输入状态与单元测试（Red）

**Files:**
- Create: `tests/minigame-touch-controls.test.js`
- Modify: `js/minigame.js:20-50`（仅在测试失败后实现）

**Interfaces:**
- `Minigame.touchInput`：`{ pointerId: null, moveX: 0, moveY: 0, leftDown: false, rightDown: false, reverseHeld: false, supported: false }`。
- `Minigame._resetTouchInput()`：无参数，清零全部触屏状态。
- `Minigame._setTouchVector(clientX, clientY, rect)`：返回 `{x, y}`，将触点映射到 `[-1, 1]` 并应用 0.15 死区。
- `Minigame._setTouchAction(type, pressed)`：`type` 为 `purple`、`yellow` 或 `reverse`；更新对应状态，`reverse` 的按下边沿只调用一次 `_reverseOrbs()`。

- [ ] **Step 1: 写失败测试**

  创建最小 VM 环境，先断言接口不存在时失败，再覆盖以下行为：

  ```js
  test('touch vector maps to a dead-zone-normalized movement vector', () => {
    const minigame = loadMinigame();
    minigame._resetTouchInput();
    assert.deepEqual(minigame._setTouchVector(90, 50, { left: 0, top: 0, width: 100, height: 100 }), { x: 0.8, y: 0 });
    assert.deepEqual(minigame._setTouchVector(52, 52, { left: 0, top: 0, width: 100, height: 100 }), { x: 0, y: 0 });
  });

  test('touch actions press and release the matching fire state', () => {
    const minigame = loadMinigame();
    minigame._setTouchAction('purple', true);
    assert.equal(minigame.touchInput.leftDown, true);
    minigame._setTouchAction('purple', false);
    assert.equal(minigame.touchInput.leftDown, false);
    minigame._setTouchAction('yellow', true);
    assert.equal(minigame.touchInput.rightDown, true);
  });

  test('reverse action is edge-triggered and reset clears stuck controls', () => {
    const minigame = loadMinigame();
    let reverseCount = 0;
    minigame._reverseOrbs = () => { reverseCount += 1; };
    minigame._setTouchAction('reverse', true);
    minigame._setTouchAction('reverse', true);
    minigame._setTouchAction('reverse', false);
    minigame._resetTouchInput();
    assert.equal(reverseCount, 1);
    assert.deepEqual(minigame.touchInput, { pointerId: null, moveX: 0, moveY: 0, leftDown: false, rightDown: false, reverseHeld: false, supported: false });
  });
  ```

- [ ] **Step 2: 运行测试确认失败**

  运行：`node --test tests/minigame-touch-controls.test.js`

  预期：FAIL，原因是当前 `Minigame` 没有 `touchInput`、`_setTouchVector()` 和 `_setTouchAction()`。

- [ ] **Step 3: 实现最小状态接口**

  在 `Minigame` 增加状态和方法，向量算法固定为：

  ```js
  touchInput: { pointerId: null, moveX: 0, moveY: 0, leftDown: false, rightDown: false, reverseHeld: false, supported: false },

  _resetTouchInput() {
    this.touchInput.pointerId = null;
    this.touchInput.moveX = 0;
    this.touchInput.moveY = 0;
    this.touchInput.leftDown = false;
    this.touchInput.rightDown = false;
    this.touchInput.reverseHeld = false;
    this.touchInput.supported = false;
  },

  _setTouchVector(clientX, clientY, rect) {
    const x = Math.max(-1, Math.min(1, ((clientX - rect.left) / rect.width) * 2 - 1));
    const y = Math.max(-1, Math.min(1, ((clientY - rect.top) / rect.height) * 2 - 1));
    const length = Math.hypot(x, y);
    if (length < 0.15) return { x: 0, y: 0 };
    const scale = Math.min(1, length) / (length || 1);
    return { x: x * scale, y: y * scale };
  },

  _setTouchAction(type, pressed) {
    if (type === 'purple') this.touchInput.leftDown = pressed;
    if (type === 'yellow') this.touchInput.rightDown = pressed;
    if (type === 'reverse') {
      if (pressed && !this.touchInput.reverseHeld) this._reverseOrbs();
      this.touchInput.reverseHeld = pressed;
    }
  },
  ```

- [ ] **Step 4: 运行单测确认通过**

  运行：`node --test tests/minigame-touch-controls.test.js`

  预期：所有触屏状态测试 PASS。

- [ ] **Step 5: 提交**

  ```powershell
  git add tests/minigame-touch-controls.test.js js/minigame.js
  git commit -m "test: define touch minigame input contract"
  ```

### Task 2: 增加触屏控件 DOM 与样式

**Files:**
- Modify: `index.html:69-87`
- Modify: `css/style.css:264-380`
- Test: `tests/minigame-touch-controls.test.js`

**Interfaces:**
- `#mgTouchControls`：触屏控件容器。
- `#mgJoystick`、`#mgJoystickKnob`：摇杆底座与摇杆帽。
- `#mgTouchPurple`、`#mgTouchYellow`、`#mgTouchReverse`：三个语义化操作按钮。

- [ ] **Step 1: 扩展失败测试**

  在同一测试文件读取 `index.html`，断言四个控件、`aria-label` 和 `touch-control` class 存在；断言 CSS 提供至少 `min-width:72px` 或等效 `width/height` 触控尺寸，并有 `.mg-touch-controls.is-visible` 可见规则。

- [ ] **Step 2: 运行测试确认失败**

  运行：`node --test tests/minigame-touch-controls.test.js`

  预期：新增 DOM/CSS 断言 FAIL，生产页面尚无这些节点。

- [ ] **Step 3: 写入最小 DOM**

  在 `#mg-wrap` 内、`#mgSkip` 之前加入：

  ```html
  <div class="mg-touch-controls" id="mgTouchControls" aria-label="触屏操作">
    <div class="mg-joystick touch-control" id="mgJoystick" role="application" aria-label="移动和瞄准">
      <span class="mg-joystick-knob" id="mgJoystickKnob" aria-hidden="true"></span>
    </div>
    <div class="mg-touch-actions">
      <button class="mg-touch-btn touch-control" id="mgTouchPurple" type="button" aria-label="发射紫球">紫球</button>
      <button class="mg-touch-btn touch-control" id="mgTouchYellow" type="button" aria-label="发射黄球">黄球</button>
      <button class="mg-touch-btn touch-control" id="mgTouchReverse" type="button" aria-label="反向球体">反向</button>
    </div>
  </div>
  ```

- [ ] **Step 4: 添加样式并通过测试**

  使用绝对定位和 `pointer-events:auto`，控件默认隐藏，仅 `.is-visible` 显示；摇杆左下角、按钮右下角，按钮 `min-width`/`min-height:72px`，容器和控件设置 `touch-action:none`。为 `.touch-control:focus-visible` 提供 3px cyan outline；在 `prefers-reduced-motion: reduce` 中禁用装饰动画。

  运行：`node --test tests/minigame-touch-controls.test.js`。

- [ ] **Step 5: 提交**

  ```powershell
  git add index.html css/style.css tests/minigame-touch-controls.test.js
  git commit -m "feat: add touch minigame controls"
  ```

### Task 3: 绑定 Pointer Events 并接入两种渲染模式

**Files:**
- Modify: `js/minigame.js:45-90,330-375,400-720`
- Test: `tests/minigame-touch-controls.test.js`

**Interfaces:**
- `Minigame._bindTouchInputs()` / `_unbindTouchInputs()`：绑定和解绑所有触屏监听器。
- `Minigame._readMoveVector()`：返回 `{ mx, my }`，触屏死区向量优先，否则读取键盘。
- `Minigame._readAimVector()`：返回 `{ x, y, active }`，触屏向量优先，否则读取鼠标。
- `Minigame._setJoystickFromEvent(event)`：更新摇杆向量和 knob 的 transform。

- [ ] **Step 1: 扩展失败测试**

  为 fake DOM 增加 `addEventListener/removeEventListener/setPointerCapture/releasePointerCapture`，断言：

  ```js
  test('pointer lifecycle updates joystick and releases it on cancel', () => {
    const { minigame, joystick } = loadMinigameWithTouchDom();
    minigame._bindTouchInputs();
    joystick.emit('pointerdown', { pointerId: 7, clientX: 90, clientY: 50, preventDefault() {} });
    assert.equal(minigame.touchInput.pointerId, 7);
    joystick.emit('pointermove', { pointerId: 7, clientX: 100, clientY: 50, preventDefault() {} });
    assert.equal(minigame.touchInput.moveX, 1);
    joystick.emit('pointercancel', { pointerId: 7, preventDefault() {} });
    assert.equal(minigame.touchInput.pointerId, null);
    assert.equal(minigame.touchInput.moveX, 0);
  });

  test('missing controls or pointer events do not break fallback', () => {
    const minigame = loadMinigame();
    assert.doesNotThrow(() => minigame._bindTouchInputs());
    minigame._unbindTouchInputs();
  });
  ```

- [ ] **Step 2: 运行测试确认失败**

  运行：`node --test tests/minigame-touch-controls.test.js`

  预期：FAIL，原因是尚未实现 Pointer Event 生命周期和监听器解绑。

- [ ] **Step 3: 实现绑定与清理**

  在 `start()` 的 `reset()` 后初始化控件，在 `_bindInputs()` 末尾调用 `_bindTouchInputs()`，在 `_unbindInputs()` 末尾调用 `_unbindTouchInputs()`。绑定逻辑遵循以下不变量：

  ```js
  _bindTouchInputs() {
    const controls = document.getElementById('mgTouchControls');
    const joystick = document.getElementById('mgJoystick');
    if (!controls || !joystick || typeof window.PointerEvent !== 'function') return;
    this.touchInput.supported = true;
    this.bound.touchJoyDown = (event) => {
      if (this.touchInput.pointerId !== null) return;
      event.preventDefault();
      this.touchInput.pointerId = event.pointerId;
      if (joystick.setPointerCapture) joystick.setPointerCapture(event.pointerId);
      this._setJoystickFromEvent(event);
    };
    this.bound.touchJoyMove = (event) => {
      if (event.pointerId === this.touchInput.pointerId) { event.preventDefault(); this._setJoystickFromEvent(event); }
    };
    this.bound.touchJoyEnd = (event) => {
      if (event.pointerId === this.touchInput.pointerId) this._releaseTouchJoystick(event.pointerId);
    };
    this.bound.touchPurpleDown = (event) => { event.preventDefault(); this._setTouchAction('purple', true); };
    this.bound.touchPurpleUp = () => this._setTouchAction('purple', false);
    this.bound.touchYellowDown = (event) => { event.preventDefault(); this._setTouchAction('yellow', true); };
    this.bound.touchYellowUp = () => this._setTouchAction('yellow', false);
    this.bound.touchReverse = (event) => { event.preventDefault(); this._setTouchAction('reverse', true); this._setTouchAction('reverse', false); };
    joystick.addEventListener('pointerdown', this.bound.touchJoyDown);
    joystick.addEventListener('pointermove', this.bound.touchJoyMove);
    joystick.addEventListener('pointerup', this.bound.touchJoyEnd);
    joystick.addEventListener('pointercancel', this.bound.touchJoyEnd);
    document.getElementById('mgTouchPurple')?.addEventListener('pointerdown', this.bound.touchPurpleDown);
    document.getElementById('mgTouchPurple')?.addEventListener('pointerup', this.bound.touchPurpleUp);
    document.getElementById('mgTouchPurple')?.addEventListener('pointercancel', this.bound.touchPurpleUp);
    document.getElementById('mgTouchYellow')?.addEventListener('pointerdown', this.bound.touchYellowDown);
    document.getElementById('mgTouchYellow')?.addEventListener('pointerup', this.bound.touchYellowUp);
    document.getElementById('mgTouchYellow')?.addEventListener('pointercancel', this.bound.touchYellowUp);
    document.getElementById('mgTouchReverse')?.addEventListener('click', this.bound.touchReverse);
  },
  ```

  `_releaseTouchJoystick(pointerId)` 必须清除 pointer capture（若可用）、`pointerId`、向量和 knob transform；`_unbindTouchInputs()` 对每个已绑定节点调用对应 `removeEventListener`，然后调用 `_resetTouchInput()`。

- [ ] **Step 4: 接入更新循环并通过测试**

  在 `_update()` 和 `_update2D()` 中统一使用 `_readMoveVector()`；3D 朝向用 `_readAimVector()` 的向量计算 `Math.atan2(x, -y)`，2D 朝向在触屏 active 时直接使用向量，否则保留鼠标坐标；发射条件改为 `mouse.leftDown || touchInput.leftDown` 与 `mouse.rightDown || touchInput.rightDown`。摇杆 knob 使用 `translate3d(${x * 42}px, ${y * 42}px, 0)`，不把 DOM 读取混进物理规则。

  运行：`node --test tests/minigame-touch-controls.test.js`、`npm test`、`npm run check`。

- [ ] **Step 5: 提交**

  ```powershell
  git add js/minigame.js tests/minigame-touch-controls.test.js
  git commit -m "feat: wire touch input into minigame modes"
  ```

### Task 4: 触屏浏览器回归与发布记忆

**Files:**
- Create: `tests/smoke-touch-minigame.py`
- Modify: `docs/project-memory.md`
- Modify: `docs/reviews/2026-09-02-relationship-ux-review.md`

**Interfaces:**
- Smoke 脚本使用 Playwright `browser.new_context(viewport={"width":1280,"height":720}, has_touch=True, is_mobile=True)`。
- 脚本通过 `Engine.state` 观察状态，不依赖固定睡眠；触屏控件通过 PointerEvent dispatch 验证向量和按钮状态。

- [ ] **Step 1: 写浏览器回归脚本**

  脚本覆盖：开始页 → `gaming` → 进入小游戏 → 摇杆 pointerdown/move/up → 紫球/黄球 pointerdown/up → 反向 click → 点击跳过；重复 `first_date` 路线确认无控件回归。为页面收集 `pageerror`、`requestfailed` 和非本地请求 URL。

- [ ] **Step 2: 运行触屏 smoke**

  运行：

  ```powershell
  python C:\Users\kotei\.codex\skills\webapp-testing\scripts\with_server.py `
    --server "python -m http.server 18080 --bind 127.0.0.1" --port 18080 `
    -- python -u tests/smoke-touch-minigame.py
  ```

  预期：Three.js 默认模式、强制 2D、强制 skip 和两条主线均无页面异常、失败请求或外链请求；触屏控件在触屏上下文可见，桌面上下文隐藏。

- [ ] **Step 3: 更新项目记忆和审查记录**

  在 `docs/project-memory.md` 的模块地图、状态机和运行证据中记录 `touchInput` 与 smoke 结果；在 `docs/reviews/2026-09-02-relationship-ux-review.md` 将 UX-005 标记为已关闭，保留 P1-004 素材授权和 P1-008 dt 物理。

- [ ] **Step 4: 全量门禁**

  运行：`npm test`、`npm run check`、`git diff --check`，并确认 `git status --short` 为空。

- [ ] **Step 5: 提交并推送**

  ```powershell
  git add tests/smoke-touch-minigame.py docs/project-memory.md docs/reviews/2026-09-02-relationship-ux-review.md
  git commit -m "test: verify touch minigame flow"
  git push origin feat/cover-character-layering
  ```

## 计划自检

- 规格覆盖：目标、四类触屏控件、Pointer Events、Three.js/2D 共用状态、兼容回退、可访问性、Red → Green → Refactor 和浏览器验收均有对应任务。
- 占位扫描：正文没有未决占位项或模糊的“稍后决定”步骤。
- 接口一致性：`touchInput`、`_resetTouchInput`、`_setTouchVector`、`_setTouchAction`、`_bindTouchInputs`、`_unbindTouchInputs`、`_readMoveVector`、`_readAimVector` 和 `_setJoystickFromEvent` 在任务间名称一致。
- 范围控制：不触及胜负规则、剧情文案、dt 物理、素材替换或远程依赖；这些保留为后续独立切片。
