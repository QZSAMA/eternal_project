# Eternal 项目记忆（单一事实源）

> 维护规则：每次改变运行时依赖、脚本指令、资产格式、输入方式或发布流程时更新本文件，并在 `docs/decisions/` 增加一条决策记录。审查结论以带日期的 `docs/reviews/` 为准。

## 当前基线

| 项目 | 值 |
|---|---|
| 仓库 | `https://github.com/QZSAMA/eternal_project.git` |
| 审查分支 | `trae/agent-1maClB` |
| 生产分支 | `main` |
| 生产预览 | `https://qzsama.github.io/eternal_project/` |
| 基线提交 | 发布提交以 `main` 与 GitHub Pages 部署记录为准 |
| 运行方式 | 静态文件；发布前用 `python -m http.server 4173` 预览并做断网 smoke；`file://` 仅作便利入口；`main` 通过 Actions 发布到 GitHub Pages |
| 运行时依赖 | 原生 JS/Web Audio/Canvas + 本地 `vendor/three-r160.min.js`；无运行时网络依赖 |
| 测试现状 | Node 内置测试 42/42 通过，`npm run check` 通过；两条浏览器主线与触屏小游戏 smoke 已通过；Pages 发布契约已覆盖 |
| 资产现状 | 21 个图片文件，约 8.14 MB；BGM 默认显式空值，静默运行且不发起音频请求 |
| 主要风险 | 角色 JPG 带背景/水印且授权待确认；Three.js classic build 有弃用警告；低端设备仍需实机帧率验收 |

## 产品意图

离线求婚视觉小说：以两人从线上游戏相识、走到现实、最终求婚为主线；中段插入“逆转的奶”小游戏；接受后展示结尾画面。关键成功条件是现场可靠、不能因游戏难度或设备能力卡住。

## 模块地图

| 模块 | 文件 | 责任 | 对外依赖 |
|---|---|---|---|
| 入口/布局 | `index.html` | DOM 层级、脚本加载、固定舞台、本地脚本顺序 | 本地 Three.js、浏览器 API |
| 剧情引擎 | `js/engine.js` | label/pc 状态机、指令解释、输入路由、场景和求婚 UI、角色槽位 latest-write-wins、静音同步、可暂停蒙太奇生命周期 | `CONFIG`、`GameAudio`、`Minigame` |
| 剧情数据 | `js/storyData.js` | 元数据、资源路径、指令数组、小游戏参数 | 无 |
| 音频 | `js/audio.js` | BGM 淡入淡出、SFX、Web Audio 合成兜底 | Audio/AudioContext |
| 配置校验 | `js/configValidation.js` | meta、资源引用、label/指令契约校验 | `CONFIG` 数据 |
| 模式选择 | `js/minigameMode.js` | 纯函数选择 Three.js / 2D / skip | 无 |
| 小游戏 | `js/minigame.js` | Three.js 主渲染、Canvas 2D 兼容渲染、触屏输入、skip、结束回调 | 全局 `THREE`、DOM、`GameAudio` |
| 样式 | `css/style.css` | 1920×1080 舞台、层级、动画、主题 | CSS/浏览器渲染 |
| 资产 | `assets/images/**` | 背景、角色、照片、球纹理 | 图片解码/GPU |

## 状态机

