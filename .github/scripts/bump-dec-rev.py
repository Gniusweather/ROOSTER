#!/usr/bin/env python3
from pathlib import Path
import re
html = Path('index.html').read_text()
html2, n = re.subn(
    r'(PRESET_REV\s*=\s*\{[^}]*December:\s*)(\d+)',
    r'\g<1>2',
    html,
    count=1,
)
if not n:
    raise SystemExit('PRESET_REV December not found')
Path('index.html').write_text(html2)
print('December PRESET_REV -> 2')
sw = Path('sw.js').read_text()
if "'rooster-v20'" in sw:
    sw = sw.replace("'rooster-v20'", "'rooster-v21'")
elif "'rooster-v19'" in sw:
    sw = sw.replace("'rooster-v19'", "'rooster-v21'")
Path('sw.js').write_text(sw)
print('sw bumped')
