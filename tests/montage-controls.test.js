const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach(value => this.values.add(value)); }
  remove(...values) { values.forEach(value => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
}

class FakeEventTarget {
  constructor() { this.listeners = {}; this.classList = new FakeClassList(); this.style = {}; }
  addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
  setAttribute(name, value) { this.attributes ||= {}; this.attributes[name] = value; }
  emit(type, event = {}) { (this.listeners[type] || []).forEach(callback => callback(event)); }
}

function loadEngine() {
  const timers = [];
  let nextTimerId = 1;
  let now = 0;
  const context = {
    console,
    window: { addEventListener() {}, requestAnimationFrame(callback) { callback(); return 1; } },
    document: { addEventListener() {} },
    performance: { now: () => now },
    CONFIG: {},
    Minigame: {},
    GameAudio: { bgm() {}, sfx() {} },
    requestAnimationFrame(callback) { callback(); return 1; },
    setTimeout(callback, delay) {
      const job = { id: nextTimerId++, callback, delay, due: now + delay, cancelled: false };
      timers.push(job);
      return job.id;
    },
    clearTimeout(id) {
      const job = timers.find(candidate => candidate.id === id);
      if (job) job.cancelled = true;
    },
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'engine.js'), 'utf8');
  vm.runInContext(`${source}\nthis.EngineUnderTest = Engine;`, context);
  const engine = context.EngineUnderTest;
  const layerMontage = new FakeEventTarget();
  const montageImg = new FakeEventTarget();
  const montageCaption = new FakeEventTarget();
  const montageToggle = new FakeEventTarget();
  const montageStatus = new FakeEventTarget();
  engine.dom = {
    dialogueBox: new FakeEventTarget(),
    layerMontage,
    montageImg,
    montageCaption,
    montageToggle,
    montageStatus,
  };
  engine.data = { images: { photos: ['assets/images/photos/photo1.jpg'] } };
  engine.photoCache = {};
  engine._next = () => {};
  return { engine, timers, layerMontage, montageImg, montageCaption, montageToggle, montageStatus, advanceClock: ms => { now += ms; } };
}

test('montage exposes an accessible pause control and live status', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /id="montageToggle"[^>]*aria-pressed="false"/);
  assert.match(html, /id="montageStatus"[^>]*aria-live="polite"/);
});

test('montage pause freezes playback and resumes the pending slide timer', () => {
  const { engine, timers, layerMontage, montageToggle, montageStatus, advanceClock } = loadEngine();
  engine._montage({ slides: [{ img: 'photo1', caption: '第一张' }] });

  assert.equal(engine.state, 'in_montage');
  assert.equal(timers.filter(job => !job.cancelled).length, 1);

  engine._toggleMontagePause();
  assert.equal(engine.montage.paused, true);
  assert.equal(layerMontage.classList.contains('is-paused'), true);
  assert.equal(montageToggle.attributes['aria-pressed'], 'true');
  assert.match(montageStatus.textContent, /暂停/);
  assert.equal(timers.filter(job => !job.cancelled).length, 0);

  advanceClock(5000);
  engine._toggleMontagePause();
  assert.equal(engine.montage.paused, false);
  assert.equal(layerMontage.classList.contains('is-paused'), false);
  assert.equal(timers.filter(job => !job.cancelled).length, 1);
  assert.match(montageStatus.textContent, /播放/);
});

test('montage continues automatically when optional controls are missing', () => {
  const { engine } = loadEngine();
  delete engine.dom.montageToggle;
  delete engine.dom.montageStatus;
  assert.doesNotThrow(() => engine._montage({ slides: [{ img: 'photo1', caption: '第一张' }] }));
});
