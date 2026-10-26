#!/usr/bin/env python3
from pathlib import Path
p = Path('index.html')
t = p.read_text()

t = t.replace("let current = 'May';", "let current = MONTHS[new Date().getMonth()];", 1)

old_build = """function buildTabs(){
  const el=document.getElementById('tabs');
  el.innerHTML='';

  // 2025 tab first
  const b25=document.createElement('button');
  b25.className='tab-btn'+(mode==='2025'?' active':'');
  b25.textContent='📂 2025';
  b25.style.cssText='background:#1a2e1a;border-color:#4ade80;color:#4ade80;font-weight:800;';
  b25.onclick=()=>{ mode='2025'; render2025(); };
  el.appendChild(b25);

  MONTHS.forEach(m=>{
    const b=document.createElement('button');
    b.className='tab-btn'+(mode==='2026'&&m===current?' active':'');
    b.textContent=m;
    b.onclick=()=>{ mode='2026'; current=m; render(); };
    el.appendChild(b);
  });
}"""

new_build = """function buildTabs(){
  const el=document.getElementById('tabs');
  el.innerHTML='';

  // 2025 tab first
  const b25=document.createElement('button');
  b25.className='tab-btn'+(mode==='2025'?' active':'');
  b25.textContent='📂 2025';
  b25.style.cssText='background:#1a2e1a;border-color:#4ade80;color:#4ade80;font-weight:800;';
  b25.onclick=()=>{ mode='2025'; render2025(); };
  el.appendChild(b25);

  MONTHS.forEach(m=>{
    const b=document.createElement('button');
    const isActive = mode==='2026'&&m===current;
    b.className='tab-btn'+(isActive?' active':'');
    b.dataset.month = m;
    // Dot marks the real calendar month in the strip
    b.textContent = (m===_todayMonth) ? (m + ' ·') : m;
    b.onclick=()=>{ mode='2026'; current=m; render(); };
    el.appendChild(b);
  });

  // Keep the active month tab visible in the horizontal strip
  requestAnimationFrame(()=>{
    const active = el.querySelector('.tab-btn.active');
    if(active) active.scrollIntoView({behavior:'smooth', inline:'center', block:'nearest'});
  });
}"""

if old_build in t:
    t = t.replace(old_build, new_build, 1)
    print('Patched buildTabs')
elif 'dataset.month' in t:
    print('buildTabs already patched')
else:
    raise SystemExit('buildTabs original not found')

old_toggle = "  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b.textContent===m));"
new_toggle = "  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.month===m || (mode==='2025' && b.textContent.includes('2025'))));"
if old_toggle in t:
    t = t.replace(old_toggle, new_toggle, 1)
    print('Patched toggle')
elif 'dataset.month===m' in t:
    print('Toggle already patched')
else:
    print('WARN: toggle line not found')

old_init = """const _today      = new Date();
// The planner is for 2026 only — mark "Vandaag" solely when the real date
// falls in 2026, otherwise e.g. 8 Aug 2027 would light up the 8 Aug 2026 row.
const _todayMonth = _today.getFullYear()===2026 ? MONTHS[_today.getMonth()] : null;
const _todayDate  = _today.getDate();

// Open on the current calendar month (handy for browsing in any year)
current = MONTHS[_today.getMonth()];

buildTabs();
render();

// Scroll today's row into view after render
setTimeout(()=>{
  const row = document.getElementById('today-row');
  if(row) row.scrollIntoView({behavior:'smooth', block:'center'});
}, 150);"""

new_init = """const _today      = new Date();
// The planner is for 2026 only — mark "Vandaag" solely when the real date
// falls in 2026, otherwise e.g. 8 Aug 2027 would light up the 8 Aug 2026 row.
const _todayMonth = _today.getFullYear()===2026 ? MONTHS[_today.getMonth()] : null;
const _todayDate  = _today.getDate();

// Always open on the month we are in (2026 calendar)
mode = '2026';
current = MONTHS[_today.getMonth()];

buildTabs();
render();

// Scroll today's row into view after render
setTimeout(()=>{
  const row = document.getElementById('today-row');
  if(row) row.scrollIntoView({behavior:'smooth', block:'center'});
  // Also ensure the month tab strip shows the active month
  const activeTab = document.querySelector('#tabs .tab-btn.active');
  if(activeTab) activeTab.scrollIntoView({behavior:'smooth', inline:'center', block:'nearest'});
}, 150);"""

if old_init in t:
    t = t.replace(old_init, new_init, 1)
    print('Patched init')
elif 'Always open on the month we are in' in t:
    print('Init already patched')
else:
    print('WARN: init block not found')

p.write_text(t)
sw = Path('sw.js')
s = sw.read_text()
for v in ['rooster-v10','rooster-v9','rooster-v8','rooster-v7','rooster-v6']:
    if f"'{v}'" in s:
        s = s.replace(f"'{v}'", "'rooster-v10'")
        break
sw.write_text(s)
print('SW done')
