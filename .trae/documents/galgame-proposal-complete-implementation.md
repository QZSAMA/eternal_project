# 求婚 Galgame 网页游戏 — 完善实现计划

> 本计划在原 `galgame-proposal-webpage-plan.md` 基础上补充实现所需的全部具体规范，使执行者无需再做架构决策即可构建。原计划保留作为高层参考，本文件为执行依据。

---

## 〇、与原计划的关系

原计划已覆盖（不重复）：技术选型理由、文件结构、指令集清单、章节划分、系统设计概述、视觉风格、素材清单、验证步骤。

本计划补充的关键缺口：
1. 引擎 API 与状态机规范（执行接口）
2. `storyData.js` 完整 schema + 可运行占位剧本
3. CSS 类架构与命名约定
4. 小游戏平衡数值表
5. 动画时序表（具体 ms）
6. Seedream 素材生成提示词（可直接用）
7. 资源加载错误处理与回退
8. 执行序列与验证检查点

---

## 一、引擎 API 规范（`js/engine.js`）

### 1.1 状态机

```
idle ─start()─▶ playing ─┬─ say ─▶ waiting_input ─advance()─▶ playing
                          ├─ menu ─▶ waiting_choice ─select()─▶ playing
                          ├─ call ─▶ in_minigame ─onEnd()─▶ playing
                          ├─ montage ─▶ in_montage ─onDone()─▶ playing
                          ├─ proposal ─▶ in_proposal ─accept()─▶ ended
                          └─ end / 脚本末尾 ─▶ ended
```

状态变量：`this.state`（枚举），`this.label`（当前 label），`this.pc`（program counter，指令索引）。

### 1.2 对外接口

```js
const Engine = {
  init(storyData): void          // 缓存 storyData、绑定 DOM 层、注册输入监听
  start(): void                  // 从 'start' label 开始
  advance(): void                // 输入推进（click/space/enter/触屏）
  choose(index): void            // menu 选项确认
  jump(label): void              // 内部跳转
  callMinigame(cfg, onEnd): void // 调用小游戏，结束后回调
  skipTypewriter(): void         // 打字机未完成时点击补全
  setMuted(bool): void
};
```

### 1.3 指令执行映射

| 指令 | 执行 | 是否阻塞 |
|---|---|---|
| `scene` | `Background.switch(bg, effect)` | 否（异步淡入，不等） |
| `show` | `Character.show(char, pos, expr)` | 否 |
| `hide` | `Character.hide(char)` | 否 |
| `say` | `Dialogue.say(who, text)` → 状态转 `waiting_input` | 是 |
| `menu` | `Menu.show(prompt, options)` → 状态转 `waiting_choice` | 是 |
| `jump` | `Engine.jump(label)` 重置 pc=0 | 否 |
| `call` | `Engine.callMinigame(cfg, onEnd)` → 状态转 `in_minigame` | 是 |
| `wait` | `setTimeout(advance, ms)` | 是 |
| `bgm` | `Audio.bgm(track, fade)` | 否 |
| `sfx` | `Audio.sfx(name)` | 否 |
| `effect` | `Effect.play(type)` | 否 |
| `montage` | `Montage.play(slides)` → 状态转 `in_montage` | 是 |
| `proposal` | `Proposal.start()` → 状态转 `in_proposal` | 是（终态） |

### 1.4 输入路由

- 全局监听：`click`（stage）、`keydown`（Space/Enter/→/↓）、`touchstart`
- `waiting_input`：任意输入 → `skipTypewriter()`（若未完成）或 `advance()`
- `waiting_choice`：↑↓ 选项移动、Enter 确认、点击直接选
- `in_minigame`：输入交给 minigame 接管
- 其他状态：忽略推进输入

---

## 二、`storyData.js` 完整 Schema 与占位剧本

### 2.1 顶层结构

```js
const CONFIG = {
  meta: { title, heroName, heroineName, proposalDate },
  audio: { bgm: {...}, sfx: {...} },
  images: {
    backgrounds: { ow_menu, ow_route66, chat_night, first_date, park, proposal },
    characters: { hero: {neutral,smile,serious}, heroine: {normal,laugh,shy} },
    photos: [ ... ],
    minigame: { player, healer, enemy },
  },
  minigame: { duration, winCapture, playerHP, ... },  // 平衡数值
  story: { start: [...], duo_queue: [...], branch: [...], gaming: [...],
           first_date: [...], from_game_to_real: [...], montage: [...],
           proposal: [...] },
};
```

