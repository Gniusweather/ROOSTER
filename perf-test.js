#!/usr/bin/env node
/**
 * Performance & integrity test for index.html (Rooster Observatoren 2026).
 *
 * Runs the page's inline script inside a minimal DOM stub (no browser needed),
 * then:
 *   1. asserts data integrity (days per month, real 2026 weekdays, known shift codes)
 *   2. asserts the bug fixes (hour table, Feb 28, weekday computation, HTML escaping)
 *   3. benchmarks the hot paths (render, calcTotals, 2025 year view, Excel export)
 *
 * Usage: node perf-test.js
 * Exit code 0 = all checks passed, 1 = failure.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML_PATH = path.join(__dirname, 'index.html');
const html = fs.readFileSync(HTML_PATH, 'utf8');

// ── Extract the inline <script> (the one without src=) ──
const scriptMatch = html.match(/<script>\n([\s\S]*)<\/script>\s*<\/body>/);
if (!scriptMatch) { console.error('FAIL: could not extract inline script from index.html'); process.exit(1); }
const pageScript = scriptMatch[1];

// ── Minimal DOM stub ──
const allElements = [];
const idRegistry = new Map();

class StubElement {
  constructor(tagName) {
    this.tagName = (tagName || 'div').toUpperCase();
    this.children = [];
    this.style = {};
    this.dataset = {};
    this._classes = new Set();
    this._innerHTML = '';
    this._id = '';
    this.textContent = '';
    this.title = '';
    this.contentEditable = false;
    allElements.push(this);
  }
  get id() { return this._id; }
  set id(v) { this._id = v; idRegistry.set(v, this); }
  get className() { return [...this._classes].join(' '); }
  set className(v) { this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get classList() {
    const self = this;
    return {
      add: (...c) => c.forEach(x => self._classes.add(x)),
      remove: (...c) => c.forEach(x => self._classes.delete(x)),
      contains: c => self._classes.has(c),
      toggle: (c, force) => {
        const on = force !== undefined ? force : !self._classes.has(c);
        on ? self._classes.add(c) : self._classes.delete(c);
        return on;
      },
    };
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(v) {
    this._innerHTML = String(v);
    this.children = [];
    // Register ids that appear in the HTML string so getElementById finds them
    // (e.g. render2025 writes id="monthBars" via innerHTML, then looks it up).
    for (const m of this._innerHTML.matchAll(/\sid="([^"]+)"/g)) {
      if (!idRegistry.has(m[1])) {
        const child = new StubElement('div');
        child.id = m[1];
      }
    }
  }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener() {}
  scrollIntoView() {}
  querySelectorAll() { return []; }
  setAttribute(k, v) { this[k] = v; }
}

function cssMatch(el, selector) {
  if (selector.startsWith('.')) return el._classes.has(selector.slice(1));
  if (selector.startsWith('#')) return el._id === selector.slice(1);
  return el.tagName === selector.toUpperCase();
}

const documentStub = {
  createElement: tag => new StubElement(tag),
  getElementById: id => idRegistry.get(id) || null,
  querySelector: sel => allElements.find(el => cssMatch(el, sel)) || null,
  querySelectorAll: sel => allElements.filter(el => cssMatch(el, sel)),
};

// Static page structure the script expects to exist
for (const id of ['tabs','personCards','uploadWrap','thead','tbody','hTitle','hSub','toast','f-all','f-jpa','f-gma']) {
  const el = new StubElement('div'); el.id = id;
}
const filterRow = new StubElement('div'); filterRow.className = 'filter-row';
const mainEl = new StubElement('div'); mainEl.className = 'main';

const storage = new Map();
const sandbox = {
  document: documentStub,
  localStorage: {
    getItem: k => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: k => storage.delete(k),
  },
  XLSX: { // capture exports instead of writing files
    utils: {
      book_new: () => ({ sheets: [] }),
      aoa_to_sheet: rows => ({ rows }),
      book_append_sheet: (wb, ws, name) => wb.sheets.push({ name, ws }),
    },
    writeFile: () => {},
  },
  setTimeout: () => 0,
  clearTimeout: () => {},
  confirm: () => false,
  prompt: () => null,
  alert: () => {},
  navigator: { serviceWorker: { register: () => Promise.resolve() } },
  fetch: () => Promise.reject(new Error('no network in test')),
  console,
};
vm.createContext(sandbox);

// ── Test harness ──
let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ok    ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}
function bench(name, fn, iterations) {
  // warm-up
  for (let i = 0; i < Math.min(5, iterations); i++) fn(i);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) fn(i);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const avg = ms / iterations;
  console.log(`  ${name.padEnd(42)} ${String(iterations).padStart(6)}x  total ${ms.toFixed(1).padStart(8)} ms   avg ${avg.toFixed(3).padStart(8)} ms`);
  return avg;
}

console.log('\n=== Page weight ===');
const totalKB = Buffer.byteLength(html) / 1024;
let imgBytes = 0;
for (const m of html.matchAll(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/g)) imgBytes += m[0].length;
console.log(`  index.html total:        ${totalKB.toFixed(0)} KB`);
console.log(`  embedded base64 images:  ${(imgBytes / 1024).toFixed(0)} KB (${(100 * imgBytes / Buffer.byteLength(html)).toFixed(1)}%)`);

console.log('\n=== Script init (parse + first render) ===');
// Top-level const/let inside the vm don't become sandbox properties — append
// an export shim so the test can reach the page's functions and data.
const exportShim = `
;globalThis.__t = {
  MONTHS, MDAYS, PRESET, MONTHS2025, DATA2025,
  emptyMonth, hrs, escapeHtml, badgeClass, calcTotals, calc2025Yearly,
  renderTableOnly, render, render2025, exportXlsx, export2025,
  undoPush, undoEdit, normShift, personsFor,
  setMultiView: (m,v) => { multiView[m] = v; },
  setCurrent: m => { current = m; },
  setMode: m => { mode = m; },
  getUndoStack: () => undoStack,
  getStore: () => store,
};`;

const tInit = process.hrtime.bigint();
vm.runInContext(pageScript + exportShim, sandbox, { filename: 'index.html#script' });
const initMs = Number(process.hrtime.bigint() - tInit) / 1e6;
console.log(`  init time: ${initMs.toFixed(1)} ms`);
check('init completes in < 2000 ms', initMs < 2000, `${initMs.toFixed(1)} ms`);

const ctx = sandbox.__t;

console.log('\n=== Data integrity: 2026 preset ===');
const KNOWN_CODES = new Set(['', 'X', 'D', 'D*', 'A', 'KW', 'R', 'R=A', 'R=D', 'R=D*', 'R=KW', 'VAK', 'VG', 'X/D', 'X=D', 'Z']);
const DNAMES = ['MA','DI','WO','DO','VR','ZA','ZO'];
let badDays = [], badCodes = [], badCounts = [];
ctx.MONTHS.forEach((m, idx) => {
  const rows = ctx.PRESET[m];
  if (!rows) return;
  const expectedDays = new Date(2026, idx + 1, 0).getDate();
  if (rows.length !== expectedDays) badCounts.push(`${m}: ${rows.length} rows, expected ${expectedDays}`);
  rows.forEach((r, i) => {
    if (r.date !== i + 1) badCounts.push(`${m} row ${i}: date ${r.date}`);
    const realDay = DNAMES[(new Date(2026, idx, r.date).getDay() + 6) % 7];
    if (r.day !== realDay) badDays.push(`${m} ${r.date}: '${r.day}' should be '${realDay}'`);
    for (const code of [r.jpa, r.gma2, r.qpi, r.ays, r.fca]) {
      if (code === undefined) continue; // qpi/ays/fca only exist on multi-person months
      if (!KNOWN_CODES.has((code || '').toUpperCase().trim())) badCodes.push(`${m} ${r.date}: '${code}'`);
    }
  });
});
check('every preset month has the correct number of days, sequential dates', badCounts.length === 0, badCounts.join('; '));
check('every preset day label matches the real 2026 calendar', badDays.length === 0, badDays.slice(0, 5).join('; '));
check('every preset shift code is a known code', badCodes.length === 0, badCodes.slice(0, 5).join('; '));

console.log('\n=== Bug-fix regression checks ===');
check("MDAYS[1] is 28 (2026 is not a leap year)", ctx.MDAYS[1] === 28, `got ${ctx.MDAYS[1]}`);
const feb = ctx.emptyMonth(1);
check('emptyMonth(Feb) has 28 days', feb.length === 28, `got ${feb.length}`);
check("emptyMonth computes real weekdays (1 Feb 2026 = ZO)", feb[0].day === 'ZO', `got '${feb[0].day}'`);
check("hrs('D') === 12", ctx.hrs('D') === 12);
check("hrs('D*') === 8", ctx.hrs('D*') === 8);
check("hrs('KW') === 4", ctx.hrs('KW') === 4);
check("hrs('X=D') === 12 (was 0 before fix)", ctx.hrs('X=D') === 12, `got ${ctx.hrs('X=D')}`);
check("hrs('R=KW') === 4 (was 0 before fix)", ctx.hrs('R=KW') === 4, `got ${ctx.hrs('R=KW')}`);
check("badgeClass('X=D') === 'b-d'", ctx.badgeClass('X=D') === 'b-d', ctx.badgeClass('X=D'));
check("badgeClass('R=KW') === 'b-kw'", ctx.badgeClass('R=KW') === 'b-kw', ctx.badgeClass('R=KW'));
check("hrs('Z') === 0 (sick day, unworked)", ctx.hrs('Z') === 0, `got ${ctx.hrs('Z')}`);
check("badgeClass('Z') === 'b-z'", ctx.badgeClass('Z') === 'b-z', ctx.badgeClass('Z'));
check("escapeHtml neutralises HTML", ctx.escapeHtml('<img src=x onerror="x">') === '&lt;img src=x onerror=&quot;x&quot;&gt;', ctx.escapeHtml('<img src=x onerror="x">'));
check("scan runs fully client-side (no API key, no server endpoint)", !pageScript.includes("anthropic_api_key") && !pageScript.includes("api.anthropic.com") && !pageScript.includes("PROXY_URL"));
check("scan uses local Tesseract OCR", pageScript.includes("Tesseract") && pageScript.includes("scanRoosterOCR"));
check("photo reference image saved to localStorage", pageScript.includes("localStorage.setItem('img_'") || pageScript.includes("img_' + m"));
// normShift snaps OCR noise to the nearest known shift code
check("normShift maps clean codes (case-insensitive)", ctx.normShift('d*') === 'D*' && ctx.normShift('vak') === 'VAK', `${ctx.normShift('d*')}, ${ctx.normShift('vak')}`);
check("normShift fuzzy-corrects a 1-char OCR error (VAX→VAK)", ctx.normShift('VAX') === 'VAK', ctx.normShift('VAX'));
check("normShift returns '' for empty input", ctx.normShift('') === '');

// June & July both show all five person columns, GMA & JPA bold, in the required order
for (const monthName of ['June', 'July']) {
  const cols = ctx.personsFor(monthName);
  check(`${monthName} renders 5 person columns`, cols.length === 5, `got ${cols.length}`);
  check(`${monthName} column order is GMA, JPA, QPI, AYS, FCA`, cols.map(p=>p.label).join(',') === 'GMA,JPA,QPI,AYS,FCA', cols.map(p=>p.label).join(','));
  check(`${monthName}: GMA & JPA are bold, others not`, cols[0].bold && cols[1].bold && !cols[2].bold && !cols[3].bold && !cols[4].bold);
  check(`${monthName} preset rows carry qpi/ays/fca`, ctx.PRESET[monthName].every(r => 'qpi' in r && 'ays' in r && 'fca' in r));

  // toggle: 'gmajpa' view shows only GMA + JPA (both bold, GMA first)
  ctx.setMultiView(monthName, 'gmajpa');
  const two = ctx.personsFor(monthName);
  check(`${monthName} 'GMA+JPA only' view shows exactly GMA then JPA`, two.map(p=>p.label).join(',') === 'GMA,JPA', two.map(p=>p.label).join(','));
  check(`${monthName} 'GMA+JPA only' keeps both bold`, two.every(p=>p.bold));
  ctx.setMultiView(monthName, 'all');
  check(`${monthName} toggling back to 'all' restores 5 columns`, ctx.personsFor(monthName).length === 5);
}
check("other months still show default 2 columns (filter=all)", (ctx.setCurrent('May'), ctx.personsFor('May').length) === 2);
// June's jpa/gma2 values must be unchanged by the qpi/ays/fca addition
const juneManualJpa = ctx.PRESET.June.reduce((s, r) => s + ctx.hrs(r.jpa), 0);
const juneTotals = ctx.calcTotals('June');
check("June calcTotals.jpa matches manual per-row sum (jpa/gma2 untouched)", juneTotals.jpa === juneManualJpa, `${juneTotals.jpa} vs ${juneManualJpa}`);

// calcTotals consistency: total hours must equal the manual per-row sum
const t = ctx.calcTotals('February');
const manual = ctx.PRESET.February.reduce((s, r) => s + ctx.hrs(r.jpa), 0);
check('calcTotals(February).jpa matches manual per-row sum', t.jpa === manual, `${t.jpa} vs ${manual}`);

// undoEdit: push an entry, restore it, verify stack is empty
{
  const row = { jpa: 'D', gma2: 'X' };
  ctx.undoPush({ m: 'January', row, field: 'jpa', old: 'X' });
  check('undoPush adds to undoStack', ctx.getUndoStack().length === 1);
  ctx.undoEdit();
  check('undoEdit restores old value', row.jpa === 'X', `got '${row.jpa}'`);
  check('undoEdit empties the stack', ctx.getUndoStack().length === 0);
}

console.log('\n=== Benchmarks ===');
const avgTotals = bench('calcTotals (all 12 months)', () => { ctx.MONTHS.forEach(m => ctx.calcTotals(m)); }, 500);
const avgTable = bench('renderTableOnly (current month)', () => ctx.renderTableOnly(), 300);
const avgRender = bench('render (full month view, cycling months)', i => { ctx.setCurrent(ctx.MONTHS[i % 12]); ctx.render(); }, 120);
const avg2025calc = bench('calc2025Yearly', () => ctx.calc2025Yearly(), 500);
const avg2025 = bench('render2025 (year view)', () => ctx.render2025(), 30);
const avgExport = bench('exportXlsx (sheet build, write stubbed)', () => { ctx.setMode('2026'); ctx.setCurrent('May'); ctx.exportXlsx(); }, 100);
bench('export2025 (13 sheets, write stubbed)', () => ctx.export2025(), 30);

console.log('\n=== Performance thresholds ===');
check('calcTotals all months avg < 5 ms', avgTotals < 5, `${avgTotals.toFixed(3)} ms`);
check('renderTableOnly avg < 25 ms', avgTable < 25, `${avgTable.toFixed(3)} ms`);
check('render avg < 50 ms', avgRender < 50, `${avgRender.toFixed(3)} ms`);
check('calc2025Yearly avg < 5 ms', avg2025calc < 5, `${avg2025calc.toFixed(3)} ms`);
check('render2025 avg < 100 ms', avg2025 < 100, `${avg2025.toFixed(3)} ms`);
check('exportXlsx avg < 25 ms', avgExport < 25, `${avgExport.toFixed(3)} ms`);

console.log('\n=== Stale-cache migration (June/July schema upgrade) ===');
{
  // Simulate a device that cached June under the OLD 2-column schema
  // (jpa/gma2 only, no qpi/ays/fca) before that feature existed, then
  // verify a fresh script init discards the stale cache and loads the
  // current 5-column preset instead of silently shadowing it forever.
  const staleIdRegistry = new Map();
  const staleElements = [];
  const staleDocStub = {
    createElement: tag => { const el = new StubElement(tag); staleElements.push(el); return el; },
    getElementById: id => staleIdRegistry.get(id) || null,
    querySelector: sel => staleElements.find(el => cssMatch(el, sel)) || null,
    querySelectorAll: sel => staleElements.filter(el => cssMatch(el, sel)),
  };
  for (const id of ['tabs','personCards','uploadWrap','thead','tbody','hTitle','hSub','toast','f-all','f-jpa','f-gma']) {
    const el = new StubElement('div'); el.id = id; staleElements.push(el); staleIdRegistry.set(id, el);
  }
  const staleFilterRow = new StubElement('div'); staleFilterRow.className = 'filter-row'; staleElements.push(staleFilterRow);

  const staleStorage = new Map();
  const staleJune = Array.from({ length: 30 }, (_, i) => ({ date: i + 1, day: 'MA', jpa: 'X', gma2: 'X', op: '' }));
  staleStorage.set('r26_June', JSON.stringify(staleJune));

  const staleSandbox = {
    document: staleDocStub,
    localStorage: {
      getItem: k => (staleStorage.has(k) ? staleStorage.get(k) : null),
      setItem: (k, v) => staleStorage.set(k, String(v)),
      removeItem: k => staleStorage.delete(k),
    },
    XLSX: { utils: { book_new: () => ({}), aoa_to_sheet: r => ({ r }), book_append_sheet: () => {} }, writeFile: () => {} },
    setTimeout: () => 0, clearTimeout: () => {}, confirm: () => false, prompt: () => null, alert: () => {},
    navigator: { serviceWorker: { register: () => Promise.resolve() } },
    fetch: () => Promise.reject(new Error('no network in test')),
    console,
  };
  vm.createContext(staleSandbox);
  vm.runInContext(pageScript + exportShim, staleSandbox, { filename: 'index.html#script(migration-test)' });

  const migratedJune = staleSandbox.__t.getStore().June;
  check('stale pre-migration June cache is discarded on load', 'qpi' in migratedJune[0], `keys: ${Object.keys(migratedJune[0]).join(',')}`);
  check('migrated June day 4 carries the corrected preset values', migratedJune[3].jpa === 'KW' && migratedJune[3].gma2 === 'Z', `jpa=${migratedJune[3].jpa} gma2=${migratedJune[3].gma2}`);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
