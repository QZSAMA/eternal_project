# Eternal 项目架构、代码与功能审查报告

## 摘要

本次审查针对 `trae/agent-1maClB` 的提交 `781f1da801db29fb6d8718a26c4a98ceb0ac4ba2`。项目是一个面向求婚现场的离线视觉小说原型：`index.html` 组织 1920×1080 舞台，`js/engine.js` 解释声明式剧情，`js/audio.js` 管理 BGM/SFX，`js/minigame.js` 使用 Three.js/WebGL 实现小游戏，`js/storyData.js` 集中保存剧情和素材路径。

结论是：主线在“网络可用、WebGL 可用、只使用鼠标/键盘”的 Chromium 环境中可以演示，但还没有达到 README 所承诺的“自包含、无需联网、触屏可玩、零控制台错误”的现场发布标准。最关键的阻断项是入口在 `index.html:135` 依赖外部 Three.js CDN；在断网时小游戏启动会在 `js/minigame.js:88` 抛出 `ReferenceError: THREE is not defined`。此外，四个 BGM 文件没有提交而被配置引用，角色素材是带背景和 AI 水印的 JPG，触屏小游戏没有虚拟摇杆，计划/README 仍描述 Canvas 2D，均说明实现与产品规格已经发生漂移。

本报告将问题分为 P0（阻断发布）、P1（下一迭代必须处理）和 P2（维护窗口处理），并把每项风险映射到可复现步骤、文件行号、修复建议和验证门禁。配套的 `docs/project-memory.md`、`docs/review-rules.md`、根目录 `AGENTS.md` 和路线图用于持续记忆与后续协作。

## 1. 审查范围与方法

### 1.1 范围

| 维度 | 覆盖内容 |
|---|---|
| 架构 | 入口、脚本加载顺序、状态机、模块边界、数据流、资产分发 |
| 内容 | 故事标签、角色/场景/照片、姓名与日期配置、README/计划一致性 |
| 功能 | 开始页、两条分支、小游戏、跳过、蒙太奇、求婚接受、结尾重启 |
| 质量 | JavaScript 语法、资源响应、异常日志、WebGL/离线降级、性能风险 |
| 界面 | Vercel Web Interface Guidelines：语义化、焦点、动画、触控、图片、可访问性 |

### 1.2 证据方法

- 读取源码、`README.md`、`galgame-proposal-webpage-plan.md`、`.trae/documents/galgame-proposal-complete-implementation.md`。
- 统计文件与资产：8 个核心文本文件、21 个图片资产，总图片体积约 8.14 MB；仓库没有 `package.json` 和测试目录。
- 运行 `node --check` 检查 4 个 JavaScript 文件，结果全部通过。
- 通过 Playwright + 本地静态服务器验证开始页、两条剧情路径、小游戏入口、跳过、求婚接受和结尾状态。
- 通过拦截 `https://unpkg.com/**` 模拟断网，验证外部运行时依赖的失败方式。
- 依据 2026-08-27 拉取的 Web Interface Guidelines 逐文件检查 UI。

### 1.3 评级定义

| 等级 | 定义 | 发布要求 |
|---|---|---|
| P0 | 核心承诺失效、现场可能卡死或无法启动 | 修复并有回归测试后才能发布 |
| P1 | 主要体验/可维护性缺陷，存在明确规避方式 | 进入下一迭代并有负责人/验收标准 |
| P2 | 低风险体验、性能或代码卫生问题 | 纳入维护窗口，不阻断当前演示 |

## 2. 产品与内容架构

### 2.1 运行时拓扑

```text
index.html
  ├─ CSS 舞台与层级（背景/立绘/对话/菜单/特效/小游戏/求婚/结尾）
  ├─ Three.js CDN（运行时外部依赖）
  └─ classic scripts
       ├─ storyData.js  ── CONFIG（剧情、姓名、资源、小游戏参数）
       ├─ audio.js      ── GameAudio（Audio 元素 + Web Audio 合成）
       ├─ minigame.js   ── Minigame（Three.js 场景与输入）
       └─ engine.js     ── Engine（label/pc 状态机与 DOM 调度）
```

