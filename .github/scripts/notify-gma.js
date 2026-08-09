#!/usr/bin/env node
/**
 * Runs on a GitHub Actions schedule (see notify-gma.yml). Loads the rooster
 * data straight out of index.html — same extraction trick perf-test.js
 * uses — then, depending on which cron entry fired, checks whether GMA has
 * a shift starting in ~1 hour or works tomorrow, and pushes a notification
 * to ntfy.sh if so.
 *
 * Only reads PRESET (the published 2026 schedule). It has no access to
 * anyone's localStorage edits — those exist only in that person's browser.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TOPIC = process.env.NTFY_TOPIC;
const SCHEDULE = process.env.GITHUB_EVENT_SCHEDULE || '';
const TEST_MODE = process.env.TEST_MODE === 'true';

async function notify(title, message, tags) {
  if (!TOPIC) {
    console.log(`[skip: NTFY_TOPIC secret not set] ${title}: ${message}`);
    return;
  }
  const res = await fetch(`https://ntfy.sh/${TOPIC}`, {
    method: 'POST',
    headers: {
      'Title': title,               // ASCII-only — ntfy headers don't accept UTF-8
      'Priority': 'high',
      'Tags': tags || 'alarm_clock',
    },
    body: message,                  // body IS UTF-8 safe, so remarks/accents go here
  });
  if (!res.ok) throw new Error(`ntfy POST failed: ${res.status} ${await res.text()}`);
  console.log(`Sent: ${title} — ${message}`);
}

if (TEST_MODE) {
  notify('GMA Rooster (test)', 'Test notification — if you see this, ntfy is wired up correctly.', 'white_check_mark')
    .catch(err => { console.error(err); process.exit(1); });
  return;
}

// ── Minimal DOM stub, just enough for index.html's inline script to run
//    top-to-bottom without a browser (same approach as perf-test.js). ──
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
      toggle: (c, force) => { const on = force !== undefined ? force : !self._classes.has(c); on ? self._classes.add(c) : self._classes.delete(c); return on; },
    };
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(v) {
    this._innerHTML = String(v);
    this.children = [];
    for (const m of this._innerHTML.matchAll(/\sid="([^"]+)"/g)) {
      if (!idRegistry.has(m[1])) { const child = new StubElement('div'); child.id = m[1]; }
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
  body: { appendChild: () => {}, style: {} },
};
for (const id of ['tabs', 'personCards', 'uploadWrap', 'thead', 'tbody', 'hTitle', 'hSub', 'toast', 'f-all', 'f-jpa', 'f-gma']) {
  const el = new StubElement('div'); el.id = id;
}
const filterRow = new StubElement('div'); filterRow.className = 'filter-row';

const sandbox = {
  document: documentStub,
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  XLSX: { utils: { book_new: () => ({}), aoa_to_sheet: () => ({}), book_append_sheet: () => {} }, writeFile: () => {} },
  setTimeout: () => 0, clearTimeout: () => {}, confirm: () => false, prompt: () => null, alert: () => {},
  navigator: { serviceWorker: { register: () => Promise.resolve() } },
  fetch: () => Promise.reject(new Error('no network from inside the page sandbox')),
  console,
};
vm.createContext(sandbox);

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const scriptMatch = html.match(/<script>\n([\s\S]*)<\/script>\s*<\/body>/);
if (!scriptMatch) { console.error('Could not extract inline script from index.html'); process.exit(1); }

const exportShim = `\n;globalThis.__t = { MONTHS, PRESET, hrs };`;
vm.runInContext(scriptMatch[1] + exportShim, sandbox, { filename: 'index.html#script' });
const { MONTHS, PRESET, hrs } = sandbox.__t;

// Real clock start-hour per shift code — MUST stay in sync with SHIFT_TIMES
// in index.html's exportCalendarGma(). Anything not listed but still
// counted as worked (hrs() > 0) defaults to an 08:00 start.
const START_HOUR = {
  D: 8, 'D*': 12, A: 20, KW: 8,
  'R=A': 20, 'R=D': 8, 'R=KW': 8, 'X=D': 8, 'X/D': 8, 'D*+KW': 8,
};

function astNow() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Puerto_Rico', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = t => parts.find(p => p.type === t).value;
  return { year: +get('year'), month: +get('month'), day: +get('day'), hour: +get('hour') % 24 };
}

function addDays(ymd, n) {
  const d = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day, 12));
  d.setUTCDate(d.getUTCDate() + n);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function shiftOn(ymd) {
  const monthName = MONTHS[ymd.month - 1];
  const rows = PRESET[monthName];
  if (!rows) return null;
  const row = rows[ymd.day - 1];
  if (!row) return null;
  const code = (row.gma2 || '').toUpperCase().trim();
  const h = hrs(code);
  if (h <= 0) return null;
  return { code, hours: h, op: row.op || '', startHour: START_HOUR[code] ?? 8 };
}

function fmtDate(ymd) {
  return `${String(ymd.day).padStart(2, '0')}-${String(ymd.month).padStart(2, '0')}-${ymd.year}`;
}

async function main() {
  const now = astNow();
  const today = { year: now.year, month: now.month, day: now.day };
  const isHourCheck = (h) => SCHEDULE === '' /* workflow_dispatch: check everything */
    ? true
    : { '5 11 * * *': 8, '5 15 * * *': 12, '5 23 * * *': 20 }[SCHEDULE] === h;

  // ── 1-hour-before check, for whichever start hour this run corresponds to ──
  if (['5 11 * * *', '5 15 * * *', '5 23 * * *', ''].includes(SCHEDULE)) {
    const s = shiftOn(today);
    if (s && isHourCheck(s.startHour)) {
      const remark = s.op ? ` (${s.op})` : '';
      await notify(
        'GMA — dienst over 1 uur',
        `${s.code} begint om ${String(s.startHour).padStart(2, '0')}:00 vandaag${remark}.`,
        'alarm_clock'
      );
    } else {
      console.log(`1h-check (${SCHEDULE || 'manual'}): no matching GMA shift today (${fmtDate(today)}).`);
    }
  }

  // ── Day-before reminder, checked against tomorrow's date ──
  if (SCHEDULE === '5 22 * * *' || SCHEDULE === '') {
    const tomorrow = addDays(today, 1);
    const s = shiftOn(tomorrow);
    if (s) {
      const remark = s.op ? ` (${s.op})` : '';
      await notify(
        'GMA — dienst morgen',
        `${s.code} om ${String(s.startHour).padStart(2, '0')}:00 op ${fmtDate(tomorrow)}${remark}.`,
        'calendar'
      );
    } else {
      console.log(`Day-before check: no GMA shift tomorrow (${fmtDate(tomorrow)}).`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
