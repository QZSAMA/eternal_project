/* ============================================
   逆转的奶 · 3D 版（Three.js）
   机制不变：
     - 玩家=莫伊拉，第一/第三人称俯视
     - 小美永远在莫伊拉身后（朝向反方向）
     - 左键紫球(打敌人) / 右键黄球(奶)
     - 黄球直直朝前飞，打不到身后的她
     - 按 E 让球反方向飞回 → 奶到小美 → 通关揭示真名
   视觉：3D 场景，发光球体材质，粒子拖尾
   依赖：全局 THREE（由 index.html CDN 加载）
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

  start(cfg, onEnd) {
    this.cfg = cfg;
    this.onEnd = onEnd;
    this.reset();
    this._initThree();
    this._bindInputs();
    this.running = true;
    this.ended = false;
    this.endingPhase = 0;
    this.startTime = performance.now();
    this.lastFrame = this.startTime;
    this.loop();
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
    this.ended = false;
    this.endingPhase = 0;
    const hintEl = document.getElementById("mgHint");
    if (hintEl) {
      hintEl.style.display = "block";
      hintEl.textContent = "左键 紫球(打敌人) · 右键 黄球(奶) · 按 E 让球反方向飞回 · 奶到身后的小美即可通关";
    }
    const r = document.getElementById("mgResult");
    if (r) r.classList.remove("is-show");
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

  _spawnParticles(x, y, z, color, n) {
    for (let i = 0; i < n; i++) {
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
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;
      // 归一化到 -1..1
      this.mouse.nx = (this.mouse.x / rect.width) * 2 - 1;
      this.mouse.ny = -((this.mouse.y / rect.height) * 2 - 1);
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
  },

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this._unbindInputs();
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

  loop() {
    if (!this.running) return;
    const now = performance.now();
    const dt = Math.min(50, now - this.lastFrame);
    this.lastFrame = now;
    this._update(dt);
    this._draw();
    this.raf = requestAnimationFrame(() => this.loop());
  },

  _update(dt) {
    if (this.ended) { this._updateEnding(dt); return; }

    // 时间
    this.timeLeft = Math.max(0, this.cfg.duration - (performance.now() - this.startTime) / 1000);
    if (this.timeLeft <= 0) { this._startEnd("timeout"); return; }

    // 玩家移动（WASD 相对世界，简化）
    let mx = 0, my = 0;
    if (this.keys["KeyW"] || this.keys["ArrowUp"]) my -= 1;
    if (this.keys["KeyS"] || this.keys["ArrowDown"]) my += 1;
    if (this.keys["KeyA"] || this.keys["ArrowLeft"]) mx -= 1;
    if (this.keys["KeyD"] || this.keys["ArrowRight"]) mx += 1;
    if (mx || my) {
      const len = Math.hypot(mx, my) || 1;
      const sp = (this.cfg.playerSpeed || 4) * 0.06;
      this.player.position.x += (mx / len) * sp;
      this.player.position.z += (my / len) * sp;
    }
    // 限制范围
    this.player.position.x = Math.max(-40, Math.min(40, this.player.position.x));
    this.player.position.z = Math.max(-40, Math.min(40, this.player.position.z));

    // 朝向：基于鼠标位置（屏幕中心=正前方）
    // 鼠标在屏幕的位置决定朝向角度
    const facing = Math.atan2(this.mouse.nx, -this.mouse.ny);
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
    if (this.playerHalo) this.playerHalo.rotation.z += 0.02;
    if (this.meiHalo) this.meiHalo.rotation.z -= 0.015;

    // 射击
    const nowShot = performance.now();
    if (this.mouse.leftDown && nowShot - this.lastShot > this.cfg.fireRate) {
      this.lastShot = nowShot;
      this._fireOrb("purple");
    }
    if (this.mouse.rightDown && nowShot - this.lastShot > this.cfg.fireRate) {
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
      o.mesh.position.x += o.vx;
      o.mesh.position.y += o.vy;
      o.mesh.position.z += o.vz;
      o.life--;
      // 拖尾
      if (o.life % 2 === 0) {
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
          if (o.mesh.position.distanceTo(e.mesh.position.clone().setY(o.mesh.position.y)) < 1.2) {
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
        if (o.mesh.position.distanceTo(this.mei.position.clone().setY(o.mesh.position.y)) < 1.5) {
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
      t.userData.life--;
      t.material.opacity = (t.userData.life / t.userData.max) * 0.4;
      t.scale.multiplyScalar(0.92);
      if (t.userData.life <= 0) {
        this.scene.remove(t);
        t.geometry.dispose(); t.material.dispose();
        this.trails.splice(i, 1);
      }
    }

    // 敌人生成
    if (performance.now() - this.lastSpawn > this.cfg.enemySpawnInterval && this.enemies.length < this.cfg.enemyMax) {
      this.lastSpawn = performance.now();
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
      e.mesh.position.x += (dx / len) * e.speed;
      e.mesh.position.z += (dz / len) * e.speed;
      // 旋转动画
      e.mesh.children[0].rotation.y += 0.04;
      e.mesh.children[0].rotation.x += 0.02;
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
      p.position.x += p.userData.vx;
      p.position.y += p.userData.vy;
      p.position.z += p.userData.vz;
      p.userData.vy -= 0.003;
      p.userData.life--;
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
    el.innerHTML = `
      <div class="mg-reveal-line">原来——</div>
      <div class="mg-reveal-name" style="color:#9B30FF">「QzSama」 → 赵启志</div>
      <div class="mg-reveal-name" style="color:#4FC3F7">「可乐就是好喝」 → 朱盈畅</div>
      <div class="mg-reveal-sub">她终于，从身后走到了你面前。</div>
    `;
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
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  },
};

// 兼容旧 engine.js 直接引用 Minigame（已挂到 window）
window.Minigame = Minigame;