`Engine` 是全局单例，使用 `state`、`label`、`pc` 三元组解释 `CONFIG.story`。它把同步指令（`scene/show/hide/bgm/sfx/effect/jump`）直接推进，把 `say/menu/call/wait/montage/proposal` 转成阻塞状态。子系统依赖全局 `CONFIG`、`GameAudio`、`Minigame` 和 DOM id，没有模块导入或类型契约。

### 2.2 剧情状态机

```text
idle --点击开始--> playing
playing --say--> waiting_input --点击/键盘--> playing
playing --menu--> waiting_choice --上下/回车/点击--> playing
playing --call--> in_minigame --onEnd--> playing
playing --montage--> in_montage --自动结束--> playing
playing --proposal--> in_proposal --我愿意--> ended
playing --脚本末尾--> ended
```

当前主线标签为：`start → group_night → branch → gaming | first_date → from_game_to_real → montage → proposal`。两条分支最终汇合，符合求婚现场“不能因选择失去主线”的产品目标。

### 2.3 内容和资产现状

| 内容层 | 代码事实 | 规格/文档事实 | 评估 |
|---|---|---|---|
| 场景 | 6 个 2560×1440 JPG，路径均存在 | 计划要求 1920×1080 背景 | 可用，但需统一交付尺寸/压缩策略 |
| 角色 | 6 个 1680×2240 RGB JPG，带纯色背景和“AI生成”水印 | README/计划描述透明 PNG 立绘 | 视觉小说层级效果不达标 |
| 小游戏图标 | 5 个 JPG 路径存在 | 计划要求 player/healer/enemy 图标 | 当前 3D 实体没有使用这 3 个图标 |
| 照片 | 4 个 2240×1680 JPG，启动时异步探测 | README 允许用户替换同名照片 | 可用，但缺少预加载完成信号 |
| BGM | 配置了 opening/game/date/proposal 四个 MP3 路径 | README 称“可选” | 目录不存在，运行产生 404；只能靠静音降级 |
| 运行时 | Three.js `0.160.0` 外链 | README/计划声称零外部依赖、Canvas 2D | 规格已漂移，离线承诺失效 |

### 2.4 文档与实现漂移

`README.md:3` 宣称“自包含、离线运行、无需联网”，`README.md:150` 又宣称“纯原生 JS + Canvas，零外部依赖”；而 `index.html:135` 引入 Three.js CDN，`js/minigame.js:2-10` 明确要求全局 `THREE`。`.trae/documents/galgame-proposal-complete-implementation.md` 仍以 Canvas 2D、玩家血量、占点进度和虚拟治疗为实现依据，但当前代码已经改成 Three.js、围绕小美血量和反向球机制运行。这样会让后续维护者依据错误规格继续改动，风险高于单个 bug。

## 3. 功能审查

### 3.1 关键路径结果

| 场景 | 结果 | 证据/说明 |
|---|---|---|
| 开始页与首句 | 通过（在线） | `#startBtn` 解锁音频并进入 `waiting_input` |
| 分支菜单 | 通过（在线） | 2 个按钮显示；Engine 支持上下箭头与回车 |
| `gaming` 小游戏入口 | 条件通过 | 网络可用且 WebGL 可用时进入 `in_minigame` |
| 小游戏跳过 | 条件通过 | 跳过后仍执行约 5.6 秒结束/揭示时间线，再回到剧情 |
| `first_date → montage` | 通过（在线） | 四张照片按序轮播，结束后进入 proposal |
| 求婚自动播放 | 通过（在线） | 戒指、文案、按钮按定时器出现，接受按钮获得焦点 |
| 接受 → 结尾 | 通过（在线） | `Engine.state=ended`，`.layer-ending.is-show` 出现 |
| 静音按钮 | 通过 | `GameAudio.muted` 与按钮文本/类名同步 |
| 拒绝按钮彩蛋 | 通过 | hover/click/focus 会移动按钮并显示提示，不会离开主线 |
| 无网络小游戏 | 不通过 | 拦截 CDN 后 `THREE` 未定义，`js/minigame.js:88` 抛异常 |
| BGM | 降级 | 四个 MP3 请求均 404；SFX 合成仍可工作 |
| 触屏小游戏 | 不通过 | README `125` 声称“虚拟摇杆”，代码只有剧情 `touchstart`，没有移动/瞄准控件 |

### 3.2 小游戏机制审查

