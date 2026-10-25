#!/usr/bin/env python3
from pathlib import Path
html = Path('index.html').read_text()
old = "BUILTIN_IMGS = { October: 'oktober-2026.jpg', November: 'november-2026.jpg' };"
new = "BUILTIN_IMGS = { October: 'oktober-2026.jpg' };"
if old in html:
    Path('index.html').write_text(html.replace(old, new, 1))
    print('Removed November from BUILTIN_IMGS')
else:
    print('No change needed', html[html.find('BUILTIN_IMGS'):html.find('BUILTIN_IMGS')+120])
sw = Path('sw.js').read_text()
if ", './november-2026.jpg'" in sw:
    Path('sw.js').write_text(sw.replace(", './november-2026.jpg'", ''))
    print('Removed november jpg from SW assets')
