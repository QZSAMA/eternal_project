# ADR：本地 Three.js 与 2D/skip 降级

- 日期：2026-08-27
- 状态：已接受
- 决策人：项目用户

## 背景

项目的小游戏已经具备 Three.js 3D 表现，但原基线从 CDN 加载运行时，断网时会在剧情中段中断。求婚现场的首要约束是主线必须可达，且设备可能没有可用 WebGL。

## 决策

保留 Three.js `r160` 作为默认渲染器，将锁定文件放入 `vendor/three-r160.min.js`。启动小游戏时依次选择：

1. Three.js 存在且可创建 WebGL context：使用 3D。
2. Three.js 或 WebGL 不可用：使用 Canvas 2D 兼容模式。
3. Canvas 2D 也不可用：异步返回 `skipped`，隐藏小游戏层并继续剧情。

运行时禁止 CDN、远程字体和在线 API。默认 BGM 使用空路径，保留 Web Audio 合成 SFX，不请求不存在的音频。

## 结果与代价

- 收益：保留 3D 体验；断网、GPU/驱动故障和第三方脚本不可用时仍能完成求婚主线。
- 代价：交付包增加 669,884 字节；3D/2D 两套渲染需要共同维护；classic Three.js build 当前有弃用 warning，后续应迁移 ES module。
- 完整性：当前 vendored 文件 SHA-256 为 `170c6789f43217c96b3170f4b42fafe135de7f7cd48497a4218f9757ee1d49fa`。

## 验证

- `npm test` 覆盖 three/2d/skip 模式选择及配置契约。
- 浏览器 smoke 覆盖 Three.js、强制 2D、强制 skip，以及 `gaming`/`first_date` 两条主线。
- 每次升级 Three.js、改变模式选择或音频默认值时，必须重新计算哈希并执行发布门禁。