小游戏的核心设计是“黄球向前飞，按 E 反向后奶到身后的小美”。实现中 `meiDistance` 从像素换算为 3D 单位（`js/minigame.js:380-386`），敌人向小美移动（`494-514`），黄球命中小美后增加 `healCount`（`451-463`）。该机制在演示中可以成立，但与旧计划的“占点进度、玩家 HP、女主治疗光束”不是同一个游戏。

当前游戏没有真正的玩家 HP：`CONFIG.minigame.playerHP` 在 `storyData.js:80` 定义却没有读取；小美碰撞伤害使用 `Math.max(1, ...)`（`minigame.js:506-508`），因此永远不会归零，也不会触发计划中的“HP 归零复活”路径。移动、敌人、球体速度按帧累加（`minigame.js:364-369`、`410-413`、`499-501`），虽然 `dt` 被计算，实际物理没有乘以 `dt`，低帧率设备上的难度和时长会改变。

### 3.3 异常与恢复

`Engine._scene` 在图片错误时仍执行 `swap`（`engine.js:163-168`），会把破图层激活；`_photoPath` 对未知 key 返回空字符串（`417-422`），蒙太奇可能显示空帧；`_exec` 对未知指令直接跳过（`127-145`），脚本拼写错误不会被发现；脚本不存在或走到末尾只调用 `_end`（`118-121`、`148-150`），没有用户可见诊断。这些策略适合一次性原型，但不适合用户自行编辑故事后仍要求现场可靠。

## 4. 代码审查发现

### 4.1 发现总表

| ID | 等级 | 位置 | 影响 | 建议 |
|---|---|---|---|---|
| P0-001 | P0 | `index.html:135`、`minigame.js:88` | 离线/被拦截网络时小游戏崩溃，主线无法继续 | vendored Three.js 或回退 Canvas 2D，并在启动时做依赖探测 |
| P0-002 | P0 | `minigame.js:88-90` | WebGL 不可用时没有降级；现场 GPU/驱动差异会卡死 | 提供 2D 兼容实现或“跳过小游戏”兜底，并记录诊断 |
| P1-003 | P1 | `storyData.js:22-28`、`assets/` | 四个 BGM 404，控制台有红色错误，现场无音乐 | 提交可授权音频或移除空引用；预检 manifest，缺失只报告一次 |
| P1-004 | P1 | `assets/images/characters/*`、`storyData.js:51-61` | JPG 非透明且带 AI 水印，角色矩形背景破坏合成和可信度 | 交付透明 PNG/WebP，去水印并做版权/隐私验收 |
| P1-005 | P1 | `README.md:125`、`minigame.js:262-315` | 触屏用户无法移动/瞄准，文档承诺与行为不符 | Pointer Events + 虚拟摇杆/触控瞄准，保留键盘等价路径 |
| P1-006 | P1 | `minigame.js:636-649`、`engine.js:105-113` | 真名、小游戏配置和部分参数硬编码/未使用，定制需改引擎 | 所有个人信息和子游戏配置从 `CONFIG` 注入，增加契约测试 |
| P1-007 | P1 | `engine.js:118-145`、`153-169` | 未知 label/指令/背景静默结束或激活破图，内容编辑易现场爆雷 | 启动校验 schema；错误层显示恢复动作，禁止静默跳过 |
| P1-008 | P1 | `minigame.js:341-369`、`407-543` | 物理与帧率耦合，低性能设备难度和碰撞时序不稳定 | 所有速度按秒定义并乘 `dt`；用固定步长或插值测试 |
| P2-009 | P2 | `minigame.js:193-219`、`324-334` | 纹理/材质和粒子对象生命周期复杂，重复启动可能造成 GPU 压力 | 资源缓存、对象池、统一 dispose；避免每次命中创建大量网格 |
| P2-010 | P2 | `engine.js:180-185`、`233`、`minigame.js:643` | `innerHTML` 拼接路径/个人信息，难以保证转义和可测试性 | 使用 DOM API + `textContent`；资源路径白名单化 |
| P2-011 | P2 | `css/style.css:335-345`、`index.html:75` | 小游戏提示与血条/计时器重叠，现场可读性下降 | 将提示放入独立 HUD 区，按 16:9 和窄屏截图验收 |

### 4.2 P0-001：外部 CDN 破坏离线主线

