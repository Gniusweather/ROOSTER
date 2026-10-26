#!/usr/bin/env python3
import base64, pathlib, urllib.request
root = pathlib.Path('.')
# Prefer local staged b64; optionally could fetch
b64_path = root / 'november-2026.jpg.b64'
if not b64_path.exists() or b64_path.stat().st_size < 1000:
    raise SystemExit(f'Missing or empty {b64_path}')
b64 = b64_path.read_text().strip()
# strip placeholder if still there
if b64.startswith('PLACEHOLDER'):
    raise SystemExit('b64 still placeholder')
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
(root / 'index.html').write_text(html)
sw = (root / 'sw.js').read_text()
for oldc in ["const CACHE = 'rooster-v7';", "const CACHE = 'rooster-v6';", "const CACHE = 'rooster-v8';"]:
    if oldc in sw:
        sw = sw.replace(oldc, "const CACHE = 'rooster-v8';")
        break
if 'november-2026.jpg' not in sw:
    sw = sw.replace("'./oktober-2026.jpg']", "'./oktober-2026.jpg', './november-2026.jpg']")
(root / 'sw.js').write_text(sw)
print('Updated sw.js')
