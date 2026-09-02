/* ============================================
   引擎核心：状态机 + 指令解释器 + 子系统
   依赖：Audio, Minigame, CONFIG
   ============================================ */

const Engine = {
  state: "idle",      // idle/playing/waiting_input/waiting_choice/in_minigame/in_montage/in_proposal/ended
  label: "start",
  pc: 0,
  data: null,
  dom: {},
  typewriterTimer: null,
  typewriterDone: true,
  photoCache: {},     // 探测过的照片：path → true/false
  selectedChoice: 0,
  lastMinigameResult: null,
  rejectEscapeCount: 0,
  proposalTipTimer: null,
  montage: null,
  particleRAF: null,
  particles: [],

  init(data) {
    this.data = data;
    // 缓存 DOM
    const $ = id => document.getElementById(id);
    this.dom = {
      stage: $("stage"),
      bgA: $("bgA"), bgB: $("bgB"),
      charLeft: $("charLeft"), charCenter: $("charCenter"), charRight: $("charRight"),
      particles: $("particles"),
      dialogueBox: $("dialogueBox"), nameTag: $("nameTag"), dialogueText: $("dialogueText"), dialogueArrow: $("dialogueArrow"),
      layerMenu: $("layerMenu"), choicePrompt: $("choicePrompt"), choiceList: $("choiceList"),
      effectFlash: $("effectFlash"), effectSpotlight: $("effectSpotlight"),
      muteBtn: $("muteBtn"), startMuteBtn: $("startMuteBtn"),
      layerMontage: $("layerMontage"), montageImg: $("montageImg"), montageCaption: $("montageCaption"),
      montageToggle: $("montageToggle"), montageStatus: $("montageStatus"),
      layerMinigame: $("layerMinigame"),
      layerProposal: $("layerProposal"), ringWrap: $("ringWrap"), proposalText: $("proposalText"),
      proposalBtns: $("proposalBtns"), btnAccept: $("btnAccept"), btnReject: $("btnReject"), rejectTip: $("rejectTip"),
      layerEnding: $("layerEnding"), endingBig: $("endingBig"), endingSub: $("endingSub"), endingMeta: $("endingMeta"), endingRestart: $("endingRestart"),
      layerStart: $("layerStart"), startTitle: $("startTitle"), startSub: $("startSub"), startBtn: $("startBtn"),
      layerError: $("layerError"), errorText: $("errorText"), errorReload: $("errorReload"),
    };

    if (window.ConfigValidation) {
      const validation = window.ConfigValidation.validateConfig(data);
      this.validation = validation;
      if (!validation.ok) {
        this._fail(`配置校验失败：${validation.errors.join("；")}`);
        return;
      }
    }

    // 填充标题
    this.dom.startTitle.textContent = data.meta.title.replace(/[{}]/g, "");
    this.dom.endingMeta.textContent = `${data.meta.endingLine.replace(/[{}]/g, "")}\n${data.meta.proposalDate.replace(/[{}]/g, "")}`;

    // 静音按钮（开始页和 HUD 共用同一状态）
    const toggleMute = (event) => {
      if (event && event.stopPropagation) event.stopPropagation();
      GameAudio.setMuted(!GameAudio.muted);
      this._syncMuteButtons();
    };
    if (this.dom.muteBtn) this.dom.muteBtn.addEventListener("click", toggleMute);
    if (this.dom.startMuteBtn) this.dom.startMuteBtn.addEventListener("click", toggleMute);
    this._syncMuteButtons();

    // 蒙太奇暂停/继续
    if (this.dom.montageToggle) {
      this.dom.montageToggle.addEventListener("click", (event) => {
        if (event && event.stopPropagation) event.stopPropagation();
        this._toggleMontagePause();
      });
    }

    // 开始按钮
    this.dom.startBtn.addEventListener("click", () => {
      GameAudio.unlock();
      this.dom.layerStart.classList.add("is-hidden");
      this.start();
    });

    if (this.dom.errorReload) this.dom.errorReload.addEventListener("click", () => location.reload());

    // 输入路由
    this._bindInputs();

    // 预探测真实照片
    this._probePhotos();

    // 启动粒子层
    this._startParticles("ambient");
  },

  start() {
    this.state = "playing";
    this.label = "start";
    this.pc = 0;
    this._next();
  },

  advance() {
    if (this.state === "waiting_input") {
      if (!this.typewriterDone) {
        this._finishTypewriter();
        return;
      }
      GameAudio.sfx("click");
      this.state = "playing";
      this.pc++;
      this._next();
    }
  },

  choose(index) {
    if (this.state !== "waiting_choice") return;
    const opts = this._currentMenuOptions();
    if (!opts || !opts[index]) return;
    GameAudio.sfx("select");
    this.dom.layerMenu.style.display = "none";
    this.state = "playing";
    this.jump(opts[index].next);
  },

  jump(label) {
    this.label = label;
    this.pc = 0;
    this._next();
  },

  callMinigame(cfg, onEnd) {
    this.state = "in_minigame";
    this.dom.layerMinigame.classList.add("is-show");
    const gameCfg = {
      ...this.data.minigame,
      ...(cfg && typeof cfg === "object" ? cfg : {}),
      realHeroName: this.data.meta.realHeroName || this.data.meta.heroName,
      realHeroineName: this.data.meta.realHeroineName || this.data.meta.heroineName,
    };
    try {
      Minigame.start(gameCfg, (result) => {
        this.dom.layerMinigame.classList.remove("is-show");
        this.state = "playing";
        if (onEnd) onEnd(result);
      });
    } catch (error) {
      console.error("Mini-game unavailable; continuing with skip fallback", error);
      this.dom.layerMinigame.classList.remove("is-show");
      this.state = "playing";
      if (onEnd) onEnd("skipped");
    }
  },

  // ============ 指令派发 ============
  _next() {
    if (this.state !== "playing") return;
    const script = this.data.story[this.label];
    if (!script || this.pc >= script.length) {
      this._end();
      return;
    }
    const inst = script[this.pc];
    this._exec(inst);
  },

  _exec(inst) {
    const key = Object.keys(inst)[0];
    const arg = inst[key];
    switch (key) {
      case "scene": this._scene(arg); this.pc++; this._next(); break;
      case "show": this._show(arg); this.pc++; this._next(); break;
      case "hide": this._hide(arg); this.pc++; this._next(); break;
      case "say": this._say(arg); break;  // 阻塞
      case "menu": this._menu(arg); break; // 阻塞
      case "jump": this.jump(arg.label); break;
      case "call": this._call(arg); break;  // 阻塞
      case "wait": this._wait(arg); break;  // 阻塞
      case "bgm": GameAudio.bgm(arg.track, arg.fade || 1500); this.pc++; this._next(); break;
      case "sfx": GameAudio.sfx(arg.name); this.pc++; this._next(); break;
      case "effect": this._effect(arg); this.pc++; this._next(); break;
      case "montage": this._montage(arg); break; // 阻塞
      case "proposal": this._proposal(); break;  // 阻塞（终态）
      default: this._fail(`未知剧情指令：${key}（${this.label}[${this.pc}]）`); break;
    }
  },

  _end() {
    this.state = "ended";
  },

  _fail(message) {
    this.state = "error";
    console.error(message);
    if (this.dom.layerError) this.dom.layerError.classList.add("is-show");
    if (this.dom.errorText) this.dom.errorText.textContent = message;
  },

  // ============ scene ============
  _scene(arg) {
    const url = this.data.images.backgrounds[arg.bg];
    if (!url) {
      this._fail(`找不到背景资源：${arg && arg.bg ? arg.bg : "(empty)"}`);
      return;
    }
    // 交叉淡入：用非激活层加载新图，切换激活
    const aActive = this.dom.bgA.classList.contains("is-active");
    const next = aActive ? this.dom.bgB : this.dom.bgA;
    const cur = aActive ? this.dom.bgA : this.dom.bgB;
    next.src = url;
    next.classList.remove("is-zoomin");
    if (arg.effect === "zoomin") next.classList.add("is-zoomin");
    // 等图片可绘制后切换（onload 兜底）
    const swap = () => {
      next.classList.add("is-active");
      cur.classList.remove("is-active");
    };
    if (next.complete && next.naturalWidth > 0) swap();
    else {
      next.onload = swap;
      next.onerror = () => this._fail(`背景资源加载失败：${url}`);
    }
  },

  _charSlots() {
    return [this.dom.charLeft, this.dom.charCenter, this.dom.charRight].filter(Boolean);
  },

  _syncMuteButtons() {
    const muted = Boolean(GameAudio.muted);
    [this.dom.muteBtn, this.dom.startMuteBtn].filter(Boolean).forEach(button => {
      button.classList.toggle("is-muted", muted);
      button.textContent = muted ? "×" : "♪";
      button.setAttribute("aria-pressed", String(muted));
    });
  },

  _invalidateCharSlot(slot) {
    if (slot._charSwapTimer != null) {
      clearTimeout(slot._charSwapTimer);
      slot._charSwapTimer = null;
    }
    slot._charRenderVersion = (slot._charRenderVersion || 0) + 1;
    return slot._charRenderVersion;
  },

  _clearCharSlot(slot) {
    this._invalidateCharSlot(slot);
    slot.classList.remove("is-show", "is-speaking", "is-dim");
    slot.dataset.char = "";
    slot.dataset.expr = "";
    slot.innerHTML = "";
  },

  _renderCharacterSlot(slot, { char, expr, url }) {
    const version = this._invalidateCharSlot(slot);
    const render = () => {
      if (slot._charRenderVersion !== version) return;
      slot._charSwapTimer = null;
      slot.innerHTML = `<img class="char-img" src="${url}" alt="" onerror="this.style.display='none'">`;
      slot.dataset.char = char;
      slot.dataset.expr = expr;
      requestAnimationFrame(() => {
        if (slot._charRenderVersion !== version) return;
        slot.classList.add("is-show");
        this._updateSpeaking();
      });
    };

    if (slot.classList.contains("is-show")) {
      slot.classList.remove("is-show");
      slot._charSwapTimer = setTimeout(render, 200);
    } else {
      render();
    }
  },

  // ============ show ============
  _show(arg) {
    const char = arg.char;
    const expr = arg.expr || "neutral";
    const pos = arg.pos || "left";
    const url = this.data.images.characters[char][expr];
    const slot = pos === "left" ? this.dom.charLeft : pos === "right" ? this.dom.charRight : this.dom.charCenter;

    this._charSlots().forEach(candidate => {
      if (candidate !== slot && candidate.dataset.char === char) this._clearCharSlot(candidate);
    });
    this._renderCharacterSlot(slot, { char, expr, url });
    this._updateSpeaking();
  },

  _hide(arg) {
    this._charSlots().forEach(slot => {
      if (arg.char === "*" || slot.dataset.char === arg.char) this._clearCharSlot(slot);
    });
  },

  _updateSpeaking() {
    // 默认不压暗；say 时再设置
  },

  // ============ say ============
  _say(arg) {
    const who = arg.who;
    const text = (arg.text || "").replace(/[{}]/g, "");
    // 立绘说话高亮
    [this.dom.charLeft, this.dom.charCenter, this.dom.charRight].forEach(s => {
      s.classList.remove("is-speaking", "is-dim");
    });
    if (who !== "narration") {
      [this.dom.charLeft, this.dom.charCenter, this.dom.charRight].forEach(s => {
        if (s.dataset.char === who) s.classList.add("is-speaking");
        else if (s.dataset.char) s.classList.add("is-dim");
      });
      // 表情切换
      if (arg.expr) {
        const matchingSlots = this._charSlots().filter(slot => slot.dataset.char === who);
        const slot = matchingSlots.shift();
        matchingSlots.forEach(duplicate => this._clearCharSlot(duplicate));
        if (slot && slot.dataset.expr !== arg.expr) {
          const url = this.data.images.characters[who][arg.expr];
          this._renderCharacterSlot(slot, { char: who, expr: arg.expr, url });
        }
      }
    }

    // 名牌：say.name 可覆盖默认 ID（用于"名字从 ID 到真名"的转折）
    if (who === "narration") {
      this.dom.dialogueBox.classList.add("is-narration");
      this.dom.nameTag.style.display = "none";
    } else {
      this.dom.dialogueBox.classList.remove("is-narration");
      this.dom.nameTag.style.display = "block";
      const defaultName = who === "hero" ? this.data.meta.heroName : who === "heroine" ? this.data.meta.heroineName : "";
      const displayName = (arg.name || defaultName).replace(/[{}]/g, "");
      this.dom.nameTag.textContent = displayName;
      this.dom.nameTag.className = "name-tag is-" + who;
    }

    this.dom.dialogueBox.classList.add("is-show");
    this.dom.dialogueArrow.classList.remove("is-show");
    this._typewriter(text);
    this.state = "waiting_input";
  },

  _typewriter(text) {
    this.typewriterDone = false;
    this.dom.dialogueText.textContent = "";
    let i = 0;
    const step = () => {
      if (this.typewriterDone) return;
      if (i >= text.length) {
        this._typewriterEnd();
        return;
      }
      const ch = text[i];
      this.dom.dialogueText.textContent += ch;
      i++;
      // 标点稍长停顿
      const delay = /[，。！？、；：]/.test(ch) ? 120 : (/[a-zA-Z0-9]/.test(ch) ? 18 : 35);
      if (i % 2 === 0) GameAudio.sfx("type");
      this.typewriterTimer = setTimeout(step, delay);
    };
    step();
  },

  _typewriterEnd() {
    this.typewriterDone = true;
    this.dom.dialogueArrow.classList.add("is-show");
  },

  _finishTypewriter() {
    if (this.typewriterTimer) clearTimeout(this.typewriterTimer);
    // 取当前完整文本
    const script = this.data.story[this.label];
    const inst = script[this.pc];
    this.dom.dialogueText.textContent = inst.say.text.replace(/[{}]/g, "");
    this._typewriterEnd();
  },

  // ============ menu ============
  _menu(arg) {
    this.dom.choicePrompt.textContent = arg.prompt.replace(/[{}]/g, "");
    this.dom.choiceList.innerHTML = "";
    arg.options.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.className = "choice-btn";
      btn.textContent = opt.text.replace(/[{}]/g, "");
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.choose(i);
      });
      btn.addEventListener("mouseenter", () => {
        this.selectedChoice = i;
        this._highlightChoice();
        GameAudio.sfx("click");
      });
      this.dom.choiceList.appendChild(btn);
      setTimeout(() => btn.classList.add("is-in"), 120 * i + 50);
    });
    this.selectedChoice = 0;
    setTimeout(() => this._highlightChoice(), 100);
    this.dom.layerMenu.style.display = "block";
    this.state = "waiting_choice";
  },

  _highlightChoice() {
    const btns = this.dom.choiceList.querySelectorAll(".choice-btn");
    btns.forEach((b, i) => b.classList.toggle("is-selected", i === this.selectedChoice));
  },

  _currentMenuOptions() {
    const inst = this.data.story[this.label][this.pc];
    return inst && inst.menu ? inst.menu.options : null;
  },

  _moveChoice(dir) {
    const opts = this._currentMenuOptions();
    if (!opts) return;
    this.selectedChoice = (this.selectedChoice + dir + opts.length) % opts.length;
    this._highlightChoice();
    GameAudio.sfx("click");
  },

  // ============ call (minigame) ============
  _call(arg) {
    const gameId = arg && arg.minigame;
    const gameCfg = (this.data.minigames && this.data.minigames[gameId]) || this.data.minigame;
    if (!gameCfg) {
      this._fail(`找不到小游戏配置：${gameId || "(empty)"}`);
      return;
    }
    this.callMinigame(gameCfg, (result) => {
      this.lastMinigameResult = ["win", "skipped", "timeout"].includes(result) ? result : "skipped";
      this.pc++;
      this._next();
    });
  },

  // ============ wait ============
  _wait(arg) {
    setTimeout(() => {
      if (this.state === "playing") {
        this.pc++;
        this._next();
      }
    }, arg.ms);
  },

  // ============ effect ============
  _effect(arg) {
    switch (arg.type) {
      case "flash":
        this.dom.effectFlash.classList.remove("is-flash");
        void this.dom.effectFlash.offsetWidth;
        this.dom.effectFlash.classList.add("is-flash");
        GameAudio.sfx("hit");
        break;
      case "shake":
        this.dom.stage.classList.remove("is-shake");
        void this.dom.stage.offsetWidth;
        this.dom.stage.classList.add("is-shake");
        break;
      case "spotlight":
        this.dom.effectSpotlight.classList.toggle("is-on");
        break;
    }
  },

  // ============ montage ============
  _montage(arg) {
    this._clearMontageTimers();
    this.state = "in_montage";
    this.dom.dialogueBox.classList.remove("is-show");
    this.dom.layerMontage.style.display = "block";
    this.dom.layerMontage.classList.remove("is-paused");
    if (arg.bgm) GameAudio.bgm(arg.bgm, 1500);

    // 过滤掉探测失败的照片
    const slides = arg.slides.filter(s => {
      const path = this._photoPath(s.img);
      return this.photoCache[path] !== false;
    });

    this.montage = {
      slides,
      idx: 0,
      paused: false,
      timerId: null,
      dueAt: 0,
      action: null,
      remaining: 0,
    };
    this._syncMontageControls();
    this._playMontageSlide();
  },

  _scheduleMontageAction(action, delay) {
    const session = this.montage;
    if (!session || session.paused) return;
    this._clearMontageTimers();
    session.action = action;
    session.remaining = Math.max(0, delay);
    session.dueAt = performance.now() + session.remaining;
    session.timerId = setTimeout(() => {
      if (this.montage !== session || session.paused) return;
      session.timerId = null;
      session.dueAt = 0;
      session.remaining = 0;
      const nextAction = session.action;
      session.action = null;
      if (nextAction) nextAction();
    }, session.remaining);
  },

  _clearMontageTimers() {
    const session = this.montage;
    if (!session) return;
    if (session.timerId != null) clearTimeout(session.timerId);
    session.timerId = null;
  },

  _playMontageSlide() {
    const session = this.montage;
    if (!session || session.paused) return;
    if (session.idx >= session.slides.length) {
      this._finishMontageSlide();
      return;
    }

    const slide = session.slides[session.idx];
    const path = this._photoPath(slide.img);
    this.dom.montageImg.style.backgroundImage = `url(${path})`;
    this.dom.montageCaption.textContent = (slide.caption || "").replace(/[{}]/g, "");
    this.dom.montageCaption.classList.remove("is-show");
    this.dom.montageImg.classList.add("is-active");

    // 图片先出现，字幕延迟 600ms，再保留 2.9s 后进入下一张。
    this._scheduleMontageAction(() => {
      if (!this.montage || this.montage.paused) return;
      this.dom.montageCaption.classList.add("is-show");
      this._scheduleMontageAction(() => {
        if (!this.montage || this.montage.paused) return;
        this.dom.montageCaption.classList.remove("is-show");
        this.dom.montageImg.classList.remove("is-active");
        this._scheduleMontageAction(() => {
          if (!this.montage || this.montage.paused) return;
          this.montage.idx++;
          this._playMontageSlide();
        }, 800);
      }, 2900);
    }, 600);
  },

  _finishMontageSlide() {
    this._clearMontageTimers();
    if (this.dom.layerMontage) {
      this.dom.layerMontage.classList.remove("is-paused");
      this.dom.layerMontage.style.display = "none";
    }
    if (this.dom.montageImg) {
      this.dom.montageImg.classList.remove("is-active");
      this.dom.montageImg.style.opacity = "";
      this.dom.montageImg.style.transition = "";
    }
    if (this.dom.montageCaption) {
      this.dom.montageCaption.classList.remove("is-show");
      this.dom.montageCaption.style.opacity = "";
      this.dom.montageCaption.style.transition = "";
    }
    this.montage = null;
    this._syncMontageControls(true);
    this.state = "playing";
    this.pc++;
    this._next();
  },

  _freezeMontageVisuals() {
    const layer = this.dom.layerMontage;
    if (!layer) return;
    layer.classList.add("is-paused");
    [this.dom.montageImg, this.dom.montageCaption].filter(Boolean).forEach(node => {
      if (window.getComputedStyle) node.style.opacity = window.getComputedStyle(node).opacity;
      node.style.transition = "none";
    });
  },

  _releaseMontageVisuals() {
    const layer = this.dom.layerMontage;
    if (layer) layer.classList.remove("is-paused");
    [this.dom.montageImg, this.dom.montageCaption].filter(Boolean).forEach(node => {
      node.style.opacity = "";
      node.style.transition = "";
    });
  },

  _toggleMontagePause() {
    const session = this.montage;
    if (!session || this.state !== "in_montage") return;
    if (session.paused) {
      session.paused = false;
      this._releaseMontageVisuals();
      this._syncMontageControls();
      if (session.action) this._scheduleMontageAction(session.action, session.remaining);
      else this._playMontageSlide();
      return;
    }

    session.paused = true;
    if (session.timerId != null) {
      session.remaining = Math.max(0, session.dueAt - performance.now());
      this._clearMontageTimers();
    }
    this._freezeMontageVisuals();
    this._syncMontageControls();
  },

  _syncMontageControls(completed = false) {
    const session = this.montage;
    const paused = Boolean(session && session.paused);
    if (this.dom.montageToggle) {
      this.dom.montageToggle.textContent = paused ? "继续" : "暂停";
      this.dom.montageToggle.setAttribute("aria-label", paused ? "继续照片蒙太奇" : "暂停照片蒙太奇");
      this.dom.montageToggle.setAttribute("aria-pressed", String(paused));
    }
    if (this.dom.montageStatus) {
      this.dom.montageStatus.textContent = completed ? "播放完成" : (paused ? "已暂停" : "播放中");
    }
  },

  _photoPath(key) {
    // key 可能是 "photo1" 或完整路径
    if (key.startsWith("assets/")) return key;
    const idx = parseInt(key.replace("photo", "")) - 1;
    return this.data.images.photos[idx] || "";
  },

  _probePhotos() {
    this.data.images.photos.forEach(path => {
      const img = new Image();
      img.onload = () => { this.photoCache[path] = true; };
      img.onerror = () => { this.photoCache[path] = false; };
      img.src = path;
    });
  },

  // ============ proposal ============
  _proposal() {
    this.state = "in_proposal";
    this.dom.dialogueBox.classList.remove("is-show");
    this.dom.effectSpotlight.classList.add("is-on");
    this.dom.layerProposal.classList.add("is-show");
    this.dom.btnReject.style.transform = "";
    this.dom.btnReject.textContent = "让我想想…";
    this.dom.btnReject.setAttribute("aria-pressed", "false");

    setTimeout(() => this.dom.ringWrap.classList.add("is-show"), 500);
    setTimeout(() => this.dom.proposalText.classList.add("is-show"), 2200);
    setTimeout(() => {
      this.dom.proposalBtns.classList.add("is-show");
      this._startRejectEscape();
    }, 3200);

    // 接受按钮
    this.dom.btnAccept.addEventListener("click", () => this._accept(), { once: true });
  },

  _startRejectEscape() {
    const reject = this.dom.btnReject;
    const showHold = () => {
      this.rejectEscapeCount++;
      this.dom.rejectTip.textContent = "没关系，我们可以慢慢来。";
      this.dom.rejectTip.classList.add("is-show");
      reject.style.transform = "";
      reject.textContent = "让我想想…";
      if (this.proposalTipTimer) clearTimeout(this.proposalTipTimer);
      this.proposalTipTimer = setTimeout(() => this.dom.rejectTip.classList.remove("is-show"), 2400);
    };
    reject.addEventListener("click", showHold);
  },

  _showProposalHold() {
    this.dom.rejectTip.textContent = "没关系，我们可以慢慢来。";
    this.dom.rejectTip.classList.add("is-show");
    if (this.proposalTipTimer) clearTimeout(this.proposalTipTimer);
    this.proposalTipTimer = setTimeout(() => this.dom.rejectTip.classList.remove("is-show"), 2400);
  },

  _accept() {
    GameAudio.sfx("success");
    // 闪白
    this.dom.effectFlash.classList.remove("is-flash");
    void this.dom.effectFlash.offsetWidth;
    this.dom.effectFlash.classList.add("is-flash");
    // 震动
    this.dom.stage.classList.remove("is-shake");
    void this.dom.stage.offsetWidth;
    this.dom.stage.classList.add("is-shake");
    // 金色粒子爆发
    this._burstParticles();
    // 隐藏求婚层，显示结尾
    setTimeout(() => {
      this.dom.layerProposal.classList.remove("is-show");
      this.dom.layerEnding.classList.add("is-show");
      this._startParticles("sakura");
      this.state = "ended";
      // 任意键重新开始
      const restart = () => {
        location.reload();
      };
      setTimeout(() => {
        document.addEventListener("keydown", restart, { once: true });
        document.addEventListener("click", restart, { once: true });
      }, 2000);
    }, 2500);
  },

  // ============ 输入路由 ============
  _bindInputs() {
    // 点击推进
    this.dom.stage.addEventListener("click", (e) => {
      // 点击 UI 元素不推进
      if (e.target.closest("button, .choice-btn, .mg-skip, .hud-btn, .btn-accept, .btn-reject, .start-btn, .start-mute, .montage-toggle")) return;
      if (this.state === "in_minigame" || this.state === "in_montage" || this.state === "in_proposal" || this.state === "ended") return;
      if (this.state === "waiting_choice") return;
      this.advance();
    });
    // 触屏
    this.dom.stage.addEventListener("touchstart", (e) => {
      if (e.target.closest("button, .choice-btn, .mg-skip, .hud-btn, .btn-accept, .btn-reject, .start-btn, .start-mute, .montage-toggle")) return;
      if (this.state === "waiting_input") {
        e.preventDefault();
        this.advance();
      }
    }, { passive: false });

    // 键盘
    document.addEventListener("keydown", (e) => {
      if (this.state === "idle") return;
      if (this.state === "ended") return;

      if (this.state === "waiting_input") {
        if (["Space", "Enter", "ArrowRight", "ArrowDown"].includes(e.code)) {
          e.preventDefault();
          this.advance();
        }
      } else if (this.state === "waiting_choice") {
        if (e.code === "ArrowUp") { e.preventDefault(); this._moveChoice(-1); }
        else if (e.code === "ArrowDown") { e.preventDefault(); this._moveChoice(1); }
        else if (e.code === "Enter") { e.preventDefault(); this.choose(this.selectedChoice); }
      } else if (this.state === "in_montage") {
        // 聚焦按钮时交给按钮自身的 click，避免 Enter/Space 双重切换。
        if (e.target && e.target.closest && e.target.closest("#montageToggle")) return;
        if (e.code === "Space" || e.code === "Enter") {
          e.preventDefault();
          this._toggleMontagePause();
        }
      } else if (this.state === "in_proposal" && e.code === "Escape") {
        e.preventDefault();
        this._showProposalHold();
      }
    });
  },

  // ============ 粒子系统 ============
  _startParticles(type) {
    const canvas = this.dom.particles;
    const ctx = canvas.getContext("2d");
    if (this.particleRAF) cancelAnimationFrame(this.particleRAF);
    this.particles = [];
    const COUNT = type === "sakura" ? 80 : 40;
    for (let i = 0; i < COUNT; i++) {
      this.particles.push(this._newParticle(type, true));
    }
    const tick = () => {
      ctx.clearRect(0, 0, 1920, 1080);
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 1;
        if (p.life <= 0 || p.y > 1100) {
          this.particles[i] = this._newParticle(type, false);
          continue;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.min(1, p.life / 60);
        if (type === "sakura") {
          // 樱花花瓣
          ctx.fillStyle = "#FFB7C5";
          ctx.beginPath();
          ctx.ellipse(0, 0, p.r, p.r * 0.6, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (type === "gold") {
          ctx.fillStyle = "#FFD700";
          ctx.shadowBlur = 12; ctx.shadowColor = "#FFD700";
          ctx.beginPath();
          ctx.arc(0, 0, p.r, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // ambient 光斑
          ctx.fillStyle = "rgba(249,158,42,0.5)";
          ctx.shadowBlur = 8; ctx.shadowColor = "rgba(249,158,42,0.6)";
          ctx.beginPath();
          ctx.arc(0, 0, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      this.particleRAF = requestAnimationFrame(tick);
    };
    tick();
  },

  _newParticle(type, initial) {
    if (type === "sakura") {
      return {
        x: Math.random() * 1920,
        y: initial ? Math.random() * 1080 : -20,
        vx: (Math.random() - 0.5) * 1.5,
        vy: 0.8 + Math.random() * 1.2,
        vr: (Math.random() - 0.5) * 0.05,
        rot: Math.random() * Math.PI * 2,
        r: 4 + Math.random() * 6,
        life: 600 + Math.random() * 400,
      };
    } else if (type === "gold") {
      return {
        x: 960, y: 540,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 12,
        vr: 0, rot: 0,
        r: 3 + Math.random() * 5,
        life: 80 + Math.random() * 60,
      };
    }
    // ambient
    return {
      x: Math.random() * 1920,
      y: Math.random() * 1080,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -0.2 - Math.random() * 0.4,
      vr: 0, rot: 0,
      r: 1.5 + Math.random() * 2.5,
      life: 200 + Math.random() * 200,
    };
  },

  _burstParticles() {
    // 金色爆发
    const canvas = this.dom.particles;
    const ctx = canvas.getContext("2d");
    if (this.particleRAF) cancelAnimationFrame(this.particleRAF);
    this.particles = [];
    for (let i = 0; i < 120; i++) {
      this.particles.push(this._newParticle("gold", true));
    }
    const tick = () => {
      ctx.clearRect(0, 0, 1920, 1080);
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= 1;
        if (p.life <= 0) { this.particles.splice(i, 1); continue; }
        ctx.save();
        ctx.globalAlpha = Math.min(1, p.life / 80);
        ctx.fillStyle = "#FFD700";
        ctx.shadowBlur = 16; ctx.shadowColor = "#FFD700";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (this.particles.length > 0) {
        this.particleRAF = requestAnimationFrame(tick);
      } else {
        this._startParticles("sakura");
      }
    };
    tick();
  },

  // 缩放
  fit() {
    if (!this.dom || !this.dom.stage) return;
    const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    this.dom.stage.style.transform = `translate(-50%,-50%) scale(${s})`;
    this.dom.stage.style.setProperty("--stage-scale", s);
  },
};

// 缩放适配
window.addEventListener("resize", () => Engine.fit());
window.addEventListener("DOMContentLoaded", () => {
  GameAudio.init();
  Engine.init(CONFIG);
  Engine.fit();
});