**复现**：浏览器加载本地站点时拦截 `https://unpkg.com/**`，开始页仍能显示；调用 `Engine.callMinigame` 后 `typeof THREE` 为 `undefined`，`new THREE.WebGLRenderer` 在 `minigame.js:88` 抛出 `ReferenceError`。这是直接违反 `README.md:3` 和计划中的离线约束。

**影响**：求婚现场最不应依赖临时网络。即使入口和前半段剧情能播放，用户在分支进入小游戏时才会遇到不可恢复的异常；由于没有错误层，现场只会看到小游戏层或黑屏。远程 CDN 还带来版本供应链和缓存不确定性。

**修复与验证**：优先把锁定版本的 Three.js 放进仓库并加完整性哈希，同时保留渲染器创建失败的 2D/跳过路径；更稳妥的方案是把小游戏重写为纯 Canvas 2D，运行时完全无第三方依赖。测试必须在断网/拦截 CDN 两种条件下从 `gaming` 走到 proposal。

### 4.3 P1-003：音频资源契约未闭合

`storyData.js:24-27` 引用四个 MP3，但 `assets/audio/` 目录不存在。Playwright 网络记录得到 `opening.mp3`、`game.mp3`、`date.mp3`、`proposal.mp3` 的 404。`audio.js:94-96` 会吞掉播放失败，因此剧情不阻塞，但控制台红错、音乐体验缺失，且用户无法知道是“未提供音乐”还是“浏览器被阻止”。

建议把“可选 BGM”建模为显式空值或本地占位音频，启动时生成资源报告而不是让每个场景重复请求 404；若交付真实 BGM，必须记录授权来源和格式/响度验收。验收标准应区分“音频未提供的静默演示”和“已配置音频的零 404 发布包”。

### 4.4 P1-004：角色素材不符合渲染契约

代码用 `<img class="char-img">` 直接放入角色槽（`engine.js:180-185`），CSS 只做 `object-fit:contain` 和滤镜。仓库中的角色文件是 RGB JPG，而不是计划描述的透明 PNG；视觉检查可见整块蓝色背景及“AI生成”水印。这样会让角色像一张海报覆盖背景，而不是视觉小说立绘，还可能在求婚场景暴露生成水印，损害私密体验。

修复应包含素材重新导出、去水印/版权确认、主体安全区与透明边缘检查；不要用 `mix-blend-mode` 把水印或背景“抹掉”作为最终方案。资源校验应检查 MIME、尺寸、透明通道（若要求）和水印人工复核。

### 4.5 P1-006：配置化边界被硬编码穿透

`storyData.js:16-17` 定义 `realHeroName/realHeroineName`，但 `minigame.js:645-646` 直接写入“赵启志/朱盈畅”；`Engine.callMinigame(cfg, onEnd)` 接收参数却始终把 `this.data.minigame` 传给 `Minigame.start`（`engine.js:105-113`），无法支持多个小游戏配置；`playerHP`、`meiR`、`orbR` 等字段定义但未使用。结果是 README 所称“只修改 storyData.js”并不完全成立。

修复时应把 `realHeroName`、`realHeroineName` 传入 reveal 函数，使用 `textContent` 组装；为 `call` 指令定义 `games` 字典或明确只允许 default；删除死参数或在测试覆盖后实现其语义。配置 schema 测试要验证每个引用均可解析、每个必需字段有默认值。

### 4.6 P1-007：脚本错误没有 fail-fast

`_exec` 通过 `Object.keys(inst)[0]` 取得指令名，未知指令走 `default` 并继续；`_scene` 直接索引背景路径，图片错误仍把层设为 active；`_end` 只改状态不显示错误。故事内容是项目最常被定制的部分，这种静默策略会把拼写错误转化为“剧情突然结束”或“黑屏”。

建议在 `DOMContentLoaded` 后运行 `validateConfig`：检查 meta、背景/角色表达式、照片 key、BGM key、所有 jump/call 目标和指令字段；开发模式抛出可定位错误，生产模式显示“资源缺失/返回开始/跳过本章”诊断。为每个指令写最小 schema 测试，保证错误在交付前暴露。

### 4.7 P1-008：小游戏物理与帧率耦合

`loop` 计算了 `dt` 并把它传给 `_update`（`minigame.js:341-352`），但移动、球体、敌人和旋转都使用每帧固定增量，只有计时器使用真实时间。这会导致 30 FPS 下移动和碰撞速度约为 60 FPS 的一半，GPU 抖动时敌人更容易靠近或球体错过小美。对一次性现场互动来说，设备差异应降低难度而不是改变规则。

