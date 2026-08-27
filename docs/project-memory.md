# Eternal 项目记忆（单一事实源）

> 维护规则：每次改变运行时依赖、脚本指令、资产格式、输入方式或发布流程时更新本文件，并在 `docs/decisions/` 增加一条决策记录。审查结论以带日期的 `docs/reviews/` 为准。

## 当前基线

| 项目 | 值 |
|---|---|
| 仓库 | `https://github.com/QZSAMA/eternal_project.git` |
| 审查分支 | `trae/agent-1maClB` |
| 基线提交 | `781f1da801db29fb6d8718a26c4a98ceb0ac4ba2` |
| 运行方式 | 静态文件；可用 `python -m http.server` 预览，也宣称支持 `file://` 双击 |
| 运行时依赖 | 原生 JS/Web Audio/Canvas + 外部 Three.js CDN |
| 测试现状 | 无 `package.json`、无测试目录；4 个 JS 文件通过 `node --check` |
| 资产现状 | 21 个图片文件，约 8.14 MB；未提交 `assets/audio/bgm/*.mp3` |
| 主要风险 | 离线小游戏依赖 CDN；计划与实现从 Canvas 漂移到 Three.js；触屏小游戏未实现 |

## 产品意图

离线求婚视觉小说：以两人从线上游戏相识、走到现实、最终求婚为主线；中段插入“逆转的奶”小游戏；接受后展示结尾画面。关键成功条件是现场可靠、不能因游戏难度或设备能力卡住。

## 模块地图

| 模块 | 文件 | 责任 | 对外依赖 |
|---|---|---|---|
| 入口/布局 | `index.html` | DOM 层级、脚本加载、固定舞台 | Three.js CDN、浏览器 API |
| 剧情引擎 | `js/engine.js` | label/pc 状态机、指令解释、输入路由、场景和求婚 UI | `CONFIG`、`GameAudio`、`Minigame` |
| 剧情数据 | `js/storyData.js` | 元数据、资源路径、指令数组、小游戏参数 | 无 |
| 音频 | `js/audio.js` | BGM 淡入淡出、SFX、Web Audio 合成兜底 | Audio/AudioContext |
| 小游戏 | `js/minigame.js` | Three.js 场景、玩家/小美/敌人/球、跳过和结束回调 | 全局 `THREE`、DOM、`GameAudio` |
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

故事和资源应只从 `CONFIG` 读取。现有实现中 `realHeroName`、`realHeroineName` 未被小游戏揭示逻辑使用；`callMinigame` 接收的小游戏标识也未用于选择配置。任何扩展前先补 schema 校验和契约测试。

## 已确认的运行证据

- Chromium 在线加载：开始页、两条分支、小游戏入口、求婚接受和结尾状态均可到达。
- 资源响应：`assets/audio/bgm/opening.mp3`、`game.mp3`、`date.mp3`、`proposal.mp3` 均返回 404；SFX 仍可走合成兜底。
- 拦截 `unpkg.com` 后，小游戏启动在 `js/minigame.js:88` 抛出 `ReferenceError: THREE is not defined`。
- 运行截图显示小游戏底部提示与 HP 区域重叠。

## 决策记录摘要

| 日期 | 决策 | 原因 | 复查触发器 |
|---|---|---|---|
| 2026-08-27 | 首轮只新增治理文档，不改业务代码 | 先冻结事实基线，避免把漂移的计划当成实现规格 | 用户确认进入修复阶段 |
| 2026-08-27 | 离线兼容优先级 P0 | 这是产品核心承诺和现场可靠性的前提 | 引入任何 CDN/远程字体/远程 API |
| 2026-08-27 | 行为变更采用 TDD | 当前无测试，回归风险不可见 | 新增/修改任何指令、输入或游戏规则 |

## 下次审查触发器

- 修改 `index.html` 脚本来源或 `js/minigame.js` 渲染器。
- 增加/删除故事 label 或指令。
- 替换角色、照片、音频格式或资产目录。
- 发布给现场使用前，至少执行一次无网络浏览器 smoke。

