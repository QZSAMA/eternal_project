# Eternal 项目架构、代码与功能审查报告

## 摘要

本次审查以 `trae/agent-1maClB` 的提交 `781f1da801db29fb6d8718a26c4a98ceb0ac4ba2` 为原始基线，并在 2026-08-27 对当前修复工作树复审。项目是一个面向求婚现场的离线视觉小说：`index.html` 组织 1920×1080 舞台，`js/engine.js` 解释声明式剧情，`js/audio.js` 管理 BGM/SFX，`js/minigame.js` 提供 Three.js/WebGL 主渲染和 Canvas 2D/skip 降级，`js/storyData.js` 集中保存剧情和素材路径。

复审结论：P0-001/P0-002 已关闭。Three.js `r160` 已 vendored 到仓库，运行时没有 CDN；小游戏现在按 Three.js → Canvas 2D → skip 降级并始终回到主线。四个未交付 BGM 改为显式空值，不再产生音频请求或 404；配置校验、错误层、焦点样式、`aria-live` 与低动效支持已经加入。`npm test` 11/11、`npm run check` 均通过，两条主线、Three.js、2D 和 skip 模式已在本地 Chromium 验证；WebGL 使用临时 Canvas 探测，2D 指针坐标在舞台缩放后也能映射到内部 Canvas。当前仍未达到最终现场发布条件：触屏小游戏没有虚拟摇杆，角色素材仍是带背景/水印的 JPG，3D 物理仍与帧率耦合，legacy Three.js build 有一条弃用 warning。

### 修复复审状态

| 问题 | 当前状态 | 验证证据 |
|---|---|---|
| P0-001 外部 CDN | 已关闭 | `vendor/three-r160.min.js`，浏览器资源列表无外部 URL |
| P0-002 无 WebGL 降级 | 已关闭 | 强制 `mode="2d"` 可渲染；强制 `mode="skip"` 回到 `gaming[5]` |
| P1-003 BGM 404 | 已关闭（默认静默策略） | 四个 BGM 配置为空；两条 smoke 无音频请求/404 |
| P1-006 配置边界 | 部分关闭 | 真实姓名和小游戏配置已注入；仍有未使用的历史参数待清理 |
| P1-007 配置 fail-fast | 部分关闭 | 已有启动校验和错误层；资产存在性预检仍需扩展 |
| UI 焦点/公告/低动效 | 部分关闭 | 已加入 `:focus-visible`、`aria-live`、`prefers-reduced-motion`；触屏等价玩法未完成 |

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
  ├─ vendor/three-r160.min.js（本地锁定）
  └─ classic scripts
       ├─ storyData.js  ── CONFIG（剧情、姓名、资源、小游戏参数）
       ├─ configValidation.js ── 配置/引用校验
       ├─ minigameMode.js ── Three.js/2D/skip 选择
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
| BGM | opening/game/date/proposal 默认为空 | README 明确“可选、默认静默” | 无缺失文件请求；合成 SFX 可用 |
| 运行时 | 本地 Three.js `r160` + Canvas 2D/skip | README 与计划已同步为混合渲染链路 | 离线约束已恢复 |

### 2.4 文档与实现漂移

原基线的 README/计划曾宣称“纯原生 JS + Canvas，零外部依赖”，而实现从 CDN 引入 Three.js。当前 `README.md`、根目录实现计划、路线图和项目记忆已统一为“本地 Three.js 主渲染 + Canvas 2D/skip 降级”；`.trae/documents/galgame-proposal-complete-implementation.md` 仍是历史生成文档，不再作为单一事实源。后续维护以 `docs/project-memory.md` 与 ADR 为准。

## 3. 功能审查

### 3.1 关键路径结果

