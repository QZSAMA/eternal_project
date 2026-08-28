# C 封面与角色贴图防重 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已批准的 C「游戏主视觉＋恋爱氛围」落实为开始封面，并确保快速推进时同一角色不会重复占位或被旧表情回调覆盖。

**Architecture:** 保持现有原生 HTML/CSS/JavaScript 和 `Engine` 单例结构。角色渲染在 `Engine` 内收敛到“槽位失效—版本校验—最新写入”三个小职责；开始页只替换语义标记与样式，继续沿用 `#startTitle`、`#startBtn` 和现有配置注入链路。

**Tech Stack:** 原生 HTML5、CSS、JavaScript、Node.js 内置 `node:test`/`vm`、Chrome、Playwright Webapp Testing、本地 Python 静态服务器。

## Global Constraints

- 保留原生 HTML/CSS/JavaScript 与 1920×1080 固定舞台。
- 不引入前端框架、构建器、新运行时依赖、CDN、远程字体或在线 API。
- 使用现有 `assets/images/photos/photo2.jpg`，不新增来源不明的远程资源。
- 保持 `#startTitle`、`#startBtn`、三个角色槽位 ID 和现有脚本加载顺序不变。
- `CONFIG.meta.title` 仍是开始页动态中文标题的单一来源。
- `prefers-reduced-motion: reduce` 时关闭封面漂移、呼吸和过渡动画。
- 所有行为变更遵循 TDD：先看到目标失败，再写最小实现，再运行完整测试。
- 同一角色在 `left`、`center`、`right` 中最多占用一个槽位；槽位只接受最新渲染请求。
- 不调整剧情台词、分支结构、小游戏玩法或求婚流程。

---

## File Structure

| 文件 | 责任 | 动作 |
|---|---|---|
| `tests/engine-character-layer.test.js` | 用最小 DOM 和可控定时器验证角色唯一性、latest-write-wins 和隐藏失效 | 新建 |
| `js/engine.js` | 集中管理角色槽位失效、清空和渲染；让 `_show`、`_say`、`_hide` 共用同一规则 | 修改 |
| `tests/start-cover.test.js` | 固化封面本地资产、动态标题/按钮 ID、C 方案文案和 reduced-motion 契约 | 新建 |
| `index.html` | C 封面语义结构；保留引擎依赖 ID | 修改 |
| `css/style.css` | C 封面构图、配色、裁切、焦点、降级和减少动画 | 修改 |
| `docs/decisions/2026-08-28-character-slot-latest-write-wins.md` | 记录角色槽位并发决策和复查触发器 | 新建 |
| `docs/project-memory.md` | 更新测试基线、角色渲染事实与浏览器证据 | 修改 |

---

### Task 1: 角色槽位 latest-write-wins

**Files:**
- Create: `tests/engine-character-layer.test.js`
- Modify: `js/engine.js:210-278`

**Interfaces:**
- Consumes: `Engine.data.images.characters`、`Engine.dom.charLeft|charCenter|charRight`、浏览器 `setTimeout`/`clearTimeout`/`requestAnimationFrame`。
- Produces: `Engine._charSlots(): HTMLElement[]`、`Engine._invalidateCharSlot(slot): number`、`Engine._clearCharSlot(slot): void`、`Engine._renderCharacterSlot(slot, { char, expr, url }): void`。
- Invariant: 每个槽位使用私有的 `_charRenderVersion: number` 和 `_charSwapTimer: number|null`；旧回调必须在写 DOM 前比较版本号。

- [ ] **Step 1: 新建失败测试夹具和三条回归测试**

