#!/usr/bin/env python3
from pathlib import Path

html = Path('index.html').read_text()

# Insert contractBase helper before personCard if missing
if 'function contractBase' not in html:
    old = 'function personCard(name, days, total, brk, filterKey){'
    new = '''function contractBase(m){
  // GMA monthly contract hours (overtime = total - base)
  if(m === 'October') return 72;
  if(m === 'November') return 115;
  return 144;
}

function personCard(name, days, total, brk, filterKey){'''
    if old not in html:
        raise SystemExit('personCard not found')
    html = html.replace(old, new, 1)
    print('added contractBase')

# Replace personCard summary rows to include GMA-only overtime
old_rows = '''        <div class="person-card-row">WERKDAGEN <span style="color:${accent}">${days}</span></div>
        <div class="person-card-row">⏱ TOTAAL UREN <span style="color:${accent}">${total}U</span></div>
      </summary>'''

# Try both emoji variants of the clock
if old_rows not in html:
    old_rows = '''        <div class="person-card-row">WERKDAGEN <span style="color:${accent}">${days}</span></div>
        <div class="person-card-row">⏱ TOTAAL UREN <span style="color:${accent}">${total}U</span></div>
      </summary>'''

new_rows = '''        <div class="person-card-row">WERKDAGEN <span style="color:${accent}">${days}</span></div>
        <div class="person-card-row">⏱ TOTAAL UREN <span style="color:${accent}">${total}U</span></div>
        ${isGma ? (() => {
          const base = contractBase(current);
          const ot = total - base;
          const otColor = ot > 0 ? '#fbbf24' : (ot < 0 ? '#94a3b8' : accent);
          const otLabel = ot > 0 ? ('+' + ot + 'U') : (ot + 'U');
          return `<div class="person-card-row">OVERUREN <span style="color:${otColor}">${otLabel}</span></div>
          <div style="font-size:9px;color:var(--ts);margin-top:-2px;margin-bottom:4px">contract ${base}u · totaal ${total}u</div>`;
        })() : ''}
      </summary>'''

# Find the actual TOTAAL UREN line in the file
import re
m = re.search(
    r'(<div class="person-card-row">WERKDAGEN <span style="color:\$\{accent\}">\$\{days\}</span></div>\s*'
    r'<div class="person-card-row">)([^<]+)( TOTAAL UREN <span style="color:\$\{accent\}">\$\{total\}U</span></div>\s*</summary>)',
    html,
)
if not m:
    raise SystemExit('WERKDAGEN/TOTAAL block not found')

prefix, label, suffix = m.group(1), m.group(2), m.group(3)
replacement = (
    m.group(0).replace('</summary>', '')
    + '''
        ${isGma ? (() => {
          const base = contractBase(current);
          const ot = total - base;
          const otColor = ot > 0 ? '#fbbf24' : (ot < 0 ? '#94a3b8' : accent);
          const otLabel = ot > 0 ? ('+' + ot + 'U') : (ot + 'U');
          return `<div class="person-card-row">OVERUREN <span style="color:${otColor}">${otLabel}</span></div>
          <div style="font-size:9px;color:var(--ts);margin-top:-2px;margin-bottom:4px">contract ${base}u \u00b7 totaal ${total}u</div>`;
        })() : ''}
      </summary>'''
)
# Cleaner approach: direct string replace of the known block
start = m.start()
end = m.end()
old_block = html[start:end]
new_block = old_block[:-len('</summary>')] + '''
        ${isGma ? (() => {
          const base = contractBase(current);
          const ot = total - base;
          const otColor = ot > 0 ? '#fbbf24' : (ot < 0 ? '#94a3b8' : accent);
          const otLabel = ot > 0 ? ('+' + ot + 'U') : (ot + 'U');
          return `<div class="person-card-row">OVERUREN <span style="color:${otColor}">${otLabel}</span></div>
          <div style="font-size:9px;color:var(--ts);margin-top:-2px;margin-bottom:4px">contract ${base}u \u00b7 totaal ${total}u</div>`;
        })() : ''}
      </summary>'''
html = html[:start] + new_block + html[end:]
print('patched personCard overtime row')

# Bump SW
sw = Path('sw.js').read_text()
for v in ['rooster-v15','rooster-v14','rooster-v13','rooster-v12','rooster-v11','rooster-v10']:
    if f"'{v}'" in sw:
        sw = sw.replace(f"'{v}'", "'rooster-v15'")
        print('sw', v, '-> v15')
        break
Path('sw.js').write_text(sw)
Path('index.html').write_text(html)
print('ok')
