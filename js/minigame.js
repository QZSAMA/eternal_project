/* ============================================
   逆转的奶 · Three.js 主渲染 + Canvas 2D / skip 降级
   机制不变：
     - 玩家=莫伊拉，第一/第三人称俯视
     - 小美永远在莫伊拉身后（朝向反方向）
     - 左键紫球(打敌人) / 右键黄球(奶)
     - 黄球直直朝前飞，打不到身后的她
     - 按 E 让球反方向飞回 → 奶到小美 → 通关揭示真名
   视觉：3D 场景，发光球体材质，粒子拖尾
   依赖：全局 THREE（由 index.html 从本地 vendor 加载）；WebGL 不可用时不要求 THREE
   ============================================ */

const Minigame = {
  cfg: null,
  onEnd: null,
  scene: null,
  camera: null,
  renderer: null,
  player: null,        // 玩家 mesh
  playerGroup: null,   // 玩家朝向组（球+瞄准锥）
  mei: null,           // 小美 mesh
  enemies: [],
  orbs: [],
  particles: [],
  trails: [],
  orbTextures: { purple: null, yellow: null },
  state: null,
  keys: {},
  mouse: { x: 0, y: 0, nx: 0, ny: 0, leftDown: false, rightDown: false },
  touchInput: { pointerId: null, moveX: 0, moveY: 0, leftDown: false, rightDown: false, reverseHeld: false, supported: false },
  startTime: 0,
  lastFrame: 0,
  lastSpawn: 0,
  lastShot: 0,
  healCount: 0,
  wrongShotCount: 0,
  hintShown: false,
  ended: false,
  endingPhase: 0,
  endingTimer: 0,
  raf: null,
  bound: {},  // 事件回调引用
  mode: "three",
  fallbackCtx: null,
  fallbackState: null,
  playerVelocity: { x: 0, y: 0, z: 0 },
  maxParticles: 240,
  maxTrails: 120,

  start(cfg, onEnd) {
    this.cfg = cfg;
    this.onEnd = onEnd;
    this.reset();
    this.mode = this._chooseMode();
    if (this.mode === "three") {
      try {
        this._initThree();
      } catch (error) {
        console.warn("Three.js/WebGL unavailable; using 2D fallback", error);
        this.mode = "2d";
      }
    }
    if (this.mode === "2d") this._init2D();
    if (this.mode === "skip") {
      this.running = false;
      if (this.onEnd) setTimeout(() => this.onEnd("skipped"), 0);
      return;
    }
    this._bindInputs();
    this.running = true;
    this.ended = false;
    this.endingPhase = 0;
    this.startTime = performance.now();
    this.lastFrame = this.startTime;
    this.loop();
  },

  _chooseMode() {
    // Probe on a disposable canvas: claiming a WebGL context on the game canvas
    // would prevent getContext("2d") from working when Three.js is unavailable.
    const webglAvailable = window.MinigameMode
      ? window.MinigameMode.canCreateWebGL(() => document.createElement("canvas"))
      : false;
    const threeAvailable = typeof THREE !== "undefined" && typeof THREE.WebGLRenderer === "function";
    if (window.MinigameMode) return window.MinigameMode.chooseMinigameMode({ threeAvailable, webglAvailable });
    if (threeAvailable && webglAvailable) return "three";
    return "2d";
  },

  reset() {
    this.enemies = [];
    this.orbs = [];
    this.particles = [];
    this.trails = [];
    this.timeLeft = this.cfg.duration;
    this.lastSpawn = 0;
    this.lastShot = 0;
    this.healCount = 0;
    this.wrongShotCount = 0;
    this.hintShown = false;
    this.keys = {};
    this.playerVelocity.x = 0;
    this.playerVelocity.y = 0;
    this.playerVelocity.z = 0;
    this._resetTouchInput();
    this.ended = false;
    this.endingPhase = 0;
    this.fallbackState = null;
    const hintEl = document.getElementById("mgHint");
    if (hintEl) {
      hintEl.style.display = "block";
      hintEl.textContent = "左键 紫球(打敌人) · 右键 黄球(奶) · 按 E 让球反方向飞回 · 触屏使用摇杆和按钮";
    }
    const r = document.getElementById("mgResult");
    if (r) r.classList.remove("is-show");
  },

  _resetTouchInput() {
    this.touchInput.pointerId = null;
    this.touchInput.moveX = 0;
    this.touchInput.moveY = 0;
    this.touchInput.leftDown = false;
    this.touchInput.rightDown = false;
    this.touchInput.reverseHeld = false;
    this.touchInput.supported = false;
  },

  _setTouchVector(clientX, clientY, rect) {
    const x = Math.max(-1, Math.min(1, ((clientX - rect.left) / rect.width) * 2 - 1));
    const y = Math.max(-1, Math.min(1, ((clientY - rect.top) / rect.height) * 2 - 1));
    const length = Math.hypot(x, y);
    if (length < 0.15) return { x: 0, y: 0 };
    const scale = Math.min(1, length) / (length || 1);
    return { x: x * scale, y: y * scale };
  },

  _setTouchAction(type, pressed) {
    if (type === "purple") this.touchInput.leftDown = pressed;
    if (type === "yellow") this.touchInput.rightDown = pressed;
    if (type === "reverse") {
      if (pressed && !this.touchInput.reverseHeld) this._reverseOrbs();
      this.touchInput.reverseHeld = pressed;
    }
  },

  _init2D() {
    const canvas = document.getElementById("minigameCanvas");
    if (!canvas) throw new Error("minigame canvas not found");
    this.fallbackCtx = canvas.getContext("2d");
    if (!this.fallbackCtx) {
      this.mode = "skip";
      return;
    }
    this.fallbackState = {
      player: { x: 640, y: 360, facingX: 0, facingY: -1 },
      mei: { x: 640, y: 440, hp: this.cfg.meiHP || 100 },
      orbs: [],
      enemies: [],
      lastSpawn: 0,
    };
    const hintEl = document.getElementById("mgHint");
    if (hintEl) hintEl.textContent = "2D 兼容模式：WASD 移动 · 点击发射 · 按 E 让球反向飞回小美 · 触屏使用摇杆和按钮 · 也可跳过";
    const canvasEl = document.getElementById("minigameCanvas");
    if (canvasEl) canvasEl.setAttribute("aria-label", "2D 兼容模式：使用 WASD 移动，点击发射球，按 E 反向球体；触屏使用摇杆和按钮");
  },

  _initThree() {
    // 销毁旧实例
    if (this.renderer) {
      this._disposeScene();
      this.renderer.dispose();
      this.renderer.domElement = null;
    }
    const canvas = document.getElementById("minigameCanvas");
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(1280, 720, false);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0a0f19, 0.012);

    this.camera = new THREE.PerspectiveCamera(55, 1280 / 720, 0.1, 500);
    this.camera.position.set(0, 18, 22);
    this.camera.lookAt(0, 1, 0);

    // 光照
    this.scene.add(new THREE.AmbientLight(0x4a5a7a, 0.5));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(10, 20, 5);
    this.scene.add(dir);
    const p1 = new THREE.PointLight(0x9B30FF, 1.5, 60);
    p1.position.set(-10, 8, -5);
    this.scene.add(p1);
    const p2 = new THREE.PointLight(0x4FC3F7, 1.2, 60);
    p2.position.set(10, 8, 5);
    this.scene.add(p2);

    // 地面网格（守望先锋风格）
    const grid = new THREE.GridHelper(200, 80, 0x4FC3F7, 0x1a2438);
    grid.position.y = 0;
    this.scene.add(grid);
    // 地面发光板
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x0d1424, metalness: 0.7, roughness: 0.4, transparent: true, opacity: 0.85 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    this.scene.add(floor);

    // 玩家（莫伊拉）= 紫色发光胶囊体
    this.playerGroup = new THREE.Group();
    const playerBody = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.8, 1.2, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0x6a1fb0, emissive: 0x9B30FF, emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.4 })
    );
    playerBody.position.y = 1.4;
    this.playerGroup.add(playerBody);
    // 头
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xe8d7ff, emissive: 0x9B30FF, emissiveIntensity: 0.2 })
    );
    head.position.y = 2.6;
    this.playerGroup.add(head);
    // 朝向指示锥（黄）
    const facingCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.4, 1.5, 12),
      new THREE.MeshStandardMaterial({ color: 0xF99E2A, emissive: 0xF99E2A, emissiveIntensity: 0.5 })
    );
    facingCone.rotation.z = -Math.PI / 2;
    facingCone.position.set(1.5, 1.4, 0);
    this.playerGroup.add(facingCone);
    // 玩家光环
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.5, 32),
      new THREE.MeshBasicMaterial({ color: 0x9B30FF, side: THREE.DoubleSide, transparent: true, opacity: 0.5 })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.05;
    this.playerGroup.add(halo);
    this.playerHalo = halo;

    this.player = this.playerGroup;
    this.player.position.set(0, 0, 0);
    this.player.facing = 0;  // 弧度
    this.scene.add(this.player);

    // 小美 = 青蓝色球体（永远在玩家身后）
    const meiGroup = new THREE.Group();
    const meiBody = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.6, 1.0, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0x2a7fb5, emissive: 0x4FC3F7, emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.4 })
    );
    meiBody.position.y = 1.2;
    meiGroup.add(meiBody);
    const meiHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xd7ecff, emissive: 0x4FC3F7, emissiveIntensity: 0.2 })
    );
    meiHead.position.y = 2.2;
    meiGroup.add(meiHead);
    // 小美光环
    const meiHalo = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.15, 32),
      new THREE.MeshBasicMaterial({ color: 0x4FC3F7, side: THREE.DoubleSide, transparent: true, opacity: 0.5 })
    );
    meiHalo.rotation.x = -Math.PI / 2;
    meiHalo.position.y = 0.05;
    meiGroup.add(meiHalo);
    this.meiHalo = meiHalo;
    this.mei = meiGroup;
    this.mei.hp = this.cfg.meiHP;
    this.scene.add(this.mei);

    // 加载球纹理
    this._loadOrbTextures();
  },

  _loadOrbTextures() {
    const texLoader = new THREE.TextureLoader();
    try {
      this.orbTextures.purple = texLoader.load("assets/images/minigame/orb_purple.jpg");
      this.orbTextures.yellow = texLoader.load("assets/images/minigame/orb_yellow.jpg");
    } catch (e) { /* fallback 用纯色 */ }
  },

  _makeOrbMesh(type) {
    const color = type === "purple" ? 0x9B30FF : 0xFFD700;
    const tex = type === "purple" ? this.orbTextures.purple : this.orbTextures.yellow;
    const matOpts = { color: 0xffffff, emissive: color, emissiveIntensity: 0.9, metalness: 0.5, roughness: 0.2 };
    if (tex) matOpts.map = tex;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 24, 24),
      new THREE.MeshStandardMaterial(matOpts)
    );
    // 光晕（双层 sprite 似）
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 16, 16),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25 })
    );
    mesh.add(glow);
    // 点光源
    const light = new THREE.PointLight(color, 1.0, 8);
    mesh.add(light);
    return mesh;
  },

  _makeEnemyMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.8, 0),
      new THREE.MeshStandardMaterial({ color: 0x441010, emissive: 0xE44040, emissiveIntensity: 0.7, metalness: 0.4, roughness: 0.3 })
    );
    body.position.y = 1.2;
    g.add(body);
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(1.0, 1.2, 16),
      new THREE.MeshBasicMaterial({ color: 0xE44040, side: THREE.DoubleSide, transparent: true, opacity: 0.4 })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.05;
    g.add(halo);
    return g;
  },

  _touchCapable() {
    const points = Number((window.navigator && window.navigator.maxTouchPoints) || 0);
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    return points > 0 || Boolean(coarse);
  },

  _syncTouchControlsVisibility() {
    const controls = document.getElementById("mgTouchControls");
    if (!controls || !controls.classList || !controls.classList.toggle) return;
    controls.classList.toggle("is-visible", Boolean(this.touchInput.supported));
  },

  _setJoystickFromEvent(event) {
    const joystick = document.getElementById("mgJoystick");
    const knob = document.getElementById("mgJoystickKnob");
    if (!joystick || !joystick.getBoundingClientRect) return;
    const vector = this._setTouchVector(event.clientX, event.clientY, joystick.getBoundingClientRect());
    this.touchInput.moveX = vector.x;
    this.touchInput.moveY = vector.y;
    if (knob && knob.style) {
      const maxOffset = Math.max(24, Math.min(46, joystick.getBoundingClientRect().width * 0.26));
      knob.style.transform = `translate(calc(-50% + ${vector.x * maxOffset}px), calc(-50% + ${vector.y * maxOffset}px))`;
    }
  },

  _releaseTouchJoystick(pointerId) {
    if (pointerId !== this.touchInput.pointerId) return;
    const joystick = document.getElementById("mgJoystick");
    if (joystick && joystick.releasePointerCapture) {
      try { joystick.releasePointerCapture(pointerId); } catch (error) { /* capture may already be released */ }
    }
    this.touchInput.pointerId = null;
    this.touchInput.moveX = 0;
    this.touchInput.moveY = 0;
    const knob = document.getElementById("mgJoystickKnob");
    if (knob && knob.style) knob.style.transform = "translate(-50%,-50%)";
  },

  _bindTouchInputs() {
    // A game restart can invoke start() again without a full stop(). Remove
    // the previous pointer handlers first so actions stay edge-triggered.
    if (this.bound.touchNodes && this.bound.touchNodes.length) this._unbindTouchInputs();
    const controls = document.getElementById("mgTouchControls");
    const joystick = document.getElementById("mgJoystick");
    if (!controls || !joystick || typeof window.PointerEvent !== "function" || !this._touchCapable()) {
      this._syncTouchControlsVisibility();
      return;
    }

    this.touchInput.supported = true;
    this._syncTouchControlsVisibility();
    this.bound.touchNodes = [];
    const bind = (node, type, handler) => {
      if (!node || !node.addEventListener) return;
      node.addEventListener(type, handler);
      this.bound.touchNodes.push({ node, type, handler });
    };

    this.bound.touchJoyDown = (event) => {
      if (this.touchInput.pointerId !== null) return;
      event.preventDefault();
      this.touchInput.pointerId = event.pointerId;
      if (joystick.setPointerCapture) {
        try { joystick.setPointerCapture(event.pointerId); } catch (error) { /* optional API */ }
      }
      this._setJoystickFromEvent(event);
    };
    this.bound.touchJoyMove = (event) => {
      if (event.pointerId === this.touchInput.pointerId) {
        event.preventDefault();
        this._setJoystickFromEvent(event);
      }
    };
    this.bound.touchJoyEnd = (event) => this._releaseTouchJoystick(event.pointerId);
    this.bound.touchActionEnd = () => {
      this._setTouchAction("purple", false);
      this._setTouchAction("yellow", false);
    };
    this.bound.touchPurpleDown = (event) => { event.preventDefault(); this._setTouchAction("purple", true); };
    this.bound.touchPurpleUp = () => this._setTouchAction("purple", false);
    this.bound.touchYellowDown = (event) => { event.preventDefault(); this._setTouchAction("yellow", true); };
    this.bound.touchYellowUp = () => this._setTouchAction("yellow", false);
    this.bound.touchPurpleKeyDown = (event) => {
      if (event.code === "Space" || event.code === "Enter") { event.preventDefault(); this._setTouchAction("purple", true); }
    };
    this.bound.touchPurpleKeyUp = (event) => {
      if (event.code === "Space" || event.code === "Enter") this._setTouchAction("purple", false);
    };
    this.bound.touchYellowKeyDown = (event) => {
      if (event.code === "Space" || event.code === "Enter") { event.preventDefault(); this._setTouchAction("yellow", true); }
    };
    this.bound.touchYellowKeyUp = (event) => {
      if (event.code === "Space" || event.code === "Enter") this._setTouchAction("yellow", false);
    };
    this.bound.touchReverse = (event) => {
      event.preventDefault();
      this._setTouchAction("reverse", true);
      this._setTouchAction("reverse", false);
    };

    bind(joystick, "pointerdown", this.bound.touchJoyDown);
    bind(joystick, "pointermove", this.bound.touchJoyMove);
    bind(joystick, "pointerup", this.bound.touchJoyEnd);
    bind(joystick, "pointercancel", this.bound.touchJoyEnd);
    const purple = document.getElementById("mgTouchPurple");
    const yellow = document.getElementById("mgTouchYellow");
    const reverse = document.getElementById("mgTouchReverse");
    bind(purple, "pointerdown", this.bound.touchPurpleDown);
    bind(purple, "pointerup", this.bound.touchPurpleUp);
    bind(purple, "pointercancel", this.bound.touchPurpleUp);
    bind(purple, "keydown", this.bound.touchPurpleKeyDown);
    bind(purple, "keyup", this.bound.touchPurpleKeyUp);
    bind(yellow, "pointerdown", this.bound.touchYellowDown);
    bind(yellow, "pointerup", this.bound.touchYellowUp);
    bind(yellow, "pointercancel", this.bound.touchYellowUp);
    bind(yellow, "keydown", this.bound.touchYellowKeyDown);
    bind(yellow, "keyup", this.bound.touchYellowKeyUp);
    bind(reverse, "click", this.bound.touchReverse);
    bind(window, "pointerup", this.bound.touchActionEnd);
    bind(window, "pointercancel", this.bound.touchActionEnd);
  },

  _unbindTouchInputs() {
    (this.bound.touchNodes || []).forEach(({ node, type, handler }) => {
      if (node && node.removeEventListener) node.removeEventListener(type, handler);
    });
    this.bound.touchNodes = [];
    this._resetTouchInput();
    this._syncTouchControlsVisibility();
  },

  _readMoveVector() {
    if (this.touchInput.pointerId !== null) {
      return { mx: this.touchInput.moveX, my: this.touchInput.moveY };
    }
    let mx = 0;
    let my = 0;
    if (this.keys["KeyW"] || this.keys["ArrowUp"]) my -= 1;
    if (this.keys["KeyS"] || this.keys["ArrowDown"]) my += 1;
    if (this.keys["KeyA"] || this.keys["ArrowLeft"]) mx -= 1;
    if (this.keys["KeyD"] || this.keys["ArrowRight"]) mx += 1;
    return { mx, my };
  },

  _readAimVector() {
    if (this.touchInput.pointerId !== null && (this.touchInput.moveX || this.touchInput.moveY)) {
      return { x: this.touchInput.moveX, y: this.touchInput.moveY, active: true };
    }
    return { x: this.mouse.nx, y: this.mouse.ny, active: false };
  },

  _spawnParticles(x, y, z, color, n) {
    for (let i = 0; i < n; i++) {
      this._trimEffectCollection(this.particles, this.maxParticles, (stale) => {
        this.scene.remove(stale);
        stale.geometry.dispose();
        stale.material.dispose();
      });
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.1 + Math.random() * 0.15, 6, 6),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
      );
      m.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2;
      const elev = Math.random() * Math.PI;
      const s = 0.05 + Math.random() * 0.15;
      m.userData = {
        vx: Math.cos(a) * Math.sin(elev) * s,
        vy: Math.cos(elev) * s + 0.05,
        vz: Math.sin(a) * Math.sin(elev) * s,
        life: 30 + Math.random() * 20,
        maxLife: 50,
      };
      this.scene.add(m);
      this.particles.push(m);
    }
  },

  _bindInputs() {
    this.bound.keyDown = (e) => {
      this.keys[e.code] = true;
      if (e.code === "Escape") this._skip();
      if (e.code === "KeyE" && !this._eHeld) {
        this._eHeld = true;
        this._reverseOrbs();
      }
    };
    this.bound.keyUp = (e) => {
      this.keys[e.code] = false;
      if (e.code === "KeyE") this._eHeld = false;
    };
    this.bound.mouseMove = (e) => {
      const c = document.getElementById("minigameCanvas");
      const rect = c.getBoundingClientRect();
      const mapped = window.MinigameMode
        ? window.MinigameMode.mapPointerToCanvas({
          clientX: e.clientX,
          clientY: e.clientY,
          rect,
          canvasWidth: c.width,
          canvasHeight: c.height,
        })
        : {
          x: (e.clientX - rect.left) * c.width / rect.width,
          y: (e.clientY - rect.top) * c.height / rect.height,
        };
      this.mouse.x = mapped.x;
      this.mouse.y = mapped.y;
      this.mouse.nx = mapped.nx ?? (mapped.x / c.width) * 2 - 1;
      this.mouse.ny = mapped.ny ?? 1 - (mapped.y / c.height) * 2;
    };
    this.bound.mouseDown = (e) => {
      e.preventDefault();
      if (e.button === 0) this.mouse.leftDown = true;
      if (e.button === 2) this.mouse.rightDown = true;
    };
    this.bound.mouseUp = (e) => {
      if (e.button === 0) this.mouse.leftDown = false;
      if (e.button === 2) this.mouse.rightDown = false;
    };
    this.bound.ctx = (e) => e.preventDefault();
    this.bound.skip = () => this._skip();
    const c = document.getElementById("minigameCanvas");
    document.addEventListener("keydown", this.bound.keyDown);
    document.addEventListener("keyup", this.bound.keyUp);
    c.addEventListener("mousemove", this.bound.mouseMove);
    c.addEventListener("mousedown", this.bound.mouseDown);
    window.addEventListener("mouseup", this.bound.mouseUp);
    c.addEventListener("contextmenu", this.bound.ctx);
    const skipBtn = document.getElementById("mgSkip");
    if (skipBtn) skipBtn.addEventListener("click", this.bound.skip);
    this._bindTouchInputs();
  },

  _unbindInputs() {
    const c = document.getElementById("minigameCanvas");
    document.removeEventListener("keydown", this.bound.keyDown);
    document.removeEventListener("keyup", this.bound.keyUp);
    c.removeEventListener("mousemove", this.bound.mouseMove);
    c.removeEventListener("mousedown", this.bound.mouseDown);
    window.removeEventListener("mouseup", this.bound.mouseUp);
    c.removeEventListener("contextmenu", this.bound.ctx);
    const skipBtn = document.getElementById("mgSkip");
    if (skipBtn) skipBtn.removeEventListener("click", this.bound.skip);
    this._unbindTouchInputs();
  },

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this._unbindInputs();
    this.fallbackCtx = null;
    this.fallbackState = null;
  },

  _disposeScene() {
    if (!this.scene) return;
    this.scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
    this.scene = null;
  },

  _skip() {
    if (this.ended) return;
    this._startEnd("skip");
  },

  _clampDtMs(dt) {
    const value = Number(dt);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.min(50, value);
  },

  _dtSeconds(dt) {
    return this._clampDtMs(dt) / 1000;
  },

  _frameScale(dt) {
    return this._clampDtMs(dt) / (1000 / 60);
  },

  _integrateVector(position, velocity, dt) {
    const seconds = this._dtSeconds(dt);
    position.x += velocity.x * seconds;
    position.y += velocity.y * seconds;
    if (Object.prototype.hasOwnProperty.call(position, "z")) position.z += velocity.z * seconds;
    return position;
  },

  _distanceSquaredXZ(a, b) {
    const dx = a.x - b.x;
    const dz = (a.z || 0) - (b.z || 0);
    return dx * dx + dz * dz;
  },

  _trimEffectCollection(collection, limit, dispose) {
    if (!Array.isArray(collection) || !Number.isFinite(limit) || limit < 1) return;
    while (collection.length >= limit) {
      const oldest = collection.shift();
      if (typeof dispose === "function") dispose(oldest);
    }
  },

  loop() {
    if (!this.running) return;
    const now = performance.now();
    const dt = this._clampDtMs(now - this.lastFrame);
    this.lastFrame = now;
    this._update(dt, now);
    this._draw();
    this.raf = requestAnimationFrame(() => this.loop());
  },

  _update(dt, now = performance.now()) {
    if (this.mode === "2d") {
      this._update2D(dt, now);
      return;
    }
    if (this.ended) { this._updateEnding(dt); return; }

    const frameScale = this._frameScale(dt);

    // 时间
    this.timeLeft = Math.max(0, this.cfg.duration - (now - this.startTime) / 1000);
    if (this.timeLeft <= 0) { this._startEnd("timeout"); return; }

    // 玩家移动（WASD 相对世界，简化）
    const move = this._readMoveVector();
    const mx = move.mx;
    const my = move.my;
    if (mx || my) {
      const len = Math.hypot(mx, my) || 1;
      const speed = (this.cfg.playerSpeed || 4) * 3.6;
      this.playerVelocity.x = (mx / len) * speed;
      this.playerVelocity.y = 0;
      this.playerVelocity.z = (my / len) * speed;
      this._integrateVector(this.player.position, this.playerVelocity, dt);
    }
    // 限制范围
    this.player.position.x = Math.max(-40, Math.min(40, this.player.position.x));
    this.player.position.z = Math.max(-40, Math.min(40, this.player.position.z));

    // 朝向：基于鼠标位置（屏幕中心=正前方）
    // 鼠标在屏幕的位置决定朝向角度
    const aim = this._readAimVector();
    const facing = Math.atan2(aim.x, -aim.y);
    this.player.facing = facing;
    this.player.rotation.y = facing;

    // 小美：永远在玩家"身后"（朝向反方向）距离 meiDistance/10
    const dist = (this.cfg.meiDistance || 80) / 10;  // 转换到 3D 单位
    const bx = this.player.position.x - Math.sin(facing) * dist;
    const bz = this.player.position.z - Math.cos(facing) * dist;
    this.mei.position.x = bx;
    this.mei.position.z = bz;
    this.mei.rotation.y = facing + Math.PI;  // 看向玩家方向
    // 光环旋转
    if (this.playerHalo) this.playerHalo.rotation.z += 0.02 * frameScale;
    if (this.meiHalo) this.meiHalo.rotation.z -= 0.015 * frameScale;

    // 射击
    const nowShot = now;
    if ((this.mouse.leftDown || this.touchInput.leftDown) && nowShot - this.lastShot > this.cfg.fireRate) {
      this.lastShot = nowShot;
      this._fireOrb("purple");
    }
    if ((this.mouse.rightDown || this.touchInput.rightDown) && nowShot - this.lastShot > this.cfg.fireRate) {
      this.lastShot = nowShot;
      this._fireOrb("yellow");
      this.wrongShotCount++;
      if (this.wrongShotCount >= 2 && !this.hintShown) {
        this.hintShown = true;
        this._floatText(this.mei.position.x, 3, this.mei.position.z, "（轻声）我一直在你身后……球，可以反方向回来的。", "#9AC");
      }
    }

    // 球更新
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.mesh.position.x += o.vx * frameScale;
      o.mesh.position.y += o.vy * frameScale;
      o.mesh.position.z += o.vz * frameScale;
      o.life -= frameScale;
      // 拖尾
      o.trailAccumulator = (o.trailAccumulator || 0) + frameScale;
      if (o.trailAccumulator >= 2) {
        o.trailAccumulator %= 2;
        this._trimEffectCollection(this.trails, this.maxTrails, (stale) => {
          this.scene.remove(stale);
          stale.geometry.dispose();
          stale.material.dispose();
        });
        const trail = new THREE.Mesh(
          new THREE.SphereGeometry(0.35, 8, 8),
          new THREE.MeshBasicMaterial({
            color: o.type === "purple" ? 0x9B30FF : 0xFFD700,
            transparent: true, opacity: 0.4
          })
        );
        trail.position.copy(o.mesh.position);
        trail.userData = { life: 15, max: 15 };
        this.scene.add(trail);
        this.trails.push(trail);
      }
      if (o.life <= 0) {
        this._removeOrb(i);
        continue;
      }
      if (o.type === "purple") {
        // 紫球打敌人
        let hit = false;
        for (let j = this.enemies.length - 1; j >= 0; j--) {
          const e = this.enemies[j];
          if (this._distanceSquaredXZ(o.mesh.position, e.mesh.position) < 1.2 * 1.2) {
            e.hp -= this.cfg.purpleDamage;
            this._spawnParticles(o.mesh.position.x, o.mesh.position.y, o.mesh.position.z, 0x9B30FF, 6);
            GameAudio.sfx("hit");
            if (e.hp <= 0) {
              this._spawnParticles(e.mesh.position.x, e.mesh.position.y, e.mesh.position.z, 0xE44040, 14);
              this.scene.remove(e.mesh);
              this.enemies.splice(j, 1);
            }
            hit = true;
            break;
          }
        }
        if (hit) { this._removeOrb(i); continue; }
      } else {
        // 黄球奶小美
        if (this._distanceSquaredXZ(o.mesh.position, this.mei.position) < 1.5 * 1.5) {
          this.mei.hp = Math.min(this.cfg.meiHP, this.mei.hp + this.cfg.yellowHeal);
          this._floatText(this.mei.position.x, 3, this.mei.position.z, "+♥ 这次看到了", "#4FC3F7");
          GameAudio.sfx("capture");
          this.healCount++;
          this._removeOrb(i);
          if (this.healCount >= this.cfg.winHealCount) {
            this._startEnd("win");
            return;
          }
          continue;
        }
      }
    }

    // 拖尾衰减
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const t = this.trails[i];
      t.userData.life -= frameScale;
      t.material.opacity = (t.userData.life / t.userData.max) * 0.4;
      t.scale.multiplyScalar(Math.pow(0.92, frameScale));
      if (t.userData.life <= 0) {
        this.scene.remove(t);
        t.geometry.dispose(); t.material.dispose();
        this.trails.splice(i, 1);
      }
    }

    // 敌人生成
    if (now - this.lastSpawn > this.cfg.enemySpawnInterval && this.enemies.length < this.cfg.enemyMax) {
      this.lastSpawn = now;
      const angle = Math.random() * Math.PI * 2;
      const r = 25 + Math.random() * 10;
      const ex = this.player.position.x + Math.cos(angle) * r;
      const ez = this.player.position.z + Math.sin(angle) * r;
      const m = this._makeEnemyMesh();
      m.position.set(ex, 0, ez);
      this.scene.add(m);
      this.enemies.push({ mesh: m, hp: this.cfg.enemyHP, speed: (this.cfg.enemySpeed || 1) * 0.04 });
    }

    // 敌人移动（朝向小美）
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const dx = this.mei.position.x - e.mesh.position.x;
      const dz = this.mei.position.z - e.mesh.position.z;
      const len = Math.hypot(dx, dz) || 1;
      e.mesh.position.x += (dx / len) * e.speed * frameScale;
      e.mesh.position.z += (dz / len) * e.speed * frameScale;
      // 旋转动画
      e.mesh.children[0].rotation.y += 0.04 * frameScale;
      e.mesh.children[0].rotation.x += 0.02 * frameScale;
      // 碰撞小美
      if (e.mesh.position.distanceTo(this.mei.position) < 1.4) {
        this.mei.hp = Math.max(1, this.mei.hp - this.cfg.enemyDamage);
        this._spawnParticles(this.mei.position.x, 1.5, this.mei.position.z, 0xE44040, 6);
        this.scene.remove(e.mesh);
        this.enemies.splice(i, 1);
        if (this.mei.hp <= 10) {
          this._floatText(this.mei.position.x, 3, this.mei.position.z, "（轻声）没事……我自己能撑住。", "#9AC");
        }
      }
    }

    // 粒子
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.position.x += p.userData.vx * frameScale;
      p.position.y += p.userData.vy * frameScale;
      p.position.z += p.userData.vz * frameScale;
      p.userData.vy -= 0.003 * frameScale;
      p.userData.life -= frameScale;
      p.material.opacity = Math.max(0, p.userData.life / p.userData.maxLife);
      if (p.userData.life <= 0) {
        this.scene.remove(p);
        p.geometry.dispose(); p.material.dispose();
        this.particles.splice(i, 1);
      }
    }

    // 相机跟随玩家
    this.camera.position.x = this.player.position.x;
    this.camera.position.z = this.player.position.z + 22;
    this.camera.lookAt(this.player.position.x, 1, this.player.position.z - 5);

    // HUD
    const hpEl = document.getElementById("mgHpFill");
    if (hpEl) hpEl.style.width = Math.max(0, this.mei.hp / this.cfg.meiHP * 100) + "%";
    const tEl = document.getElementById("mgTimer");
    if (tEl) tEl.textContent = Math.ceil(this.timeLeft);
  },

  _update2D(dt, now = performance.now()) {
    if (this.ended) { this._updateEnding(dt); return; }
    const state = this.fallbackState;
    if (!state) return;
    const seconds = this._dtSeconds(dt);
    this.timeLeft = Math.max(0, this.cfg.duration - (now - this.startTime) / 1000);
    if (this.timeLeft <= 0) { this._startEnd("timeout"); return; }

    const move = this._readMoveVector();
    const mx = move.mx;
    const my = move.my;
    const speed = (this.cfg.playerSpeed || 4) * 60;
    if (mx || my) {
      const length = Math.hypot(mx, my) || 1;
      state.player.x = Math.max(30, Math.min(1250, state.player.x + (mx / length) * speed * seconds));
      state.player.y = Math.max(30, Math.min(690, state.player.y + (my / length) * speed * seconds));
    }

    const aim = this._readAimVector();
    if (aim.active) {
      state.player.facingX = aim.x;
      state.player.facingY = aim.y;
    } else {
      const dx = this.mouse.x - state.player.x;
      const dy = this.mouse.y - state.player.y;
      const aimLength = Math.hypot(dx, dy) || 1;
      state.player.facingX = dx / aimLength;
      state.player.facingY = dy / aimLength;
    }
    state.mei.x = state.player.x - state.player.facingX * (this.cfg.meiDistance || 80);
    state.mei.y = state.player.y - state.player.facingY * (this.cfg.meiDistance || 80);

    if ((this.mouse.leftDown || this.touchInput.leftDown) && now - this.lastShot > (this.cfg.fireRate || 400)) {
      this.lastShot = now;
      this._fireOrb2D("purple");
    }
    if ((this.mouse.rightDown || this.touchInput.rightDown) && now - this.lastShot > (this.cfg.fireRate || 400)) {
      this.lastShot = now;
      this._fireOrb2D("yellow");
      this.wrongShotCount++;
      if (this.wrongShotCount >= 2 && !this.hintShown) {
        this.hintShown = true;
        this._floatText2D("按 E，让黄球反向飞回她身边", "#9AC");
      }
    }

    for (let i = state.orbs.length - 1; i >= 0; i--) {
      const orb = state.orbs[i];
      orb.x += orb.vx * seconds;
      orb.y += orb.vy * seconds;
      orb.life -= seconds * 60;
      if (orb.life <= 0 || orb.x < -30 || orb.x > 1310 || orb.y < -30 || orb.y > 750) {
        state.orbs.splice(i, 1);
        continue;
      }
      if (orb.type === "purple") {
        let hit = false;
        for (let j = state.enemies.length - 1; j >= 0; j--) {
          const enemy = state.enemies[j];
          if (Math.hypot(orb.x - enemy.x, orb.y - enemy.y) < 24) {
            enemy.hp -= this.cfg.purpleDamage || 30;
            hit = true;
            if (enemy.hp <= 0) state.enemies.splice(j, 1);
            break;
          }
        }
        if (hit) state.orbs.splice(i, 1);
      } else if (Math.hypot(orb.x - state.mei.x, orb.y - state.mei.y) < 28) {
        state.mei.hp = Math.min(this.cfg.meiHP || 100, state.mei.hp + (this.cfg.yellowHeal || 40));
        this.healCount++;
        this._floatText2D("+♥ 这次看到了", "#4FC3F7");
        state.orbs.splice(i, 1);
        if (this.healCount >= (this.cfg.winHealCount || 1)) {
          this._startEnd("win");
          return;
        }
      }
    }

    if (now - state.lastSpawn > (this.cfg.enemySpawnInterval || 2200) && state.enemies.length < (this.cfg.enemyMax || 5)) {
      state.lastSpawn = now;
      const angle = Math.random() * Math.PI * 2;
      const radius = 260 + Math.random() * 100;
      state.enemies.push({
        x: Math.max(20, Math.min(1260, state.mei.x + Math.cos(angle) * radius)),
        y: Math.max(20, Math.min(700, state.mei.y + Math.sin(angle) * radius)),
        hp: this.cfg.enemyHP || 30,
      });
    }
    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const enemy = state.enemies[i];
      const ex = state.mei.x - enemy.x;
      const ey = state.mei.y - enemy.y;
      const length = Math.hypot(ex, ey) || 1;
      const enemySpeed = (this.cfg.enemySpeed || 1) * 60;
      enemy.x += (ex / length) * enemySpeed * seconds;
      enemy.y += (ey / length) * enemySpeed * seconds;
      if (Math.hypot(enemy.x - state.mei.x, enemy.y - state.mei.y) < 24) {
        state.mei.hp = Math.max(1, state.mei.hp - (this.cfg.enemyDamage || 8));
        state.enemies.splice(i, 1);
      }
    }
    const hpEl = document.getElementById("mgHpFill");
    if (hpEl) hpEl.style.width = Math.max(0, state.mei.hp / (this.cfg.meiHP || 100) * 100) + "%";
    const tEl = document.getElementById("mgTimer");
    if (tEl) tEl.textContent = Math.ceil(this.timeLeft);
  },

  _fireOrb2D(type) {
    const state = this.fallbackState;
    if (!state) return;
    const speed = (this.cfg.orbSpeed || 7) * 60;
    state.orbs.push({
      x: state.player.x + state.player.facingX * 24,
      y: state.player.y + state.player.facingY * 24,
      vx: state.player.facingX * speed,
      vy: state.player.facingY * speed,
      life: this.cfg.orbLife || 120,
      type,
      reversed: false,
    });
  },

  _floatText2D(message, color) {
    const wrap = document.getElementById("mgFloats");
    if (!wrap) return;
    const el = document.createElement("div");
    el.className = "mg-float";
    el.textContent = message;
    el.style.color = color;
    el.style.left = "50%";
    el.style.top = "45%";
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  },

  _fireOrb(type) {
    const mesh = this._makeOrbMesh(type);
    const fx = Math.sin(this.player.facing);
    const fz = Math.cos(this.player.facing);
    const speed = (this.cfg.orbSpeed || 7) * 0.1;
    mesh.position.set(
      this.player.position.x + fx * 1.5,
      1.5,
      this.player.position.z + fz * 1.5
    );
    this.scene.add(mesh);
    this.orbs.push({
      mesh, type, life: this.cfg.orbLife,
      vx: fx * speed, vy: 0, vz: fz * speed,
      reversed: false, trailAccumulator: 0,
    });
    GameAudio.sfx("gunshot");
  },

  _reverseOrbs() {
    let any = false;
    if (this.mode === "2d") {
      const state = this.fallbackState;
      if (!state) return;
      for (const orb of state.orbs) {
        if (!orb.reversed) {
          orb.reversed = true;
          orb.vx = -orb.vx;
          orb.vy = -orb.vy;
          any = true;
        }
      }
      if (any) GameAudio.sfx("select");
      return;
    }
    for (const o of this.orbs) {
      if (!o.reversed) {
        o.reversed = true;
        o.vx = -o.vx;
        o.vz = -o.vz;
        any = true;
        // 反向闪光
        this._spawnParticles(o.mesh.position.x, o.mesh.position.y, o.mesh.position.z,
          o.type === "purple" ? 0xFF66FF : 0xFFFF66, 8);
      }
    }
    if (any) GameAudio.sfx("select");
  },

  _removeOrb(i) {
    const o = this.orbs[i];
    this.scene.remove(o.mesh);
    o.mesh.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    });
    this.orbs.splice(i, 1);
  },

  _startEnd(reason) {
    if (this.ended) return;
    this.ended = true;
    this.endingPhase = 1;
    this.endingTimer = 0;
    const hintEl = document.getElementById("mgHint");
    if (hintEl) hintEl.style.display = "none";
    const r = document.getElementById("mgResult");
    if (reason === "win") {
      if (r) {
        r.textContent = "这次，我奶到你了";
        r.style.color = "#4FC3F7";
        r.style.fontSize = "56px";
        r.classList.add("is-show");
      }
      GameAudio.sfx("success");
    } else if (reason === "skip") {
      if (r) r.classList.remove("is-show");
    } else {
      if (r) {
        r.textContent = "她一直在你身后";
        r.style.color = "#4FC3F7";
        r.style.fontSize = "56px";
        r.classList.add("is-show");
      }
      GameAudio.sfx("bell");
    }
  },

  _updateEnding(dt) {
    this.endingTimer += dt;
    if (this.endingPhase === 1 && this.endingTimer > 1800) {
      this.endingPhase = 2;
      this.endingTimer = 0;
      const r = document.getElementById("mgResult");
      if (r) r.classList.remove("is-show");
      // 揭示真名
      this._revealNames();
    } else if (this.endingPhase === 2 && this.endingTimer > 3800) {
      this.endingPhase = 3;
      this.stop();
      this._disposeScene();
      if (this.onEnd) this.onEnd(this.healCount > 0 ? "win" : "timeout");
    }
  },

  _revealNames() {
    // 镜头拉近小美，她从身后"走出来"
    // 用 DOM 层叠加文字（避免 3D 内嵌字体复杂度）
    const wrap = document.getElementById("mgFloats");
    if (!wrap) return;
    const el = document.createElement("div");
    el.className = "mg-reveal";
    const line = document.createElement("div");
    line.className = "mg-reveal-line";
    line.textContent = "原来——";
    const hero = document.createElement("div");
    hero.className = "mg-reveal-name";
    hero.style.color = "#9B30FF";
    hero.textContent = `「QzSama」 → ${this.cfg.realHeroName || ""}`;
    const heroine = document.createElement("div");
    heroine.className = "mg-reveal-name";
    heroine.style.color = "#4FC3F7";
    heroine.textContent = `「可乐就是好喝」 → ${this.cfg.realHeroineName || ""}`;
    const sub = document.createElement("div");
    sub.className = "mg-reveal-sub";
    sub.textContent = "她终于，从身后走到了你面前。";
    el.append(line, hero, heroine, sub);
    wrap.appendChild(el);
  },

  _floatText(x, y, z, text, color) {
    const v = new THREE.Vector3(x, y, z);
    v.project(this.camera);
    const sx = (v.x * 0.5 + 0.5) * 1280;
    const sy = (-v.y * 0.5 + 0.5) * 720;
    const wrap = document.getElementById("mgFloats");
    if (!wrap) return;
    const el = document.createElement("div");
    el.className = "mg-float";
    el.textContent = text;
    el.style.color = color;
    el.style.left = sx + "px";
    el.style.top = sy + "px";
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  },

  _draw() {
    if (this.mode === "2d") {
      this._draw2D();
      return;
    }
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  },

  _draw2D() {
    const ctx = this.fallbackCtx;
    const state = this.fallbackState;
    if (!ctx || !state) return;
    ctx.clearRect(0, 0, 1280, 720);
    ctx.fillStyle = "#070b14";
    ctx.fillRect(0, 0, 1280, 720);
    ctx.strokeStyle = "rgba(79,195,247,.16)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= 1280; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 720); ctx.stroke(); }
    for (let y = 0; y <= 720; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1280, y); ctx.stroke(); }

    ctx.strokeStyle = "rgba(249,158,42,.5)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(state.player.x, state.player.y, 72, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "rgba(79,195,247,.35)";
    ctx.beginPath(); ctx.arc(state.mei.x, state.mei.y, 28, 0, Math.PI * 2); ctx.stroke();

    ctx.fillStyle = "#9B30FF";
    ctx.beginPath(); ctx.arc(state.player.x, state.player.y, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#4FC3F7";
    ctx.beginPath(); ctx.arc(state.mei.x, state.mei.y, 15, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#F99E2A";
    ctx.beginPath(); ctx.moveTo(state.player.x, state.player.y); ctx.lineTo(state.player.x + state.player.facingX * 34, state.player.y + state.player.facingY * 34); ctx.stroke();

    state.enemies.forEach((enemy) => {
      ctx.fillStyle = "#E44040";
      ctx.beginPath(); ctx.arc(enemy.x, enemy.y, 14, 0, Math.PI * 2); ctx.fill();
    });
    state.orbs.forEach((orb) => {
      ctx.fillStyle = orb.type === "purple" ? "#C56CFF" : "#FFD700";
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(orb.x, orb.y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    });
  },
};

// 兼容旧 engine.js 直接引用 Minigame（已挂到 window）
window.Minigame = Minigame;
