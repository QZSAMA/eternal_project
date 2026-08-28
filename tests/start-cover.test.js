const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

test('start cover uses the approved local co-op artwork and preserves engine ids', () => {
  assert.match(html, /class="start-art"[^>]+src="assets\/images\/photos\/photo2\.jpg"/);
  assert.match(html, /id="startTitle"[^>]*>我们的故事</);
  assert.match(html, /id="startBtn"[^>]*>[\s\S]*开始双人旅程[\s\S]*<\/button>/);
  assert.doesNotMatch(html, /class="start-deco"/);
});

test('start cover exposes the approved cooperative game copy', () => {
  assert.match(html, /CO-OP STORY MODE \/ ONLINE/);
  assert.match(html, /OUR[\s\S]*STORY/);
  assert.match(html, /SAVE SLOT 01/);
  assert.match(html, /SYNC RATE[\s\S]*100%/);
  assert.match(html, /两个人的主线任务，从这一刻继续/);
});

test('start cover defines the approved palette and reduced-motion fallback', () => {
  assert.match(css, /--start-bg:\s*#080A18/i);
  assert.match(css, /--start-coral:\s*#FF684E/i);
  assert.match(css, /--start-cyan:\s*#7EE6FF/i);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.start-art[\s\S]*animation:/);
});