建议定义世界单位/秒，统一使用 `const seconds = dt / 1000`；对碰撞使用固定时间步长（例如 60 Hz）并在渲染帧之间插值。通过注入时钟和随机数源，测试“同一输入序列在不同帧率下获得相同结果”，再用真实设备做性能预算。

## 5. Web Interface Guidelines 审查

### 5.1 可访问性与语义

| 位置 | 发现 | 严重度 | 建议 |
|---|---|---|---|
| `index.html:5` | `user-scalable=no` 禁止缩放 | P1 | 移除，使用舞台缩放而不是禁止用户放大 |
| `index.html:15-16` | 背景 `<img>` 的 `alt` 为空；若被视为内容则缺少描述 | P2 | 明确装饰语义 `aria-hidden`，由剧情文本承担叙事 |
| `index.html:27`、`:66` | Canvas 没有文本替代或状态公告 | P1 | 提供游戏目标、状态、结果的可读 DOM 与键盘路径 |
| `index.html:31-34` | 对话文本动态更新但没有 `aria-live` | P1 | 为对话区提供 `role="log"`/`aria-live="polite"`，避免打字机逐字过度播报 |
| `index.html:39-43` | 选项面板缺少 dialog/listbox 语义和当前选项公告 | P1 | 使用语义按钮、`aria-activedescendant` 或明确选中状态 |
| `index.html:105` | `autofocus` 会在求婚阶段强制夺焦点 | P2 | 仅在确认用户已进入 proposal 且提供焦点回退时使用 |
| `engine.js:180-185`、`:233` | 动态角色图片 `alt=""` 且无显式尺寸 | P1 | 角色名/表情生成可读 alt，声明尺寸并处理失败占位 |
| `engine.js:304-307` | 菜单使用按钮是正确方向，但未设置焦点/选中公告 | P1 | 打开菜单时聚焦第一项，键盘选择用 `aria-selected` 或 live 状态 |

### 5.2 焦点、动画与触控

| 位置 | 发现 | 严重度 | 建议 |
|---|---|---|---|
| `css/style.css` 全文 | 没有 `:focus-visible` 规则；不能依赖浏览器默认焦点 | P1 | 为开始、静音、跳过、选项、接受/拒绝按钮提供高对比焦点环 |
| `css/style.css:171,219,400` | 使用 `transition: all` | P2 | 只列出 `opacity/transform/background-color/border-color` 等实际属性 |
| `css/style.css:60,232` | Ken Burns 8 秒循环无暂停且无 reduced-motion | P1 | `prefers-reduced-motion: reduce` 下静止，必要时提供暂停 |
| `css/style.css:84,360,368,391,472` | 呼吸、戒指、光晕、按钮脉冲等循环动画没有 reduced-motion 变体 | P1 | 统一关闭/降频，保证求婚现场可控 |
| `index.html:74-75`、`minigame.js:262-315` | 小游戏只实现鼠标/键盘，未提供触屏等价操作 | P1 | Pointer Events + 虚拟摇杆；`touch-action: manipulation` |
| `engine.js:520-526` | 触屏推进仅监听 `touchstart`，可能与滚动/合成 click 产生重复语义 | P2 | 统一 Pointer Events 并加入去重和可见提示 |

### 5.3 图片、性能与内容

- 背景和角色虽为绝对定位，仍应声明宽高或使用资源 manifest，避免加载期间出现不可预测布局；动态 `<img>` 没有 `loading` 策略。
- 8.14 MB 图片全部为高分辨率 JPG，角色和小游戏贴图存在“配置但未使用”的下载/维护成本；建议建立 WebP/AVIF 派生图和首屏预加载清单。
- `body`/`stage` 全屏固定布局适合投屏，但在竖屏或低分辨率设备上会把 1920×1080 缩得很小；应显示方向提示而不是只依赖黑边。
- 对话、菜单和结果是异步状态更新，却没有公告区域；屏幕阅读器用户无法获知“正在输入”“小游戏胜利”或“她说好”。

## 6. 风险矩阵与质量门槛

### 6.1 风险矩阵

