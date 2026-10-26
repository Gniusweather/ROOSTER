#!/usr/bin/env python3
import base64, pathlib
root = pathlib.Path('.')
b64 = pathlib.Path('november-2026.jpg.b64').read_text().strip()
pathlib.Path('november-2026.jpg').write_bytes(base64.b64decode(b64))
print('Wrote november-2026.jpg', pathlib.Path('november-2026.jpg').stat().st_size)
html = (root / 'index.html').read_text()
old = "BUILTIN_IMGS = { October: 'oktober-2026.jpg' };"
new = "BUILTIN_IMGS = { October: 'oktober-2026.jpg', November: 'november-2026.jpg' };"
if old in html:
    html = html.replace(old, new, 1)
    print('Updated BUILTIN')
elif "November: 'november-2026.jpg'" in html:
    print('BUILTIN already has November')
else:
    print('BUILTIN unexpected', html[html.find('BUILTIN_IMGS'):html.find('BUILTIN_IMGS')+140])
(root / 'index.html').write_text(html)
sw = (root / 'sw.js').read_text()
for oldc in ["const CACHE = 'rooster-v7';", "const CACHE = 'rooster-v6';", "const CACHE = 'rooster-v8';"]:
    if oldc in sw:
        sw = sw.replace(oldc, "const CACHE = 'rooster-v8';")
        break
if 'november-2026.jpg' not in sw:
    if "'./oktober-2026.jpg']" in sw:
        sw = sw.replace("'./oktober-2026.jpg']", "'./oktober-2026.jpg', './november-2026.jpg']")
    elif "'./oktober-2026.jpg'" in sw and 'november-2026' not in sw:
        sw = sw.replace("'./oktober-2026.jpg'", "'./oktober-2026.jpg', './november-2026.jpg'")
(root / 'sw.js').write_text(sw)
print('Updated sw.js')
