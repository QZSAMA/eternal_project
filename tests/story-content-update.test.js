const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const story = fs.readFileSync(path.join(root, 'js', 'storyData.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'js', 'engine.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const minigame = fs.readFileSync(path.join(root, 'js', 'minigame.js'), 'utf8');

test('story uses the requested Xiaohongshu note and comment and Kiriko role', () => {
  assert.match(story, /大龄游戏宅, 喜欢玩OW/);
  assert.match(story, /戳戳,🙋‍♀️/);
  assert.match(story, /雾子/);
  assert.doesNotMatch(story, /小美|冰墙/);
});

test('story is a linear female-viewpoint memory timeline', () => {
  assert.match(story, /女生视角|我看见|我记得|我和他/);
  assert.match(story, /守望先锋线下展览/);
  assert.match(story, /演唱会重放/);
  assert.match(story, /脱口秀/);
  assert.match(story, /X118/);
  assert.match(story, /2025[年年\-./ ]+5月?20日|2025-05-20/);
  assert.match(story, /情书/);
  assert.match(story, /Will you marry me\?/i);
  assert.doesNotMatch(story, /branch\s*:|再来一局.*见一面|见一面.*再来一局/);
  assert.match(story, /memoryBubbles\s*:/);
});

test('all visible heroine names keep the full 朱盈畅 spelling', () => {
  assert.match(story, /realHeroineName:\s*"朱盈畅"/);
  assert.doesNotMatch(minigame, /朱盈(?!畅)/);
  assert.match(css, /\.name-tag[^{]*\{[^}]*white-space:\s*nowrap/s);
});

test('ending markup exposes an explicit restart confirmation', () => {
  assert.match(html, /id="endingRestart"[^>]*type="button"/);
  assert.match(html, /id="endingConfirm"/);
  assert.match(html, /要重新开始我们的故事吗？/);
  assert.doesNotMatch(engine, /document\.addEventListener\("keydown", restart/);
});

test('orb controls expose selectable yellow and purple actions', () => {
  assert.match(html, /id="mgNeedHealing"/);
  assert.match(minigame, /requestHealing/);
  assert.match(minigame, /_convertPurpleOrbsToYellow/);
  assert.doesNotMatch(minigame, /selectedOrbType/);
});

test('minigame is 2d-only and keeps skip fallback without remote assets', () => {
  assert.match(minigame, /mode:\s*"2d"/);
  assert.doesNotMatch(minigame, /new THREE\.|WebGLRenderer|BoxGeometry/);
  assert.match(minigame, /mode\s*===\s*["']skip["']/);
  assert.doesNotMatch(minigame, /https?:\/\//);
});