| 场景 | 结果 | 证据/说明 |
|---|---|---|
| 开始页与首句 | 通过（在线） | `#startBtn` 解锁音频并进入 `waiting_input` |
| 分支菜单 | 通过（在线） | 2 个按钮显示；Engine 支持上下箭头与回车 |
| `gaming` 小游戏入口 | 通过 | WebGL 可用时进入本地 Three.js；不可用时进入 2D 或 skip |
| 小游戏跳过 | 条件通过 | 跳过后仍执行约 5.6 秒结束/揭示时间线，再回到剧情 |
| `first_date → montage` | 通过（在线） | 四张照片按序轮播，结束后进入 proposal |
| 求婚自动播放 | 通过（在线） | 戒指、文案、按钮按定时器出现，接受按钮获得焦点 |
| 接受 → 结尾 | 通过（在线） | `Engine.state=ended`，`.layer-ending.is-show` 出现 |
| 静音按钮 | 通过 | `GameAudio.muted` 与按钮文本/类名同步 |
| 拒绝按钮彩蛋 | 通过 | hover/click/focus 会移动按钮并显示提示，不会离开主线 |
| 无网络小游戏 | 通过 | 运行时无外部 URL；Three.js、2D、skip 均能继续主线 |
| BGM | 通过（默认静默） | 空配置不发起请求；SFX 合成仍可工作 |
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
| P0-001 | P0（已关闭） | `index.html`、`vendor/three-r160.min.js` | 原基线离线时主线会崩溃 | 已 vendored；保留版本哈希与离线 smoke |
| P0-002 | P0（已关闭） | `js/minigameMode.js`、`js/minigame.js` | 原基线 WebGL 不可用时会卡死 | 已实现 2D/skip；保持模式测试和浏览器 smoke |
| P1-003 | P1（已关闭） | `storyData.js:22-30`、`js/audio.js` | 原基线四个 BGM 404 | 默认空值；交付真实 BGM 时做授权和资源验收 |
| P1-004 | P1 | `assets/images/characters/*`、`storyData.js:51-61` | JPG 非透明且带 AI 水印，角色矩形背景破坏合成和可信度 | 交付透明 PNG/WebP，去水印并做版权/隐私验收 |
| P1-005 | P1 | `README.md:125`、`minigame.js:262-315` | 触屏用户无法移动/瞄准，文档承诺与行为不符 | Pointer Events + 虚拟摇杆/触控瞄准，保留键盘等价路径 |
| P1-006 | P1 | `minigame.js:636-649`、`engine.js:105-113` | 真名、小游戏配置和部分参数硬编码/未使用，定制需改引擎 | 所有个人信息和子游戏配置从 `CONFIG` 注入，增加契约测试 |
| P1-007 | P1 | `engine.js:118-145`、`153-169` | 未知 label/指令/背景静默结束或激活破图，内容编辑易现场爆雷 | 启动校验 schema；错误层显示恢复动作，禁止静默跳过 |
| P1-008 | P1 | `minigame.js:341-369`、`407-543` | 物理与帧率耦合，低性能设备难度和碰撞时序不稳定 | 所有速度按秒定义并乘 `dt`；用固定步长或插值测试 |
| P2-009 | P2 | `minigame.js:193-219`、`324-334` | 纹理/材质和粒子对象生命周期复杂，重复启动可能造成 GPU 压力 | 资源缓存、对象池、统一 dispose；避免每次命中创建大量网格 |
| P2-010 | P2 | `engine.js:180-185`、`233`、`minigame.js:643` | `innerHTML` 拼接路径/个人信息，难以保证转义和可测试性 | 使用 DOM API + `textContent`；资源路径白名单化 |
| P2-011 | P2 | `css/style.css:335-345`、`index.html:75` | 小游戏提示与血条/计时器重叠，现场可读性下降 | 将提示放入独立 HUD 区，按 16:9 和窄屏截图验收 |

### 4.2 P0-001：外部 CDN 破坏离线主线

**原基线复现（已修复）**：浏览器加载本地站点时拦截 `https://unpkg.com/**`，开始页仍能显示；调用 `Engine.callMinigame` 后 `typeof THREE` 为 `undefined`，`new THREE.WebGLRenderer` 抛出 `ReferenceError`。

**影响**：求婚现场最不应依赖临时网络。即使入口和前半段剧情能播放，用户在分支进入小游戏时才会遇到不可恢复的异常；由于没有错误层，现场只会看到小游戏层或黑屏。远程 CDN 还带来版本供应链和缓存不确定性。

