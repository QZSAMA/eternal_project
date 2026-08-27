const test = require('node:test');
const assert = require('node:assert/strict');
const { chooseMinigameMode, canCreateWebGL, mapPointerToCanvas } = require('../js/minigameMode.js');

test('uses Three.js when it is available and WebGL can be created', () => {
  assert.equal(chooseMinigameMode({ threeAvailable: true, webglAvailable: true }), 'three');
});

test('uses the 2D fallback when WebGL is unavailable', () => {
  assert.equal(chooseMinigameMode({ threeAvailable: true, webglAvailable: false }), '2d');
});

test('uses the 2D fallback when the vendored runtime is unavailable', () => {
  assert.equal(chooseMinigameMode({ threeAvailable: false, webglAvailable: false }), '2d');
});

test('supports an explicit skip when no fallback canvas is available', () => {
  assert.equal(chooseMinigameMode({ threeAvailable: false, webglAvailable: false, fallbackAvailable: false }), 'skip');
});

test('probes WebGL on a disposable canvas so the game canvas remains available to 2D fallback', () => {
  const contextTypes = [];
  const available = canCreateWebGL(() => ({
    getContext(type) {
      contextTypes.push(type);
      return type === 'webgl' ? {} : null;
    },
  }));
  assert.equal(available, true);
  assert.deepEqual(contextTypes, ['webgl2', 'webgl']);
});

test('maps CSS-scaled pointer coordinates into the canvas coordinate system', () => {
  assert.deepEqual(mapPointerToCanvas({
    clientX: 420,
    clientY: 230,
    rect: { left: 100, top: 50, width: 640, height: 360 },
    canvasWidth: 1280,
    canvasHeight: 720,
  }), { x: 640, y: 360, nx: 0, ny: 0 });
});
