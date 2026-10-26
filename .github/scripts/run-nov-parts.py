#!/usr/bin/env python3
import base64, pathlib, sys
parts = []
for i in range(24):
    p = pathlib.Path('.github/novb64/{:02d}.txt'.format(i))
    if not p.exists():
        print('Missing', p)
        sys.exit(1)
    parts.append(p.read_text().strip())
data = base64.b64decode(''.join(parts))
pathlib.Path('november-2026.jpg').write_bytes(data)
print('Wrote', len(data))
html = pathlib.Path('index.html').read_text()
old = "BUILTIN_IMGS = { October: 'oktober-2026.jpg' };"
new = "BUILTIN_IMGS = { October: 'oktober-2026.jpg', November: 'november-2026.jpg' };"
if old in html:
    html = html.replace(old, new, 1)
    print('BUILTIN')
pathlib.Path('index.html').write_text(html)
sw = pathlib.Path('sw.js').read_text()
for v in ['rooster-v12','rooster-v11','rooster-v10','rooster-v9']:
    if ("'"+v+"'") in sw:
        sw = sw.replace("'"+v+"'", "'rooster-v12'")
        break
if 'november-2026.jpg' not in sw:
    sw = sw.replace("'./oktober-2026.jpg']", "'./oktober-2026.jpg', './november-2026.jpg']")
pathlib.Path('sw.js').write_text(sw)
print('done')
