const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadMinigame() {
  const context = {
    console,
    window: { addEventListener() {}, removeEventListener() {} },
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

test('dt conversion clamps invalid and long frames', () => {
  const minigame = loadMinigame();
  assert.equal(minigame._dtSeconds(40), 0.04);
  assert.equal(minigame._dtSeconds(-10), 0);
  assert.equal(minigame._dtSeconds(Number.NaN), 0);
  assert.equal(minigame._dtSeconds(1000), 0.05);
  assert.equal(minigame._frameScale(1000 / 60), 1);
  assert.equal(minigame._frameScale(1000 / 30), 2);
});

test('vector integration is stable across 60hz and 30hz steps', () => {
  const minigame = loadMinigame();
  const velocity = { x: 6, y: -3, z: 1.5 };
  const sixty = { x: 0, y: 0, z: 0 };
  const thirty = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 60; i++) minigame._integrateVector(sixty, velocity, 1000 / 60);
  for (let i = 0; i < 30; i++) minigame._integrateVector(thirty, velocity, 1000 / 30);
  for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(sixty[axis] - thirty[axis]) < 0.0001);
  assert.ok(Math.abs(sixty.x - 6) < 0.0001);
  assert.ok(Math.abs(sixty.y + 3) < 0.0001);
  assert.ok(Math.abs(sixty.z - 1.5) < 0.0001);
});

test('collision distance compares the horizontal plane without allocations', () => {
  const minigame = loadMinigame();
  assert.equal(minigame._distanceSquaredXZ({ x: 3, y: 20, z: 4 }, { x: 0, y: -10, z: 0 }), 25);
  assert.ok(minigame._distanceSquaredXZ({ x: 1.2, z: 0 }, { x: 0, z: 0 }) > 1);
});

test('3d player movement is stable across frame rates', () => {
  const makeSimulation = () => {
    const minigame = loadMinigame();
    minigame.mode = 'three';
    minigame.cfg = { duration: 90, playerSpeed: 4, meiDistance: 80, fireRate: 400, enemySpawnInterval: 2200, enemyMax: 5 };
    minigame.startTime = 0;
    minigame.lastSpawn = 0;
    minigame.lastShot = 0;
    minigame.ended = false;
    minigame.player = { position: { x: 0, y: 0, z: 0 }, rotation: {}, facing: 0 };
    minigame.mei = { position: { x: 0, y: 0, z: 0 }, rotation: {}, hp: 100 };
    minigame.camera = { position: {}, lookAt() {} };
    minigame.enemies = [];
    minigame.orbs = [];
    minigame.trails = [];
    minigame.particles = [];
    minigame._readMoveVector = () => ({ mx: 1, my: 0 });
    minigame._readAimVector = () => ({ x: 1, y: 0, active: true });
    return minigame;
  };
  const sixty = makeSimulation();
  const thirty = makeSimulation();
  for (let i = 0; i < 60; i++) sixty._update(1000 / 60, 1000);
  for (let i = 0; i < 30; i++) thirty._update(1000 / 30, 1000);
  assert.ok(Math.abs(sixty.player.position.x - thirty.player.position.x) < 0.0001);
  assert.ok(Math.abs(sixty.player.position.x - 14.4) < 0.0001);
});

test('effect collection trimming removes oldest entries at the cap', () => {
  const minigame = loadMinigame();
  const collection = ['oldest', 'newest'];
  const removed = [];
  minigame._trimEffectCollection(collection, 2, item => removed.push(item));
  assert.deepEqual(collection, ['newest']);
  assert.deepEqual(removed, ['oldest']);
});
