#!/usr/bin/env python3
from pathlib import Path
import re

html = Path('index.html').read_text()

# 1) Cache-bust builtin November URL
old_b = "BUILTIN_IMGS = { October: 'oktober-2026.jpg', November: 'november-2026.jpeg' };"
new_b = "BUILTIN_IMGS = { October: 'oktober-2026.jpg', November: 'november-2026.jpeg?v=20261105' };"
if old_b in html:
    html = html.replace(old_b, new_b, 1)
    print('builtin cache-busted')
elif "november-2026.jpeg?v=" in html:
    html = re.sub(
        r"November: 'november-2026\.jpeg\?v=[^']*'",
        "November: 'november-2026.jpeg?v=20261105'",
        html,
        count=1,
    )
    print('builtin version updated')
else:
    print('WARN: BUILTIN line not matched')

# 2) One-time clear of stale localStorage November photo (data URL from old upload)
marker = 'IMG_REV_NOVEMBER'
if marker not in html:
    # Insert after store init or near DOMContentLoaded / end of script setup
    inject = '''
// One-time: drop stale local November photo so the new repo scan is shown.
(function(){
  try {
    const REV = 2; // bump when replacing november-2026.jpeg again
    const key = 'imgRev_November';
    const cur = parseInt(localStorage.getItem(key) || '0', 10);
    if (cur < REV) {
      localStorage.removeItem('img_November');
      localStorage.setItem(key, String(REV));
    }
  } catch (e) {}
})();
'''
    # place just before function showOriginal
    anchor = 'function showOriginal(m){'
    if anchor not in html:
        raise SystemExit('showOriginal not found')
    html = html.replace(anchor, inject + '\n' + anchor, 1)
    print('injected localStorage clear')
else:
    # bump REV number in existing inject
    html2, n = re.subn(
        r"(const REV = )(\d+)(; // bump when replacing november-2026\.jpeg again)",
        r"\g<1>3\3",
        html,
        count=1,
    )
    if n:
        html = html2
        print('bumped IMG REV to 3')
    else:
        print('marker present, REV bump skipped')

Path('index.html').write_text(html)

sw = Path('sw.js').read_text()
for v in ['rooster-v18','rooster-v17','rooster-v16','rooster-v15']:
    if f"'{v}'" in sw:
        sw = sw.replace(f"'{v}'", "'rooster-v18'")
        print('sw', v, '-> v18')
        break
# Prefer network for the november image after activate
if "november-2026.jpeg?v=" not in sw and "november-2026.jpeg" in sw:
    sw = sw.replace(
        "'./november-2026.jpeg']",
        "'./november-2026.jpeg']  /* query-busted in page */",
    )
Path('sw.js').write_text(sw)
print('ok')
