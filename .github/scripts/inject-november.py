#!/usr/bin/env python3
import json
import pathlib

root = pathlib.Path('.')
data = json.loads((root / 'november-2026.json').read_text())
lines = ['  November:[']
for r in data:
    lines.append(
        "    {date:%d, day:'%s',qpi:'%s', jpa:'%s', ays:'%s', fca:'%s', gma2:'%s', op:'%s'}," % (
            r['date'], r['day'], r['qpi'], r['jpa'], r['ays'], r['fca'], r['gma2'], r.get('op', ''))
    )
lines.append('  ]')
nov_block = '\n'.join(lines)
html = (root / 'index.html').read_text()
preset_start = html.find('const PRESET')
rooster = html.find('const ROOSTER_IMGS')
if 'November:[' not in html[preset_start:rooster]:
    marker = '  ]\n};\n\nconst ROOSTER_IMGS_2025'
    if marker not in html:
        raise SystemExit('PRESET end marker not found')
    html = html.replace(marker, '  ],\n' + nov_block + '\n};\n\nconst ROOSTER_IMGS_2025', 1)
    print('Inserted November PRESET')
else:
    print('November already in PRESET')

multi_start = html.find('MULTI_PERSON_COLUMNS')
multi_end = html.find('MULTI_PERSON_MONTHS')
if 'November: [' not in html[multi_start:multi_end]:
    old = (
        "  October: [\n"
        "    {key:'gma2', label:'GMA', bold:true},\n"
        "    {key:'jpa',  label:'JPA', bold:true},\n"
        "    {key:'qpi',  label:'QPI', bold:false},\n"
        "    {key:'ays',  label:'AYS', bold:false},\n"
        "    {key:'fca',  label:'FCA', bold:false},\n"
        "  ],\n"
        "};"
    )
    new = (
        "  October: [\n"
        "    {key:'gma2', label:'GMA', bold:true},\n"
        "    {key:'jpa',  label:'JPA', bold:true},\n"
        "    {key:'qpi',  label:'QPI', bold:false},\n"
        "    {key:'ays',  label:'AYS', bold:false},\n"
        "    {key:'fca',  label:'FCA', bold:false},\n"
        "  ],\n"
        "  November: [\n"
        "    {key:'gma2', label:'GMA', bold:true},\n"
        "    {key:'jpa',  label:'JPA', bold:true},\n"
        "    {key:'qpi',  label:'QPI', bold:false},\n"
        "    {key:'ays',  label:'AYS', bold:false},\n"
        "    {key:'fca',  label:'FCA', bold:false},\n"
        "  ],\n"
        "};"
    )
    if old not in html:
        raise SystemExit('MULTI_PERSON October block not found')
    html = html.replace(old, new, 1)
    print('Added MULTI_PERSON November')

rev_slice = html[html.find('PRESET_REV'):html.find('PRESET_REV') + 100]
if 'November:' not in rev_slice:
    html = html.replace(
        'PRESET_REV = { October: 2 };',
        'PRESET_REV = { October: 2, November: 1 };',
        1,
    )
    print('Bumped PRESET_REV')

bi = html.find('BUILTIN_IMGS')
if bi >= 0 and 'November:' not in html[bi:bi + 140]:
    html = html.replace(
        "BUILTIN_IMGS = { October: 'oktober-2026.jpg' };",
        "BUILTIN_IMGS = { October: 'oktober-2026.jpg', November: 'november-2026.jpg' };",
        1,
    )
    print('Added BUILTIN November')

(root / 'index.html').write_text(html)
sw = (root / 'sw.js').read_text()
sw = sw.replace("const CACHE = 'rooster-v6';", "const CACHE = 'rooster-v7';")
if 'november-2026.jpg' not in sw:
    sw = sw.replace("'./oktober-2026.jpg']", "'./oktober-2026.jpg', './november-2026.jpg']")
(root / 'sw.js').write_text(sw)
print('Updated sw.js')