**修复与验证**：已采用“本地锁定 Three.js + 2D/skip”方案。`vendor/three-r160.min.js` SHA-256 为 `170c6789f43217c96b3170f4b42fafe135de7f7cd48497a4218f9757ee1d49fa`；模式选择有 Node 回归测试，浏览器实测 Three.js 和 2D 均可进入、skip 后主线继续。

### 4.3 P1-003：音频资源契约未闭合

原基线的 `storyData.js` 引用四个未提交 MP3，曾产生四个 404。当前四个 BGM 值为空，`GameAudio.bgm` 对空值直接返回，因此默认静默演示没有音频请求；真实音乐仍是可选交付物。

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

## 5. Web Interface Guidelines 审查（含复审状态）

### 5.1 可访问性与语义

| 位置 | 发现 | 严重度 | 建议 |
|---|---|---|---|
| `index.html` viewport | 已移除 `user-scalable=no` | 已关闭 | 保持用户缩放能力 |
| `index.html:15-16` | 背景 `<img>` 的 `alt` 为空；若被视为内容则缺少描述 | P2 | 明确装饰语义 `aria-hidden`，由剧情文本承担叙事 |
| 小游戏 Canvas/HUD | 已有目标 `aria-label` 和结果 `role="status"`，但没有完整触屏等价玩法 | P1（部分关闭） | 完成虚拟摇杆/触控瞄准与状态公告 |
| 对话区域 | 已加入 `role="log"`、`aria-live="polite"`、`aria-atomic` | 已关闭 | 浏览器/屏幕阅读器实机复核播报节奏 |
| 选项面板 | 已加入 dialog/heading 语义；打开时尚未主动聚焦首项 | P1（部分关闭） | 补菜单焦点进入/退出和当前项公告 |
| 求婚接受按钮 | 已移除静态 `autofocus`，运行时按阶段聚焦 | 已关闭 | 保留焦点回退策略 |
| `engine.js:180-185`、`:233` | 动态角色图片 `alt=""` 且无显式尺寸 | P1 | 角色名/表情生成可读 alt，声明尺寸并处理失败占位 |
| `engine.js:304-307` | 菜单使用按钮是正确方向，但未设置焦点/选中公告 | P1 | 打开菜单时聚焦第一项，键盘选择用 `aria-selected` 或 live 状态 |

### 5.2 焦点、动画与触控

| 位置 | 发现 | 严重度 | 建议 |
|---|---|---|---|
| 全部按钮 | 已加入高对比 `:focus-visible` | 已关闭 | 实机检查投屏对比度 |
| CSS 过渡 | 已移除 `transition: all` | 已关闭 | 新增规则继续列出具体属性 |
| 循环动画 | 已加入统一 `prefers-reduced-motion: reduce` | 已关闭（代码） | 低动效系统设置下做视觉复核 |
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
| 本地 Three.js 文件缺失/损坏 | 5 | 2 | 4 | P1（有 2D/skip） |
| WebGL 驱动不可用 | 2 | 3 | 5 | P2（自动 2D/skip） |
| BGM 缺失/404 | 1 | 1 | 5 | 已关闭（默认空值） |
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

可靠性 P0 已完成：运行时自包含，WebGL 失败有 2D/skip，默认 BGM 不再制造 404，配置错误可见，TDD 和浏览器 smoke 已成为门禁。下一阶段应优先完成触屏等价玩法、按 `dt` 重构物理、替换合规透明角色素材和资产 manifest；之后再扩展新章节或视觉效果。当前工作树可进入真实设备彩排，但在这些 P1 完成且真实内容/音频授权验收前不应标记为现场发布版。

## 9. 参考资料

[1] QZSAMA. eternal_project[EB/OL]. https://github.com/QZSAMA/eternal_project/tree/trae/agent-1maClB, 2026-08-27.

[2] Vercel Labs. Web Interface Guidelines[EB/OL]. https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md, 2026-08-27.

[3] QZSAMA. eternal_project, commit 781f1da801db29fb6d8718a26c4a98ceb0ac4ba2[EB/OL]. https://github.com/QZSAMA/eternal_project/commit/781f1da801db29fb6d8718a26c4a98ceb0ac4ba2, 2026-08-27.
