const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class FakeClassList {
  constructor(values = []) {
    this.values = new Set(values);
  }
  add(...values) { values.forEach(value => this.values.add(value)); }
  remove(...values) { values.forEach(value => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
}

function createSlot({ char = '', expr = '', shown = false } = {}) {
  return {
    classList: new FakeClassList(shown ? ['is-show'] : []),
    dataset: { char, expr },
    innerHTML: char ? `<img src="${char}-${expr}.jpg">` : '',
  };
}

function loadEngine() {
  const jobs = [];
  let nextTimerId = 1;
  const context = {
    console,
    window: { addEventListener() {} },
    document: { addEventListener() {} },
    CONFIG: {},
    Minigame: {},
    GameAudio: { init() {}, sfx() {} },
    requestAnimationFrame(callback) { callback(); return 1; },
    setTimeout(callback) {
      const job = { id: nextTimerId++, callback, cancelled: false };
      jobs.push(job);
      return job.id;
    },
    clearTimeout(id) {
      const job = jobs.find(candidate => candidate.id === id);
      if (job) job.cancelled = true;
    },
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'engine.js'), 'utf8');
  vm.runInContext(`${source}\nthis.EngineUnderTest = Engine;`, context);
  const engine = context.EngineUnderTest;
  engine.data = {
    meta: { heroName: 'H', heroineName: 'W' },
    images: {
      characters: {
        heroine: {
          normal: 'heroine-normal.jpg',
          shy: 'heroine-shy.jpg',
          laugh: 'heroine-laugh.jpg',
        },
      },
    },
  };
  engine.dom = {
    charLeft: createSlot(),
    charCenter: createSlot(),
    charRight: createSlot(),
    dialogueBox: { classList: new FakeClassList() },
    nameTag: { style: {}, textContent: '', className: '' },
    dialogueText: { textContent: '' },
    dialogueArrow: { classList: new FakeClassList() },
  };
  return { engine, jobs };
}

test('moving the same character from center to right clears the old slot', () => {
  const { engine } = loadEngine();
  engine._show({ char: 'heroine', pos: 'center', expr: 'shy' });
  engine._show({ char: 'heroine', pos: 'right', expr: 'normal' });

  assert.equal(engine.dom.charCenter.dataset.char, '');
  assert.equal(engine.dom.charCenter.innerHTML, '');
  assert.equal(engine.dom.charCenter.classList.contains('is-show'), false);
  assert.equal(engine.dom.charRight.dataset.char, 'heroine');
  assert.equal(engine.dom.charRight.dataset.expr, 'normal');
});

test('an older delayed expression callback cannot overwrite the latest expression', () => {
  const { engine, jobs } = loadEngine();
  engine._show({ char: 'heroine', pos: 'left', expr: 'normal' });
  engine._say({ who: 'heroine', expr: 'shy', text: '' });
  const staleJob = jobs.at(-1);
  engine._say({ who: 'heroine', expr: 'laugh', text: '' });

  staleJob.callback();

  assert.equal(staleJob.cancelled, true);
  assert.equal(engine.dom.charLeft.dataset.expr, 'laugh');
  assert.match(engine.dom.charLeft.innerHTML, /heroine-laugh\.jpg/);
});

test('hiding a character invalidates a pending expression callback', () => {
  const { engine, jobs } = loadEngine();
  engine._show({ char: 'heroine', pos: 'left', expr: 'normal' });
  engine._say({ who: 'heroine', expr: 'shy', text: '' });
  const staleJob = jobs.at(-1);

  engine._hide({ char: 'heroine' });
  staleJob.callback();

  assert.equal(staleJob.cancelled, true);
  assert.equal(engine.dom.charLeft.dataset.char, '');
  assert.equal(engine.dom.charLeft.dataset.expr, '');
  assert.equal(engine.dom.charLeft.innerHTML, '');
  assert.equal(engine.dom.charLeft.classList.contains('is-show'), false);
});
