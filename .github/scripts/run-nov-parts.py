#!/usr/bin/env python3
import base64, pathlib
parts_dir = pathlib.Path('.github/novb64')
parts = sorted(parts_dir.glob('*.txt'))
assert parts, 'no parts'
b64 = ''.join(p.read_text().strip() for p in parts)
pathlib.Path('november-2026.jpg').write_bytes(base64.b64decode(b64))
print('Wrote', pathlib.Path('november-2026.jpg').stat().st_size)
html = pathlib.Path('index.html').read_text()
old = "BUILTIN_IMGS = { October: 'oktober-2026.jpg' };"
new = "BUILTIN_IMGS = { October: 'oktober-2026.jpg', November: 'november-2026.jpg' };"
if old in html:
    html = html.replace(old, new, 1)
    print('BUILTIN')
pathlib.Path('index.html').write_text(html)
sw = pathlib.Path('sw.js').read_text()
for v in ['rooster-v12','rooster-v11','rooster-v10','rooster-v9','rooster-v8']:
    if f"'{v}'" in sw:
        sw = sw.replace(f"'{v}'", "'rooster-v12'")
        break
if 'november-2026.jpg' not in sw:
    sw = sw.replace("'./oktober-2026.jpg']", "'./oktober-2026.jpg', './november-2026.jpg']")
pathlib.Path('sw.js').write_text(sw)
print('sw')
