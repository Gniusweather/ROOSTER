#!/usr/bin/env python3
from pathlib import Path
import re

html = Path('index.html').read_text()
NEW_DEC = Path('.github/december_preset.js').read_text().strip()
if not NEW_DEC.startswith('December:'):
    raise SystemExit('bad preset')

# Locate the real PRESET object: const PRESET = { ... };
start = html.find('const PRESET = {')
if start < 0:
    raise SystemExit('PRESET not found')

# Brace-match to find the real close of PRESET
depth = 0
started = False
close_at = None
for idx in range(start, len(html)):
    c = html[idx]
    if c == '{':
        depth += 1
        started = True
    elif c == '}':
        depth -= 1
        if started and depth == 0:
            close_at = idx
            break
if close_at is None:
    raise SystemExit('PRESET close not found')

preset_body = html[start:close_at+1]
print('PRESET span', start, close_at, 'has December', 'December' in preset_body)

if re.search(r'December:\s*\[', preset_body):
    # Replace existing December inside PRESET
    def repl_dec(m):
        return NEW_DEC.rstrip().rstrip(',') + ','
    new_body, n = re.subn(
        r'December:\[\s*(?:\{[^}]*\},?\s*)*\],?',
        lambda m: NEW_DEC.rstrip().rstrip(',') + ',',
        preset_body,
        count=1,
        flags=re.M,
    )
    if not n:
        raise SystemExit('December inside PRESET but replace failed')
    html = html[:start] + new_body + html[close_at+1:]
    print('replaced December inside PRESET')
else:
    # Insert before the final } of PRESET. Body ends with  ],\n} or ],}
    # Find last ], before close
    last_bracket = preset_body.rfind(']')
    if last_bracket < 0:
        raise SystemExit('no ] in PRESET')
    # After November's closing ], insert ,\n  December:[...]
    insert = ',\n  ' + NEW_DEC.rstrip().rstrip(',') + '\n'
    # preset_body[last_bracket] is ], we want to keep it and add after the comma if any
    # Structure is typically:  ],\n};  where ] closes November
    # We need:  ],\n  December:[...],\n};
    abs_pos = start + last_bracket + 1  # position after ]
    # Skip optional comma after ]
    if abs_pos < len(html) and html[abs_pos] == ',':
        abs_pos += 1
    html = html[:abs_pos] + insert + html[abs_pos:]
    print('inserted December into PRESET after November')

# Bump PRESET_REV December to 2 (force localStorage refresh)
if re.search(r'December:\s*\d+', html[html.find('PRESET_REV'):html.find('PRESET_REV')+120] if 'PRESET_REV' in html else ''):
    html = re.sub(
        r'(PRESET_REV\s*=\s*\{[^}]*December:\s*)\d+',
        r'\g<1>2',
        html,
        count=1,
    )
    print('PRESET_REV December -> 2')
else:
    html = re.sub(
        r'(PRESET_REV\s*=\s*\{)([^}]*)(\})',
        lambda m: m.group(1) + m.group(2).rstrip().rstrip(',') + ', December: 2 ' + m.group(3),
        html,
        count=1,
    )
    print('PRESET_REV added December: 2')

# Ensure contractBase has December = 115
if "m === 'November' || m === 'December'" not in html:
    html = html.replace(
        "if(m === 'November') return 115;",
        "if(m === 'November' || m === 'December') return 115;",
        1,
    )
    print('contractBase updated')

# MULTI + BUILTIN already done in previous patch; re-ensure
if 'MULTI_PERSON_COLUMNS' in html:
    region = html[html.find('MULTI_PERSON_COLUMNS'):html.find('MULTI_PERSON_MONTHS')]
    if 'December:' not in region:
        nov = region.rfind('],')
        insert = """
  December: [
    {key:'gma2', label:'GMA', bold:true},
    {key:'jpa',  label:'JPA', bold:true},
    {key:'qpi',  label:'QPI', bold:false},
    {key:'ays',  label:'AYS', bold:false},
    {key:'fca',  label:'FCA', bold:false},
  ],"""
        abs_pos = html.find('MULTI_PERSON_COLUMNS') + nov + 2
        html = html[:abs_pos] + insert + html[abs_pos:]
        print('MULTI cols added')

if "December: 'december-2026" not in html:
    html = re.sub(
        r"(BUILTIN_IMGS\s*=\s*\{)([^}]*)(\})",
        lambda m: m.group(1) + m.group(2).rstrip().rstrip(',') + ", December: 'december-2026.jpeg' " + m.group(3),
        html,
        count=1,
    )
    print('BUILTIN added')

Path('index.html').write_text(html)

# Verify with a quick brace check
text = Path('index.html').read_text()
s = text.find('const PRESET = {')
depth = 0
started = False
for idx in range(s, len(text)):
    if text[idx] == '{':
        depth += 1; started = True
    elif text[idx] == '}':
        depth -= 1
        if started and depth == 0:
            body = text[s:idx+1]
            print('VERIFY December in PRESET', 'December' in body)
            break

sw = Path('sw.js').read_text()
for v in ['rooster-v20','rooster-v19','rooster-v18']:
    if f"'{v}'" in sw:
        sw = sw.replace(f"'{v}'", "'rooster-v20'")
        print('sw -> v20')
        break
if 'december-2026.jpeg' not in sw:
    sw = sw.replace("'./oktober-2026.jpg']", "'./oktober-2026.jpg', './december-2026.jpeg']")
Path('sw.js').write_text(sw)
print('ok')
