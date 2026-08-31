const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
const nameTagRule = css.match(/\.name-tag\{([\s\S]*?)\}/)?.[1] || '';
const dialogueRule = css.match(/\.dialogue-box\{([\s\S]*?)\}/)?.[1] || '';

test('dialogue name tag stays inside the clipped dialogue box', () => {
  assert.match(nameTagRule, /top:\s*0(?:px)?\s*;/,
    'name tag must not extend above the dialogue box clip path');
});

test('dialogue text leaves room for the in-box name tag', () => {
  const padding = dialogueRule.match(/padding:\s*([\d.]+)px\s+([\d.]+)px\s+([\d.]+)px/);
  assert.ok(padding, 'dialogue box should define explicit padding');
  assert.ok(Number(padding[1]) >= 70,
    'top padding must keep dialogue text below the full-height name tag');
});
