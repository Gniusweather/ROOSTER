#!/usr/bin/env python3
from pathlib import Path
import re

html = Path('index.html').read_text()

# Ensure contractBase exists and document November OT override
old_cb = '''function contractBase(m){
  // GMA monthly contract hours (overtime = total - base)
  if(m === 'October') return 72;
  if(m === 'November') return 115;
  return 144;
}'''

new_cb = '''function contractBase(m){
  // GMA monthly contract hours (overtime = total - base)
  if(m === 'October') return 72;
  if(m === 'November') return 115;
  return 144;
}

// GMA overtime for the person card. November is fixed at +16u (per request).
function gmaOvertime(m, total){
  if(m === 'November') return 16;
  return total - contractBase(m);
}'''

if 'function gmaOvertime' in html:
    # update existing gmaOvertime body if present
    html = re.sub(
        r'function gmaOvertime\(m, total\)\{[^}]+\}',
        'function gmaOvertime(m, total){\n  if(m === \'November\') return 16;\n  return total - contractBase(m);\n}',
        html,
        count=1,
    )
    print('updated gmaOvertime')
elif old_cb in html:
    html = html.replace(old_cb, new_cb, 1)
    print('added gmaOvertime')
else:
    # try looser match
    m = re.search(r'function contractBase\(m\)\{[^}]+\}', html)
    if not m:
        raise SystemExit('contractBase not found')
    html = html[:m.end()] + '''

// GMA overtime for the person card. November is fixed at +16u (per request).
function gmaOvertime(m, total){
  if(m === 'November') return 16;
  return total - contractBase(m);
}''' + html[m.end():]
    print('inserted gmaOvertime after contractBase')

# Point personCard overtime calc at gmaOvertime instead of total - base
# Current pattern inside the isGma IIFE:
old_ot = 'const ot = total - base;'
new_ot = 'const ot = gmaOvertime(current, total);'
if old_ot in html:
    html = html.replace(old_ot, new_ot, 1)
    print('wired ot = gmaOvertime')
elif 'gmaOvertime(current, total)' in html:
    print('ot already uses gmaOvertime')
else:
    raise SystemExit('ot assignment not found')

Path('index.html').write_text(html)

sw = Path('sw.js').read_text()
for v in ['rooster-v16','rooster-v15','rooster-v14','rooster-v13']:
    if f"'{v}'" in sw:
        sw = sw.replace(f"'{v}'", "'rooster-v16'")
        print('sw -> v16 from', v)
        break
Path('sw.js').write_text(sw)
print('ok')
