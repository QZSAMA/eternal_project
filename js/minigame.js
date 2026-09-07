/* ============================================
   逆转的奶 · Three.js 主渲染 + Canvas 2D / skip 降级
   机制：E 进入选球或让在途球回头；A/D 选择黄/紫球；左键发射
   视觉：原创第一人称 3D 训练场、发光球体、边界反弹与粒子拖尾
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
  kiriko: null,           // 雾子 mesh
  enemies: [],
  orbs: [],
  particles: [],
  trails: [],
  orbTextures: { purple: null, yellow: null },
  state: null,
  keys: {},
  mouse: { x: 0, y: 0, nx: 0, ny: 0, leftDown: false, rightDown: false },
  touchInput: { pointerId: null, moveX: 0, moveY: 0, fireDown: false, reverseHeld: false, supported: false },
  selectedOrbType: "yellow",
  orbSelectionMode: false,
  arenaHalfSize: 38,
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
    this.mouse.leftDown = false;
    this.mouse.rightDown = false;
    this.playerVelocity.x = 0;
    this.playerVelocity.y = 0;
    this.playerVelocity.z = 0;
    this._resetTouchInput();
    this.resetSelection();
    this.ended = false;
    this.endingPhase = 0;
    this.fallbackState = null;
    const hintEl = document.getElementById("mgHint");
    if (hintEl) {
      hintEl.style.display = "block";
      hintEl.textContent = "按 E 选球 · A/D 切换 · 左键发射 · 球飞出后再按 E 让球回头";
    }
    const r = document.getElementById("mgResult");
    if (r) r.classList.remove("is-show");
  },

  _resetTouchInput() {
    this.touchInput.pointerId = null;
    this.touchInput.moveX = 0;
    this.touchInput.moveY = 0;
    this.touchInput.fireDown = false;
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
    if (type === "purple" || type === "yellow") {
      if (pressed) {
        this._selectOrbType(type);
        this._fireSelectedOrb();
      }
      this.touchInput.fireDown = false;
    }
    if (type === "reverse") {
      if (pressed && !this.touchInput.reverseHeld) this._handleOrbAction();
      this.touchInput.reverseHeld = pressed;
    }
    if (type === "fire") this.touchInput.fireDown = pressed;
  },

  resetSelection() {
    this.selectedOrbType = "yellow";
    this.orbSelectionMode = false;
    this._syncOrbHud();
  },

  _selectOrbType(type) {
    if (type !== "yellow" && type !== "purple") return false;
    this.selectedOrbType = type;
    this.orbSelectionMode = true;
    this._syncOrbHud();
    GameAudio.sfx("select");
    return true;
  },

  _cycleOrbType(direction) {
    const order = ["yellow", "purple"];
    const current = Math.max(0, order.indexOf(this.selectedOrbType));
    const next = (current + (direction < 0 ? -1 : 1) + order.length) % order.length;
    return this._selectOrbType(order[next]);
  },

  _activeOrbCollection() {
    if (this.mode === "2d") return (this.fallbackState && this.fallbackState.orbs) || [];
    return this.orbs || [];
  },

  _handleOrbAction() {
    if (this._activeOrbCollection().length > 0) {
      const reversed = this._reverseOrbs();
      if (reversed) this.orbSelectionMode = false;
      this._syncOrbHud(reversed ? "球体已回头" : "球体已经回头");
      return reversed ? "reversed" : "active";
    }
    this.orbSelectionMode = true;
    this._syncOrbHud("选择黄球或紫球");
    return "select";
  },

  _fireSelectedOrb() {
    if (!this.orbSelectionMode || this._activeOrbCollection().length > 0) return false;
    const type = this.selectedOrbType === "purple" ? "purple" : "yellow";
    if (this.mode === "2d") this._fireOrb2D(type);
    else if (this.scene && this.player) this._fireOrb(type);
    else return false;
    this.orbSelectionMode = false;
    this._syncOrbHud(`${type === "yellow" ? "黄球" : "紫球"}已发射 · 再按 E 让球回头`);
    return true;
  },

  _syncOrbHud(message) {
    const yellow = document.getElementById("mgOrbYellow");
    const purple = document.getElementById("mgOrbPurple");
    const status = document.getElementById("mgOrbStatus");
    if (yellow && yellow.classList) yellow.classList.toggle("is-selected", this.selectedOrbType === "yellow");
    if (purple && purple.classList) purple.classList.toggle("is-selected", this.selectedOrbType === "purple");
    if (status) {
      const label = this.selectedOrbType === "yellow" ? "黄球 · 治疗" : "紫球 · 伤害";
      status.textContent = message || (this.orbSelectionMode ? `已选择 ${label} · 左键发射` : `${label} · 按 E 选球`);
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
      kiriko: { x: 640, y: 440, hp: this.cfg.kirikoHP || 100 },
      orbs: [],
      enemies: [],
      lastSpawn: 0,
    };
    const hintEl = document.getElementById("mgHint");
    if (hintEl) hintEl.textContent = "2D 兼容模式：E 选球 · A/D 切换 · 左键发射 · 再按 E 回头 · 也可跳过";
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
    this.camera.position.set(0, 4.5, 8.5);
    this.camera.lookAt(0, 2.4, -12);

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

    // 地面网格：抽象科幻训练场，不复用任何官方地图素材。
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
    this._buildTrainingArena();

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

    // 雾子 = 青蓝色球体（永远在玩家身后）
    const kirikoGroup = new THREE.Group();
    const kirikoBody = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.6, 1.0, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0x2a7fb5, emissive: 0x4FC3F7, emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.4 })
    );
    kirikoBody.position.y = 1.2;
    kirikoGroup.add(kirikoBody);
    const kirikoHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xd7ecff, emissive: 0x4FC3F7, emissiveIntensity: 0.2 })
    );
    kirikoHead.position.y = 2.2;
    kirikoGroup.add(kirikoHead);
    // 雾子光环
    const kirikoHalo = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.15, 32),
      new THREE.MeshBasicMaterial({ color: 0x4FC3F7, side: THREE.DoubleSide, transparent: true, opacity: 0.5 })
    );
    kirikoHalo.rotation.x = -Math.PI / 2;
    kirikoHalo.position.y = 0.05;
    kirikoGroup.add(kirikoHalo);
    this.kirikoHalo = kirikoHalo;
    this.kiriko = kirikoGroup;
    this.kiriko.hp = this.cfg.kirikoHP;
    this.scene.add(this.kiriko);

    // 加载球纹理
    this._loadOrbTextures();
  },

  _buildTrainingArena() {
    if (!this.scene) return;
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x16263d, emissive: 0x123c5d, emissiveIntensity: 0.55,
      metalness: 0.65, roughness: 0.35,
    });
    const trimMaterial = new THREE.MeshBasicMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.72 });
    const half = this.arenaHalfSize;
    const addBox = (x, y, z, sx, sy, sz, material = wallMaterial) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
      return mesh;
    };
    // Four low walls make the playable space readable without copying a game map.
    addBox(0, 2, -half - 1, half * 2 + 4, 4, 2);
    addBox(0, 2, half + 1, half * 2 + 4, 4, 2);
    addBox(-half - 1, 2, 0, 2, 4, half * 2);
    addBox(half + 1, 2, 0, 2, 4, half * 2);
    // Three procedural cover blocks create depth and alternate firing lanes.
    addBox(-14, 1.5, -7, 7, 3, 7);
    addBox(12, 2.5, 8, 9, 5, 5);
    addBox(4, 1.25, -22, 5, 2.5, 4);
    [-half, half].forEach((x) => addBox(x, 0.12, 0, 0.18, 0.24, half * 2, trimMaterial));
    [-half, half].forEach((z) => addBox(0, 0.12, z, half * 2, 0.24, 0.18, trimMaterial));
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.55, 5, 12),
      new THREE.MeshStandardMaterial({ color: 0x4fc3f7, emissive: 0x4fc3f7, emissiveIntensity: 1.4 })
    );
    beacon.position.set(0, 2.5, -half + 4);
    this.scene.add(beacon);
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
    this.bound.touchActionEnd = () => this._setTouchAction("fire", false);
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
    this.bound.touchSelectYellow = (event) => {
      event.preventDefault();
      this._selectOrbType("yellow");
      this._fireSelectedOrb();
    };
    this.bound.touchSelectPurple = (event) => {
      event.preventDefault();
      this._selectOrbType("purple");
      this._fireSelectedOrb();
    };

    bind(joystick, "pointerdown", this.bound.touchJoyDown);
    bind(joystick, "pointermove", this.bound.touchJoyMove);
    bind(joystick, "pointerup", this.bound.touchJoyEnd);
    bind(joystick, "pointercancel", this.bound.touchJoyEnd);
    const selectPurple = document.getElementById("mgTouchSelectPurple");
    const selectYellow = document.getElementById("mgTouchSelectYellow");
    const reverse = document.getElementById("mgTouchReverse");
    bind(selectPurple, "pointerdown", this.bound.touchSelectPurple);
    bind(selectYellow, "pointerdown", this.bound.touchSelectYellow);
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
      if ((e.code === "KeyA" || e.code === "ArrowLeft") && this.orbSelectionMode) {
        e.preventDefault();
        this._cycleOrbType(-1);
        return;
      }
      if ((e.code === "KeyD" || e.code === "ArrowRight") && this.orbSelectionMode) {
        e.preventDefault();
        this._cycleOrbType(1);
        return;
      }
      this.keys[e.code] = true;
      if (e.code === "Escape") this._skip();
      if (e.code === "KeyE" && !this._eHeld) {
        this._eHeld = true;
        this._handleOrbAction();
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
      if (e.button === 2) {
        this._selectOrbType("purple");
        this.mouse.rightDown = true;
      }
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

    // 雾子：永远在玩家"身后"（朝向反方向）距离 kirikoDistance/10
    const dist = (this.cfg.kirikoDistance || 80) / 10;  // 转换到 3D 单位
    const bx = this.player.position.x - Math.sin(facing) * dist;
    const bz = this.player.position.z - Math.cos(facing) * dist;
    this.kiriko.position.x = bx;
    this.kiriko.position.z = bz;
    this.kiriko.rotation.y = facing + Math.PI;  // 看向玩家方向
    // 光环旋转
    if (this.playerHalo) this.playerHalo.rotation.z += 0.02 * frameScale;
    if (this.kirikoHalo) this.kirikoHalo.rotation.z -= 0.015 * frameScale;

    // 射击
    const nowShot = now;
    if (this.mouse.leftDown && nowShot - this.lastShot > this.cfg.fireRate) {
      this.lastShot = nowShot;
      this._fireSelectedOrb();
    }

    // 球更新
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.mesh.position.x += o.vx * frameScale;
      o.mesh.position.y += o.vy * frameScale;
      o.mesh.position.z += o.vz * frameScale;
      this._reflectOrbAtBounds(o, this.arenaHalfSize);
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
        // 黄球奶雾子
        if (this._distanceSquaredXZ(o.mesh.position, this.kiriko.position) < 1.5 * 1.5) {
          this.kiriko.hp = Math.min(this.cfg.kirikoHP, this.kiriko.hp + this.cfg.yellowHeal);
          this._floatText(this.kiriko.position.x, 3, this.kiriko.position.z, "+♥ 这次看到了", "#4FC3F7");
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

    // 敌人移动（朝向雾子）
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const dx = this.kiriko.position.x - e.mesh.position.x;
      const dz = this.kiriko.position.z - e.mesh.position.z;
      const len = Math.hypot(dx, dz) || 1;
      e.mesh.position.x += (dx / len) * e.speed * frameScale;
      e.mesh.position.z += (dz / len) * e.speed * frameScale;
      // 旋转动画
      e.mesh.children[0].rotation.y += 0.04 * frameScale;
      e.mesh.children[0].rotation.x += 0.02 * frameScale;
      // 碰撞雾子
      if (e.mesh.position.distanceTo(this.kiriko.position) < 1.4) {
        this.kiriko.hp = Math.max(1, this.kiriko.hp - this.cfg.enemyDamage);
        this._spawnParticles(this.kiriko.position.x, 1.5, this.kiriko.position.z, 0xE44040, 6);
        this.scene.remove(e.mesh);
        this.enemies.splice(i, 1);
        if (this.kiriko.hp <= 10) {
          this._floatText(this.kiriko.position.x, 3, this.kiriko.position.z, "（轻声）没事……我自己能撑住。", "#9AC");
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

    // 低位跟随镜头：保持第一人称训练场的空间感，同时保留雾子在身后的叙事关系。
    if (this.camera) {
      this.camera.position.x = this.player.position.x;
      this.camera.position.y = this.player.position.y + 4.5;
      this.camera.position.z = this.player.position.z + 8.5;
      this.camera.lookAt(
        this.player.position.x + Math.sin(this.player.facing) * 12,
        this.player.position.y + 2.4,
        this.player.position.z - Math.cos(this.player.facing) * 12
      );
    }

    // HUD
    const hpEl = document.getElementById("mgHpFill");
    if (hpEl) hpEl.style.width = Math.max(0, this.kiriko.hp / this.cfg.kirikoHP * 100) + "%";
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
    state.kiriko.x = state.player.x - state.player.facingX * (this.cfg.kirikoDistance || 80);
    state.kiriko.y = state.player.y - state.player.facingY * (this.cfg.kirikoDistance || 80);

    if (this.mouse.leftDown && now - this.lastShot > (this.cfg.fireRate || 400)) {
      this.lastShot = now;
      this._fireSelectedOrb();
    }

    for (let i = state.orbs.length - 1; i >= 0; i--) {
      const orb = state.orbs[i];
      orb.x += orb.vx * seconds;
      orb.y += orb.vy * seconds;
      this._reflectOrb2D(orb, 20, 1260, 30, 690);
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
      } else if (Math.hypot(orb.x - state.kiriko.x, orb.y - state.kiriko.y) < 28) {
        state.kiriko.hp = Math.min(this.cfg.kirikoHP || 100, state.kiriko.hp + (this.cfg.yellowHeal || 40));
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
        x: Math.max(20, Math.min(1260, state.kiriko.x + Math.cos(angle) * radius)),
        y: Math.max(20, Math.min(700, state.kiriko.y + Math.sin(angle) * radius)),
        hp: this.cfg.enemyHP || 30,
      });
    }
    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const enemy = state.enemies[i];
      const ex = state.kiriko.x - enemy.x;
      const ey = state.kiriko.y - enemy.y;
      const length = Math.hypot(ex, ey) || 1;
      const enemySpeed = (this.cfg.enemySpeed || 1) * 60;
      enemy.x += (ex / length) * enemySpeed * seconds;
      enemy.y += (ey / length) * enemySpeed * seconds;
      if (Math.hypot(enemy.x - state.kiriko.x, enemy.y - state.kiriko.y) < 24) {
        state.kiriko.hp = Math.max(1, state.kiriko.hp - (this.cfg.enemyDamage || 8));
        state.enemies.splice(i, 1);
      }
    }
    const hpEl = document.getElementById("mgHpFill");
    if (hpEl) hpEl.style.width = Math.max(0, state.kiriko.hp / (this.cfg.kirikoHP || 100) * 100) + "%";
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

  _reflectOrbAtBounds(orb, bound = this.arenaHalfSize) {
    if (!orb || !orb.mesh || !orb.mesh.position) return false;
    const position = orb.mesh.position;
    let reflected = false;
    if (position.x >= bound && orb.vx > 0) { position.x = bound; orb.vx = -Math.abs(orb.vx); reflected = true; }
    else if (position.x <= -bound && orb.vx < 0) { position.x = -bound; orb.vx = Math.abs(orb.vx); reflected = true; }
    if (position.z >= bound && orb.vz > 0) { position.z = bound; orb.vz = -Math.abs(orb.vz); reflected = true; }
    else if (position.z <= -bound && orb.vz < 0) { position.z = -bound; orb.vz = Math.abs(orb.vz); reflected = true; }
    return reflected;
  },

  _reflectOrb2D(orb, minX, maxX, minY, maxY) {
    if (!orb) return false;
    let reflected = false;
    if (orb.x > maxX) { orb.x = maxX; orb.vx = -Math.abs(orb.vx); reflected = true; }
    else if (orb.x < minX) { orb.x = minX; orb.vx = Math.abs(orb.vx); reflected = true; }
    if (orb.y > maxY) { orb.y = maxY; orb.vy = -Math.abs(orb.vy); reflected = true; }
    else if (orb.y < minY) { orb.y = minY; orb.vy = Math.abs(orb.vy); reflected = true; }
    return reflected;
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
      return any;
    }
    for (const o of this.orbs) {
      if (!o.reversed) {
        o.reversed = true;
        o.vx = -o.vx;
        o.vz = -o.vz;
        any = true;
        // 反向闪光
        if (this.scene && this._spawnParticles) {
          this._spawnParticles(o.mesh.position.x, o.mesh.position.y, o.mesh.position.z,
            o.type === "purple" ? 0xFF66FF : 0xFFFF66, 8);
        }
      }
    }
    if (any) GameAudio.sfx("select");
    return any;
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
    // 镜头拉近雾子，她从身后"走出来"
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
    ctx.beginPath(); ctx.arc(state.kiriko.x, state.kiriko.y, 28, 0, Math.PI * 2); ctx.stroke();

    ctx.fillStyle = "#9B30FF";
    ctx.beginPath(); ctx.arc(state.player.x, state.player.y, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#4FC3F7";
    ctx.beginPath(); ctx.arc(state.kiriko.x, state.kiriko.y, 15, 0, Math.PI * 2); ctx.fill();
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
