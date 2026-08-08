# Rooster Observatoren 2026

A single-file, offline-capable web app for the observatory shift schedule
(rooster) of persons **JPA** and **GMA2**, with a read-only 2025 year overview.

**Live app:** https://gniusweather.github.io/ROOSTER/

## Features

- Interactive 2026 month planner — click any shift badge to cycle the code
  (`X`, `D`, `D*`, `A`, `KW`, `R`, `R=A`, `R=D`, `VAK`, `Z` (ziek), …). Edits
  save automatically to your browser (`localStorage`).
- **Undo** (`↩ Ongedaan`) reverts the last badge edit.
- **June, July & August** show every observer column (June/July: GMA, JPA,
  QPI, AYS, FCA; August adds ECON and PJAN); a toggle switches between all
  persons and only GMA + JPA.
- **Photo upload** — attach a photo of the printed schedule as a reference
  copy, viewable fullscreen with a click. Purely a reference image; there's
  no automatic reading of the photo, so you still enter shifts by clicking
  badges.
- **Excel export** for any month and for the 2025 year overview.
- **Installable PWA** — "Add to home screen" for a fullscreen, offline app.
- 2025 year overview with worked-hours stats and a per-month bar chart.

## Development

Everything lives in `index.html` (HTML + CSS + JS in one file). No build step.

```sh
# Serve locally
python3 -m http.server 8080
# open http://localhost:8080/index.html
```

### Tests

`perf-test.js` runs the page's inline script in a Node DOM stub and checks
data integrity, bug-fix regressions, the multi-column month layouts and
toggle, the stale-cache migration, and performance thresholds.

```sh
node perf-test.js
```

## Deployment

Hosted on GitHub Pages from `main`. `.nojekyll` disables Jekyll processing so
the static files are served as-is.
