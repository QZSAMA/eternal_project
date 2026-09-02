const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class FakeNode {
  constructor(rect = { left: 0, top: 0, width: 100, height: 100 }) {
    this.listeners = {};
    this.rect = rect;
    this.style = {};
    this.captured = [];
  }
  addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
  removeEventListener(type, callback) {
    this.listeners[type] = (this.listeners[type] || []).filter(listener => listener !== callback);
  }
  emit(type, event = {}) { (this.listeners[type] || []).forEach(callback => callback(event)); }
  getBoundingClientRect() { return this.rect; }
  setPointerCapture(pointerId) { this.captured.push(pointerId); }
  releasePointerCapture(pointerId) { this.captured = this.captured.filter(id => id !== pointerId); }
}

function loadMinigame({ pointerEvents = false, nodes = {} } = {}) {
  const context = {
    console,
    window: {
      addEventListener() {},
      removeEventListener() {},
      ...(pointerEvents ? { PointerEvent: function PointerEvent() {}, navigator: { maxTouchPoints: 1 } } : {}),
    },
    document: { getElementById(id) { return nodes[id] || null; }, addEventListener() {}, createElement() { return {}; } },
    performance: { now: () => 0 },
    requestAnimationFrame() { return 1; },
    cancelAnimationFrame() {},
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
    GameAudio: { sfx() {} },
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'minigame.js'), 'utf8');
  vm.runInContext(`${source}\nthis.MinigameUnderTest = Minigame;`, context);
  return context.MinigameUnderTest;
}

function loadMinigameWithTouchDom() {
  const nodes = {
    mgTouchControls: new FakeNode(),
    mgJoystick: new FakeNode({ left: 0, top: 0, width: 100, height: 100 }),
    mgJoystickKnob: new FakeNode(),
    mgTouchPurple: new FakeNode(),
    mgTouchYellow: new FakeNode(),
    mgTouchReverse: new FakeNode(),
  };
  const minigame = loadMinigame({ pointerEvents: true, nodes });
  return { minigame, nodes, joystick: nodes.mgJoystick };
}

test('touch vector maps to a dead-zone-normalized movement vector', () => {
  const minigame = loadMinigame();
  minigame._resetTouchInput();
  const right = minigame._setTouchVector(90, 50, { left: 0, top: 0, width: 100, height: 100 });
  assert.equal(right.x, 0.8);
  assert.equal(right.y, 0);
  const deadZone = minigame._setTouchVector(52, 52, { left: 0, top: 0, width: 100, height: 100 });
  assert.equal(deadZone.x, 0);
  assert.equal(deadZone.y, 0);
});

test('touch actions press and release the matching fire state', () => {
  const minigame = loadMinigame();
  minigame._setTouchAction('purple', true);
  assert.equal(minigame.touchInput.leftDown, true);
  minigame._setTouchAction('purple', false);
  assert.equal(minigame.touchInput.leftDown, false);
  minigame._setTouchAction('yellow', true);
  assert.equal(minigame.touchInput.rightDown, true);
});

test('reverse action is edge-triggered and reset clears stuck controls', () => {
  const minigame = loadMinigame();
  let reverseCount = 0;
  minigame._reverseOrbs = () => { reverseCount += 1; };
  minigame._setTouchAction('reverse', true);
  minigame._setTouchAction('reverse', true);
  minigame._setTouchAction('reverse', false);
  minigame._resetTouchInput();
  assert.equal(reverseCount, 1);
  assert.equal(minigame.touchInput.pointerId, null);
  assert.equal(minigame.touchInput.moveX, 0);
  assert.equal(minigame.touchInput.moveY, 0);
  assert.equal(minigame.touchInput.leftDown, false);
  assert.equal(minigame.touchInput.rightDown, false);
  assert.equal(minigame.touchInput.reverseHeld, false);
  assert.equal(minigame.touchInput.supported, false);
});

test('touch controls expose semantic nodes and minimum touch size', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
  for (const id of ['mgTouchControls', 'mgJoystick', 'mgTouchPurple', 'mgTouchYellow', 'mgTouchReverse']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /aria-label="发射紫球"/);
  assert.match(html, /aria-label="发射黄球"/);
  assert.match(html, /aria-label="反向球体"/);
  assert.match(css, /\.mg-touch-controls\.is-visible/);
  assert.match(css, /min-width:\s*72px/);
  assert.match(css, /min-height:\s*72px/);
});

test('pointer lifecycle updates joystick and releases it on cancel', () => {
  const { minigame, joystick } = loadMinigameWithTouchDom();
  minigame._bindTouchInputs();
  joystick.emit('pointerdown', { pointerId: 7, clientX: 90, clientY: 50, preventDefault() {} });
  assert.equal(minigame.touchInput.pointerId, 7);
  joystick.emit('pointermove', { pointerId: 7, clientX: 100, clientY: 50, preventDefault() {} });
  assert.equal(minigame.touchInput.moveX, 1);
  joystick.emit('pointercancel', { pointerId: 7, preventDefault() {} });
  assert.equal(minigame.touchInput.pointerId, null);
  assert.equal(minigame.touchInput.moveX, 0);
});

test('binding touch controls repeatedly does not duplicate reverse actions', () => {
  const { minigame, nodes } = loadMinigameWithTouchDom();
  let reverseCount = 0;
  minigame._reverseOrbs = () => { reverseCount += 1; };
  minigame._bindTouchInputs();
  minigame._bindTouchInputs();
  nodes.mgTouchReverse.emit('click', { preventDefault() {} });
  assert.equal(reverseCount, 1);
  assert.equal(nodes.mgTouchReverse.listeners.click.length, 1);
});

test('missing controls or pointer events do not break fallback', () => {
  const minigame = loadMinigame();
  assert.doesNotThrow(() => minigame._bindTouchInputs());
  assert.doesNotThrow(() => minigame._unbindTouchInputs());
});
