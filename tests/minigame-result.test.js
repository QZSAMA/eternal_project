const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadEngine(result) {
  const context = {
    console,
    window: { addEventListener() {} },
    document: { addEventListener() {} },
    CONFIG: {},
    Minigame: {},
    GameAudio: { init() {}, sfx() {} },
    requestAnimationFrame(callback) { callback(); return 1; },
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'engine.js'), 'utf8');
  vm.runInContext(`${source}\nthis.EngineUnderTest = Engine;`, context);
  const engine = context.EngineUnderTest;
  engine.data = { minigame: { duration: 90 } };
  engine.callMinigame = (_cfg, onEnd) => onEnd(result);
  engine._next = () => {};
  return engine;
}

test('engine preserves the minigame result before continuing the story', () => {
  const skipped = loadEngine('skipped');
  skipped._call({ minigame: 'default' });
  assert.equal(skipped.lastMinigameResult, 'skipped');

  const timeout = loadEngine('timeout');
  timeout._call({ minigame: 'default' });
  assert.equal(timeout.lastMinigameResult, 'timeout');
});

test('gaming follow-up copy does not claim success after a skipped game', () => {
  const story = fs.readFileSync(path.join(__dirname, '..', 'js', 'storyData.js'), 'utf8');
  assert.doesNotMatch(story, /今天居然真的奶到我了/);
  assert.doesNotMatch(story, /说了这次一定奶到你嘛/);
  assert.match(story, /和你一起组队就是最开心的事/);
});
