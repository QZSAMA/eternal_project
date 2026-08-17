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
  rejectEscapeCount: 0,
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
      muteBtn: $("muteBtn"),
      layerMontage: $("layerMontage"), montageImg: $("montageImg"), montageCaption: $("montageCaption"),
      layerMinigame: $("layerMinigame"),
      layerProposal: $("layerProposal"), ringWrap: $("ringWrap"), proposalText: $("proposalText"),
      proposalBtns: $("proposalBtns"), btnAccept: $("btnAccept"), btnReject: $("btnReject"), rejectTip: $("rejectTip"),
      layerEnding: $("layerEnding"), endingBig: $("endingBig"), endingSub: $("endingSub"), endingMeta: $("endingMeta"), endingRestart: $("endingRestart"),
      layerStart: $("layerStart"), startTitle: $("startTitle"), startSub: $("startSub"), startBtn: $("startBtn"),
    };

    // 填充标题
    this.dom.startTitle.textContent = data.meta.title.replace(/[{}]/g, "");
    this.dom.endingMeta.textContent = `${data.meta.endingLine.replace(/[{}]/g, "")}\n${data.meta.proposalDate.replace(/[{}]/g, "")}`;

    // 静音按钮
    this.dom.muteBtn.addEventListener("click", () => {
      GameAudio.setMuted(!GameAudio.muted);
      this.dom.muteBtn.classList.toggle("is-muted", GameAudio.muted);
      this.dom.muteBtn.textContent = GameAudio.muted ? "×" : "♪";
    });

    // 开始按钮
    this.dom.startBtn.addEventListener("click", () => {
      GameAudio.unlock();
      this.dom.layerStart.classList.add("is-hidden");
      this.start();
    });

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
    Minigame.start(this.data.minigame, (result) => {
      this.dom.layerMinigame.classList.remove("is-show");
      this.state = "playing";
      if (onEnd) onEnd(result);
    });
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
      default: this.pc++; this._next(); break;
    }
  },

  _end() {
    this.state = "ended";
  },

  // ============ scene ============
  _scene(arg) {
    const url = this.data.images.backgrounds[arg.bg];
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
    if (next.complete) swap();
    else { next.onload = swap; next.onerror = swap; }
  },

  // ============ show ============
  _show(arg) {
    const char = arg.char, expr = arg.expr || "neutral", pos = arg.pos || "left";
    const url = this.data.images.characters[char][expr];
    const slot = pos === "left" ? this.dom.charLeft : pos === "right" ? this.dom.charRight : this.dom.charCenter;
    // 表情切换：若已有立绘，先淡出再换
    if (slot.classList.contains("is-show")) {
      slot.classList.remove("is-show");
      setTimeout(() => {
        slot.innerHTML = `<img class="char-img" src="${url}" alt="" onerror="this.style.display='none'">`;
        requestAnimationFrame(() => slot.classList.add("is-show"));
        this._updateSpeaking();
      }, 200);
    } else {
      slot.innerHTML = `<img class="char-img" src="${url}" alt="" onerror="this.style.display='none'">`;
      requestAnimationFrame(() => slot.classList.add("is-show"));
    }
    slot.dataset.char = char;
    slot.dataset.expr = expr;
    this._updateSpeaking();
  },

  _hide(arg) {
    if (arg.char === "*") {
      [this.dom.charLeft, this.dom.charCenter, this.dom.charRight].forEach(s => {
        s.classList.remove("is-show");
        s.dataset.char = "";
      });
    } else {
      [this.dom.charLeft, this.dom.charCenter, this.dom.charRight].forEach(s => {
        if (s.dataset.char === arg.char) {
          s.classList.remove("is-show");
          s.dataset.char = "";
        }
      });
    }
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
        [this.dom.charLeft, this.dom.charCenter, this.dom.charRight].forEach(s => {
          if (s.dataset.char === who && s.dataset.expr !== arg.expr) {
            const url = this.data.images.characters[who][arg.expr];
            s.classList.remove("is-show");
            setTimeout(() => {
              s.innerHTML = `<img class="char-img" src="${url}" alt="" onerror="this.style.display='none'">`;
              s.dataset.expr = arg.expr;
              requestAnimationFrame(() => s.classList.add("is-show"));
            }, 200);
          }
        });
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
    this.callMinigame(arg.minigame, () => {
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
    this.state = "in_montage";
    this.dom.dialogueBox.classList.remove("is-show");
    this.dom.layerMontage.style.display = "block";
    if (arg.bgm) GameAudio.bgm(arg.bgm, 1500);

    // 过滤掉探测失败的照片
    const slides = arg.slides.filter(s => {
      const path = this._photoPath(s.img);
      return this.photoCache[path] !== false;
    });

    let idx = 0;
    const playSlide = () => {
      if (idx >= slides.length) {
        this.dom.layerMontage.style.display = "none";
        this.dom.montageImg.classList.remove("is-active");
        this.dom.montageCaption.classList.remove("is-show");
        this.state = "playing";
        this.pc++;
        this._next();
        return;
      }
      const s = slides[idx];
      const path = this._photoPath(s.img);
      this.dom.montageImg.style.backgroundImage = `url(${path})`;
      this.dom.montageCaption.textContent = s.caption.replace(/[{}]/g, "");
      this.dom.montageImg.classList.add("is-active");
      setTimeout(() => this.dom.montageCaption.classList.add("is-show"), 600);
      setTimeout(() => {
        this.dom.montageCaption.classList.remove("is-show");
        this.dom.montageImg.classList.remove("is-active");
        setTimeout(() => { idx++; playSlide(); }, 800);
      }, 3500);
    };
    playSlide();
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

    setTimeout(() => this.dom.ringWrap.classList.add("is-show"), 500);
    setTimeout(() => this.dom.proposalText.classList.add("is-show"), 2200);
    setTimeout(() => {
      this.dom.proposalBtns.classList.add("is-show");
      this.dom.btnAccept.focus();
      this._startRejectEscape();
    }, 3200);

    // 接受按钮
    this.dom.btnAccept.addEventListener("click", () => this._accept(), { once: true });
  },

  _startRejectEscape() {
    const reject = this.dom.btnReject;
    const tips = [
      "（系统提示：该选项在当前剧情线不可用，因为他真的很爱你）",
      "再想想？",
      "不许选这个哦",
      "这个按钮只是装饰…",
      "嗯？再考虑一下嘛",
    ];
    const escape = () => {
      this.rejectEscapeCount++;
      const tip = tips[Math.min(this.rejectEscapeCount - 1, tips.length - 1)];
      this.dom.rejectTip.textContent = tip;
      this.dom.rejectTip.classList.add("is-show");
      // 随机移动
      const maxX = 600, maxY = 300;
      const dx = (Math.random() - 0.5) * maxX;
      const dy = (Math.random() - 0.5) * maxY;
      reject.style.transform = `translate(${dx}px, ${dy}px)`;
      reject.textContent = ["让我想想…", "咦？", "啊这", "别点我", "再想想？"][Math.min(this.rejectEscapeCount, 4)];
      GameAudio.sfx("hit");
      setTimeout(() => this.dom.rejectTip.classList.remove("is-show"), 2000);
    };
    reject.addEventListener("mouseenter", escape);
    reject.addEventListener("click", escape);
    reject.addEventListener("focus", escape);
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
      if (e.target.closest("button, .choice-btn, .mg-skip, .hud-btn, .btn-accept, .btn-reject, .start-btn")) return;
      if (this.state === "in_minigame" || this.state === "in_montage" || this.state === "in_proposal" || this.state === "ended") return;
      if (this.state === "waiting_choice") return;
      this.advance();
    });
    // 触屏
    this.dom.stage.addEventListener("touchstart", (e) => {
      if (e.target.closest("button, .choice-btn, .mg-skip, .hud-btn, .btn-accept, .btn-reject, .start-btn")) return;
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
