const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'deploy-pages.yml');
const workflow = fs.existsSync(workflowPath) ? fs.readFileSync(workflowPath, 'utf8') : '';

test('GitHub Pages deploys main only after verification', () => {
  assert.match(workflow, /branches:\s*\[main\]/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /needs:\s*verify/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
});

test('GitHub Pages workflow uses least-privilege deployment permissions', () => {
  assert.match(workflow, /contents:\s*read/);
  assert.match(workflow, /pages:\s*write/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
});
