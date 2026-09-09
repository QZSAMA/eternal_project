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

class FakeNode {
  constructor() { this.classList = new FakeClassList(); this.style = {}; this.textContent = ''; this.children = []; this.listeners = {}; }
  addEventListener(type, cb) { (this.listeners[type] ||= []).push(cb); }
  setAttribute(name, value) { this[name] = value; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.children.push(node); return node; }
  remove() { this.removed = true; }
}

function loadEngine() {
  const timers = [];
  const nodes = new Map();
  const document = {
    getElementById(id) { return nodes.get(id) || null; },
    createElement() { return new FakeNode(); },
    addEventListener() {},
  };
  [
    'layerMemory', 'memoryBubble', 'memoryPhoto', 'memoryCaption', 'memoryMeta', 'memoryBut', 'memoryFinal',
    'dialogueBox', 'layerProposal', 'effectSpotlight', 'ringWrap', 'proposalText', 'proposalBtns',
    'btnAccept', 'btnReject', 'rejectTip',
  ].forEach(id => nodes.set(id, new FakeNode()));
  const context = {
    console, document, window: { matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {}, getComputedStyle() { return { opacity: '1' }; } }, CONFIG: {}, Minigame: {}, GameAudio: { sfx() {}, init() {} },
    requestAnimationFrame(cb) { cb(); return 1; },
    setTimeout(cb, delay) { const id = timers.length + 1; timers.push({ id, cb, delay, cleared: false }); return id; },
    clearTimeout(id) { const timer = timers.find(item => item.id === id); if (timer) timer.cleared = true; },
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'engine.js'), 'utf8');
  vm.runInContext(`${source}\nthis.EngineUnderTest = Engine;`, context);
  context.EngineUnderTest.dom = Object.fromEntries(nodes);
  return { engine: context.EngineUnderTest, nodes, timers };
}

test('memory bubbles autoplay and the but button enters the single final proposal reveal', () => {
  const { engine, nodes, timers } = loadEngine();
  engine.data = { images: { photos: ['assets/images/photos/photo1.jpg', 'assets/images/photos/photo2.jpg'] }, meta: { proposalCopy: '但是，他想继续和你创造更多回忆，所以——Will you marry me?' }, story: {} };
  const bubbles = [
    { photo: 'assets/images/photos/photo1.jpg', caption: '第一次展览', meta: '线下展览' },
    { photo: 'assets/images/photos/photo2.jpg', caption: '一起看演唱会重放', meta: '我们的回忆' },
  ];
  engine.startMemoryBubbles(bubbles);
  assert.equal(engine.state, 'in_memory');
  assert.equal(nodes.get('memoryCaption').textContent, '第一次展览');
  assert.equal(timers.length, 1);
  engine.finishMemoryBubbles();
  assert.equal(timers[0].cleared, true);
  assert.equal(nodes.get('memoryFinal').classList.contains('is-show'), false);
  assert.match(nodes.get('proposalText').textContent, /Will you marry me\?/i);
  assert.equal(nodes.get('proposalText').classList.contains('is-show'), true);
});

test('finishing memories keeps one final proposal copy visible before the ring reveal', () => {
  const { engine, nodes, timers } = loadEngine();
  const copy = '但是，他想继续和你创造更多回忆，所以——Will you marry me?';
  engine.data = {
    images: { photos: ['assets/images/photos/photo1.jpg'] },
    meta: { proposalCopy: copy },
    story: {},
  };

  engine.startMemoryBubbles([{ photo: 'photo1', caption: '回忆', meta: '照片' }]);
  engine.finishMemoryBubbles();

  assert.equal(engine.state, 'in_proposal');
  assert.equal(nodes.get('memoryFinal').classList.contains('is-show'), false);
  assert.equal(nodes.get('proposalText').textContent, copy);
  assert.equal(nodes.get('proposalText').classList.contains('is-show'), true);
  assert.equal(nodes.get('ringWrap').classList.contains('is-show'), false);
  assert.equal(timers.some(timer => timer.delay >= 400), true);

  timers.filter(timer => !timer.cleared).forEach(timer => timer.cb());
  assert.equal(nodes.get('ringWrap').classList.contains('is-show'), true);
  assert.equal(nodes.get('proposalText').textContent, copy);
  assert.doesNotMatch(nodes.get('proposalText').textContent, /嫁给我，好吗/);
});
