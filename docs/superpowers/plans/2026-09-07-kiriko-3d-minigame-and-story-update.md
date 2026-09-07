# Kiriko 3D Minigame and Story Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the story to Kiriko, make the ending persistent with confirmed restart, and replace the flat minigame loop with an original Three.js training-room experience using selectable healing/damage orbs and reversal.

**Architecture:** `storyData.js` remains the content source. `Engine` owns ending/restart state and name rendering. `Minigame` owns a shared orb-selection state machine consumed by Three.js and Canvas 2D renderers; a bounded 3D arena adds walls, drones, bounce, and first-person-style HUD while preserving 2D/skip fallbacks.

**Tech Stack:** Native JavaScript, vendored Three.js r160, Canvas 2D, Node built-in test runner, Playwright smoke scripts

## Global Constraints

- Keep Three.js local and preserve Canvas 2D and skip fallback paths.
- Runtime remains offline-first with no CDN, remote fonts, online APIs, or new runtime packages.
- Every behavior change follows Red → Green → Refactor.
- `storyData.js` is the source of names, copy, and resource paths; renderer code must not hardcode personal names.
- Public assets remain original/procedural; do not copy OW assets, maps, models, or textures.

---

### Task 1: Lock content and ending contracts with failing tests

**Files:**
- Create: `tests/story-content-update.test.js`
- Modify: `tests/engine-proposal-consent.test.js`
- Modify: `tests/minigame-physics.test.js`

**Interfaces:**
- Consumes: source strings from `js/storyData.js`, `index.html`, `js/engine.js`, and `js/minigame.js`.
- Produces: executable contracts for content migration, persistent ending, and orb selection/reversal.

- [ ] **Step 1: Write failing tests**

```js
test('story migrates the note, comment, and heroine to Kiriko', () => {
  assert.match(story, /大龄游戏宅, 喜欢玩OW/);
  assert.match(story, /戳戳,🙋‍♀️/);
  assert.match(story, /雾子/);
  assert.doesNotMatch(story, /小美|冰墙/);
});

test('ending requires explicit restart confirmation', () => {
  assert.match(html, /id="endingRestart"[^>]*type="button"/);
  assert.match(html, /要重新开始我们的故事吗？/);
  assert.doesNotMatch(engine, /document\.addEventListener\("keydown", restart/);
});

test('orb selection uses E plus left/right and E reverses active orbs', () => {
  assert.match(source, /selectedOrbType/);
  assert.match(source, /KeyA|ArrowLeft/);
  assert.match(source, /KeyD|ArrowRight/);
  assert.match(source, /_reverseOrbs\(\)/);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test tests/story-content-update.test.js tests/engine-proposal-consent.test.js tests/minigame-physics.test.js`

Expected: failures identify the old note, 小美 copy, auto-restart listener, and missing selection state.

### Task 2: Migrate story/config/docs to Kiriko and correct full names

**Files:**
- Modify: `js/storyData.js`
- Modify: `README.md`
- Modify: `docs/story-script.md`
- Modify: `docs/project-memory.md`
- Create: `docs/decisions/2026-09-07-kiriko-story-migration.md`

**Interfaces:**
- Consumes: content contracts from Task 1.
- Produces: a single consistent story using `雾子`, exact note/comment copy, and full `朱盈畅` naming.

- [ ] **Step 1: Replace the opening note and comment**

Use exact text `大龄游戏宅, 喜欢玩OW` and `戳戳,🙋‍♀️` in the first chapter.

- [ ] **Step 2: Replace visible heroine role copy**

Change role descriptions, support lines, health labels, reveal subtitles, and documentation from 小美/冰墙 to 雾子-themed copy.

- [ ] **Step 3: Rename config fields and runtime identifiers**

Use `kirikoHP` and `kirikoDistance` in the source of truth; update all consumers and tests. Keep no user-visible 小美 fallback text.

- [ ] **Step 4: Harden full-name rendering**

Keep `朱盈畅` in `meta.realHeroineName` and all explicit `say.name` values; add `white-space: nowrap`, `min-width: max-content`, and visible overflow rules to `.name-tag` and `.mg-reveal-name`.

- [ ] **Step 5: Verify content green**

Run: `node --test tests/story-content-update.test.js tests/config-validation.test.js tests/dialogue-name-tag.test.js`

Expected: all focused content/name tests pass.

### Task 3: Implement persistent ending with explicit confirmation