```text
idle --start--> playing
playing --say--> waiting_input --advance--> playing
playing --menu--> waiting_choice --choose--> playing
playing --call--> in_minigame --onEnd--> playing
playing --montage--> in_montage --pause/resume--> in_montage --onDone--> playing
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
- 2026-08-28 Playwright Chromium 真实快速点击回归：`first_date` 与 `gaming + skip` 两条分支均通过，313 次推进/等待采样未出现重复可见角色；第一次见面分支进入公园后 `center` 已清空且 `right` 只有 `heroine`，游戏分支跳过后恢复到 `gaming[5]`，最新表情为 `hero:serious` 与 `heroine:laugh`，并完成蒙太奇到达求婚层。C 封面通过 1920×1080、1280×720 和 `prefers-reduced-motion: reduce` 复核，人物脸部完整，无水印、黑边、破图或横向溢出，键盘焦点可见；96 个请求全部同源且无控制台错误、页面异常、失败请求或 HTTP 错误，仅保留已知 Three.js classic 弃用 warning 和 headless WebGL `ReadPixels` 性能 warning。
- 2026-09-02 Playwright Chromium 静音无头回归：`tests/smoke-relationship-ux.py` 在 `--mute-audio --disable-audio-output` 下验证 `gaming`（跳过小游戏）与 `first_date` 两条路线。开始页静音按钮不会推进剧情，并与 HUD 状态同步；蒙太奇暂停后 900ms 状态和计时均不变，继续后两条路线均进入 `in_proposal`。无页面异常、失败请求或外链请求；仅保留已知 Three.js classic 弃用 warning 与 headless WebGL `ReadPixels` 性能 warning。
- 2026-09-02 Playwright Chromium 触屏无头回归：`tests/smoke-touch-minigame.py` 在 `has_touch=True`、强制 2D 模式下验证虚拟摇杆 pointerdown/move/cancel、紫球/黄球按下释放、反向按钮和跳过；桌面上下文确认触屏控件默认隐藏。无页面异常或失败请求，触屏与桌面路径均能回到主线。
- 2026-09-02 `tests/minigame-physics.test.js` 验证 `dt` 限制、60/30 FPS 积分一致、3D 玩家移动一致、平方距离碰撞与特效队列上限；`npm test` 达到 40/40。3D 更新复用循环时间戳，粒子/拖尾超过预算时回收最旧对象。

## 决策记录摘要

| 日期 | 决策 | 原因 | 复查触发器 |
|---|---|---|---|
| 2026-08-27 | 首轮只新增治理文档，不改业务代码 | 先冻结事实基线，避免把漂移的计划当成实现规格 | 用户确认进入修复阶段 |
| 2026-08-27 | 离线兼容优先级 P0 | 这是产品核心承诺和现场可靠性的前提 | 引入任何 CDN/远程字体/远程 API |
| 2026-08-27 | 行为变更采用 TDD | 当前无测试，回归风险不可见 | 新增/修改任何指令、输入或游戏规则 |
| 2026-08-27 | 保留 Three.js r160，本地 vendoring，并提供 2D/skip 两级降级 | 保留 3D 体验，同时满足断网与 GPU 故障现场可靠性 | 升级 Three.js、改变渲染链路或包体预算 |
| 2026-08-27 | BGM 默认显式为空 | 未提供授权音频时保持静默、保留合成 SFX 且不制造 404 | 加入任何真实 BGM |
| 2026-08-28 | 角色槽位使用可取消定时器与版本校验，开始封面采用 C 双人游戏主视觉 | 消除快速推进竞态和跨段落重复角色，同时建立一致开场视觉 | 增加分身演出、改用 Canvas/WebGL 角色或替换封面结构 |
| 2026-09-02 | 第一阶段关系体验增加开始前静音与可暂停照片蒙太奇；求婚拒绝改为稳定反馈，小游戏结果按事实传递 | 现场演示中误触接受、跳过后虚假成功文案和不可控长动画会削弱信任；控制逻辑集中在 Engine 并保持离线 | 增加蒙太奇重播/进度条、触屏小游戏输入、或替换音频资产时重新审查生命周期与焦点 |
| 2026-09-02 | 触屏小游戏采用 Pointer Events + 虚拟摇杆/三按钮，并由 Three.js 与 2D 共用 `touchInput`；控件按触屏能力显示，绑定重复时先清理，缺失能力安全回退 | 让触屏设备可完成移动、瞄准、发射和反向，同时保留键鼠与 skip；统一状态避免两套规则漂移，幂等解绑防止重复点击 | 迁移输入设备、调整控件布局/手势、升级 Three.js 或改变小游戏规则时重新审查 |
| 2026-09-02 | 3D 小游戏按受限 `dt` 推进，并以平方距离与粒子/拖尾上限降低热路径开销 | 消除低帧率下移动/寿命漂移，减少碰撞临时对象和特效无限增长；保持 60 FPS 手感与现有规则 | 改变速度/生命周期、引入固定时间步或对象池、迁移 Three.js ES Module 时重新基准测试 |
| 2026-09-03 | `main` 作为唯一生产源，通过 GitHub Pages 官方 Actions 发布 | 保持代码历史与线上版本一致，先过 Node 测试和语法门禁再上传静态文件；失败时保留上一成功版本 | 修改工作流权限、Pages 构建类型、发布目录或仓库可见性时重新验收 |

## 下次审查触发器

- 修改 `index.html` 脚本来源或 `js/minigame.js` 渲染器。
- 增加/删除故事 label 或指令。
- 替换角色、照片、音频格式或资产目录。
- 发布给现场使用前，至少执行一次无网络浏览器 smoke。