### 2.2 占位剧本（通用浪漫，关键信息用 `{{}}`）

**start**：守望主菜单背景，旁白介绍相识。
```
{scene bg:ow_menu, effect:fade}
{bgm track:opening, fade:1500}
{say who:narration, text:"{{那年的夏天，屏幕那头的语音频道里，一个陌生的ID亮了起来。}}"}
{say who:narration, text:"{{谁也没想到，一句'辅助跟紧我'，会变成往后余生的开场白。}}"}
{show char:heroine, pos:right, expr:normal}
{say who:heroine, text:"{{嗨，你就是那个据说很猛的源氏？}}"}
{show char:hero, pos:left, expr:neutral}
{say who:hero, text:"{{互相切磋一下？输了请喝奶茶。}}"}
{say who:heroine, expr:laugh, text:"{{好啊，你输了可别赖账。}}"}
{jump label:duo_queue}
```

**duo_queue**：双排日常，感情升温。
```
{scene bg:chat_night, effect:fade}
{bgm track:opening, fade:1500}
{say who:narration, text:"{{从那以后，每晚十点，语音频道总会准时亮起两个小绿点。}}"}
{say who:hero, expr:smile, text:"{{今天又被你救了，你这奶量属实离谱。}}"}
{say who:heroine, expr:laugh, text:"{{那当然，我可是全服第一专属辅助。}}"}
{say who:narration, text:"{{游戏里的默契，悄悄长成了别的什么。}}"}
{effect type:spotlight}
{say who:hero, expr:serious, text:"{{其实……除了打游戏，我还想见你一面。}}"}
{effect type:flash}
{jump label:branch}
```

**branch**：选项分支。
```
{menu prompt:"{{她沉默了一下，你会——}}", options:[
  {text:"{{再陪我打两局排位冲分}}", next:gaming},
  {text:"{{周末出来见个面吧}}", next:first_date}
]}
```

**gaming**：调用小游戏。
```
{scene bg:ow_route66, effect:fade}
{bgm track:game, fade:1000}
{say who:heroine, expr:normal, text:"{{这局我来奶你，冲点！}}"}
{call minigame:default}
{say who:heroine, expr:laugh, text:"{{可以啊你，今天状态在线！}}"}
{say who:hero, expr:smile, text:"{{有你奶我，能不猛吗。}}"}
{jump label:from_game_to_real}
```

**first_date**：第一次见面。
```
{scene bg:first_date, effect:fade}
{bgm track:date, fade:1500}
{say who:narration, text:"{{周末的黄昏，咖啡店门口，她比语音里更紧张。}}"}
{show char:heroine, pos:center, expr:shy}
{say who:heroine, text:"{{你……比头像里高一点。}}"}
{show char:hero, pos:left, expr:smile}
{say who:hero, text:"{{你比想象里更可爱一点。}}"}
{say who:heroine, expr:laugh, text:"{{少贫啦，走吧。}}"}
{jump label:from_game_to_real}
```

**from_game_to_real**：分支汇合，告白。
```
{scene bg:park, effect:fade}
{effect type:spotlight}
{say who:narration, text:"{{从游戏走到现实，从双排走到并肩。}}"}
{say who:hero, expr:serious, text:"{{这些年，你是我最稳定的辅助，也是最想守护的人。}}"}
{say who:heroine, expr:shy, text:"{{……我也是。}}"}
{effect type:flash}
{jump label:montage}
```

**montage**：真实照片蒙太奇。
```
{montage slides:[
  {img:photo1, caption:"{{第一次合照，我们都笑得很傻}}"},
  {img:photo2, caption:"{{那次旅行，你说海风很咸}}"},
  {img:photo3, caption:"{{生日那天，你许的愿望我都知道}}"},
  {img:photo4, caption:"{{平凡的日子，因为有你而闪闪发光}}"}
], bgm:proposal}
{jump label:proposal}
```

