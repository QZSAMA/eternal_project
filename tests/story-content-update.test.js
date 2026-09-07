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
  assert.match(html, /id="mgTouchSelectYellow"/);
  assert.match(html, /id="mgTouchSelectPurple"/);
  assert.match(minigame, /selectedOrbType/);
  assert.match(minigame, /KeyA|ArrowLeft/);
  assert.match(minigame, /KeyD|ArrowRight/);
  assert.match(minigame, /_reverseOrbs\(\)/);
});

test('three mode exposes an original training arena without remote assets', () => {
  assert.match(minigame, /_buildTrainingArena/);
  assert.match(minigame, /BoxGeometry/);
  assert.match(minigame, /arenaHalfSize/);
  assert.doesNotMatch(minigame, /https?:\/\//);
});
