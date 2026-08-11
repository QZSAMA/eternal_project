/* ============================================
   音频系统：BGM 淡入淡出 + SFX + 合成兜底
   开始按钮 onclick 内解锁 AudioContext
   ============================================ */

const GameAudio = {
  ctx: null,
  bgmEl: null,
  bgmVolume: 0.6,
  muted: false,
  bgmFadeTimer: null,
  currentTrack: null,

  init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      this.ctx = null;
    }
    this.bgmEl = new window.Audio();
    this.bgmEl.loop = true;
    this.bgmEl.volume = 0;
  },

  // 必须在用户手势内调用，解锁自动播放
  unlock() {
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    // 触发一次静音播放以解锁 <audio> 元素
    try {
      this.bgmEl.play().then(() => { this.bgmEl.pause(); }).catch(() => {});
    } catch (e) {}
  },

  setMuted(m) {
    this.muted = m;
    if (m) {
      this.bgmEl.volume = 0;
    } else {
      this.bgmEl.volume = this.bgmVolume;
    }
  },

  // BGM 切换，支持淡入淡出
  bgm(track, fade = 1500) {
    const url = (CONFIG.audio.bgm[track] || "").replace("synth:", "");
    this.currentTrack = track;
    if (!url) return;

    // 淡出当前
    const fadeOut = () => {
      const startVol = this.bgmEl.volume;
      const t0 = performance.now();
      const step = () => {
        const p = Math.min(1, (performance.now() - t0) / fade);
        this.bgmEl.volume = Math.max(0, startVol * (1 - p));
        if (p < 1) {
          this.bgmFadeTimer = requestAnimationFrame(step);
        } else {
          this._loadAndFadeIn(url, fade);
        }
      };
      if (startVol > 0) {
        step();
      } else {
        this._loadAndFadeIn(url, fade);
      }
    };

    if (this.bgmFadeTimer) cancelAnimationFrame(this.bgmFadeTimer);
    if (this.bgmEl.src && !this.bgmEl.paused) {
      fadeOut();
    } else {
      this._loadAndFadeIn(url, fade);
    }
  },

  _loadAndFadeIn(url, fade) {
    this.bgmEl.src = url;
    this.bgmEl.volume = 0;
    const playPromise = this.bgmEl.play();
    if (!playPromise) return;
    playPromise.then(() => {
      if (this.muted) return;
      const t0 = performance.now();
      const target = this.bgmVolume;
      const step = () => {
        const p = Math.min(1, (performance.now() - t0) / fade);
        this.bgmEl.volume = target * p;
        if (p < 1) requestAnimationFrame(step);
      };
      step();
    }).catch(() => {
      // BGM 加载失败静默跳过
    });
  },

  stopBgm(fade = 1000) {
    if (!this.bgmEl.src) return;
    const startVol = this.bgmEl.volume;
    const t0 = performance.now();
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / fade);
      this.bgmEl.volume = Math.max(0, startVol * (1 - p));
      if (p < 1) {
        requestAnimationFrame(step);
      } else {
        this.bgmEl.pause();
        this.bgmEl.src = "";
      }
    };
    step();
  },

  // SFX：支持外部文件或合成
  sfx(name) {
    if (this.muted) return;
    const def = CONFIG.audio.sfx[name];
    if (!def) return;

    if (def.startsWith("synth:")) {
      this._synthSfx(def.slice(6));
    } else {
      // 尝试播放外部文件，失败则合成兜底
      const a = new window.Audio(def);
      a.play().catch(() => this._synthSfx(name));
    }
  },

  // 合成音效
  _synthSfx(type) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.connect(this.ctx.destination);

    switch (type) {
      case "click": {
        const o = this.ctx.createOscillator();
        o.type = "sine"; o.frequency.value = 880;
        g.gain.setValueAtTime(0.15, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        o.connect(g); o.start(t); o.stop(t + 0.1);
        break;
      }
      case "select": {
        const o = this.ctx.createOscillator();
        o.type = "triangle"; o.frequency.setValueAtTime(660, t);
        o.frequency.exponentialRampToValueAtTime(990, t + 0.1);
        g.gain.setValueAtTime(0.18, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        o.connect(g); o.start(t); o.stop(t + 0.16);
        break;
      }
      case "type": {
        const o = this.ctx.createOscillator();
        o.type = "square"; o.frequency.value = 1200;
        g.gain.setValueAtTime(0.04, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
        o.connect(g); o.start(t); o.stop(t + 0.04);
        break;
      }
      case "gunshot": {
        const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.1, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
        }
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        g.gain.setValueAtTime(0.25, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        src.connect(g); src.start(t);
        break;
      }
      case "hit": {
        const o = this.ctx.createOscillator();
        o.type = "square"; o.frequency.setValueAtTime(200, t);
        o.frequency.exponentialRampToValueAtTime(80, t + 0.1);
        g.gain.setValueAtTime(0.2, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        o.connect(g); o.start(t); o.stop(t + 0.13);
        break;
      }
      case "capture": {
        const o = this.ctx.createOscillator();
        o.type = "sine"; o.frequency.setValueAtTime(523, t);
        o.frequency.linearRampToValueAtTime(1046, t + 0.3);
        g.gain.setValueAtTime(0.2, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        o.connect(g); o.start(t); o.stop(t + 0.41);
        break;
      }
      case "heartbeat": {
        const beat = (delay, freq) => {
          const o = this.ctx.createOscillator();
          const gg = this.ctx.createGain();
          o.type = "sine"; o.frequency.value = freq;
          gg.gain.setValueAtTime(0, t + delay);
          gg.gain.linearRampToValueAtTime(0.3, t + delay + 0.02);
          gg.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.15);
          o.connect(gg); gg.connect(this.ctx.destination);
          o.start(t + delay); o.stop(t + delay + 0.16);
        };
        beat(0, 60); beat(0.25, 55); beat(0.7, 60); beat(0.95, 55);
        break;
      }
      case "bell": {
        const freqs = [523, 659, 784];
        freqs.forEach((f, i) => {
          const o = this.ctx.createOscillator();
          const gg = this.ctx.createGain();
          o.type = "sine"; o.frequency.value = f;
          gg.gain.setValueAtTime(0, t + i * 0.05);
          gg.gain.linearRampToValueAtTime(0.15, t + i * 0.05 + 0.02);
          gg.gain.exponentialRampToValueAtTime(0.001, t + i * 0.05 + 1.2);
          o.connect(gg); gg.connect(this.ctx.destination);
          o.start(t + i * 0.05); o.stop(t + i * 0.05 + 1.3);
        });
        break;
      }
      case "success": {
        const notes = [523, 659, 784, 1046];
        notes.forEach((f, i) => {
          const o = this.ctx.createOscillator();
          const gg = this.ctx.createGain();
          o.type = "triangle"; o.frequency.value = f;
          gg.gain.setValueAtTime(0, t + i * 0.12);
          gg.gain.linearRampToValueAtTime(0.2, t + i * 0.12 + 0.02);
          gg.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.4);
          o.connect(gg); gg.connect(this.ctx.destination);
          o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.41);
        });
        break;
      }
    }
  },
};
