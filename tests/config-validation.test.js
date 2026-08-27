const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { validateConfig } = require('../js/configValidation.js');

function config(overrides = {}) {
  return {
    meta: { title: 'T', heroName: 'H', heroineName: 'W' },
    images: {
      backgrounds: { menu: 'menu.jpg' },
      characters: { hero: { neutral: 'hero.jpg' } },
      photos: ['photo.jpg'],
    },
    audio: { bgm: { opening: '' }, sfx: {} },
    minigame: { duration: 10 },
    story: {
      start: [
        { scene: { bg: 'menu' } },
        { show: { char: 'hero', expr: 'neutral', pos: 'left' } },
        { say: { who: 'hero', text: 'hello' } },
        { jump: { label: 'end' } },
      ],
      end: [{ say: { who: 'narration', text: 'done' } }],
    },
    ...overrides,
  };
}

test('accepts a config whose story references existing labels and assets', () => {
  const result = validateConfig(config());
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('rejects an unknown jump label with instruction location', () => {
  const value = config();
  value.story.start[3].jump.label = 'missing';
  const result = validateConfig(value);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /story\.start\[3\].*missing/);
});

test('rejects unknown commands instead of silently skipping them', () => {
  const value = config();
  value.story.start[0] = { typo: {} };
  const result = validateConfig(value);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /story\.start\[0\].*typo/);
});

test('collects only non-empty external audio paths for preflight', () => {
  const value = config();
  value.audio.bgm.game = 'assets/audio/game.mp3';
  const result = validateConfig(value);
  assert.equal(result.ok, true);
  assert.deepEqual(result.audioPaths, ['assets/audio/game.mp3']);
});

test('ships with a silent BGM configuration when no licensed audio assets are bundled', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'storyData.js'), 'utf8');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${source}\nthis.loadedConfig = CONFIG;`, context);

  const result = validateConfig(context.loadedConfig);
  assert.equal(result.ok, true);
  assert.deepEqual(result.audioPaths, []);
});