**Files:**
- Modify: `index.html`
- Modify: `js/engine.js`
- Modify: `css/style.css`
- Modify: `tests/engine-proposal-consent.test.js`

**Interfaces:**
- Consumes: `CONFIG.meta.endingLine` and `CONFIG.meta.proposalDate`.
- Produces: `Engine._showRestartPrompt()`, `Engine._hideRestartPrompt()`, and explicit `#endingConfirmYes/#endingConfirmNo` controls.

- [ ] **Step 1: Add the failing confirmation behavior test**

Assert that the restart control opens a visible prompt, cancel leaves `Engine.state === "ended"`, and confirm is the only path that invokes reload.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/engine-proposal-consent.test.js`

Expected: failure because the current ending auto-binds document key/click restart and has no confirmation layer.

- [ ] **Step 3: Implement the ending controls**

Add a semantic restart button and hidden confirmation dialog in `index.html`; cache them in `Engine.init`; wire click handlers; remove the delayed global key/click reload listener from `_accept()`.

- [ ] **Step 4: Add focused styles**

Style the confirmation panel and preserve `:focus-visible`; keep the final ending layer visible behind it.

- [ ] **Step 5: Verify green**

Run: `node --test tests/engine-proposal-consent.test.js tests/dialogue-name-tag.test.js && npm run check`

### Task 4: Implement shared orb selection, reversal, and 3D arena polish

**Files:**
- Modify: `index.html`
- Modify: `css/style.css`
- Modify: `js/minigame.js`
- Modify: `tests/minigame-physics.test.js`
- Modify: `tests/minigame-touch-controls.test.js`

**Interfaces:**
- Consumes: `CONFIG.minigame.kirikoHP`, `CONFIG.minigame.kirikoDistance`, existing `touchInput` and `MinigameMode`.
- Produces: `selectedOrbType`, `_selectOrbType(type)`, `_cycleOrbType(direction)`, `_handleOrbAction()`, shared 2D/3D selected firing, bounded arena bounce, and HUD selection controls.

- [ ] **Step 1: Add failing unit tests**

Cover default yellow selection, A/D cycling, selected-type firing, E reversal only after a shot, and X/Z boundary bounce reflection.

- [ ] **Step 2: Run focused physics/touch tests and verify RED**

Run: `node --test tests/minigame-physics.test.js tests/minigame-touch-controls.test.js`

Expected: missing helper/state assertions fail.

- [ ] **Step 3: Implement the shared state machine**

Track `selectedOrbType` and `orbSelectionMode`; make E enter selection when no active orb and reverse active orbs otherwise; make A/D and arrows cycle; make left-click and touch action buttons fire the selected type; preserve safe skip and old pointer cleanup.

- [ ] **Step 4: Add the Three.js arena**

Create procedural walls, cover blocks, target rings, a lower camera/weapon-rig composition, and bounded orb reflection. Dispose all generated geometry/materials through the existing scene cleanup path.

- [ ] **Step 5: Update Canvas 2D fallback**

Draw selected yellow/purple cards and use the same firing/reversal state; keep the simplified renderer playable and text guidance accurate.

- [ ] **Step 6: Verify green**

Run: `node --test tests/minigame-physics.test.js tests/minigame-touch-controls.test.js && npm run check`

### Task 5: Update smoke coverage, docs, and release evidence

**Files:**
- Modify: `tests/smoke-touch-minigame.py`
- Modify: `tests/smoke-relationship-ux.py`
- Modify: `docs/story-script.md`
- Modify: `docs/project-memory.md`
- Modify: `docs/reviews/2026-09-07-kiriko-3d-minigame-review.md`

**Interfaces:**
- Consumes: final Engine and Minigame behavior from Tasks 2–4.
- Produces: silent browser evidence for both routes, touch selection/reversal, ending confirmation, and no external runtime requests.

- [ ] **Step 1: Extend touch smoke**

Assert yellow/purple selection controls, selected status text, one-shot reversal, and skip return to the mainline.

- [ ] **Step 2: Extend relationship smoke**

Accept the proposal, verify the ending remains visible after a delay, open restart confirmation, cancel it, and verify the ending remains visible.

- [ ] **Step 3: Run full verification**

Run: `npm test`; `npm run check`; `git diff --check`; local static server with both Python smoke scripts.

- [ ] **Step 4: Record review evidence and commit**

Record changed behaviors, known warnings, and remaining real-device checks in the dated review and project memory.

