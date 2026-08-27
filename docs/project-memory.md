# Eternal 项目记忆（单一事实源）

> 维护规则：每次改变运行时依赖、脚本指令、资产格式、输入方式或发布流程时更新本文件，并在 `docs/decisions/` 增加一条决策记录。审查结论以带日期的 `docs/reviews/` 为准。

## 当前基线

| 项目 | 值 |
|---|---|
| 仓库 | `https://github.com/QZSAMA/eternal_project.git` |
| 审查分支 | `trae/agent-1maClB` |
| 基线提交 | `781f1da801db29fb6d8718a26c4a98ceb0ac4ba2` |
| 运行方式 | 静态文件；发布前用 `python -m http.server 4173` 预览并做断网 smoke；`file://` 仅作便利入口 |
| 运行时依赖 | 原生 JS/Web Audio/Canvas + 本地 `vendor/three-r160.min.js`；无运行时网络依赖 |
| 测试现状 | Node 内置测试基座；`npm test` 11/11 通过，`npm run check` 通过；两条浏览器主线已 smoke |
| 资产现状 | 21 个图片文件，约 8.14 MB；BGM 默认显式空值，静默运行且不发起音频请求 |
| 主要风险 | 触屏小游戏无虚拟摇杆；3D 帧率耦合；角色 JPG 带背景/水印；Three.js classic build 有弃用警告 |

## 产品意图

离线求婚视觉小说：以两人从线上游戏相识、走到现实、最终求婚为主线；中段插入“逆转的奶”小游戏；接受后展示结尾画面。关键成功条件是现场可靠、不能因游戏难度或设备能力卡住。

## 模块地图

| 模块 | 文件 | 责任 | 对外依赖 |
|---|---|---|---|
| 入口/布局 | `index.html` | DOM 层级、脚本加载、固定舞台、本地脚本顺序 | 本地 Three.js、浏览器 API |
| 剧情引擎 | `js/engine.js` | label/pc 状态机、指令解释、输入路由、场景和求婚 UI | `CONFIG`、`GameAudio`、`Minigame` |
| 剧情数据 | `js/storyData.js` | 元数据、资源路径、指令数组、小游戏参数 | 无 |
| 音频 | `js/audio.js` | BGM 淡入淡出、SFX、Web Audio 合成兜底 | Audio/AudioContext |
| 配置校验 | `js/configValidation.js` | meta、资源引用、label/指令契约校验 | `CONFIG` 数据 |
| 模式选择 | `js/minigameMode.js` | 纯函数选择 Three.js / 2D / skip | 无 |
| 小游戏 | `js/minigame.js` | Three.js 主渲染、Canvas 2D 兼容渲染、skip、结束回调 | 全局 `THREE`、DOM、`GameAudio` |
| 样式 | `css/style.css` | 1920×1080 舞台、层级、动画、主题 | CSS/浏览器渲染 |
| 资产 | `assets/images/**` | 背景、角色、照片、球纹理 | 图片解码/GPU |

## 状态机

```text
idle --start--> playing
playing --say--> waiting_input --advance--> playing
playing --menu--> waiting_choice --choose--> playing
playing --call--> in_minigame --onEnd--> playing
playing --montage--> in_montage --onDone--> playing
playing --proposal--> in_proposal --accept--> ended
playing --script end--> ended
```

主线标签：`start → group_night → branch → gaming|first_date → from_game_to_real → montage → proposal`。

## 配置契约

故事和资源只从 `CONFIG` 读取。`Engine.init` 会调用 `ConfigValidation.validateConfig`；校验失败进入可见错误层。`call.minigame` 从 `CONFIG.minigames` 或默认 `CONFIG.minigame` 解析，并注入真实姓名。新增指令或配置字段时必须先扩展校验与契约测试。

## 已确认的运行证据

- 2026-08-27 Chromium 本地静态服务器 smoke：`gaming → Three.js → 跳过 → montage → proposal → 接受 → ending` 通过。
- 2026-08-27 Chromium 本地静态服务器 smoke：`first_date → montage → proposal → 接受 → ending` 通过。
- 强制无 WebGL 模式后进入 `mode="2d"`；另在 WebGL 可用时删除 `window.THREE`，仍获得独立 2D Canvas context，证明临时 Canvas 探测不会污染游戏 Canvas。缩放舞台中心点映射到内部 Canvas `(640, 360)`；点击跳过后回到 `gaming[5]`。强制 `mode="skip"` 后异步回到同一主线，小游戏层正确隐藏。
- 浏览器资源清单只有同源资源且均为 200；修复内联 favicon 后无 404；BGM 默认空配置，没有音频请求；页面 errors 为空。
- Three.js classic minified build会输出一条官方弃用 warning，但没有 `ReferenceError` 或未处理 Promise rejection；后续迁移 ES module。
- 桌面 1280×720 截图中 HUD 没有遮挡，但底部说明信息密度高；窄屏/触屏仍需专项验收。

## 决策记录摘要

| 日期 | 决策 | 原因 | 复查触发器 |
|---|---|---|---|
| 2026-08-27 | 首轮只新增治理文档，不改业务代码 | 先冻结事实基线，避免把漂移的计划当成实现规格 | 用户确认进入修复阶段 |
| 2026-08-27 | 离线兼容优先级 P0 | 这是产品核心承诺和现场可靠性的前提 | 引入任何 CDN/远程字体/远程 API |
| 2026-08-27 | 行为变更采用 TDD | 当前无测试，回归风险不可见 | 新增/修改任何指令、输入或游戏规则 |
| 2026-08-27 | 保留 Three.js r160，本地 vendoring，并提供 2D/skip 两级降级 | 保留 3D 体验，同时满足断网与 GPU 故障现场可靠性 | 升级 Three.js、改变渲染链路或包体预算 |
| 2026-08-27 | BGM 默认显式为空 | 未提供授权音频时保持静默、保留合成 SFX 且不制造 404 | 加入任何真实 BGM |

## 下次审查触发器

- 修改 `index.html` 脚本来源或 `js/minigame.js` 渲染器。
- 增加/删除故事 label 或指令。
- 替换角色、照片、音频格式或资产目录。
- 发布给现场使用前，至少执行一次无网络浏览器 smoke。
