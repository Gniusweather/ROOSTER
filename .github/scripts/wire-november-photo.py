#!/usr/bin/env python3
from pathlib import Path
root = Path('.')
jpg = root / 'november-2026.jpg'
if not jpg.exists() or jpg.stat().st_size < 1000:
    raise SystemExit('november-2026.jpg missing or too small')
print('Found', jpg, jpg.stat().st_size)
html = (root / 'index.html').read_text()
old = "BUILTIN_IMGS = { October: 'oktober-2026.jpg' };"
new = "BUILTIN_IMGS = { October: 'oktober-2026.jpg', November: 'november-2026.jpg' };"
if old in html:
    html = html.replace(old, new, 1)
    print('Updated BUILTIN')
elif "November: 'november-2026.jpg'" in html:
    print('BUILTIN already has November')
else:
    print('BUILTIN slice', html[html.find('BUILTIN_IMGS'):html.find('BUILTIN_IMGS')+140])
(root / 'index.html').write_text(html)
sw = (root / 'sw.js').read_text()
for oldc in ["const CACHE = 'rooster-v7';", "const CACHE = 'rooster-v6';", "const CACHE = 'rooster-v8';"]:
    if oldc in sw:
        sw = sw.replace(oldc, "const CACHE = 'rooster-v9';")
        break
else:
    if "const CACHE = 'rooster-v9';" not in sw:
        sw = sw.replace("const CACHE = 'rooster-v8';", "const CACHE = 'rooster-v9';")
if 'november-2026.jpg' not in sw:
    sw = sw.replace("'./oktober-2026.jpg']", "'./oktober-2026.jpg', './november-2026.jpg']")
(root / 'sw.js').write_text(sw)
print('Updated sw.js')
