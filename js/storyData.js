/* ============================================
   ★ 用户主要配置文件
   所有文案、照片、BGM 在此集中配置
   {{...}} 为占位符，替换为真实内容即可
   ============================================ */

const CONFIG = {
  meta: {
    title: "{{我们的故事}}",
    heroName: "{{他}}",
    heroineName: "{{她}}",
    proposalDate: "{{2026.08.11}}",
    endingLine: "{{Chapter 1 完 / 我们的故事，才刚刚开始}}",
  },

  audio: {
    bgm: {
      opening: "assets/audio/bgm/opening.mp3",
      game: "assets/audio/bgm/game.mp3",
      date: "assets/audio/bgm/date.mp3",
      proposal: "assets/audio/bgm/proposal.mp3",
    },
    sfx: {
      // 值为合成音效标识，缺失时由 audio.js 合成
      click: "synth:click",
      select: "synth:select",
      type: "synth:type",
      gunshot: "synth:gunshot",
      hit: "synth:hit",
      capture: "synth:capture",
      heartbeat: "synth:heartbeat",
      bell: "synth:bell",
      success: "synth:success",
    },
  },

  images: {
    backgrounds: {
      ow_menu: "assets/images/backgrounds/ow_menu.jpg",
      ow_route66: "assets/images/backgrounds/ow_route66.jpg",
      chat_night: "assets/images/backgrounds/chat_night.jpg",
      first_date: "assets/images/backgrounds/first_date.jpg",
      park: "assets/images/backgrounds/park.jpg",
      proposal: "assets/images/backgrounds/proposal.jpg",
    },
    characters: {
      hero: {
        neutral: "assets/images/characters/hero_neutral.jpg",
        smile: "assets/images/characters/hero_smile.jpg",
        serious: "assets/images/characters/hero_serious.jpg",
      },
      heroine: {
        normal: "assets/images/characters/heroine_normal.jpg",
        laugh: "assets/images/characters/heroine_laugh.jpg",
        shy: "assets/images/characters/heroine_shy.jpg",
      },
    },
    photos: [
      "assets/images/photos/photo1.jpg",
      "assets/images/photos/photo2.jpg",
      "assets/images/photos/photo3.jpg",
      "assets/images/photos/photo4.jpg",
    ],
    minigame: {
      player: "assets/images/minigame/player.jpg",
      healer: "assets/images/minigame/healer.jpg",
      enemy: "assets/images/minigame/enemy.jpg",
    },
  },

  // 小游戏平衡数值
  minigame: {
    duration: 60,        // 秒
    winCapture: 100,     // 占点胜利阈值
    playerHP: 100,
    playerSpeed: 4,
    fireRate: 166,       // ms/发
    bulletSpeed: 10,
    bulletDamage: 25,
    enemyHP: 30,
    enemySpeed: 1.5,
    enemyDamage: 10,
    enemySpawnInterval: 1200,
    enemyMax: 8,
    controlRadius: 120,
    captureRate: 5,      // %/s
    healInterval: 8000,
    healAmount: 15,
  },

  // 剧情脚本：label → 指令数组
  story: {
    start: [
      { scene: { bg: "ow_menu", effect: "fade" } },
      { bgm: { track: "opening", fade: 1500 } },
      { say: { who: "narration", text: "{{那年的夏天，屏幕那头的语音频道里，一个陌生的ID亮了起来。}}" } },
      { say: { who: "narration", text: "{{谁也没想到，一句'辅助跟紧我'，会变成往后余生的开场白。}}" } },
      { show: { char: "heroine", pos: "right", expr: "normal" } },
      { say: { who: "heroine", text: "{{嗨，你就是那个据说很猛的源氏？}}" } },
      { show: { char: "hero", pos: "left", expr: "neutral" } },
      { say: { who: "hero", text: "{{互相切磋一下？输了请喝奶茶。}}" } },
      { say: { who: "heroine", expr: "laugh", text: "{{好啊，你输了可别赖账。}}" } },
      { jump: { label: "duo_queue" } },
    ],

    duo_queue: [
      { scene: { bg: "chat_night", effect: "fade" } },
      { bgm: { track: "opening", fade: 1500 } },
      { say: { who: "narration", text: "{{从那以后，每晚十点，语音频道总会准时亮起两个小绿点。}}" } },
      { say: { who: "hero", expr: "smile", text: "{{今天又被你救了，你这奶量属实离谱。}}" } },
      { say: { who: "heroine", expr: "laugh", text: "{{那当然，我可是全服第一专属辅助。}}" } },
      { say: { who: "narration", text: "{{游戏里的默契，悄悄长成了别的什么。}}" } },
      { effect: { type: "spotlight" } },
      { say: { who: "hero", expr: "serious", text: "{{其实……除了打游戏，我还想见你一面。}}" } },
      { effect: { type: "flash" } },
      { jump: { label: "branch" } },
    ],

    branch: [
      { menu: { prompt: "{{她沉默了一下，你会——}}", options: [
        { text: "{{再陪我打两局排位冲分}}", next: "gaming" },
        { text: "{{周末出来见个面吧}}", next: "first_date" },
      ] } },
    ],

    gaming: [
      { scene: { bg: "ow_route66", effect: "fade" } },
      { bgm: { track: "game", fade: 1000 } },
      { say: { who: "heroine", expr: "normal", text: "{{这局我来奶你，冲点！}}" } },
      { call: { minigame: "default" } },
      { say: { who: "heroine", expr: "laugh", text: "{{可以啊你，今天状态在线！}}" } },
      { say: { who: "hero", expr: "smile", text: "{{有你奶我，能不猛吗。}}" } },
      { jump: { label: "from_game_to_real" } },
    ],

    first_date: [
      { scene: { bg: "first_date", effect: "fade" } },
      { bgm: { track: "date", fade: 1500 } },
      { say: { who: "narration", text: "{{周末的黄昏，咖啡店门口，她比语音里更紧张。}}" } },
      { show: { char: "heroine", pos: "center", expr: "shy" } },
      { say: { who: "heroine", text: "{{你……比头像里高一点。}}" } },
      { show: { char: "hero", pos: "left", expr: "smile" } },
      { say: { who: "hero", text: "{{你比想象里更可爱一点。}}" } },
      { say: { who: "heroine", expr: "laugh", text: "{{少贫啦，走吧。}}" } },
      { jump: { label: "from_game_to_real" } },
    ],

    from_game_to_real: [
      { scene: { bg: "park", effect: "fade" } },
      { effect: { type: "spotlight" } },
      { say: { who: "narration", text: "{{从游戏走到现实，从双排走到并肩。}}" } },
      { say: { who: "hero", expr: "serious", text: "{{这些年，你是我最稳定的辅助，也是最想守护的人。}}" } },
      { say: { who: "heroine", expr: "shy", text: "{{……我也是。}}" } },
      { effect: { type: "flash" } },
      { jump: { label: "montage" } },
    ],

    montage: [
      { montage: { slides: [
        { img: "photo1", caption: "{{第一次合照，我们都笑得很傻}}" },
        { img: "photo2", caption: "{{那次旅行，你说海风很咸}}" },
        { img: "photo3", caption: "{{生日那天，你许的愿望我都知道}}" },
        { img: "photo4", caption: "{{平凡的日子，因为有你而闪闪发光}}" },
      ], bgm: "proposal" } },
      { jump: { label: "proposal" } },
    ],

    proposal: [
      { scene: { bg: "proposal", effect: "zoomin" } },
      { hide: { char: "*" } },
      { bgm: { track: "proposal", fade: 2000 } },
      { wait: { ms: 800 } },
      { say: { who: "narration", text: "{{今天，我想把心里藏了很久的话，亲口说给你听。}}" } },
      { effect: { type: "spotlight" } },
      { sfx: { name: "heartbeat" } },
      { say: { who: "hero", expr: "serious", text: "{{从守望的语音频道，到今天这一刻，你愿意……}}" } },
      { say: { who: "hero", expr: "serious", text: "{{嫁给我，做我下半辈子的专属辅助吗？}}" } },
      { proposal: {} },
    ],
  },
};
