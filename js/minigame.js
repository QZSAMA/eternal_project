/* ============================================
   逆转的奶 · Mini 小游戏
   机制：莫伊拉丢紫球(打敌人) / 黄球(奶)
        小美永远在莫伊拉身后，黄球打不到
        唯一解：丢黄球后按 E 让球反向飞回 → 奶到她
        通关后揭示真名：QzSama → 赵启志 / 可乐就是好喝 → 朱盈畅
   Canvas 2D + requestAnimationFrame，零依赖
   ============================================ */

const Minigame = {
  canvas: null,
  ctx: null,
  cfg: null,
  onEnd: null,
  running: false,
  RAF: null,

  // 游戏状态
  player: null,
  mei: null,
  enemies: [],
  orbs: [],
  particles: [],
  timeLeft: 0,
  lastSpawn: 0,
  lastShot: 0,
  healCount: 0,
  wrongShotCount: 0,
  hintShown: false,
  keys: {},
  mouse: { x: 640, y: 360, leftDown: false, rightDown: false },
  startTime: 0,
  lastFrame: 0,
  ended: false,
  endingPhase: 0,     // 0=playing, 1=victory_msg, 2=reveal, 3=done
  endingTimer: 0,

  start(cfg, onEnd) {
    this.cfg = cfg;
    this.onEnd = onEnd;
    this.canvas = document.getElementById("minigameCanvas");
    this.ctx = this.canvas.getContext("2d");
    this.reset();
    this._bindInputs();
    this.running = true;
    this.ended = false;
    this.endingPhase = 0;
    this.startTime = performance.now();
    this.lastFrame = this.startTime;
    this.loop();
  },

  reset() {
    this.player = { x: 640, y: 400, hp: this.cfg.playerHP, r: 20, speed: this.cfg.playerSpeed, facing: 0 };
    this.mei = { x: 640, y: 480, hp: this.cfg.meiHP, r: this.cfg.meiR };
    this.enemies = [];
    this.orbs = [];
    this.particles = [];
    this.timeLeft = this.cfg.duration;
    this.lastSpawn = 0;
    this.lastShot = 0;
    this.healCount = 0;
    this.wrongShotCount = 0;
    this.hintShown = false;
    this.keys = {};
    document.getElementById("mgResult").classList.remove("is-show");
    document.getElementById("mgHint").style.display = "block";
    document.getElementById("mgHint").textContent = "左键 紫球(打敌人) · 右键 黄球(奶) · 按 E 让球反方向飞回 · 奶到身后的小美一次即可通关";
  },

  stop() {
    this.running = false;
    if (this.RAF) cancelAnimationFrame(this.RAF);
    this._unbindInputs();
  },

  _bindInputs() {
    this._keyDown = (e) => {
      this.keys[e.code] = true;
      if (e.code === "Escape") this._skip();
      // E 单次触发：按下时立即处理，松开才允许下一次
      if (e.code === "KeyE" && !this._eHeld) {
        this._eHeld = true;
        this._reverseOrbs();
      }
    };
    this._keyUp = (e) => {
      this.keys[e.code] = false;
      if (e.code === "KeyE") this._eHeld = false;
    };
    this._mouseMove = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const sx = this.canvas.width / rect.width;
      const sy = this.canvas.height / rect.height;
      this.mouse.x = (e.clientX - rect.left) * sx;
      this.mouse.y = (e.clientY - rect.top) * sy;
    };
    this._mouseDown = (e) => {
      e.preventDefault();
      if (e.button === 0) this.mouse.leftDown = true;
      if (e.button === 2) this.mouse.rightDown = true;
    };
    this._mouseUp = (e) => {
      if (e.button === 0) this.mouse.leftDown = false;
      if (e.button === 2) this.mouse.rightDown = false;
    };
    this._contextMenu = (e) => e.preventDefault();
    this._skipBtn = () => this._skip();

    document.addEventListener("keydown", this._keyDown);
    document.addEventListener("keyup", this._keyUp);
    this.canvas.addEventListener("mousemove", this._mouseMove);
    this.canvas.addEventListener("mousedown", this._mouseDown);
    window.addEventListener("mouseup", this._mouseUp);
    this.canvas.addEventListener("contextmenu", this._contextMenu);
    document.getElementById("mgSkip").addEventListener("click", this._skipBtn);
  },

  _unbindInputs() {
    document.removeEventListener("keydown", this._keyDown);
    document.removeEventListener("keyup", this._keyUp);
    this.canvas.removeEventListener("mousemove", this._mouseMove);
    this.canvas.removeEventListener("mousedown", this._mouseDown);
    window.removeEventListener("mouseup", this._mouseUp);
    this.canvas.removeEventListener("contextmenu", this._contextMenu);
    document.getElementById("mgSkip").removeEventListener("click", this._skipBtn);
  },

  _skip() {
    if (this.ended) return;
    this._startEnd("skip");
  },

  loop() {
    if (!this.running) return;
    const now = performance.now();
    const dt = Math.min(50, now - this.lastFrame);
    this.lastFrame = now;
    this._update(dt);
    this._draw();
    this.RAF = requestAnimationFrame(() => this.loop());
  },

  _update(dt) {
    if (this.ended) {
      this._updateEnding(dt);
      return;
    }
    // 时间
    this.timeLeft = Math.max(0, this.cfg.duration - (performance.now() - this.startTime) / 1000);
    if (this.timeLeft <= 0) { this._startEnd("timeout"); return; }

    // 玩家移动
    let mx = 0, my = 0;
    if (this.keys["KeyW"] || this.keys["ArrowUp"]) my -= 1;
    if (this.keys["KeyS"] || this.keys["ArrowDown"]) my += 1;
    if (this.keys["KeyA"] || this.keys["ArrowLeft"]) mx -= 1;
    if (this.keys["KeyD"] || this.keys["ArrowRight"]) mx += 1;
    if (mx || my) {
      const len = Math.hypot(mx, my) || 1;
      this.player.x += (mx / len) * this.player.speed;
      this.player.y += (my / len) * this.player.speed;
    }
    this.player.x = Math.max(40, Math.min(1240, this.player.x));
    this.player.y = Math.max(40, Math.min(680, this.player.y));

    // 朝向（鼠标方向）
    const dx = this.mouse.x - this.player.x;
    const dy = this.mouse.y - this.player.y;
    this.player.facing = Math.atan2(dy, dx);

    // 小美位置：永远在玩家"身后"（朝向反方向）
    this.mei.x = this.player.x - Math.cos(this.player.facing) * this.cfg.meiDistance;
    this.mei.y = this.player.y - Math.sin(this.player.facing) * this.cfg.meiDistance;

    // 射击：左键紫球，右键黄球
    const nowShot = performance.now();
    if (this.mouse.leftDown && nowShot - this.lastShot > this.cfg.fireRate) {
      this.lastShot = nowShot;
      this._fireOrb("purple");
    }
    if (this.mouse.rightDown && nowShot - this.lastShot > this.cfg.fireRate) {
      this.lastShot = nowShot;
      this._fireOrb("yellow");
      // 黄球直直朝前飞 → 永远打不到身后的小美
      this.wrongShotCount++;
      // 摸索提示：玩家丢了几次黄球都没奶到，给一次温柔提示
      if (this.wrongShotCount >= 2 && !this.hintShown) {
        this.hintShown = true;
        this._floatText(this.mei.x, this.mei.y - 30, "（轻声）我一直在你身后……球，可以反方向回来的。", "#9AC");
      }
    }

    // 球更新
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.x += o.vx; o.y += o.vy; o.life--;
      if (o.life <= 0 || o.x < -20 || o.x > 1300 || o.y < -20 || o.y > 740) {
        this.orbs.splice(i, 1); continue;
      }
      if (o.type === "purple") {
        // 紫球打敌人
        let hit = false;
        for (let j = this.enemies.length - 1; j >= 0; j--) {
          const e = this.enemies[j];
          if (Math.hypot(o.x - e.x, o.y - e.y) < e.r + o.r) {
            e.hp -= this.cfg.purpleDamage;
            this._spawnParticles(o.x, o.y, "#9B30FF", 6);
            GameAudio.sfx("hit");
            if (e.hp <= 0) {
              this._spawnParticles(e.x, e.y, "#E44040", 14);
              this.enemies.splice(j, 1);
            }
            hit = true;
            break;
          }
        }
        if (hit) { this.orbs.splice(i, 1); continue; }
      } else {
        // 黄球奶小美（球必须反向飞回才能命中身后的小美）
        if (Math.hypot(o.x - this.mei.x, o.y - this.mei.y) < this.mei.r + o.r) {
          this.mei.hp = Math.min(this.cfg.meiHP, this.mei.hp + this.cfg.yellowHeal);
          this._floatText(this.mei.x, this.mei.y - 30, "+♥ 这次看到了", "#4FC3F7");
          GameAudio.sfx("capture");
          this.healCount++;
          this.orbs.splice(i, 1);
          if (this.healCount >= this.cfg.winHealCount) {
            this._startEnd("win");
            return;
          }
          continue;
        }
      }
    }

    // 敌人生成
    if (performance.now() - this.lastSpawn > this.cfg.enemySpawnInterval && this.enemies.length < this.cfg.enemyMax) {
      this.lastSpawn = performance.now();
      const side = Math.floor(Math.random() * 4);
      let x, y;
      if (side === 0) { x = Math.random() * 1280; y = -20; }
      else if (side === 1) { x = 1300; y = Math.random() * 720; }
      else if (side === 2) { x = Math.random() * 1280; y = 740; }
      else { x = -20; y = Math.random() * 720; }
      this.enemies.push({ x, y, hp: this.cfg.enemyHP, r: 16, speed: this.cfg.enemySpeed });
    }

    // 敌人移动（优先切身后的小美，呼应"她替你扛刀"）
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const tx = this.mei.x, ty = this.mei.y;
      const dx2 = tx - e.x, dy2 = ty - e.y;
      const len = Math.hypot(dx2, dy2) || 1;
      e.x += (dx2 / len) * e.speed;
      e.y += (dy2 / len) * e.speed;
      // 碰撞小美（永不倒，最低 1 血）
      if (Math.hypot(e.x - this.mei.x, e.y - this.mei.y) < e.r + this.mei.r) {
        this.mei.hp = Math.max(1, this.mei.hp - this.cfg.enemyDamage);
        this._spawnParticles(this.mei.x, this.mei.y, "#E44040", 6);
        this.enemies.splice(i, 1);
        if (this.mei.hp <= 10) {
          this._floatText(this.mei.x, this.mei.y - 30, "（轻声）没事……我自己能撑住。", "#9AC");
        }
      }
    }

    // 粒子
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx; p.y += p.vy; p.life--;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    // HUD：小美血条
    document.getElementById("mgHpFill").style.width = Math.max(0, this.mei.hp / this.cfg.meiHP * 100) + "%";
    document.getElementById("mgTimer").textContent = Math.ceil(this.timeLeft);
  },

  _fireOrb(type) {
    const speed = this.cfg.orbSpeed;
    const dx = Math.cos(this.player.facing);
    const dy = Math.sin(this.player.facing);
    this.orbs.push({
      x: this.player.x + dx * 25,
      y: this.player.y + dy * 25,
      vx: dx * speed,
      vy: dy * speed,
      r: this.cfg.orbR,
      life: this.cfg.orbLife,
      type,
      reversed: false,
    });
    GameAudio.sfx("gunshot");
  },

  _reverseOrbs() {
    let any = false;
    for (const o of this.orbs) {
      if (!o.reversed) {
        o.reversed = true;
        o.vx = -o.vx;
        o.vy = -o.vy;
        any = true;
      }
    }
    if (any) GameAudio.sfx("select");
  },

  _startEnd(reason) {
    if (this.ended) return;
    this.ended = true;
    this.endingPhase = 1;
    this.endingTimer = 0;
    document.getElementById("mgHint").style.display = "none";
    const resultEl = document.getElementById("mgResult");
    if (reason === "win") {
      resultEl.textContent = "这次，我奶到你了";
      GameAudio.sfx("success");
    } else if (reason === "skip") {
      resultEl.textContent = "";
      // 跳过也走揭示，但快速
    } else {
      resultEl.textContent = "她一直在你身后";
      GameAudio.sfx("bell");
    }
    resultEl.style.color = "#4FC3F7";
    resultEl.style.fontSize = "56px";
    if (resultEl.textContent) resultEl.classList.add("is-show");
  },

  _updateEnding(dt) {
    this.endingTimer += dt;
    if (this.endingPhase === 1 && this.endingTimer > 1800) {
      this.endingPhase = 2;
      this.endingTimer = 0;
      document.getElementById("mgResult").classList.remove("is-show");
    } else if (this.endingPhase === 2 && this.endingTimer > 3800) {
      this.endingPhase = 3;
      this.stop();
      if (this.onEnd) this.onEnd(this.healCount > 0 ? "win" : "timeout");
    }
  },

  _spawnParticles(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 4;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 2 + Math.random() * 3, color, life: 30 + Math.random() * 20 });
    }
  },

  _floatText(x, y, text, color) {
    const el = document.createElement("div");
    el.className = "mg-float";
    el.textContent = text;
    el.style.color = color;
    el.style.fontSize = "20px";
    el.style.whiteSpace = "nowrap";
    const rect = this.canvas.getBoundingClientRect();
    const wrap = document.getElementById("mgFloats");
    const sx = rect.width / this.canvas.width;
    const sy = rect.height / this.canvas.height;
    el.style.left = (x * sx) + "px";
    el.style.top = (y * sy) + "px";
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  },

  _draw() {
    const ctx = this.ctx;
    const W = 1280, H = 720;
    // 背景
    ctx.fillStyle = "#0a0f19";
    ctx.fillRect(0, 0, W, H);
    // 网格
    ctx.strokeStyle = "rgba(79,195,247,0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // 揭示身份阶段：黑屏 + 文字
    if (this.endingPhase === 2) {
      ctx.fillStyle = "rgba(0,0,0,0.95)";
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = "center";
      const t = this.endingTimer / 3800;
      const fadeIn = Math.min(1, t * 2.5);
      ctx.globalAlpha = fadeIn;
      ctx.fillStyle = "#F5F7FA";
      ctx.font = "bold 28px 'PingFang SC',sans-serif";
      ctx.fillText("原来——", W / 2, H / 2 - 90);
      ctx.font = "bold 44px 'PingFang SC',sans-serif";
      ctx.fillStyle = "#9B30FF";
      ctx.fillText("「QzSama」  →  赵启志", W / 2, H / 2 - 20);
      ctx.fillStyle = "#4FC3F7";
      ctx.fillText("「可乐就是好喝」  →  朱盈畅", W / 2, H / 2 + 50);
      ctx.globalAlpha = Math.min(1, Math.max(0, (t - 0.45) * 2));
      ctx.fillStyle = "#cfe3f0";
      ctx.font = "italic 22px 'PingFang SC',sans-serif";
      ctx.fillText("她终于，从身后走到了你面前。", W / 2, H / 2 + 130);
      ctx.globalAlpha = 1;
      return;
    }

    // 玩家瞄准线 + 朝向指示
    const p = this.player;
    ctx.strokeStyle = "rgba(249,158,42,0.3)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(this.mouse.x, this.mouse.y); ctx.stroke();
    ctx.setLineDash([]);
    const fx = Math.cos(p.facing), fy = Math.sin(p.facing);
    ctx.strokeStyle = "#F99E2A";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + fx * 45, p.y + fy * 45);
    ctx.stroke();

    // 小美（身后那个小点）
    const m = this.mei;
    ctx.save();
    ctx.fillStyle = "#4FC3F7";
    ctx.strokeStyle = "#9AC";
    ctx.lineWidth = 2;
    ctx.shadowBlur = 12; ctx.shadowColor = "#4FC3F7";
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // 小美血条
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(m.x - 18, m.y - m.r - 10, 36, 4);
    ctx.fillStyle = "#4FC3F7";
    ctx.fillRect(m.x - 18, m.y - m.r - 10, 36 * (m.hp / this.cfg.meiHP), 4);
    // 名字
    ctx.fillStyle = "#9AC";
    ctx.font = "12px 'PingFang SC',sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("小美（她）", m.x, m.y + m.r + 16);
    ctx.restore();

    // 玩家本体
    ctx.save();
    ctx.fillStyle = "#9B30FF";
    ctx.strokeStyle = "#F99E2A";
    ctx.lineWidth = 3;
    ctx.shadowBlur = 12; ctx.shadowColor = "#9B30FF";
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#0a0f19";
    ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#F99E2A";
    ctx.font = "12px 'PingFang SC',sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("莫伊拉（你）", p.x, p.y - p.r - 10);
    ctx.restore();

    // 敌人
    for (const e of this.enemies) {
      ctx.save();
      ctx.fillStyle = "#E44040";
      ctx.strokeStyle = "#FF6B6B";
      ctx.lineWidth = 2;
      ctx.shadowBlur = 8; ctx.shadowColor = "#E44040";
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + performance.now() / 500;
        const px = e.x + Math.cos(a) * e.r;
        const py = e.y + Math.sin(a) * e.r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#FF0000";
      ctx.beginPath(); ctx.arc(e.x, e.y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // 球（紫/黄）
    for (const o of this.orbs) {
      ctx.save();
      const color = o.type === "purple" ? "#9B30FF" : "#FFD700";
      ctx.fillStyle = color;
      ctx.shadowBlur = 14; ctx.shadowColor = color;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill();
      // 球尾迹
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(o.x, o.y);
      ctx.lineTo(o.x - o.vx * 1.5, o.y - o.vy * 1.5);
      ctx.stroke();
      ctx.restore();
    }

    // 粒子
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life / 30);
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 8; ctx.shadowColor = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  },
};
