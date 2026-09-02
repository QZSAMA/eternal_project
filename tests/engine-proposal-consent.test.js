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
  constructor() { this.listeners = {}; }
  addEventListener(type, callback) {
    (this.listeners[type] ||= []).push(callback);
  }
  setAttribute(name, value) { this[name] = value; }
  emit(type, event = {}) {
    (this.listeners[type] || []).forEach(callback => callback(event));
  }
}

function loadEngine() {
  const timers = [];
  let nextTimerId = 1;
  const context = {
    console,
    window: { addEventListener() {} },
    document: { addEventListener() {} },
    CONFIG: {},
    Minigame: {},
    GameAudio: { init() {}, sfx() {} },
    requestAnimationFrame(callback) { callback(); return 1; },
    setTimeout(callback, delay) {
      const job = { id: nextTimerId++, callback, delay, cancelled: false };
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
  const btnAccept = new FakeEventTarget();
  const btnReject = new FakeEventTarget();
  btnAccept.focusCount = 0;
  btnAccept.focus = () => { btnAccept.focusCount += 1; };
  btnReject.style = {};
  btnReject.textContent = '让我想想…';
  engine.dom = {
    dialogueBox: { classList: new FakeClassList() },
    effectSpotlight: { classList: new FakeClassList() },
    layerProposal: { classList: new FakeClassList() },
    ringWrap: { classList: new FakeClassList() },
    proposalText: { classList: new FakeClassList() },
    proposalBtns: { classList: new FakeClassList() },
    btnAccept,
    btnReject,
    rejectTip: { classList: new FakeClassList(), textContent: '' },
  };
  return { engine, timers, btnAccept, btnReject };
}

test('proposal buttons do not auto-focus acceptance', () => {
  const { engine, timers, btnAccept } = loadEngine();
  engine._proposal();
  timers.forEach(job => job.callback());

  assert.equal(btnAccept.focusCount, 0);
});

test('thinking response stays in place and shows a reassuring message', () => {
  const { engine, btnReject } = loadEngine();
  const initialTransform = btnReject.style.transform || '';

  engine._startRejectEscape();
  btnReject.emit('click');

  assert.equal(btnReject.style.transform, initialTransform);
  assert.match(engine.dom.rejectTip.textContent, /慢慢/);
});
