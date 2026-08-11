/* ============================================
   守望先锋主题 Mini 小游戏：守护目标点60秒
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
  enemies: [],
  bullets: [],
  particles: [],
  controlPoint: null,
  captureProgress: 0,
  timeLeft: 0,
  lastSpawn: 0,
  lastHeal: 0,
  healCooldown: 0,
  lastShot: 0,
  keys: {},
  mouse: { x: 640, y: 360, down: false },
  touchMove: { active: false, sx: 0, sy: 0, dx: 0, dy: 0 },
  startTime: 0,
  ended: false,

  start(cfg, onEnd) {
    this.cfg = cfg;
    this.onEnd = onEnd;
    this.canvas = document.getElementById("minigameCanvas");
    this.ctx = this.canvas.getContext("2d");
    this.reset();
    this._bindInputs();
    this.running = true;
    this.ended = false;
    this.startTime = performance.now();
    this.lastFrame = this.startTime;
    this.loop();
  },

  reset() {
    this.player = { x: 640, y: 360, hp: this.cfg.playerHP, r: 18, speed: this.cfg.playerSpeed };
    this.enemies = [];
    this.bullets = [];
    this.particles = [];
    this.controlPoint = { x: 640, y: 360, r: this.cfg.controlRadius };
    this.captureProgress = 0;
    this.timeLeft = this.cfg.duration;
    this.lastSpawn = 0;
    this.lastHeal = 0;
    this.healCooldown = this.cfg.healInterval;
    this.lastShot = 0;
    document.getElementById("mgResult").classList.remove("is-show");
    document.getElementById("mgHint").style.display = "block";
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
    };
    this._keyUp = (e) => { this.keys[e.code] = false; };
    this._mouseMove = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const sx = this.canvas.width / rect.width;
      const sy = this.canvas.height / rect.height;
      this.mouse.x = (e.clientX - rect.left) * sx;
      this.mouse.y = (e.clientY - rect.top) * sy;
    };
    this._mouseDown = (e) => { if (e.button === 0) this.mouse.down = true; };
    this._mouseUp = (e) => { if (e.button === 0) this.mouse.down = false; };
    this._touchStart = (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const sx = this.canvas.width / rect.width;
      const sy = this.canvas.height / rect.height;
      const t = e.touches[0];
      this.touchMove = { active: true, sx: t.clientX, sy: t.clientY, dx: 0, dy: 0, rect, sx2: sx, sy2: sy };
    };
    this._touchMove = (e) => {
      e.preventDefault();
      if (!this.touchMove.active) return;
      const t = e.touches[0];
      this.touchMove.dx = t.clientX - this.touchMove.sx;
      this.touchMove.dy = t.clientY - this.touchMove.sy;
      // 鼠标瞄准用第二指或默认中央
      if (e.touches[1]) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = (e.touches[1].clientX - rect.left) * this.touchMove.sx2;
        this.mouse.y = (e.touches[1].clientY - rect.top) * this.touchMove.sy2;
        this.mouse.down = true;
      }
    };
    this._touchEnd = (e) => {
      this.touchMove.active = false;
      this.mouse.down = false;
    };
    this._skipBtn = () => this._skip();

    document.addEventListener("keydown", this._keyDown);
    document.addEventListener("keyup", this._keyUp);
    this.canvas.addEventListener("mousemove", this._mouseMove);
    this.canvas.addEventListener("mousedown", this._mouseDown);
    window.addEventListener("mouseup", this._mouseUp);
    this.canvas.addEventListener("touchstart", this._touchStart, { passive: false });
    this.canvas.addEventListener("touchmove", this._touchMove, { passive: false });
    this.canvas.addEventListener("touchend", this._touchEnd);
    document.getElementById("mgSkip").addEventListener("click", this._skipBtn);
  },

  _unbindInputs() {
    document.removeEventListener("keydown", this._keyDown);
    document.removeEventListener("keyup", this._keyUp);
    this.canvas.removeEventListener("mousemove", this._mouseMove);
    this.canvas.removeEventListener("mousedown", this._mouseDown);
    window.removeEventListener("mouseup", this._mouseUp);
    this.canvas.removeEventListener("touchstart", this._touchStart);
    this.canvas.removeEventListener("touchmove", this._touchMove);
    this.canvas.removeEventListener("touchend", this._touchEnd);
    document.getElementById("mgSkip").removeEventListener("click", this._skipBtn);
  },

  _skip() {
    if (this.ended) return;
    this._end("skip");
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
    if (this.ended) return;
    // 时间
    this.timeLeft = Math.max(0, this.cfg.duration - (now2sec(performance.now() - this.startTime)));
    if (this.timeLeft <= 0) { this._end("timeout"); return; }

    // 玩家移动
    let mx = 0, my = 0;
    if (this.keys["KeyW"] || this.keys["ArrowUp"]) my -= 1;
    if (this.keys["KeyS"] || this.keys["ArrowDown"]) my += 1;
    if (this.keys["KeyA"] || this.keys["ArrowLeft"]) mx -= 1;
    if (this.keys["KeyD"] || this.keys["ArrowRight"]) mx += 1;
    // 触屏摇杆
    if (this.touchMove.active) {
      const len = Math.hypot(this.touchMove.dx, this.touchMove.dy);
      if (len > 8) { mx = this.touchMove.dx / Math.max(len, 60); my = this.touchMove.dy / Math.max(len, 60); }
    }
    if (mx || my) {
      const len = Math.hypot(mx, my) || 1;
      this.player.x += (mx / len) * this.player.speed;
      this.player.y += (my / len) * this.player.speed;
    }
    this.player.x = Math.max(20, Math.min(1260, this.player.x));
    this.player.y = Math.max(20, Math.min(700, this.player.y));

    // 射击
    if ((this.mouse.down || this.keys["Space"]) && performance.now() - this.lastShot > this.cfg.fireRate) {
      this.lastShot = performance.now();
      const dx = this.mouse.x - this.player.x;
      const dy = this.mouse.y - this.player.y;
      const len = Math.hypot(dx, dy) || 1;
      this.bullets.push({
        x: this.player.x, y: this.player.y,
        vx: (dx / len) * this.cfg.bulletSpeed,
        vy: (dy / len) * this.cfg.bulletSpeed,
        r: 4, life: 90,
      });
      GameAudio.sfx("gunshot");
    }

    // 子弹更新
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx; b.y += b.vy; b.life--;
      if (b.life <= 0 || b.x < 0 || b.x > 1280 || b.y < 0 || b.y > 720) {
        this.bullets.splice(i, 1); continue;
      }
      // 命中敌人
      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const e = this.enemies[j];
        if (Math.hypot(b.x - e.x, b.y - e.y) < e.r + b.r) {
          e.hp -= this.cfg.bulletDamage;
          this._spawnParticles(b.x, b.y, "#F99E2A", 6);
          GameAudio.sfx("hit");
          this.bullets.splice(i, 1);
          if (e.hp <= 0) {
            this._spawnParticles(e.x, e.y, "#E44040", 14);
            this.enemies.splice(j, 1);
          }
          break;
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

    // 敌人移动 + 碰撞
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const dx = this.player.x - e.x, dy = this.player.y - e.y;
      const len = Math.hypot(dx, dy) || 1;
      e.x += (dx / len) * e.speed;
      e.y += (dy / len) * e.speed;
      // 碰撞玩家
      if (Math.hypot(e.x - this.player.x, e.y - this.player.y) < e.r + this.player.r) {
        this.player.hp -= this.cfg.enemyDamage;
        this._spawnParticles(this.player.x, this.player.y, "#E44040", 10);
        this.enemies.splice(i, 1);
        GameAudio.sfx("hit");
        // 屏幕震动
        this.canvas.style.transform = "translate(4px,2px)";
        setTimeout(() => { this.canvas.style.transform = ""; }, 80);
        if (this.player.hp <= 0) { this._revive(); break; }
      }
    }

    // 占点
    const inPoint = Math.hypot(this.player.x - this.controlPoint.x, this.player.y - this.controlPoint.y) < this.controlPoint.r;
    if (inPoint) {
      this.captureProgress = Math.min(this.cfg.winCapture, this.captureProgress + this.cfg.captureRate * dt / 1000);
      if (this.captureProgress >= this.cfg.winCapture) { this._end("win"); return; }
    }

    // 治疗
    this.healCooldown -= dt;
    if (this.healCooldown <= 0) {
      this.healCooldown = this.cfg.healInterval;
      this.player.hp = Math.min(this.cfg.playerHP, this.player.hp + this.cfg.healAmount);
      this._floatText(this.player.x, this.player.y - 30, "+♥ 她在奶你", "#4FC3F7");
      GameAudio.sfx("capture");
    }

    // 粒子
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx; p.y += p.vy; p.life--;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    // HUD
    document.getElementById("mgCapFill").style.width = this.captureProgress + "%";
    document.getElementById("mgHpFill").style.width = Math.max(0, this.player.hp / this.cfg.playerHP * 100) + "%";
    document.getElementById("mgTimer").textContent = Math.ceil(this.timeLeft);
    document.getElementById("mgHealerCd").style.transform = `scaleY(${1 - this.healCooldown / this.cfg.healInterval})`;
  },

  _revive() {
    this._floatText(this.player.x, this.player.y - 40, "她复活了你 ♥", "#4FC3F7");
    this.player.hp = this.cfg.playerHP;
    this.enemies = [];
    GameAudio.sfx("bell");
    // 短暂无敌视觉
    this.canvas.style.filter = "brightness(1.5)";
    setTimeout(() => { this.canvas.style.filter = ""; }, 300);
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
    // 转换 canvas 坐标到 wrap 坐标
    const rect = this.canvas.getBoundingClientRect();
    const wrap = document.getElementById("mgFloats");
    const wrapRect = wrap.getBoundingClientRect();
    const sx = rect.width / this.canvas.width;
    const sy = rect.height / this.canvas.height;
    el.style.left = (x * sx) + "px";
    el.style.top = (y * sy) + "px";
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  },

  _end(reason) {
    if (this.ended) return;
    this.ended = true;
    const resultEl = document.getElementById("mgResult");
    const hintEl = document.getElementById("mgHint");
    hintEl.style.display = "none";
    if (reason === "win" || reason === "skip") {
      resultEl.textContent = "VICTORY";
      resultEl.style.color = "#F99E2A";
      GameAudio.sfx("success");
      // 闪白
      this.canvas.style.filter = "brightness(3)";
      setTimeout(() => { this.canvas.style.filter = ""; }, 200);
    } else {
      // timeout 也算温柔胜利
      resultEl.textContent = "和她一起就很开心";
      resultEl.style.color = "#4FC3F7";
      resultEl.style.fontSize = "56px";
      GameAudio.sfx("bell");
    }
    resultEl.classList.add("is-show");
    setTimeout(() => {
      this.stop();
      if (this.onEnd) this.onEnd(reason);
    }, 1600);
  },

  _draw() {
    const ctx = this.ctx;
    const W = 1280, H = 720;
    // 背景：暗色科技网格
    ctx.fillStyle = "#0a0f19";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(79,195,247,0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // 控制点
    const cp = this.controlPoint;
    const pulse = 0.6 + Math.sin(performance.now() / 300) * 0.15;
    ctx.save();
    // 外圈
    ctx.strokeStyle = `rgba(249,158,42,${pulse})`;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cp.x, cp.y, cp.r, 0, Math.PI * 2); ctx.stroke();
    // 进度环
    ctx.strokeStyle = "#F99E2A";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cp.x, cp.y, cp.r - 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (this.captureProgress / 100));
    ctx.stroke();
    // 内部填充
    ctx.fillStyle = `rgba(249,158,42,${0.1 + (this.captureProgress / 100) * 0.2})`;
    ctx.beginPath(); ctx.arc(cp.x, cp.y, cp.r - 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // 粒子
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life / 30);
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 8; ctx.shadowColor = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // 敌人
    for (const e of this.enemies) {
      ctx.save();
      ctx.fillStyle = "#E44040";
      ctx.strokeStyle = "#FF6B6B";
      ctx.lineWidth = 2;
      ctx.shadowBlur = 8; ctx.shadowColor = "#E44040";
      // 机械单位：六边形
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + performance.now() / 500;
        const px = e.x + Math.cos(a) * e.r;
        const py = e.y + Math.sin(a) * e.r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // 红眼
      ctx.fillStyle = "#FF0000";
      ctx.beginPath(); ctx.arc(e.x, e.y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // 子弹
    for (const b of this.bullets) {
      ctx.save();
      ctx.fillStyle = "#F99E2A";
      ctx.shadowBlur = 10; ctx.shadowColor = "#F99E2A";
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // 玩家
    const p = this.player;
    ctx.save();
    // 瞄准线
    ctx.strokeStyle = "rgba(249,158,42,0.3)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(this.mouse.x, this.mouse.y); ctx.stroke();
    ctx.setLineDash([]);
    // 玩家本体：橙色圆形 + 头像占位
    ctx.fillStyle = "#F99E2A";
    ctx.strokeStyle = "#FFB13B";
    ctx.lineWidth = 3;
    ctx.shadowBlur = 12; ctx.shadowColor = "#F99E2A";
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // 中心点
    ctx.fillStyle = "#0a0f19";
    ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // 治疗光束
    if (this.healCooldown < 1000) {
      ctx.save();
      ctx.strokeStyle = `rgba(79,195,247,${0.6})`;
      ctx.lineWidth = 3;
      ctx.shadowBlur = 12; ctx.shadowColor = "#4FC3F7";
      ctx.beginPath();
      ctx.moveTo(1280, 120);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.restore();
    }
  },
};

function now2sec(ms) { return ms / 1000; }
