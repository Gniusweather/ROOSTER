#!/usr/bin/env python3
from pathlib import Path
import re

html = Path('index.html').read_text()
NEW_DEC = Path('.github/december_preset.js').read_text().strip()
if not NEW_DEC.startswith('December:'):
    raise SystemExit('bad preset file')

pat = re.compile(r'December:\[\s*(?:\{[^}]*\},?\s*)+\],', re.M)
m = pat.search(html)
if not m:
    raise SystemExit('December PRESET not found')
html = html[:m.start()] + NEW_DEC.rstrip() + ',' + html[m.end():]
print('replaced December PRESET')

region_start = html.find('MULTI_PERSON_COLUMNS')
region_end = html.find('MULTI_PERSON_MONTHS')
region = html[region_start:region_end]
if 'December:' not in region:
    nov = region.rfind('],')
    if nov < 0:
        raise SystemExit('no ], in MULTI cols')
    insert = """
  December: [
    {key:'gma2', label:'GMA', bold:true},
    {key:'jpa',  label:'JPA', bold:true},
    {key:'qpi',  label:'QPI', bold:false},
    {key:'ays',  label:'AYS', bold:false},
    {key:'fca',  label:'FCA', bold:false},
  ],"""
    abs_pos = region_start + nov + 2
    html = html[:abs_pos] + insert + html[abs_pos:]
    print('added December MULTI_PERSON_COLUMNS')
else:
    print('December already in MULTI cols')

if re.search(r'PRESET_REV\s*=\s*\{[^}]*December', html):
    print('PRESET_REV already has December')
else:
    html2, n = re.subn(
        r'(PRESET_REV\s*=\s*\{)([^}]*)(\})',
        lambda m: m.group(1) + m.group(2).rstrip().rstrip(',') + ', December: 1 ' + m.group(3),
        html,
        count=1,
    )
    if not n:
        raise SystemExit('PRESET_REV not found')
    html = html2
    print('PRESET_REV updated')

if "December: 'december-2026" in html:
    print('BUILTIN already has December')
else:
    html2, n = re.subn(
        r"(BUILTIN_IMGS\s*=\s*\{)([^}]*)(\})",
        lambda m: m.group(1) + m.group(2).rstrip().rstrip(',') + ", December: 'december-2026.jpeg' " + m.group(3),
        html,
        count=1,
    )
    if not n:
        raise SystemExit('BUILTIN_IMGS not found')
    html = html2
    print('BUILTIN_IMGS updated')

# December OT base = 115 (same as November)
old_cb = """function contractBase(m){
  // GMA monthly contract hours (overtime = total - base)
  if(m === 'October') return 72;
  if(m === 'November') return 115;
  return 144;
}"""
new_cb = """function contractBase(m){
  // GMA monthly contract hours (overtime = total - base)
  if(m === 'October') return 72;
  if(m === 'November' || m === 'December') return 115;
  return 144;
}"""
if old_cb in html:
    html = html.replace(old_cb, new_cb, 1)
    print('contractBase: December = 115')
elif "m === 'December'" in html:
    print('contractBase already has December')
else:
    html2, n = re.subn(
        r"if\(m === 'November'\) return 115;",
        "if(m === 'November' || m === 'December') return 115;",
        html,
        count=1,
    )
    if n:
        html = html2
        print('contractBase patched via regex')
    else:
        print('WARN: contractBase not patched')

Path('index.html').write_text(html)

sw = Path('sw.js').read_text()
for v in ['rooster-v19','rooster-v18','rooster-v17','rooster-v16','rooster-v15']:
    if f"'{v}'" in sw:
        sw = sw.replace(f"'{v}'", "'rooster-v19'")
        print('sw', v, '-> v19')
        break
if 'december-2026.jpeg' not in sw:
    if "'./november-2026.jpeg']" in sw:
        sw = sw.replace("'./november-2026.jpeg']", "'./november-2026.jpeg', './december-2026.jpeg']")
    elif "'./oktober-2026.jpg']" in sw:
        sw = sw.replace("'./oktober-2026.jpg']", "'./oktober-2026.jpg', './december-2026.jpeg']")
Path('sw.js').write_text(sw)
print('ok')
