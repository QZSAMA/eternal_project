/* ============================================
   ★ 用户主要配置文件
   v2 剧情：小红书相识 / 紫球没奶到 / 名字从 ID 到真名
   两位主角：
     - 男：赵启志（ID: QzSama）主玩莫伊拉
     - 女：朱盈畅（ID: 可乐就是好喝）主玩小美
   meta.heroName/heroineName 默认是 ID；
   后期台词在 say 指令里用 name 字段覆盖为真名。
   ============================================ */

const CONFIG = {
  meta: {
    title: "我们的故事",
    heroName: "QzSama",
    heroineName: "可乐就是好喝",
    realHeroName: "赵启志",
    realHeroineName: "朱盈畅",
    proposalDate: "2026.08.11",
    endingLine: "Chapter 1 完 / 我们的故事，才刚刚开始",
  },

  audio: {
    bgm: {
      // Optional licensed tracks. Leave empty for the self-contained silent default;
      // GameAudio will keep synthesized SFX without issuing 404 requests.
      opening: "",
      game: "",
      date: "",
      proposal: "",
    },
    sfx: {
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

  // 小游戏平衡数值：逆转的奶
  minigame: {
    duration: 90,           // 给玩家摸索机制的时间
    winHealCount: 1,        // 奶到小美 1 次即通关
    playerHP: 100,
    playerSpeed: 4,
    meiHP: 100,
    meiR: 14,
    meiDistance: 80,        // 小美固定在玩家身后 80 像素
    orbSpeed: 7,
    orbLife: 120,
    orbR: 8,
    purpleDamage: 30,      // 紫球伤害
    yellowHeal: 40,        // 黄球奶量
    fireRate: 400,         // ms/球
    enemyHP: 30,
    enemySpeed: 1.0,
    enemyDamage: 8,
    enemySpawnInterval: 2200,
    enemyMax: 5,
  },

  // 剧情脚本：label → 指令数组
  story: {
    // 章节 1 · 开篇：小红书笔记相识
    start: [
      { scene: { bg: "ow_menu", effect: "fade" } },
      { bgm: { track: "opening", fade: 1500 } },
      { say: { who: "narration", text: "故事的开始，不是在游戏里，而是在小红书的一篇笔记上。" } },
      { say: { who: "narration", text: "「缺队友，快乐组局，不骂人」，笔记里这样写着。" } },
      { say: { who: "narration", text: "他刷到的时候犹豫了一下，还是点了关注，发了私信：「我也缺队友，加个好友？」" } },
      { say: { who: "narration", text: "对面很快回了一个「好呀」。" } },
      { say: { who: "narration", text: "就这样，「QzSama」和「可乐就是好喝」，成了好友列表里挨在一起的两个 ID。" } },
      { say: { who: "narration", text: "他主玩莫伊拉，紫球丢得满天飞；她主玩小美，冰墙立得理直气壮。" } },
      { jump: { label: "group_night" } },
    ],

    // 章节 2 · 组局日常：紫球飞了 / 她从不指责
    group_night: [
      { scene: { bg: "chat_night", effect: "fade" } },
      { bgm: { track: "opening", fade: 1500 } },
      { say: { who: "narration", text: "从那以后，每晚的组局语音，成了两个人最期待的时刻。" } },
      { show: { char: "hero", pos: "left", expr: "smile" } },
      { say: { who: "hero", text: "这波我紫球丢过去，肯定能收割！" } },
      { say: { who: "narration", text: "紫球飞远了，没奶到身后的她。" } },
      { show: { char: "heroine", pos: "right", expr: "normal" } },
      { say: { who: "heroine", text: "……我这边有点掉血……没事，我自己找血包就好。" } },
      { say: { who: "hero", expr: "serious", text: "啊？你刚才残血了？怎么不早说！" } },
      { say: { who: "heroine", expr: "laugh", text: "看你丢紫球丢得那么开心，没忍心打断你。" } },
      { say: { who: "narration", text: "他总是这样，紫球一丢就忘乎所以，回头时才发现她早就残血了。" } },
      { say: { who: "narration", text: "而她从不指责，只是悄悄找个血包，又默默跟回他身后。" } },
      { say: { who: "narration", text: "嘴上不说，可她每一局都还是挡在他前面，替他立冰墙、替他扛刀。" } },
      { say: { who: "hero", expr: "serious", text: "……其实，除了组局，我也想单独和你说说话。" } },
      { say: { who: "heroine", expr: "shy", text: "嗯？那你想说什么？" } },
      { jump: { label: "branch" } },
    ],

    // 章节 3 · 分支
    branch: [
      { menu: { prompt: "组局散场后，你会——", options: [
        { text: "「再来一局，这次我一定奶到你」", next: "gaming" },
        { text: "「组局结束了，要不……见一面？」", next: "first_date" },
      ] } },
    ],

    // 章节 4 · 小游戏：逆转的奶
    gaming: [
      { scene: { bg: "ow_route66", effect: "fade" } },
      { bgm: { track: "game", fade: 1000 } },
      { say: { who: "heroine", expr: "normal", text: "这局你莫伊拉好好奶我啊，我小美要冲了。" } },
      { say: { who: "hero", expr: "smile", text: "放心，这次我紫球和黄球都给你安排上！" } },
      { call: { minigame: "default" } },
      { say: { who: "heroine", expr: "laugh", text: "哎，和你一起组队就是最开心的事。" } },
      { say: { who: "hero", expr: "smile", text: "不管结果怎样，我都想和你一起走完每一局。" } },
      { say: { who: "heroine", expr: "shy", text: "那以后每一局，都要这样陪着我哦。" } },
      { jump: { label: "from_game_to_real" } },
    ],

    // 章节 5 · 第一次见面：从 ID 到真人
    first_date: [
      { scene: { bg: "first_date", effect: "fade" } },
      { bgm: { track: "date", fade: 1500 } },
      { say: { who: "narration", text: "组局散场后的一个周末，咖啡店门口，他比约定时间早到了半小时。" } },
      { say: { who: "narration", text: "他第一次见到她——不是屏幕上那个 ID，而是一个会脸红、会笑出声的真人。" } },
      { show: { char: "heroine", pos: "center", expr: "shy" } },
      { say: { who: "hero", expr: "neutral", text: "你……比头像里好看多了。" } },
      { say: { who: "heroine", text: "你比语音里还紧张。" } },
      { say: { who: "hero", expr: "smile", text: "原来「可乐就是好喝」长这样啊。" } },
      { say: { who: "heroine", expr: "laugh", text: "原来「QzSama」是这么普通的一个人啊。" } },
      { say: { who: "narration", text: "那一刻，两个 ID 第一次变成了两个真实的人。" } },
      { say: { who: "narration", text: "他知道了，她叫朱盈畅；她也知道了，他叫赵启志。" } },
      { jump: { label: "from_game_to_real" } },
    ],

    // 章节 6 · 告白：名字的重量（这里起用真名）
    from_game_to_real: [
      { scene: { bg: "park", effect: "fade" } },
      { effect: { type: "spotlight" } },
      { say: { who: "narration", text: "从小红书的笔记，到组局的语音，到并肩的街头。" } },
      { say: { who: "narration", text: "从 ID，到名字，到余生。" } },
      { say: { who: "narration", text: "那些年他丢出去的紫球，没能奶到她；可她从不计较，只是一次又一次，默默跟在他身后。" } },
      { show: { char: "hero", pos: "left", expr: "serious" } },
      { say: { who: "hero", name: "赵启志", text: "朱盈畅，这些年我玩莫伊拉一直很菜，紫球丢不准，奶也奶不到位……" } },
      { show: { char: "heroine", pos: "right", expr: "normal" } },
      { say: { who: "heroine", name: "朱盈畅", text: "嗯，我知道。" } },
      { say: { who: "hero", name: "赵启志", text: "可你从来没说过我一句。" } },
      { say: { who: "heroine", name: "朱盈畅", expr: "laugh", text: "因为你开心就好啊。" } },
      { say: { who: "hero", name: "赵启志", expr: "serious", text: "但是有一件事，我想做得很准、很到位——" } },
      { say: { who: "hero", name: "赵启志", text: "那就是，陪你走完往后的每一局。" } },
      { effect: { type: "flash" } },
      { jump: { label: "montage" } },
    ],

    // 章节 7 · 蒙太奇：真实照片
    montage: [
      { montage: { slides: [
        { img: "photo1", caption: "那时候我们还不知道，会走到这里" },
        { img: "photo2", caption: "你从不计较我没奶到你，那些日子我都记得" },
        { img: "photo3", caption: "你说可乐就是好喝，我说有你在就是好日子" },
        { img: "photo4", caption: "从 ID 到名字，从组局到余生" },
      ], bgm: "proposal" } },
      { jump: { label: "proposal" } },
    ],

    // 章节 8 · 求婚：用真名
    proposal: [
      { scene: { bg: "proposal", effect: "zoomin" } },
      { hide: { char: "*" } },
      { bgm: { track: "proposal", fade: 2000 } },
      { wait: { ms: 800 } },
      { say: { who: "narration", text: "今天，我想把心里藏了很久的话，用真实的名字，亲口说给你听。" } },
      { say: { who: "narration", text: "不是对「可乐就是好喝」说，而是对朱盈畅说。" } },
      { effect: { type: "spotlight" } },
      { sfx: { name: "heartbeat" } },
      { show: { char: "hero", pos: "center", expr: "serious" } },
      { say: { who: "hero", name: "赵启志", text: "朱盈畅，从那篇小红书的笔记，到今天这一刻——" } },
      { say: { who: "hero", name: "赵启志", text: "我玩莫伊拉一直很菜，丢过无数次紫球，也错过无数次奶你的机会。" } },
      { say: { who: "hero", name: "赵启志", text: "可你从来没有怪过我，只是悄悄找回血包，又跟回我身边。" } },
      { say: { who: "hero", name: "赵启志", text: "这辈子我不想再错过你了——" } },
      { say: { who: "hero", name: "赵启志", text: "嫁给我，好吗？让我用真名，奶你一辈子。" } },
      { proposal: {} },
    ],
  },
};
