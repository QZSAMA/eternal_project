# 求婚 Galgame 网页游戏 — 使用与定制指南

一个自包含、离线优先的网页视觉小说，讲述“守望双排相识 → 走到现实 → 求婚”的故事。Three.js `r160` 已随仓库本地提供；WebGL 不可用时自动降级为 Canvas 2D，2D 也不可用时自动跳过小游戏并继续主线。无需联网或在线 API。

---

## 快速开始

1. 推荐在项目目录运行 `python -m http.server 4173`，再用 Chrome / Edge 打开 `http://127.0.0.1:4173/`（现场前请按此方式验证；也可尝试直接双击 `index.html`）
2. 可先点击开始页右上角静音按钮，再点击"开始双人旅程"（解锁音频）
3. 点击 / 空格 / 回车 推进剧情
4. 剧情中段有一个守望主题小游戏（WASD 移动 + 鼠标射击），也可点"跳过"
5. 结尾进入求婚交互，由她明确选择"我愿意 ♥"或暂时想想

> 投屏：HDMI 连电视，浏览器全屏，自动等比缩放到 1920×1080。

---

## 文件结构

```
├── index.html              # 入口
├── css/style.css           # 全部样式
├── js/
│   ├── storyData.js        # ★ 主要配置文件（文案/照片/BGM/剧情）
│   ├── configValidation.js # 配置与资源引用校验
│   ├── minigameMode.js     # Three.js / 2D / skip 模式选择
│   ├── engine.js           # 引擎核心
│   ├── minigame.js         # Three.js + Canvas 2D 守望小游戏
│   └── audio.js            # 音频系统
├── vendor/
│   └── three-r160.min.js   # 本地锁定的 Three.js 运行时
├── tests/                  # Node 配置/模式回归测试
├── assets/images/
│   ├── backgrounds/        # 6 张场景背景
│   ├── characters/         # 6 张人物立绘
│   ├── photos/             # ★ 你的真实照片（替换占位）
│   └── minigame/           # 小游戏图标
└── README.md               # 本文件
```

---

## 定制指南

### 1. 替换文案（最重要）

打开 `js/storyData.js`，找到所有 `{{...}}` 占位符，替换为真实内容：

```js
meta: {
  title: "{{我们的故事}}",        // ← 改成你的标题
  heroName: "{{他}}",            // ← 男方名字
  heroineName: "{{她}}",         // ← 女方名字
  proposalDate: "{{2026.08.11}}",// ← 求婚日期
  endingLine: "{{Chapter 1 完}}",// ← 结尾寄语
}
```

剧情中的每句台词也有 `{{}}`，例如：
```js
{ say: { who: "hero", text: "{{嫁给我，做我下半辈子的专属辅助吗？}}" } }
```
把 `{{}}` 内的文字改成你想说的真实台词即可。**真实的话最打动人。**

### 2. 替换照片

把你的合照放入 `assets/images/photos/`，保持文件名：
- `photo1.jpg` — 第一次合照
- `photo2.jpg` — 旅行/约会
- `photo3.jpg` — 生日/纪念
- `photo4.jpg` — 日常温馨

**建议尺寸**：横向 1600×1200 或更高，JPG 格式。
照片会在蒙太奇章节自动轮播（带 Ken Burns 缩放 + 字幕），右下角可暂停/继续，Space/Enter 也可切换。

> 不放照片也能运行——会使用已生成的二次元占位照片。

### 3. 替换 BGM（可选）

默认配置中的四个 BGM 值为空，因此不会请求不存在的文件；Web Audio 合成 SFX 仍可用。如需音乐，把 MP3 放入 `assets/audio/bgm/`，并在 `js/storyData.js` 的 `audio.bgm` 中填写对应路径：
- `opening.mp3` — 开场/双排
- `game.mp3` — 小游戏
- `date.mp3` — 约会
- `proposal.mp3` — 求婚

不放 MP3 时静默运行，不产生音频 404，也不阻塞剧情。

### 4. 调整小游戏难度

`js/storyData.js` 的 `minigame` 字段：
```js
minigame: {
  duration: 60,        // 时长（秒）
  winHealCount: 1,     // 奶到小美几次后通关
  meiHP: 100,          // 小美血量
  enemySpawnInterval: 2200, // 敌人生成间隔（ms）
  // ...更多参数见文件注释
}
```

### 5. 修改剧情走向

`storyData.js` 的 `story` 字段是分章节脚本。每章是 `label → 指令数组`。可用指令：

| 指令 | 示例 | 说明 |
|---|---|---|
| `scene` | `{scene:{bg:"park",effect:"fade"}}` | 切背景 |
| `show` | `{show:{char:"heroine",pos:"right",expr:"shy"}}` | 立绘入场 |
| `hide` | `{hide:{char:"*"}}` | 立绘退场（`*`=全部） |
| `say` | `{say:{who:"hero",text:"..."}}` | 台词 |
| `menu` | `{menu:{prompt:"...",options:[{text,next}]}}` | 选项 |
| `jump` | `{jump:{label:"proposal"}}` | 跳转 |
| `call` | `{call:{minigame:"default"}}` | 调用小游戏 |
| `wait` | `{wait:{ms:800}}` | 停顿 |
| `bgm` | `{bgm:{track:"proposal",fade:2000}}` | 音乐 |
| `sfx` | `{sfx:{name:"heartbeat"}}` | 音效 |
| `effect` | `{effect:{type:"flash"}}` | 特效(flash/shake/spotlight) |
| `montage` | `{montage:{slides:[{img,caption}]}}` | 照片轮播 |
| `proposal` | `{proposal:{}}` | 求婚终局 |

---

## 操作说明

| 操作 | 剧情 | 小游戏 |
|---|---|---|
| 鼠标 | 点击推进 | 移动瞄准 + 左键射击 |
| 键盘 | 空格/回车/→ 推进；↑↓ 选选项；蒙太奇中 Space/Enter 暂停/继续 | WASD 移动；Esc 跳过 |
| 触屏 | 点击推进 | 点击发射；当前无虚拟摇杆，可点“跳过”继续主线 |

---

## 常见问题

**Q: 双击打开后没有声音？**
A: 浏览器限制，必须先点"开始双人旅程"按钮解锁音频；开始前也可以用静音按钮保持全程安静。

**Q: 投屏后画面太小/有黑边？**
A: 浏览器按 F11 全屏。游戏自动等比缩放，黑边正常（保持比例不变形）。

**Q: 小游戏太难/太简单？**
A: 改 `storyData.js` 的 `minigame` 参数。也可直接点右上"跳过"按钮。

**Q: 想改立绘/背景？**
A: 替换 `assets/images/` 对应文件，保持文件名不变即可。

**Q: 求婚时暂时不想答怎么办？**
A: 点击"让我想想…"会保留求婚画面并显示温和提示，不会移动按钮，也不会离开主线。

---

## 技术说明

- 原生 JavaScript + 本地 vendored Three.js `r160`；无 CDN、远程字体或在线 API
- 小游戏渲染链路：Three.js/WebGL → Canvas 2D → 自动跳过并继续剧情
- 1920×1080 基准舞台，`transform:scale()` 等比缩放
- Web Audio API 合成音效（无音频文件也能出声）
- `npm test` 运行配置与降级模式回归测试，`npm run check` 运行语法门禁
- 不使用任何暴雪官方版权素材，守望风格仅为视觉语言提炼

祝求婚顺利 ♥
