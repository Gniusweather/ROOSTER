#!/usr/bin/env python3
from pathlib import Path

html = Path('index.html').read_text()
old = "BUILTIN_IMGS = { October: 'oktober-2026.jpg' };"
new = "BUILTIN_IMGS = { October: 'oktober-2026.jpg', November: 'november-2026.jpeg' };"
if old in html:
    Path('index.html').write_text(html.replace(old, new, 1))
    print('BUILTIN wired to november-2026.jpeg')
elif "November: 'november-2026.jpeg'" in html:
    print('BUILTIN already wired')
elif "November: 'november-2026.jpg'" in html:
    Path('index.html').write_text(html.replace("November: 'november-2026.jpg'", "November: 'november-2026.jpeg'", 1))
    print('BUILTIN fixed extension to .jpeg')
else:
    raise SystemExit('BUILTIN line not found')

sw = Path('sw.js').read_text()
# bump cache
for v in ['rooster-v14','rooster-v13','rooster-v12','rooster-v11','rooster-v10','rooster-v9']:
    if f"'{v}'" in sw:
        sw = sw.replace(f"'{v}'", "'rooster-v14'")
        break
# ensure jpeg is in ASSETS
if 'november-2026.jpeg' not in sw:
    if "'./oktober-2026.jpg']" in sw:
        sw = sw.replace("'./oktober-2026.jpg']", "'./oktober-2026.jpg', './november-2026.jpeg']")
    elif "'./oktober-2026.jpg'" in sw:
        sw = sw.replace("'./oktober-2026.jpg'", "'./oktober-2026.jpg', './november-2026.jpeg'")
Path('sw.js').write_text(sw)
print('sw.js updated')
print('ok')