**proposal**：终局求婚。
```
{scene bg:proposal, effect:zoomin}
{hide char:*}
{bgm track:proposal, fade:2000}
{wait ms:800}
{say who:narration, text:"{{今天，我想把心里藏了很久的话，亲口说给你听。}}"}
{effect type:spotlight}
{sfx name:heartbeat}
{say who:hero, expr:serious, text:"{{从守望的语音频道，到今天这一刻，你愿意……}}"}
{say who:hero, expr:serious, text:"{{嫁给我，做我下半辈子的专属辅助吗？}}"}
{proposal}
```

> 所有 `{{...}}` 内容均为占位，用户在 `storyData.js` 直接替换为真实文案即可。

---

## 三、CSS 类架构（`css/style.css`）

### 3.1 命名约定

- 层级用 `layer-*`，组件用 `组件名`，状态修饰用 `--修饰`。
- 不引入 CSS 框架，纯手写，便于离线。

### 3.2 层级（z-index 从低到高）

```
.stage                      1920×1080 根容器，transform:scale
  .layer-bg                 z:1   双层背景交叉淡入
  .layer-chars              z:2   立绘层（left/center/right 三槽）
  .layer-particles          z:3   Canvas 粒子
  .layer-dialogue           z:10  对话框
  .layer-menu               z:20  选项面板
  .layer-effects            z:30  全屏特效（flash/shake/spotlight 蒙版）
  .layer-hud                z:40  右上静音/跳过按钮
  .layer-start              z:50  开始界面
  .layer-ending             z:50  结尾画面
  .layer-minigame           z:60  小游戏 Canvas + HUD（仅 in_minigame 显示）
```

### 3.3 关键组件类

```
.dialogue-box               底部 28% 高，半透明深底 + backdrop-filter
.dialogue-box .name-tag     左上斜切色块名牌
.dialogue-box .text         打字机文本区
.dialogue-box .arrow        句末闪烁 ▼
.dialogue-box.is-narration  旁白模式（无名牌，居中）

.char                       立绘基类
.char--left/.char--center/.char--right   三槽定位
.char--speaking             当前说话：brightness↑ + 橙色光晕
.char--dim                  非说话：brightness↓

.choice-panel               半透明遮罩 + 居中面板
.choice-btn                 斜切角按钮
.choice-btn:hover           橙色发光
.choice-btn.is-selected     键盘选中态

.start-screen               开始界面，标题 + "点击开始" 按钮
.ring                       CSS/SVG 戒指容器
.btn-accept                 "我愿意" 大按钮，橙色脉冲
.btn-reject                 "让我想想" 小按钮，灰色，可逃跑
.ending-screen              结尾画面

.effect-flash               白闪蒙版（opacity 动画）
.effect-shake               抖动（@keyframes 平移）
.effect-spotlight           径向渐变暗角
```

### 3.4 配色变量（`:root`）

```css
:root{
  --ow-orange:#F99E2A; --ow-orange-bright:#FFB13B;
  --ow-dark:#1B2838; --ow-mid:#2A475E;
  --ow-cyan:#4FC3F7; --warn-red:#E44040;
  --gold:#FFD700;
  --dialogue-bg:rgba(10,15,25,.82);
  --text-light:#F5F7FA;
}
```

---

## 四、小游戏平衡数值表（`js/minigame.js`）

| 参数 | 值 | 说明 |
|---|---|---|
| 画布尺寸 | 1280×720（舞台内居中） | 小游戏专用区 |
| 时长 | 60s | 倒计时 |
| 胜利条件 | 占点进度 ≥100% | 或撑满 60s（温柔胜利） |
| 玩家 HP | 100 | 归零触发"她复活了你" |
| 玩家速度 | 4 px/帧（60fps≈240px/s） | WASD |
| 射速 | 6 发/秒（间隔 ~166ms） | 鼠标左键 |
| 子弹速度 | 10 px/帧 | |
| 子弹伤害 | 25 | 4 发击杀普通敌人 |
| 敌人 HP | 30 | |
| 敌人速度 | 1.5 px/帧 | 朝玩家移动 |
| 敌人接触伤害 | 10 | |
| 敌人生成间隔 | 1200ms | 最多同屏 8 个 |
| 控制点半径 | 120px | 屏幕中央圆环 |
| 占点速率 | +5%/s（玩家在圈内） | 20s 可满 |
| 治疗触发 | 每 8s 一次 | 女主头像释放光束 |
| 治疗量 | +15 HP | 飘字 "+♥ 她在奶你" |
| 失败处理 | HP 归零 → 闪白 → "她复活了你" → 继续占点进度不丢 | 不卡关 |
| 跳过按钮 | 右上角，直接判定胜利 | 防现场无键鼠 |

