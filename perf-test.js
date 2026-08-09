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
  remove() {}
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
  MONTHS, MDAYS, PRESET, MONTHS2025, DATA2025, MULTI_PERSON_COLUMNS,
  emptyMonth, hrs, escapeHtml, badgeClass, calcTotals, breakdownKey, calc2025Yearly,
  renderTableOnly, render, render2025, exportXlsx, export2025, exportCalendarGma, icsEscape, clearMonth,
  undoPush, undoEdit, personsFor,
  setMultiView: (m,v) => { multiView[m] = v; },
  setCurrent: m => { current = m; },
  setMode: m => { mode = m; },
  getUndoStack: () => undoStack,
  getStore: () => store,
  getTodayMonth: () => _todayMonth,
};`;

const tInit = process.hrtime.bigint();
vm.runInContext(pageScript + exportShim, sandbox, { filename: 'index.html#script' });
const initMs = Number(process.hrtime.bigint() - tInit) / 1e6;
console.log(`  init time: ${initMs.toFixed(1)} ms`);
check('init completes in < 2000 ms', initMs < 2000, `${initMs.toFixed(1)} ms`);

const ctx = sandbox.__t;

console.log('\n=== Data integrity: 2026 preset ===');
const KNOWN_CODES = new Set(['', 'X', 'D', 'D*', 'A', 'KW', 'R', 'R=A', 'R=D', 'R=D*', 'R=KW', 'VAK', 'VG', 'X/D', 'X=D', 'Z', 'D*+KW']);
const DNAMES = ['MA','DI','WO','DO','VR','ZA','ZO'];
let badDays = [], badCodes = [], badCounts = [], badPjan = [];
ctx.MONTHS.forEach((m, idx) => {
  const rows = ctx.PRESET[m];
  if (!rows) return;
  const expectedDays = new Date(2026, idx + 1, 0).getDate();
  if (rows.length !== expectedDays) badCounts.push(`${m}: ${rows.length} rows, expected ${expectedDays}`);
  rows.forEach((r, i) => {
    if (r.date !== i + 1) badCounts.push(`${m} row ${i}: date ${r.date}`);
    const realDay = DNAMES[(new Date(2026, idx, r.date).getDay() + 6) % 7];
    if (r.day !== realDay) badDays.push(`${m} ${r.date}: '${r.day}' should be '${realDay}'`);
    for (const code of [r.jpa, r.gma2, r.qpi, r.ays, r.fca, r.econ]) {
      if (code === undefined) continue; // qpi/ays/fca/econ only exist on multi-person months
      if (!KNOWN_CODES.has((code || '').toUpperCase().trim())) badCodes.push(`${m} ${r.date}: '${code}'`);
    }
    // PJAN is a partial-shift flag, not a shift code — only '' or '*' are valid.
    if (r.pjan !== undefined && r.pjan !== '' && r.pjan !== '*') badPjan.push(`${m} ${r.date}: '${r.pjan}'`);
  });
});
check('every preset month has the correct number of days, sequential dates', badCounts.length === 0, badCounts.join('; '));
check('every preset day label matches the real 2026 calendar', badDays.length === 0, badDays.slice(0, 5).join('; '));
check('every preset shift code is a known code', badCodes.length === 0, badCodes.slice(0, 5).join('; '));
check("every preset PJAN cell is '' or '*' (flag column, not a shift code)", badPjan.length === 0, badPjan.slice(0, 5).join('; '));

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
check("June has no stray shift code in the 'op' remarks field", ctx.PRESET.June.every(r => r.op === '' || !/^[A-Z=*]{1,4}$/.test((r.op||'').toUpperCase())), JSON.stringify(ctx.PRESET.June.find(r => r.op && /^[A-Z=*]{1,4}$/.test(r.op.toUpperCase()))));
{
  const gmaBreak = ctx.calcTotals('June').gmaBreak;
  check("calcTotals breaks out 'Z' (sick) separately, not folded into 'R'", gmaBreak.Z === 7 && gmaBreak.R === 0, JSON.stringify(gmaBreak));
}
// Every code used anywhere in the 2026 preset must land in a breakdown bucket
// (its own, or a folded synonym's) so per-person day counts always sum to the
// month's day count — no code should silently inflate 'R' (Reserve).
ctx.MONTHS.forEach(m=>{
  const rows = ctx.PRESET[m];
  if(!rows) return;
  const {jpaBreak, gmaBreak} = ctx.calcTotals(m);
  const jpaSum = Object.values(jpaBreak).reduce((a,b)=>a+b,0);
  const gmaSum = Object.values(gmaBreak).reduce((a,b)=>a+b,0);
  check(`${m} jpaBreak day counts sum to ${rows.length} (no code silently miscounted)`, jpaSum === rows.length, `got ${jpaSum}`);
  check(`${m} gmaBreak day counts sum to ${rows.length} (no code silently miscounted)`, gmaSum === rows.length, `got ${gmaSum}`);
});
check("breakdownKey folds 'X=D'/'X/D' into 'D' (same hours/colour as D)", ctx.breakdownKey('X=D') === 'D' && ctx.breakdownKey('X/D') === 'D');
check("breakdownKey folds 'R=KW' into 'KW' (same hours/colour as KW)", ctx.breakdownKey('R=KW') === 'KW');
check("breakdownKey keeps 'D*+KW' as its own bucket (12u ≠ D*'s 8u)", ctx.breakdownKey('D*+KW') === 'D*+KW');
check("escapeHtml neutralises HTML", ctx.escapeHtml('<img src=x onerror="x">') === '&lt;img src=x onerror=&quot;x&quot;&gt;', ctx.escapeHtml('<img src=x onerror="x">'));
check("no OCR library or scan pipeline left in the page (photo upload is raw-only now)", !pageScript.includes("Tesseract") && !pageScript.includes("scanRoosterOCR") && !pageScript.includes("normShift"));
check("photo reference image saved to localStorage", pageScript.includes("localStorage.setItem('img_'") || pageScript.includes("img_' + m"));
check("uploaded photo opens fullscreen on click", pageScript.includes("showImageFullscreen") && pageScript.includes("img-lightbox"));
{
  ctx.setMode('2025');
  ctx.render2025();
  const html = documentStub.getElementById('monthDetails').innerHTML;
  check("2025 detail-view photos also open fullscreen on click", html.includes('onclick="showImageFullscreen(this.src)"'), html.slice(0, 200));
  ctx.setMode('2026');
}

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

// August renders all 7 person columns (adds ECON/PJAN beyond June/July's 5), GMA & JPA bold
{
  const cols = ctx.personsFor('August');
  check("August renders 7 person columns", cols.length === 7, `got ${cols.length}`);
  check("August column order is GMA, JPA, QPI, AYS, FCA, ECON, PJAN", cols.map(p=>p.label).join(',') === 'GMA,JPA,QPI,AYS,FCA,ECON,PJAN', cols.map(p=>p.label).join(','));
  check("August: GMA & JPA are bold, others not", cols[0].bold && cols[1].bold && cols.slice(2).every(p => !p.bold));
  check("August preset rows carry qpi/ays/fca/econ/pjan", ctx.PRESET.August.every(r => 'qpi' in r && 'ays' in r && 'fca' in r && 'econ' in r && 'pjan' in r));

  ctx.setMultiView('August', 'gmajpa');
  const two = ctx.personsFor('August');
  check("August 'GMA+JPA only' view shows exactly GMA then JPA", two.map(p=>p.label).join(',') === 'GMA,JPA', two.map(p=>p.label).join(','));
  ctx.setMultiView('August', 'all');
  check("August toggling back to 'all' restores 7 columns", ctx.personsFor('August').length === 7);

  // Person cards' "↓ Filter tabel op X" link calls setFilter(), but multi-person
  // months never consult `filter` (they use multiView instead) — the link did
  // nothing there. It should be hidden on multi-person months, present elsewhere.
  ctx.setCurrent('June');
  ctx.render();
  check("multi-person month hides the dead 'Filter tabel op' link", !documentStub.getElementById('personCards').innerHTML.includes('Filter tabel op'));
  ctx.setCurrent('May');
  ctx.render();
  check("2-person month still shows a working 'Filter tabel op' link for both cards",
    documentStub.getElementById('personCards').innerHTML.includes('Filter tabel op JPA') &&
    documentStub.getElementById('personCards').innerHTML.includes('Filter tabel op GMA2'));

  // JPA's D*+KW combined shift (Aug 14) must count as worked hours, not silently drop to 0
  check("hrs('D*+KW') === 12 (D* 8u + KW 4u)", ctx.hrs('D*+KW') === 12, `got ${ctx.hrs('D*+KW')}`);
  const augManualJpa = ctx.PRESET.August.reduce((s, r) => s + ctx.hrs(r.jpa), 0);
  const augTotals = ctx.calcTotals('August');
  check("August calcTotals.jpa matches manual per-row sum", augTotals.jpa === augManualJpa, `${augTotals.jpa} vs ${augManualJpa}`);
}

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

// Boot a completely fresh copy of the page (own DOM stub + own localStorage),
// so tests can exercise load-time behaviour: cache migration, a wipe surviving
// a reload, or what the app does when the real-world clock isn't 2026.
function freshInstance(storageEntries = {}, overrides = {}) {
  const reg = new Map();
  const els = [];
  const lastDownload = { filename: null, blobParts: null };
  const docStub = {
    createElement: tag => {
      const el = new StubElement(tag); els.push(el);
      if (tag === 'a') {
        // Capture download-link clicks (exportXlsx/exportCalendarGma use this
        // pattern) instead of touching the real filesystem or DOM.
        el._dl = '';
        Object.defineProperty(el, 'download', { get() { return this._dl; }, set(v) { this._dl = v; lastDownload.filename = v; } });
        el.click = () => {};
      }
      return el;
    },
    getElementById: id => reg.get(id) || null,
    querySelector: sel => els.find(el => cssMatch(el, sel)) || null,
    querySelectorAll: sel => els.filter(el => cssMatch(el, sel)),
    body: { appendChild: () => {}, style: {} },
  };
  for (const id of ['tabs','personCards','uploadWrap','thead','tbody','hTitle','hSub','toast','f-all','f-jpa','f-gma']) {
    const el = new StubElement('div'); el.id = id; els.push(el); reg.set(id, el);
  }
  const fr = new StubElement('div'); fr.className = 'filter-row'; els.push(fr);

  const storage = new Map(Object.entries(storageEntries));
  const sb = {
    document: docStub,
    localStorage: {
      getItem: k => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: k => storage.delete(k),
    },
    XLSX: { utils: { book_new: () => ({}), aoa_to_sheet: r => ({ r }), book_append_sheet: () => {} }, writeFile: () => {} },
    Blob: function (parts, opts) { lastDownload.blobParts = parts; this.type = opts && opts.type; },
    URL: { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} },
    setTimeout: () => 0, clearTimeout: () => {}, confirm: () => false, prompt: () => null, alert: () => {},
    navigator: { serviceWorker: { register: () => Promise.resolve() } },
    fetch: () => Promise.reject(new Error('no network in test')),
    console,
    ...overrides,
  };
  vm.createContext(sb);
  vm.runInContext(pageScript + exportShim, sb, { filename: 'index.html#script(fresh-instance)' });
  return { t: sb.__t, storage, sandbox: sb, lastDownload };
}

console.log('\n=== Stale-cache migration (multi-person schema upgrade) ===');
{
  // Simulate a device that cached June under the OLD 2-column schema
  // (jpa/gma2 only, no qpi/ays/fca) before that feature existed, then
  // verify a fresh script init discards the stale cache and loads the
  // current 5-column preset instead of silently shadowing it forever.
  const staleJune = Array.from({ length: 30 }, (_, i) => ({ date: i + 1, day: 'MA', jpa: 'X', gma2: 'X', op: '' }));
  const migratedJune = freshInstance({ r26_June: JSON.stringify(staleJune) }).t.getStore().June;
  check('stale pre-migration June cache is discarded on load', 'qpi' in migratedJune[0], `keys: ${Object.keys(migratedJune[0]).join(',')}`);
  check('migrated June day 4 carries the corrected preset values', migratedJune[3].jpa === 'KW' && migratedJune[3].gma2 === 'Z', `jpa=${migratedJune[3].jpa} gma2=${migratedJune[3].gma2}`);
}

console.log('\n=== Wis maand (clear month) ===');
{
  check('emptyMonth carries every column a multi-person month tracks',
    ['gma2','jpa','qpi','ays','fca','econ','pjan'].every(k => k in ctx.emptyMonth(7)[0]),
    Object.keys(ctx.emptyMonth(7)[0]).join(','));
  check('emptyMonth for a 2-person month is unchanged',
    ['jpa','gma2','op'].every(k => k in ctx.emptyMonth(8)[0]) && !('qpi' in ctx.emptyMonth(8)[0]),
    Object.keys(ctx.emptyMonth(8)[0]).join(','));

  const inst = freshInstance({}, { confirm: () => true });
  inst.t.setCurrent('August');
  inst.t.clearMonth();
  check('clearMonth persists the wipe to localStorage (it never saved before)', inst.storage.has('r26_August'));

  // The wipe has to survive a reload — previously the month was cleared only
  // in memory, so the old data reappeared on the next page load.
  const reloaded = freshInstance({ r26_August: inst.storage.get('r26_August') }).t.getStore().August;
  check('cleared month stays cleared after a reload',
    reloaded.length === 31 && reloaded.every(r => !r.jpa && !r.gma2 && !r.qpi && !r.ays && !r.fca && !r.econ && !r.pjan),
    JSON.stringify(reloaded[0]));
}

console.log('\n=== "Vandaag" marker is year-aware ===');
{
  const fakeClock = (y, mo, d) => class extends Date {
    constructor(...a) { if (a.length === 0) super(y, mo, d); else super(...a); }
  };
  check("today marker is set when the real date is inside 2026",
    freshInstance({}, { Date: fakeClock(2026, 7, 8) }).t.getTodayMonth() === 'August');
  check("no day is marked 'Vandaag' once the real year leaves 2026",
    freshInstance({}, { Date: fakeClock(2027, 7, 8) }).t.getTodayMonth() === null);
}

console.log('\n=== Excel export covers every tracked column ===');
{
  const inst = freshInstance();
  let sheet = null;
  inst.sandbox.XLSX.utils.aoa_to_sheet = rows => { sheet = rows; return { rows }; };

  inst.t.setCurrent('August');
  inst.t.exportXlsx();
  const augHeader = sheet[0];
  check('August export includes QPI/AYS/FCA/ECON/PJAN (silently dropped before)',
    ['QPI','AYS','FCA','ECON','PJAN'].every(l => augHeader.includes(l)), augHeader.join('|'));
  check('PJAN gets no "Uren" column (it is a flag, not a shift)', !augHeader.includes('PJAN Uren'), augHeader.join('|'));
  check('every August export row matches the header width',
    sheet.every(r => r.length === augHeader.length), `header ${augHeader.length}, rows ${[...new Set(sheet.map(r => r.length))].join('/')}`);

  inst.t.setCurrent('May');
  inst.t.exportXlsx();
  check('2-person month export keeps its original columns',
    sheet[0].join(',') === 'DAT,DAG,JPA,JPA Uren,GMA2,GMA2 Uren,OPMERKING', sheet[0].join(','));
}

console.log('\n=== GMA calendar export (.ics) ===');
{
  const inst = freshInstance();
  inst.t.setCurrent('August');
  inst.t.exportCalendarGma();
  const ics = inst.lastDownload.blobParts[0];
  const expectedDays = ctx.PRESET.August.filter(r => ctx.hrs(r.gma2) > 0).length;

  check('.ics filename names the month', inst.lastDownload.filename === 'GMA_Rooster_August_2026.ics', inst.lastDownload.filename);
  check('.ics is a valid VCALENDAR wrapper', ics.startsWith('BEGIN:VCALENDAR') && ics.trim().endsWith('END:VCALENDAR'));
  check('one VEVENT per day GMA actually works (hrs(gma2) > 0)',
    (ics.match(/BEGIN:VEVENT/g) || []).length === expectedDays, `got ${(ics.match(/BEGIN:VEVENT/g) || []).length}, expected ${expectedDays}`);
  check('every VEVENT carries exactly 2 VALARMs (day-before + hour-before)',
    (ics.match(/BEGIN:VALARM/g) || []).length === expectedDays * 2);
  check('alarms trigger at -P1D and -PT1H', ics.includes('TRIGGER:-P1D') && ics.includes('TRIGGER:-PT1H'));
  check('uses floating local time, not UTC (shift times are wall-clock, not zone-specific)',
    !/DTSTART:\d{8}T\d{6}Z/.test(ics) && /DTSTART:\d{8}T\d{6}\r?\n/.test(ics));

  check("icsEscape escapes backslash/semicolon/comma", ctx.icsEscape('a\\b;c,d') === 'a\\\\b\\;c\\,d', ctx.icsEscape('a\\b;c,d'));
  check("icsEscape normalizes \\r\\n and bare \\n to the same escaped \\n", ctx.icsEscape('a\r\nb') === ctx.icsEscape('a\nb'));
  check("icsEscape escapes a bare \\r too (not just \\r\\n) — a lone CR could otherwise look like a stray line break",
    ctx.icsEscape('a\rb') === 'a\\nb', JSON.stringify(ctx.icsEscape('a\rb')));

  // Day shift (D): 08:00-20:00 same day
  const dEvent = ics.split('BEGIN:VEVENT').find(e => e.includes('20260824'));
  check("'D' shift runs 08:00–20:00", dEvent.includes('DTSTART:20260824T080000') && dEvent.includes('DTEND:20260824T200000'), dEvent);

  // Overnight shift (A): 20:00 today -> 08:00 the next calendar day
  const inst2 = freshInstance();
  inst2.t.setCurrent('May');
  inst2.t.getStore().May[9].gma2 = 'A'; // May 10
  inst2.t.exportCalendarGma();
  const overnight = inst2.lastDownload.blobParts[0].split('BEGIN:VEVENT').find(e => e.includes('20260510'));
  check("'A' shift spans midnight correctly (20:00 -> 08:00 next day)",
    overnight.includes('DTSTART:20260510T200000') && overnight.includes('DTEND:20260511T080000'), overnight);

  // A month with zero GMA work-hours must not export an empty/broken file
  const inst3 = freshInstance();
  inst3.t.setCurrent('August');
  inst3.t.getStore().August.forEach(r => { r.gma2 = 'X'; });
  inst3.t.exportCalendarGma();
  check('a month with no GMA shifts exports nothing (no blob written)', inst3.lastDownload.blobParts === null, JSON.stringify(inst3.lastDownload));
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
