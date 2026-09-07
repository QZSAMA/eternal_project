/* 我需要治疗：固定镜头 Canvas 2D 小游戏。 */
const Minigame = {
  cfg: null, onEnd: null, mode: "2d", fallbackCtx: null, fallbackState: null,
  orbs: [], particles: [], ended: false, running: false, raf: null, startTime: 0, timeLeft: 0,
  lastFrame: 0, lastOrbSpawn: 0, needsHealing: false, healingRequestedAt: 0, healCount: 0,
  endingTimer: 0, keys: {}, bound: {}, characterImages: {},
  touchInput: { pointerId: null, moveX: 0, moveY: 0, fireDown: false, reverseHeld: false, supported: false },

  start(cfg, onEnd) {
    this.cfg = cfg || {}; this.onEnd = onEnd; this.reset(); this.mode = "2d";
    try { this._init2D(); } catch (_) { this.mode = "skip"; }
    if (this.mode === "skip") { setTimeout(() => this.onEnd && this.onEnd("skipped"), 0); return; }
    this._bindInputs(); this._bindTouchInputs(); this.running = true;
    this.startTime = performance.now(); this.lastFrame = this.startTime; this.loop();
  },

  reset() {
    this.stop(); this.orbs = []; this.particles = []; this.ended = false; this.running = false;
    this.needsHealing = false; this.healingRequestedAt = 0; this.healCount = 0; this.endingTimer = 0;
    this.timeLeft = Number(this.cfg && this.cfg.duration) || 45; this.lastOrbSpawn = 0; this.keys = {};
    this._resetTouchInput();
    const hint = document.getElementById("mgHint"); if (hint) hint.textContent = "莫伊拉正在投掷紫球 · 按 X / 点击‘我需要治疗’";
    const result = document.getElementById("mgResult"); if (result && result.classList) result.classList.remove("is-show");
  },
  _resetTouchInput() { this.touchInput = { pointerId: null, moveX: 0, moveY: 0, fireDown: false, reverseHeld: false, supported: false }; this._resetTouchKnob(); },
  _resetTouchKnob() { const knob = document.getElementById("mgJoystickKnob"); if (knob && knob.style) knob.style.transform = "translate(-50%, -50%)"; },
  _dtSeconds(dt) { const value = Number(dt); return Number.isFinite(value) && value > 0 ? Math.min(0.05, value / 1000) : 0; },
  _frameScale(dt) { return this._dtSeconds(dt) * 60; },
  _distanceSquaredXZ(a, b) { const dx = a.x - b.x; const dz = (a.z || 0) - (b.z || 0); return dx * dx + dz * dz; },
  _integrateVector(position, velocity, dt) { const s = this._dtSeconds(dt); position.x += velocity.x * s; position.y += velocity.y * s; if ("z" in position) position.z += velocity.z * s; return position; },
  _trimEffectCollection(collection, limit, dispose) { while (collection.length >= limit) { const item = collection.shift(); if (dispose) dispose(item); } },
  _chooseMode() { return "2d"; },

  _init2D() {
    const canvas = document.getElementById("minigameCanvas"); if (!canvas) throw new Error("canvas missing");
    this.fallbackCtx = canvas.getContext("2d"); if (!this.fallbackCtx) { this.mode = "skip"; return; }
    const maxHp = Number(this.cfg.kirikoHP) || 100;
    const initial = Math.max(1, Math.min(maxHp - 1, Number(this.cfg.kirikoInitialHP) || Math.round(maxHp * 0.35)));
    this.fallbackState = { canvas, moira: { x: 420, y: 260 }, kiriko: { x: 860, y: 430, hp: initial, maxHp }, orbs: this.orbs };
    this.kiriko = this.fallbackState.kiriko;
    this._loadCharacterImages();
    canvas.setAttribute?.("aria-label", "我需要治疗：观察莫伊拉的紫球，按 X 请求治疗");
  },
  _loadCharacterImages() {
    this.characterImages = {};
    if (typeof Image !== "function") return;
    const paths = { kiriko: this.cfg.kirikoImage || this.cfg.kiriko, moira: this.cfg.moiraImage || this.cfg.moira };
    Object.entries(paths).forEach(([key, path]) => {
      if (typeof path !== "string" || !path || /^https?:\/\//i.test(path)) return;
      const image = new Image();
      image.onload = () => { this.characterImages[key] = image; };
      image.src = path;
    });
  },

  requestHealing() {
    if (this.needsHealing || this.ended) return false;
    this.needsHealing = true; this.healingRequestedAt = performance.now(); this._convertPurpleOrbsToYellow();
    const status = document.getElementById("mgVoiceStatus"); if (status) status.textContent = "我需要治疗";
    const hint = document.getElementById("mgHint"); if (hint) hint.textContent = "我需要治疗 · 黄球正在回到雾子身边";
    const button = document.getElementById("mgNeedHealing"); if (button) button.disabled = true;
    if (typeof GameAudio !== "undefined" && GameAudio.sfx) GameAudio.sfx("select");
    return true;
  },
  _convertPurpleOrbsToYellow() { const list = this.fallbackState?.orbs || this.orbs; list.forEach(orb => { if (orb.type === "purple") orb.type = "yellow"; }); return list.length; },
  _healKiriko() {
    const kiriko = this.fallbackState?.kiriko || this.kiriko; if (!kiriko) return false;
    kiriko.hp = kiriko.maxHp || Number(this.cfg?.kirikoHP) || 100; this.kiriko = kiriko; this.healCount += 1;
    const status = document.getElementById("mgVoiceStatus"); if (status) status.textContent = "收到治疗，血量已回满";
    this._startEnd("win"); return true;
  },
  _spawnPurpleOrb() {
    const s = this.fallbackState; if (!s) return;
    const dx = s.kiriko.x - s.moira.x, dy = s.kiriko.y - s.moira.y, len = Math.hypot(dx, dy) || 1;
    const speed = Number(this.cfg.orbSpeed) || 4.2;
    this.orbs.push({ x: s.moira.x, y: s.moira.y, vx: dx / len * speed, vy: dy / len * speed, type: this.needsHealing ? "yellow" : "purple", reversed: false, life: Number(this.cfg.orbLife) || 600 });
  },
  _reflectOrb2D(orb, minX = 40, maxX = 1240, minY = 40, maxY = 680) {
    let hit = false;
    if (orb.x <= minX || orb.x >= maxX) { orb.x = Math.max(minX, Math.min(maxX, orb.x)); orb.vx *= -1; hit = true; }
    if (orb.y <= minY || orb.y >= maxY) { orb.y = Math.max(minY, Math.min(maxY, orb.y)); orb.vy *= -1; hit = true; }
    return hit;
  },
  _reflectOrbAtBounds(orb, bound = 38) {
    if (!orb?.mesh?.position) return false; const p = orb.mesh.position; let hit = false;
    if (p.x >= bound && orb.vx > 0) { p.x = bound; orb.vx = -Math.abs(orb.vx); hit = true; }
    else if (p.x <= -bound && orb.vx < 0) { p.x = -bound; orb.vx = Math.abs(orb.vx); hit = true; }
    if (p.z >= bound && orb.vz > 0) { p.z = bound; orb.vz = -Math.abs(orb.vz); hit = true; }
    else if (p.z <= -bound && orb.vz < 0) { p.z = -bound; orb.vz = Math.abs(orb.vz); hit = true; }
    return hit;
  },
  _update(dt, now = performance.now()) {
    if (this.ended) { this._updateEnding(dt); return; }
    const s = this.fallbackState; if (!s) return; const sec = this._dtSeconds(dt);
    this.timeLeft = Math.max(0, (Number(this.cfg.duration) || 45) - (now - this.startTime) / 1000);
    if (this.timeLeft <= 0) { this._startEnd("timeout"); return; }
    if (now - this.lastOrbSpawn >= (Number(this.cfg.orbSpawnInterval) || 1100)) { this.lastOrbSpawn = now; this._spawnPurpleOrb(); }
    for (let i = this.orbs.length - 1; i >= 0; i -= 1) {
      const orb = this.orbs[i]; orb.x += orb.vx * sec * 60; orb.y += orb.vy * sec * 60; orb.life -= sec * 60; this._reflectOrb2D(orb);
      if (orb.type === "purple" && Math.hypot(orb.x - s.kiriko.x, orb.y - s.kiriko.y) < 34) s.kiriko.hp = Math.max(1, s.kiriko.hp - (Number(this.cfg.purpleDamage) || 3));
      if (orb.type === "yellow" && Math.hypot(orb.x - s.kiriko.x, orb.y - s.kiriko.y) < 38) { this.orbs.splice(i, 1); this._healKiriko(); continue; }
      if (orb.life <= 0) this.orbs.splice(i, 1);
    }
    const hp = document.getElementById("mgHpFill"); if (hp) hp.style.width = `${Math.max(0, s.kiriko.hp / s.kiriko.maxHp * 100)}%`;
    const timer = document.getElementById("mgTimer"); if (timer) timer.textContent = Math.ceil(this.timeLeft);
  },
  _updateEnding(dt) { this.endingTimer += Number(dt || 0); if (this.endingTimer > 900) { this.stop(); if (this.onEnd) this.onEnd(this.healCount > 0 ? "win" : "timeout"); } },
  _startEnd(reason) { if (this.ended) return; this.ended = true; this.endingTimer = 0; const result = document.getElementById("mgResult"); if (result) { result.textContent = reason === "win" ? "收到治疗" : "她还在等你"; result.classList.add("is-show"); } },

  _bindInputs() {
    this._unbindInputs();
    this.bound.keyDown = e => { if (e.code === "KeyX") { e.preventDefault(); this.requestHealing(); } else if (e.code === "Escape") { e.preventDefault(); this._skip(); } };
    document.addEventListener("keydown", this.bound.keyDown);
    const button = document.getElementById("mgNeedHealing"); if (button) { this.bound.healClick = () => this.requestHealing(); button.addEventListener("click", this.bound.healClick); }
    const skip = document.getElementById("mgSkip"); if (skip) { this.bound.skip = () => this._skip(); skip.addEventListener("click", this.bound.skip); }
  },
  _unbindInputs() {
    if (this.bound.keyDown) document.removeEventListener?.("keydown", this.bound.keyDown);
    const button = document.getElementById("mgNeedHealing"); if (button && this.bound.healClick) button.removeEventListener?.("click", this.bound.healClick);
    const skip = document.getElementById("mgSkip"); if (skip && this.bound.skip) skip.removeEventListener?.("click", this.bound.skip);
    this.bound.keyDown = this.bound.healClick = this.bound.skip = null;
    this._unbindTouchInputs();
  },
  _skip() { if (!this.ended) this._startEnd("skip"); },
  stop() { this.running = false; if (this.raf) cancelAnimationFrame?.(this.raf); this.raf = null; this._unbindInputs(); },
  loop() { if (!this.running) return; const now = performance.now(); this._update(Math.min(50, now - this.lastFrame), now); this.lastFrame = now; this._draw(); this.raf = requestAnimationFrame(() => this.loop()); },

  _setTouchVector(clientX, clientY, rect) {
    const x = Math.max(-1, Math.min(1, ((clientX - rect.left) / rect.width) * 2 - 1));
    const y = Math.max(-1, Math.min(1, ((clientY - rect.top) / rect.height) * 2 - 1));
    const length = Math.hypot(x, y); if (length < 0.15) return { x: 0, y: 0 };
    return { x: x / Math.max(1, length), y: y / Math.max(1, length) };
  },
  _setTouchAction(type, pressed) {
    if (type === "reverse") { if (pressed && !this.touchInput.reverseHeld) this.requestHealing(); this.touchInput.reverseHeld = pressed; }
    if (type === "heal") { if (pressed) this.requestHealing(); this.touchInput.fireDown = false; }
  },
  _bindTouchInputs() {
    this._unbindTouchInputs();
    const controls = document.getElementById("mgTouchControls");
    if (!controls) return; this.touchInput.supported = true;
    const joystick = document.getElementById("mgJoystick"); if (!joystick) return;
    const update = e => { if (this.touchInput.pointerId !== e.pointerId) return; const rect = joystick.getBoundingClientRect(); const vector = this._setTouchVector(e.clientX, e.clientY, rect); this.touchInput.moveX = vector.x; this.touchInput.moveY = vector.y; };
    const release = e => { if (this.touchInput.pointerId !== e.pointerId) return; this.touchInput.pointerId = null; this.touchInput.moveX = 0; this.touchInput.moveY = 0; this._resetTouchKnob(); try { joystick.releasePointerCapture?.(e.pointerId); } catch (_) {} };
    this.bound.pointerDown = e => { this.touchInput.pointerId = e.pointerId; joystick.setPointerCapture?.(e.pointerId); update(e); e.preventDefault?.(); };
    this.bound.pointerMove = e => { update(e); e.preventDefault?.(); };
    this.bound.pointerUp = release; this.bound.pointerCancel = release;
    joystick.addEventListener("pointerdown", this.bound.pointerDown); joystick.addEventListener("pointermove", this.bound.pointerMove); joystick.addEventListener("pointerup", this.bound.pointerUp); joystick.addEventListener("pointercancel", this.bound.pointerCancel);
  },
  _unbindTouchInputs() {
    const joystick = document.getElementById("mgJoystick");
    if (joystick) { [["pointerdown", "pointerDown"], ["pointermove", "pointerMove"], ["pointerup", "pointerUp"], ["pointercancel", "pointerCancel"]].forEach(([event, key]) => { if (this.bound[key]) joystick.removeEventListener?.(event, this.bound[key]); }); }
    ["pointerDown", "pointerMove", "pointerUp", "pointerCancel", "touchHeal"].forEach(key => { this.bound[key] = null; }); this._resetTouchInput();
  },
  _draw() {
    const ctx = this.fallbackCtx, s = this.fallbackState; if (!ctx || !s) return;
    ctx.clearRect(0, 0, 1280, 720); ctx.fillStyle = "#080d1d"; ctx.fillRect(0, 0, 1280, 720); ctx.strokeStyle = "rgba(79,195,247,.2)";
    for (let x = 40; x < 1280; x += 40) { ctx.beginPath(); ctx.moveTo(x, 40); ctx.lineTo(x, 680); ctx.stroke(); }
    for (let y = 40; y < 680; y += 40) { ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(1240, y); ctx.stroke(); }
    this._drawCharacter(ctx, s.moira, "莫伊拉", "#b06cff"); this._drawCharacter(ctx, s.kiriko, "雾子", "#4fc3f7");
    this.orbs.forEach(orb => { ctx.fillStyle = orb.type === "yellow" ? "#ffd84d" : "#b566ff"; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 18; ctx.beginPath(); ctx.arc(orb.x, orb.y, 12, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; });
    ctx.fillStyle = "#fff"; ctx.font = "24px sans-serif"; ctx.fillText(this.needsHealing ? "我需要治疗" : "莫伊拉正在投掷紫球…", 60, 90);
  },
  _drawCharacter(ctx, point, label, color) {
    const key = label === "雾子" ? "kiriko" : "moira";
    const image = this.characterImages[key];
    if (image && image.complete && image.naturalWidth) {
      const size = 92; ctx.save(); ctx.globalAlpha = 0.96; ctx.drawImage(image, point.x - size / 2, point.y - size / 2, size, size); ctx.restore();
    } else {
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(point.x, point.y, 32, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#fff"; ctx.font = "22px sans-serif"; ctx.fillText(label, point.x - 34, point.y + 62);
  },
};
window.Minigame = Minigame;
