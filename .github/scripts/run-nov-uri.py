#!/usr/bin/env python3
from pathlib import Path
import sys
parts = []
for i in range(20):
    p = Path('.github/novuri/{:02d}.txt'.format(i))
    if not p.exists():
        print('Missing', p)
        sys.exit(1)
    parts.append(p.read_text().strip())
URI = ''.join(parts)
html = Path('index.html').read_text()
old = "BUILTIN_IMGS = { October: 'oktober-2026.jpg' };"
new = "BUILTIN_IMGS = { October: 'oktober-2026.jpg', November: '" + URI + "' };"
if old in html:
    Path('index.html').write_text(html.replace(old, new, 1))
    print('patched BUILTIN data URI', len(URI))
elif 'November:' in html[html.find('BUILTIN_IMGS'):html.find('BUILTIN_IMGS')+400]:
    print('already has November')
else:
    raise SystemExit('BUILTIN not found')
sw = Path('sw.js').read_text()
for v in ['rooster-v13','rooster-v12','rooster-v11','rooster-v10']:
    if ("'"+v+"'") in sw:
        sw = sw.replace("'"+v+"'", "'rooster-v13'")
        break
Path('sw.js').write_text(sw)
print('done')
