const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'js', 'engine.js'), 'utf8');

test('start cover exposes a mute control before the story starts', () => {
  assert.match(html, /id="startMuteBtn"[^>]*aria-label="静音切换"/);
  assert.match(html, /id="startMuteBtn"[^>]*aria-pressed="false"/);
});

test('start and HUD mute buttons share one synchronization helper', () => {
  assert.match(engine, /startMuteBtn:\s*\$\("startMuteBtn"\)/);
  assert.match(engine, /_syncMuteButtons\(\)/);
});