HUD：顶部占点进度条（守望分段刻度 0/33/66/100）、左下血条、右下倒计时、右侧女主治疗头像。

---

## 五、动画时序表（具体 ms）

| 动画 | 时长 | 缓动 |
|---|---|---|
| 背景淡入 | 800ms | ease-out |
| 背景 Ken Burns 推进 | 8000ms 循环 | linear |
| 立绘入场（上移+淡入） | 300ms | ease-out |
| 立绘呼吸 | 3500ms 循环 | ease-in-out |
| 立绘说话高亮切换 | 200ms | ease-out |
| 立绘表情切换（淡出+淡入） | 400ms | ease-in-out |
| 对话框出现 | 200ms | ease-out |
| 打字机每字 | 35ms（中文）/ 18ms（英文标点） | linear |
| 句末 ▼ 闪烁 | 1000ms 循环 | ease-in-out |
| 选项按钮逐条延迟 | 120ms 间隔，300ms 淡入 | ease-out |
| effect flash | 150ms | ease-out |
| effect shake | 400ms | ease-in-out |
| effect spotlight 渐显 | 600ms | ease-out |
| 蒙太奇每张停留 | 3500ms | |
| 蒙太奇切换 | 800ms 淡入淡出 | ease-in-out |
| 求婚戒指升起 | 2000ms | cubic-bezier(.2,.8,.3,1) |
| 戒指旋转 | 4000ms 循环 | linear |
| "我愿意"按钮脉冲 | 1500ms 循环 | ease-in-out |
| 接受后闪白 | 300ms | ease-out |
| 金色粒子爆发 | 2500ms | ease-out |
| 结尾画面淡入 | 1200ms | ease-out |
| 樱花飘落 | 持续 | linear |

---

## 六、Seedream 素材生成提示词

> 执行阶段调用 `GenerateImage` 工具，按以下提示词逐张生成，保存到对应路径。画风统一关键词：`anime visual novel style, cel shading, clean lineart, soft coloring, no text, high quality`。

### 6.1 背景（1920×1080 横版，`landscape_16_9`）

1. **ow_menu.jpg**：`Anime visual novel background, Overwatch-style main menu aesthetic, deep blue night sky with orange tech glow, futuristic city silhouette, sci-fi HUD particles, no text, cel shading, 16:9`
2. **ow_route66.jpg**：`Anime visual novel background, Route 66 style desert at sunset, dusty road, warm orange sky, anime stylized, no text, cel shading, 16:9`
3. **chat_night.jpg**：`Anime visual novel background, cozy bedroom at night, computer desk with monitor glow, moonlight through window, warm atmosphere, no text, cel shading, 16:9`
4. **first_date.jpg**：`Anime visual novel background, coffee shop street at dusk, city street, warm lights, anime stylized, no text, cel shading, 16:9`
5. **park.jpg**：`Anime visual novel background, spring park with cherry blossom path, pink petals, sunny day, anime stylized, no text, cel shading, 16:9`
6. **proposal.jpg**：`Anime visual novel background, night rooftop or hotel window view, city lights bokeh, warm romantic lighting, stars, no text, cel shading, 16:9`

### 6.2 立绘（1200×1600 竖版，`portrait_4_3`，透明背景需后期处理或用纯色背景占位）

> 注：GenerateImage 不保证透明 PNG。策略：生成时用纯深色背景，CSS 用 `mix-blend-mode: screen` 或 `multiply` 抠出。或生成半身像直接用方形背景作立绘展示。

