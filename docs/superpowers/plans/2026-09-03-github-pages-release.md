# GitHub Pages Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the verified static game from `main` to GitHub Pages with automated release gates.

**Architecture:** A GitHub Actions workflow separates verification from deployment. The verified repository root is uploaded as the Pages artifact, preserving all relative resource URLs and the offline runtime architecture.

**Tech Stack:** GitHub Actions, GitHub Pages, Node.js built-in test runner, static HTML/CSS/JavaScript

## Global Constraints

- `main` is the only production deployment source.
- Runtime resources remain local; do not add CDN, remote fonts, online APIs, or npm runtime dependencies.
- Deployment cannot run unless `npm test` and `npm run check` pass.
- Keep Three.js vendored and preserve Canvas 2D and skip fallbacks.

---

### Task 1: Define and implement the Pages deployment contract

**Files:**
- Create: `tests/pages-deployment.test.js`
- Create: `.github/workflows/deploy-pages.yml`

**Interfaces:**
- Consumes: existing `npm test` and `npm run check` scripts.
- Produces: a `Deploy GitHub Pages` workflow triggered by `main` and `workflow_dispatch`.

- [ ] **Step 1: Write the failing deployment contract test**

```js
test('GitHub Pages deploys main only after verification', () => {
  assert.match(workflow, /branches:\s*\[main\]/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /needs:\s*verify/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/pages-deployment.test.js`

Expected: FAIL because `.github/workflows/deploy-pages.yml` does not exist.

- [ ] **Step 3: Add the minimal official Pages workflow**

Create two jobs: `verify` checks out and runs the existing Node commands; `deploy` depends on `verify`, uploads `.` using `actions/upload-pages-artifact@v4`, then deploys with `actions/deploy-pages@v4`.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/pages-deployment.test.js && npm test && npm run check`

Expected: all tests and syntax checks pass.

### Task 2: Record the production release contract

**Files:**
- Modify: `README.md`
- Modify: `docs/project-memory.md`
- Create: `docs/decisions/2026-09-03-github-pages-main-release.md`

**Interfaces:**
- Consumes: the workflow contract from Task 1.
- Produces: durable operator guidance and a release decision record.

- [ ] **Step 1: Document the public URL and release behavior**

Add `https://qzsama.github.io/eternal_project/` to README and state that only verified `main` pushes publish.

- [ ] **Step 2: Update project memory and ADR**

Record `main` as the production branch, the Pages URL, release gates, rollback behavior, and the requirement to recheck privacy and asset authorization before public screenshots are shared.

- [ ] **Step 3: Validate documentation and repository whitespace**

Run: `git diff --check`

Expected: no output and exit code 0.

### Task 3: Publish and verify production

**Files:**
- No additional repository files.

**Interfaces:**
- Consumes: the verified release commit.
- Produces: matching feature and `main` remote refs plus a live Pages deployment.

- [ ] **Step 1: Commit and push the release work**

Push the release commit to `feat/cover-character-layering`, then fast-forward the same commit to `main`.

- [ ] **Step 2: Enable and observe GitHub Pages**

Set Pages `build_type` to `workflow`, then monitor the `Deploy GitHub Pages` run until it succeeds or produces an actionable failure.

- [ ] **Step 3: Run a production smoke test**

Open the returned Pages URL in headless Chromium and assert a successful response, visible start button, local-only runtime assets, and no failed requests or page errors.

- [ ] **Step 4: Confirm immutable release evidence**

Compare local `HEAD`, remote feature ref, remote `main`, the Actions run commit, and Pages deployment commit. All must match.