| 风险 | 影响 | 发生概率 | 当前可探测性 | 综合等级 |
|---|---:|---:|---:|---|
| CDN/Three.js 离线失败 | 5 | 5 | 3 | P0 |
| WebGL 驱动不可用 | 5 | 3 | 2 | P0 |
| BGM 缺失/404 | 3 | 5 | 4 | P1 |
| 角色水印/矩形背景 | 4 | 5 | 4 | P1 |
| 触屏小游戏不可玩 | 4 | 3 | 3 | P1 |
| 配置/脚本拼写错误静默结束 | 4 | 4 | 1 | P1 |
| 帧率导致游戏规则改变 | 3 | 3 | 2 | P1 |
| 循环动画无法降低动效 | 2 | 4 | 2 | P1 |
| 粒子/纹理生命周期泄漏 | 2 | 2 | 2 | P2 |

### 6.2 发布前必须满足的门禁

1. 无网络且拦截所有外链时，两个剧情分支都能从开始页走到结尾。
2. 控制台无 `ReferenceError`、未处理 Promise 拒绝和资源 404；可选媒体缺失只产生一次明确诊断。
3. 小游戏具备 WebGL 失败时的 2D/跳过兜底，`Esc`/按钮跳过不阻塞主线。
4. `storyData.js` 修改姓名、日期、台词、照片和 BGM 后无需改渲染器代码。
5. 键盘、鼠标、触屏均有等价路径；焦点可见，动效可按系统偏好降低。
6. 每个 P0/P1 修复都有先失败后通过的测试或可复现 smoke 记录。

## 7. 持续记忆与规则系统

本次新增的治理层不是一次性报告，而是后续工作的入口：

| 文件 | 作用 | 更新时机 |
|---|---|---|
| `AGENTS.md` | 让贡献者/智能代理先读项目记忆和发布门禁 | 每次规则改变时 |
| `docs/project-memory.md` | 单一事实源：基线提交、模块地图、状态机、风险、决策和触发器 | 架构/资产/输入/发布改变时 |
| `docs/review-rules.md` | P0/P1/P2 分级、配置边界、UI、TDD、发布检查命令 | 发现新类别问题时 |
| `docs/reviews/*.md` | 带日期的证据和问题 ID，修复后保留回归链接 | 每轮审查/发布前 |
| `docs/plans/*.md` | 经过优先级排序的实施与新功能计划 | 立项、范围或依赖改变时 |
| `docs/superpowers/specs/*.md` | 重大设计的目标、边界、错误处理和验收标准 | 进入实现前 |

推荐的记忆更新循环是“代码/资产变更 → 运行 smoke → 更新 memory/ADR → 关闭 review issue → 再发布”。任何新增 CDN、脚本指令、故事 label、媒体格式或输入方式都自动触发一次审查，而不是等到求婚现场再发现漂移。

## 8. 结论

Eternal 已经具备一个清晰、可演示的叙事原型：声明式故事数据降低了文案修改成本，Engine 的状态机使两条分支能够安全汇合，求婚接受和拒绝彩蛋提供了完整情绪闭环。在线 Chromium 环境的关键路径实测通过，说明问题不是“无法工作”，而是“尚未达到承诺的交付条件”。

当前最重要的判断是可靠性优先于视觉增量。把 Three.js 运行时自包含或实现 2D 降级、补齐资源预检和故障可见性后，项目才有资格进入现场测试；在此之前继续添加动画、章节或新素材会放大验证成本。第二优先级是收敛规格：以实际 Three.js 机制为准更新 README/计划，或反向把实现拉回 Canvas 2D，不能保留两套互相矛盾的产品事实。第三优先级是建立 TDD 与浏览器 smoke 门禁，使每次内容定制都能证明两条主线、跳过路径和接受结尾仍然可达。

## 9. 参考资料

[1] QZSAMA. eternal_project[EB/OL]. https://github.com/QZSAMA/eternal_project/tree/trae/agent-1maClB, 2026-08-27.

[2] Vercel Labs. Web Interface Guidelines[EB/OL]. https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md, 2026-08-27.

[3] QZSAMA. eternal_project, commit 781f1da801db29fb6d8718a26c4a98ceb0ac4ba2[EB/OL]. https://github.com/QZSAMA/eternal_project/commit/781f1da801db29fb6d8718a26c4a98ceb0ac4ba2, 2026-08-27.