**男主**（连帽衫青年，赛璐璐）：
1. `hero_neutral.png`：`Anime visual novel character sprite, young man in hoodie, neutral calm expression, half body, cel shading, clean lineart, soft coloring, simple background, no text`
2. `hero_smile.png`：`...same young man in hoodie, gentle smile expression...`
3. `hero_serious.png`：`...same young man in hoodie, serious determined expression...`

**女主**（二次元少女，赛璐璐）：
4. `heroine_normal.png`：`Anime visual novel character sprite, young woman, friendly normal expression, half body, cel shading, clean lineart, soft coloring, simple background, no text`
5. `heroine_laugh.png`：`...same young woman, laughing happy expression...`
6. `heroine_shy.png`：`...same young woman, shy blushing expression...`

### 6.3 小游戏图标（256×256，`square_hd`）

7. **player.png**：`Game icon, stylized hero character portrait, futuristic soldier, orange accent, cel shading, square, no text`
8. **healer.png**：`Game icon, stylized female healer portrait, cyan healing aura, cel shading, square, no text`
9. **enemy.png**：`Game icon, simple robot enemy unit, red eye, mechanical, cel shading, square, no text`

### 6.4 替换说明

生成后放入 `assets/images/` 对应目录。`storyData.js` 的 `images` 字段路径已对齐。用户后续可用真实照片替换 `photos/` 下文件名一致的占位。

---

## 七、资源加载与错误处理

### 7.1 图片加载
- 启动时预加载所有 `images` 引用的资源，`Image.onload` 计数。
- 单张 `onerror`：记录但不阻塞，该位置显示纯色占位（CSS 渐变 + 文件名）。
- 真实照片探测：`photos` 列表逐张 `Image()` 探测，失败的从蒙太奇 slides 中剔除（避免蒙太奇空帧）。

### 7.2 音频加载
- BGM 文件 404 时：`Audio.bgm` 静默跳过，不报错。
- SFX 缺失时：用 Web Audio 合成短音（点击=短促正弦、命中=白噪衰减、心跳=低频脉冲）。
- AudioContext 被浏览器阻塞：开始按钮 `onclick` 内 `audioCtx.resume()` 解锁。

### 7.3 浏览器兼容
- 目标：Chrome/Edge 最新版（投屏笔记本）。
- `backdrop-filter` 不支持时降级为更深的纯色底。
- Canvas 2D 全平台支持，无 WebGL 依赖。

---

## 八、执行序列（构建顺序）

每步完成后立即在浏览器验证，避免最后集成爆雷。

### 阶段 A：舞台与引擎骨架
1. **创建项目结构**：`index.html`、`css/style.css`、`js/{engine,minigame,audio,storyData}.js`、`assets/` 目录树。
2. **舞台与缩放**：`.stage` 1920×1080 + `fit()` 缩放函数 + resize 监听。
3. **开始界面**：标题 + "点击开始" 按钮 + 点击解锁 AudioContext。
4. **引擎核心**：`init/start/advance/jump`，指令派发，`scene/show/hide/say/jump` 五条指令跑通假数据。
5. **对话框与打字机**：`Dialogue.say`，打字机、点击补全、▼ 提示、名牌、旁白模式。
   - ✅ 验证：假数据从 start 跑到 duo_queue，对话框/立绘/背景切换正常。

### 阶段 B：交互系统
6. **选项菜单**：`Menu.show`，键盘操作，分支跳转与汇合。
7. **立绘系统完善**：三槽定位、呼吸动画、说话高亮、表情切换。
8. **转场特效**：`Effect.play` flash/shake/spotlight，Canvas 粒子层（樱花/光点）。
9. **音频系统**：`audio.js` BGM 淡入淡出、SFX、静音按钮、合成音效兜底。
   - ✅ 验证：完整跑通 start→branch 两条分支，特效/音频/立绘联动。

### 阶段 C：小游戏
10. **小游戏骨架**：`minigame.js` Canvas、游戏循环、玩家移动+射击。
11. **占点与敌人**：控制点进度、敌人 AI、碰撞、HUD。
12. **治疗与失败处理**：女主治疗光束、HP 归零复活、跳过按钮。
13. **接入引擎**：`call` 指令调起，结束后回到剧情。
    - ✅ 验证：gaming 章节小游戏可玩/可跳过/失败不卡关/结束后回到 say。