Create `tests/engine-character-layer.test.js` with:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class FakeClassList {
  constructor(values = []) {
    this.values = new Set(values);
  }
  add(...values) { values.forEach(value => this.values.add(value)); }
  remove(...values) { values.forEach(value => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
}

function createSlot({ char = '', expr = '', shown = false } = {}) {
  return {
    classList: new FakeClassList(shown ? ['is-show'] : []),
    dataset: { char, expr },
    innerHTML: char ? `<img src="${char}-${expr}.jpg">` : '',
  };
}

function loadEngine() {
  const jobs = [];
  let nextTimerId = 1;
  const context = {
    console,
    window: { addEventListener() {} },
    document: { addEventListener() {} },
    CONFIG: {},
    Minigame: {},
    GameAudio: { init() {}, sfx() {} },
    requestAnimationFrame(callback) { callback(); return 1; },
    setTimeout(callback) {
      const job = { id: nextTimerId++, callback, cancelled: false };
      jobs.push(job);
      return job.id;
    },
    clearTimeout(id) {
      const job = jobs.find(candidate => candidate.id === id);
      if (job) job.cancelled = true;
    },
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'engine.js'), 'utf8');
  vm.runInContext(`${source}\nthis.EngineUnderTest = Engine;`, context);
  const engine = context.EngineUnderTest;
  engine.data = {
    meta: { heroName: 'H', heroineName: 'W' },
    images: {
      characters: {
        heroine: {
          normal: 'heroine-normal.jpg',
          shy: 'heroine-shy.jpg',
          laugh: 'heroine-laugh.jpg',
        },
      },
    },
  };
  engine.dom = {
    charLeft: createSlot(),
    charCenter: createSlot(),
    charRight: createSlot(),
    dialogueBox: { classList: new FakeClassList() },
    nameTag: { style: {}, textContent: '', className: '' },
    dialogueText: { textContent: '' },
    dialogueArrow: { classList: new FakeClassList() },
  };
  return { engine, jobs };
}

test('moving the same character from center to right clears the old slot', () => {
  const { engine } = loadEngine();
  engine._show({ char: 'heroine', pos: 'center', expr: 'shy' });
  engine._show({ char: 'heroine', pos: 'right', expr: 'normal' });

  assert.equal(engine.dom.charCenter.dataset.char, '');
  assert.equal(engine.dom.charCenter.innerHTML, '');
  assert.equal(engine.dom.charCenter.classList.contains('is-show'), false);
  assert.equal(engine.dom.charRight.dataset.char, 'heroine');
  assert.equal(engine.dom.charRight.dataset.expr, 'normal');
});

test('an older delayed expression callback cannot overwrite the latest expression', () => {
  const { engine, jobs } = loadEngine();
  engine._show({ char: 'heroine', pos: 'left', expr: 'normal' });
  engine._say({ who: 'heroine', expr: 'shy', text: '' });
  const staleJob = jobs.at(-1);
  engine._say({ who: 'heroine', expr: 'laugh', text: '' });

  staleJob.callback();

  assert.equal(staleJob.cancelled, true);
  assert.equal(engine.dom.charLeft.dataset.expr, 'laugh');
  assert.match(engine.dom.charLeft.innerHTML, /heroine-laugh\.jpg/);
});

test('hiding a character invalidates a pending expression callback', () => {
  const { engine, jobs } = loadEngine();
  engine._show({ char: 'heroine', pos: 'left', expr: 'normal' });
  engine._say({ who: 'heroine', expr: 'shy', text: '' });
  const staleJob = jobs.at(-1);

  engine._hide({ char: 'heroine' });
  staleJob.callback();

  assert.equal(staleJob.cancelled, true);
  assert.equal(engine.dom.charLeft.dataset.char, '');
  assert.equal(engine.dom.charLeft.dataset.expr, '');
  assert.equal(engine.dom.charLeft.innerHTML, '');
  assert.equal(engine.dom.charLeft.classList.contains('is-show'), false);
});
```

- [ ] **Step 2: 运行测试并确认三个目标行为都失败**

Run:

```powershell
node --test tests/engine-character-layer.test.js
```

Expected: 3 tests fail. The first reports that `charCenter.dataset.char` is still `heroine`; the race tests show an old callback can write or re-show a character.

- [ ] **Step 3: 在 Engine 中加入槽位失效和统一渲染方法**

Insert before `_show()` in `js/engine.js`:

```js
  _charSlots() {
    return [this.dom.charLeft, this.dom.charCenter, this.dom.charRight].filter(Boolean);
  },

  _invalidateCharSlot(slot) {
    if (slot._charSwapTimer != null) {
      clearTimeout(slot._charSwapTimer);
      slot._charSwapTimer = null;
    }
    slot._charRenderVersion = (slot._charRenderVersion || 0) + 1;
    return slot._charRenderVersion;
  },

  _clearCharSlot(slot) {
    this._invalidateCharSlot(slot);
    slot.classList.remove("is-show", "is-speaking", "is-dim");
    slot.dataset.char = "";
    slot.dataset.expr = "";
    slot.innerHTML = "";
  },

  _renderCharacterSlot(slot, { char, expr, url }) {
    const version = this._invalidateCharSlot(slot);
    const render = () => {
      if (slot._charRenderVersion !== version) return;
      slot._charSwapTimer = null;
      slot.innerHTML = `<img class="char-img" src="${url}" alt="" onerror="this.style.display='none'">`;
      slot.dataset.char = char;
      slot.dataset.expr = expr;
      requestAnimationFrame(() => {
        if (slot._charRenderVersion !== version) return;
        slot.classList.add("is-show");
        this._updateSpeaking();
      });
    };

    if (slot.classList.contains("is-show")) {
      slot.classList.remove("is-show");
      slot._charSwapTimer = setTimeout(render, 200);
    } else {
      render();
    }
  },
```

- [ ] **Step 4: 让 `_show`、`_hide`、`_say` 共用统一入口**

Replace `_show()` and `_hide()` with:

```js
  _show(arg) {
    const char = arg.char;
    const expr = arg.expr || "neutral";
    const pos = arg.pos || "left";
    const url = this.data.images.characters[char][expr];
    const slot = pos === "left" ? this.dom.charLeft : pos === "right" ? this.dom.charRight : this.dom.charCenter;

    this._charSlots().forEach(candidate => {
      if (candidate !== slot && candidate.dataset.char === char) this._clearCharSlot(candidate);
    });
    this._renderCharacterSlot(slot, { char, expr, url });
    this._updateSpeaking();
  },

  _hide(arg) {
    this._charSlots().forEach(slot => {
      if (arg.char === "*" || slot.dataset.char === arg.char) this._clearCharSlot(slot);
    });
  },
```

Replace the expression-switch block inside `_say()` with:

```js
      if (arg.expr) {
        const matchingSlots = this._charSlots().filter(slot => slot.dataset.char === who);
        const slot = matchingSlots.shift();
        matchingSlots.forEach(duplicate => this._clearCharSlot(duplicate));
        if (slot && slot.dataset.expr !== arg.expr) {
          const url = this.data.images.characters[who][arg.expr];
          this._renderCharacterSlot(slot, { char: who, expr: arg.expr, url });
        }
      }
```

- [ ] **Step 5: 运行定向测试和完整 Node 测试**

Run:

```powershell
node --test tests/engine-character-layer.test.js
npm test
npm run check
```

Expected: 3/3 character-layer tests pass; the complete suite reports 14/14 passing at this point; syntax checks exit 0.

- [ ] **Step 6: 检查差异并提交角色修复**

Run:

```powershell
git diff --check
git diff -- tests/engine-character-layer.test.js js/engine.js
git add tests/engine-character-layer.test.js js/engine.js
git commit -m "fix: prevent duplicate character layers"
```

Expected: commit succeeds and contains only the test plus engine rendering changes.

---

### Task 2: C 游戏恋爱主视觉开始封面

**Files:**
- Create: `tests/start-cover.test.js`
- Modify: `index.html:132-140`
- Modify: `css/style.css:6-17,444-478,500-507`

**Interfaces:**
- Consumes: `assets/images/photos/photo2.jpg`、`Engine.init()` 对 `#startTitle`/`#startBtn` 的查询与标题注入。
- Produces: `.start-art`、`.start-kicker`、`.start-display`、`.start-save`、`.start-sync` 视觉单元；`#startTitle` 继续承载 `CONFIG.meta.title`；`#startBtn` 继续触发现有开始逻辑。
- Accessibility: `.start-display`、`.start-sync`、播放图标和封面图片均为装饰；按钮的可访问名称为“开始双人旅程”。

- [ ] **Step 1: 新建封面静态契约失败测试**

Create `tests/start-cover.test.js` with:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

test('start cover uses the approved local co-op artwork and preserves engine ids', () => {
  assert.match(html, /class="start-art"[^>]+src="assets\/images\/photos\/photo2\.jpg"/);
  assert.match(html, /id="startTitle"[^>]*>我们的故事</);
  assert.match(html, /id="startBtn"[^>]*>[\s\S]*开始双人旅程[\s\S]*<\/button>/);
  assert.doesNotMatch(html, /class="start-deco"/);
});

test('start cover exposes the approved cooperative game copy', () => {
  assert.match(html, /CO-OP STORY MODE \/ ONLINE/);
  assert.match(html, /OUR[\s\S]*STORY/);
  assert.match(html, /SAVE SLOT 01/);
  assert.match(html, /SYNC RATE[\s\S]*100%/);
  assert.match(html, /两个人的主线任务，从这一刻继续/);
});

test('start cover defines the approved palette and reduced-motion fallback', () => {
  assert.match(css, /--start-bg:\s*#080A18/i);
  assert.match(css, /--start-coral:\s*#FF684E/i);
  assert.match(css, /--start-cyan:\s*#7EE6FF/i);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.start-art[\s\S]*animation:/);
});
```

- [ ] **Step 2: 运行测试并确认 C 方案契约失败**

Run:

```powershell
node --test tests/start-cover.test.js
```

Expected: all 3 tests fail because the current page has no `.start-art`, cooperative-game copy, or C palette tokens.

- [ ] **Step 3: 用已批准的语义结构替换开始页**

Replace `index.html:132-140` with:

```html
    <!-- 开始界面层 -->
    <div class="layer-start" id="layerStart">
      <img class="start-art" src="assets/images/photos/photo2.jpg" alt="" aria-hidden="true">
      <div class="start-screen">
        <div class="start-kicker"><span aria-hidden="true"></span>CO-OP STORY MODE / ONLINE</div>
        <div class="start-display" aria-hidden="true"><span>OUR</span><strong>STORY</strong></div>
        <div class="start-save"><span>SAVE SLOT 01</span><h1 class="start-title" id="startTitle">我们的故事</h1></div>
        <p class="start-sub" id="startSub">两个人的主线任务，从这一刻继续</p>
        <button class="start-btn" id="startBtn" type="button">
          <span class="start-play" aria-hidden="true">▶</span>
          <span>开始双人旅程</span>
        </button>
      </div>
      <div class="start-sync" aria-hidden="true">
        <span>SYNC RATE</span><strong>100%</strong><small>PLAYER 1 + PLAYER 2</small>
      </div>
    </div>
```

- [ ] **Step 4: 增加 C 方案颜色令牌并替换开始页 CSS**

Add these tokens to `:root`:

```css
  --start-bg:#080A18;
  --start-coral:#FF684E;
  --start-cyan:#7EE6FF;
```

Replace the current “开始界面” block with:

```css
.layer-start{
  display:block;overflow:hidden;isolation:isolate;background:
    radial-gradient(circle at 68% 35%,rgba(85,55,165,.26),transparent 42%),
    linear-gradient(120deg,#080A18,#17102c 55%,#080A18);
}
.layer-start::before{
  content:"";position:absolute;inset:0;z-index:1;pointer-events:none;
  background:
    radial-gradient(circle at 64% 42%,transparent 0 28%,rgba(6,7,19,.16) 50%,rgba(6,7,19,.78) 100%),
    linear-gradient(90deg,rgba(8,7,23,.94) 0%,rgba(12,7,25,.54) 34%,rgba(7,9,23,.10) 68%,rgba(5,10,25,.58) 100%),
    linear-gradient(0deg,rgba(6,7,19,.88),transparent 52%);
}
.layer-start::after{
  content:"";position:absolute;inset:0;z-index:2;pointer-events:none;opacity:.16;
  background:repeating-linear-gradient(0deg,transparent 0 3px,rgba(122,225,255,.13) 4px);
  mix-blend-mode:screen;
}
.layer-start.is-hidden{display:none;}
.start-art{
  position:absolute;inset:-4%;width:108%;height:108%;object-fit:cover;object-position:52% 43%;
  filter:saturate(1.04) contrast(1.12) brightness(.64);
  animation:startArtDrift 14s ease-in-out infinite alternate;
}
.start-screen{
  position:absolute;z-index:3;left:132px;top:50%;width:600px;transform:translateY(-47%);
  text-align:left;
}
.start-kicker{
  display:flex;align-items:center;gap:14px;margin-bottom:28px;color:var(--start-cyan);
  font-size:15px;font-weight:800;letter-spacing:5px;
}
.start-kicker span{
  width:9px;height:9px;border-radius:50%;background:var(--start-coral);
  box-shadow:0 0 22px rgba(255,104,78,.8);animation:startStatusPulse 1800ms ease-in-out infinite;
}
.start-display{
  color:#fff;font-size:122px;font-weight:900;font-style:italic;letter-spacing:-10px;
  line-height:.82;text-transform:uppercase;text-shadow:8px 8px 0 rgba(94,52,218,.42);
}
.start-display span,.start-display strong{display:block;}
.start-display strong{
  margin:32px 0 0 118px;color:var(--start-coral);font-weight:900;
  -webkit-text-stroke:1px rgba(255,255,255,.18);
}
.start-save{display:flex;align-items:baseline;gap:22px;margin-top:54px;}
.start-save>span{color:var(--start-cyan);font-size:15px;font-weight:800;letter-spacing:4px;}
.start-title{color:#fff;font-size:24px;font-weight:800;letter-spacing:3px;}
.start-sub{margin-top:18px;color:rgba(219,228,255,.62);font-size:18px;letter-spacing:3px;}
.start-btn{
  display:inline-flex;align-items:center;gap:22px;margin-top:42px;padding:16px 28px 16px 20px;
  border:1px solid rgba(126,230,255,.58);color:#fff;background:rgba(12,14,35,.72);
  clip-path:polygon(0 0,calc(100% - 16px) 0,100% 16px,100% 100%,16px 100%,0 calc(100% - 16px));
  font-size:18px;font-weight:800;letter-spacing:4px;cursor:pointer;backdrop-filter:blur(8px);
  transition:transform 200ms ease,background 200ms ease,border-color 200ms ease;
}
.start-play{
  display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:var(--start-coral);
  box-shadow:0 0 22px rgba(255,104,78,.58);font-size:14px;text-indent:2px;
}
.start-btn:hover{transform:translateY(-3px);background:rgba(126,230,255,.16);border-color:var(--start-cyan);}
.start-sync{
  position:absolute;z-index:3;right:76px;top:106px;display:flex;flex-direction:column;width:170px;
  color:rgba(206,235,255,.62);font-size:12px;letter-spacing:3px;
}
.start-sync::before{content:"";height:1px;margin-bottom:14px;background:linear-gradient(90deg,var(--start-cyan),transparent);}
.start-sync strong{color:#fff;font-size:36px;line-height:1.1;letter-spacing:0;}
.start-sync small{margin-top:5px;font-size:10px;letter-spacing:2px;}
@keyframes startArtDrift{to{transform:scale(1.035) translate3d(-.45%,-.25%,0);}}
@keyframes startStatusPulse{50%{opacity:.5;transform:scale(.8);}}
```

The existing global `button:focus-visible` rule remains unchanged. The existing reduced-motion rule already collapses all animation and transition durations, so no additional motion media query is needed.

- [ ] **Step 5: 运行封面定向测试、完整测试与语法检查**

Run:

```powershell
node --test tests/start-cover.test.js
npm test
npm run check
```

Expected: 3/3 cover tests pass; the complete suite reports 17/17 passing; syntax checks exit 0.

- [ ] **Step 6: 检查本地资源与差异**

Run:

```powershell
Test-Path 'assets/images/photos/photo2.jpg'
rg -n "https?://|@import|url\(.*https?" index.html css js
git diff --check
git diff -- tests/start-cover.test.js index.html css/style.css
```

Expected: `Test-Path` returns `True`; runtime source contains no new remote dependency; `git diff --check` emits no output.

- [ ] **Step 7: 提交 C 封面实现**

Run:

```powershell
git add tests/start-cover.test.js index.html css/style.css
git commit -m "feat: add co-op romance start cover"
```

Expected: commit succeeds and contains only the cover contract, markup, and styles.

---

### Task 3: 双分支快速点击、视觉验收与项目记忆

**Files:**
- Create: `docs/decisions/2026-08-28-character-slot-latest-write-wins.md`
- Modify: `docs/project-memory.md`

**Interfaces:**
- Consumes: 本地 `http://127.0.0.1:4173/`、开始按钮、舞台点击路由、两个 `.choice-btn`、`.mg-skip`、`.char-slot.is-show[data-char]`。
- Produces: 1920×1080 和 1280×720 视觉证据、两条分支快速点击证据、控制台错误检查、可持续工程记忆。

- [ ] **Step 1: 按 Webapp Testing 要求确认服务器包装器用法**

Run before using the helper:

```powershell
python 'C:\Users\kotei\.codex\skills\webapp-testing\scripts\with_server.py' --help
```

Expected: help output documents the server command, port argument, and test-command separator. Use exactly the displayed syntax in the next step; do not guess flags.

- [ ] **Step 2: 启动本地静态服务器并打开 Chrome 测试页**

Start the repository with the wrapper documented in Step 1, using this server command and port:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173/` in Chrome. Expected: title is `我们的故事`; no network resource is requested from a non-local origin.

- [ ] **Step 3: 在 1920×1080 视口验证 C 封面**

Use Chrome viewport override `1920×1080`, reload, and capture a screenshot. Verify all of the following against the approved C mockup:

1. Both characters remain visible in the middle/right and neither face is clipped.
2. `OUR STORY` is readable on the left without overlapping faces.
3. `SAVE SLOT 01` and the dynamic title `我们的故事` are visible.
4. “开始双人旅程” has clear default, hover, and keyboard focus states.
5. No watermark, horizontal overflow, broken image, A/B/C selector, or black strip is visible.

Expected: all five checks pass before continuing.

- [ ] **Step 4: 在 1280×720 缩放视口和减少动画模式复查封面**

Change the viewport to `1280×720`, reload, focus the start button with `Tab`, and capture a screenshot. Then emulate `prefers-reduced-motion: reduce`, reload, and capture one more screenshot.

Expected: the 1920×1080 stage remains centered and fully scaled inside 1280×720; text remains readable; the focus ring is visible; reduced-motion mode has no sustained background/status animation and the button still works.

- [ ] **Step 5: 快速推进“第一次见面”分支并持续断言角色唯一性**

Reload, click “开始双人旅程”, then rapidly click a non-control area of `#stage` in short bursts until the choice menu appears. Choose `「组局结束了，要不……见一面？」`. During every burst, read visible slots using:

```js
Array.from(document.querySelectorAll('.char-slot.is-show'))
  .map(slot => slot.dataset.char)
  .filter(Boolean)
```

After every sample, assert:

```js
visibleCharacters.length === new Set(visibleCharacters).size
```

Continue rapidly until the park scene has shown the heroine at `right`. Expected: `charCenter` has empty `data-char`, empty image DOM, and no `is-show`; `charRight.dataset.char === 'heroine'`; the uniqueness assertion never fails.

- [ ] **Step 6: 快速推进“再来一局”分支并验证小游戏跳过后状态**

Reload and repeat the start-to-menu rapid advance. Choose `「再来一局，这次我一定奶到你」`, advance until the mini-game layer appears, then click `跳过 ▶`. Continue rapidly through `from_game_to_real`, sampling the same uniqueness assertion after every burst.

Expected: the mini-game layer hides after skip; story resumes; no duplicate character appears; the latest displayed expression matches the latest dialogue; the flow reaches montage/proposal without being blocked.

- [ ] **Step 7: 检查控制台和同源资源**

Inspect Chrome logs and page assets after both flows.

Expected:

- No `ReferenceError`, unhandled promise rejection, failed image request, or 404.
- The known Three.js classic-build deprecation warning may remain and is not a failure.
- All image/script/style assets are loaded from `127.0.0.1:4173` or inline data URLs.

- [ ] **Step 8: 写入角色槽位决策记录**

Create `docs/decisions/2026-08-28-character-slot-latest-write-wins.md` with:

```markdown
# 角色槽位采用 latest-write-wins

- 日期：2026-08-28
- 状态：已采用

## 决策

角色渲染继续保留左、中、右三个 DOM 槽位，但每个槽位维护递增版本号和一个可取消的换图定时器。`show`、`say(expr)`、`hide` 共用同一失效与渲染入口；回调只有在版本号仍为最新时才能写入 DOM。同一角色移动到新槽位时，旧槽位立即失效并清空。

## 原因

剧情会把同一角色从中间移动到右侧，快速推进还会让多个 200ms 表情回调交错执行。仅修改剧情数据无法覆盖所有后续移动和竞态；集中到引擎可形成可测试的不变量。

## 后果

- 任意时刻同一角色最多出现在一个槽位。
- 最新表情请求胜出，隐藏动作不会被历史回调撤销。
- 新增角色动画时必须经过统一渲染入口，不得再次创建裸换图定时器。

## 复查触发器

- 角色槽位从 DOM 改为 Canvas/WebGL。
- 增加多实例同角色、分身或镜像演出需求。
- 更改角色换图动画时长或调度机制。
```

- [ ] **Step 9: 更新项目记忆**

In `docs/project-memory.md`:

1. Change the test baseline to `Node 内置测试 17/17 通过，npm run check 通过`.
2. Add to the engine module responsibility: `角色槽位 latest-write-wins`.
3. Add a 2026-08-28 evidence bullet stating both rapid-click branches passed, the first-date center-to-right move left one visible heroine, and the C cover passed 1920×1080/1280×720/reduced-motion checks.
4. Add this decision-summary row:

```markdown
| 2026-08-28 | 角色槽位使用可取消定时器与版本校验，开始封面采用 C 双人游戏主视觉 | 消除快速推进竞态和跨段落重复角色，同时建立一致开场视觉 | 增加分身演出、改用 Canvas/WebGL 角色或替换封面结构 |
```

- [ ] **Step 10: 执行发布门禁**

Run:

```powershell
npm test
npm run check
git diff --check
git status --short
```

Expected: 17/17 tests pass; syntax checks exit 0; diff check emits no output; only the decision and project-memory documents remain uncommitted.

- [ ] **Step 11: 提交验证与治理更新**

Run:

```powershell
git add docs/decisions/2026-08-28-character-slot-latest-write-wins.md docs/project-memory.md
git commit -m "docs: record cover and character rendering baseline"
git status --short
git log -4 --oneline
```

Expected: commit succeeds; working tree is clean; log shows separate character fix, cover feature, governance update, and the earlier design/plan history.

---

## Final Verification Checklist

- [ ] `npm test` reports 17/17 passing.
- [ ] `npm run check` exits 0.
- [ ] `git diff --check` is clean.
- [ ] C cover matches the approved composition at 1920×1080 and 1280×720.
- [ ] Reduced-motion mode is static and fully operable.
- [ ] First-date branch moves heroine `center → right` without duplication.
- [ ] Gaming branch survives rapid advance and mini-game skip without stale expressions.
- [ ] Chrome console has no new errors or failed resources.
- [ ] `docs/project-memory.md` and the decision record reflect the verified state.
- [ ] Working tree is clean with three focused implementation commits.
