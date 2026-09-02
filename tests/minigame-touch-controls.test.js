const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadMinigame({ pointerEvents = false } = {}) {
  const context = {
    console,
    window: {
      addEventListener() {},
      removeEventListener() {},
      ...(pointerEvents ? { PointerEvent: function PointerEvent() {} } : {}),
    },
    document: { getElementById() { return null; }, createElement() { return {}; } },
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