### 阶段 D：终局
14. **蒙太奇指令**：照片轮播 + Ken Burns + 字幕 + 真实照片探测回退。
15. **求婚终局**：自动播放时间线、戒指 CSS/SVG 动画、"我愿意/让我想想"按钮。
16. **拒绝彩蛋**：按钮逃跑 + 键盘拦截 + 温柔提示。
17. **接受爆发**：闪白 + 金色粒子 + "她说好！" + 结尾画面 + 樱花 + 重新开始。
    - ✅ 验证：montage→proposal→接受→结尾完整跑通，拒绝按钮不可选。

### 阶段 E：素材与配置
18. **Seedream 素材生成**：按第六节提示词生成 15 张，放入 `assets/`。
19. **storyData.js 配置化**：填入占位剧本（第二节），所有 `{{}}` 占位符。
20. **README.md**：占位符清单、照片尺寸建议、使用说明、替换指南。
    - ✅ 验证：真实素材路径下完整运行，无破图。

### 阶段 F：投屏实测
21. **1920×1080 投屏测试**：字号、安全区、输入方式（键鼠/触屏/翻页笔）、性能。
22. **离线测试**：断网双击 `index.html` 完整运行。
23. **U 盘拷贝测试**：文件夹整体拷贝到另一台机器即开即用。
    - ✅ 验证：第十三节全部验证步骤通过。

---

## 九、假设与决策（补充）

- **决策**：立绘透明背景问题——Seedream 不保证透明 PNG，采用方案：生成时统一深色背景，CSS `mix-blend-mode: screen` 抠出亮部；或接受方形立绘直接展示。执行时优先 mix-blend，效果不佳则降级为方形展示。
- **决策**：不实现存档/读档——求婚是一次性体验，无需保存进度。
- **决策**：不实现跳过已读——但提供小游戏跳过按钮和"按 Esc 跳过特效"快捷键（仅特效，不跳剧情）。
- **决策**：字体用系统字体栈（`"PingFang SC","Microsoft YaHei",sans-serif`），不内嵌字体文件，保证离线体积。
- **假设**：用户最终会替换 `{{}}` 占位文案为真实台词；占位文案通顺可演示但不替代真实情感。
- **假设**：用户能自行准备 6-10 张照片放入 `photos/`；不提供时蒙太奇自动跳过该 slide。

---

## 十、验证检查点（执行后逐项确认）

1. ☐ 双击 `index.html` 断网运行，从开始到"我愿意"结尾无报错。
2. ☐ `storyData.js` 改文案/路径不改引擎代码即可生效。
3. ☐ 未提供真实照片时，Seedream 占位素材完整呈现，蒙太奇无空帧。
4. ☐ 小游戏可玩、可跳过、HP 归零复活不卡关、结束后回剧情。
5. ☐ 求婚自动播放，"我愿意"有高潮反馈，"拒绝"是温柔彩蛋不可选。
6. ☐ 1920×1080 投屏字号清晰、UI 不贴边、动画流畅、无滚动条。
7. ☐ 文件夹拷贝到 U 盘，任意 Win/Mac + Chrome/Edge 即开即用。
8. ☐ 鼠标/键盘/触屏三种输入均可推进到"我愿意"。
9. ☐ 静音按钮生效，BGM 淡入淡出正常。
10. ☐ 浏览器控制台无红色错误。

---

## 十一、文件清单（执行后预期产物）

```
/workspace/
├── index.html
├── css/style.css
├── js/
│   ├── engine.js
│   ├── minigame.js
│   ├── audio.js
│   └── storyData.js
├── assets/
│   └── images/
│       ├── backgrounds/{ow_menu,ow_route66,chat_night,first_date,park,proposal}.jpg
│       ├── characters/{hero_neutral,hero_smile,hero_serious,heroine_normal,heroine_laugh,heroine_shy}.png
│       ├── minigame/{player,healer,enemy}.png
│       └── photos/  (用户后续放入)
├── README.md
└── galgame-proposal-webpage-plan.md  (原计划，保留)
```
