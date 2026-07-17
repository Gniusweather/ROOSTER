# Rooster Observatoren 2026

A single-file, offline-capable web app for the observatory shift schedule
(rooster) of persons **JPA** and **GMA2**, with a read-only 2025 year overview.

**Live app:** https://gnius21.github.io/ROOSTER/

## Features

- Interactive 2026 month planner — click any shift badge to cycle the code
  (`X`, `D`, `D*`, `A`, `KW`, `R`, `R=A`, `R=D`, `VAK`, `Z` (ziek), …). Edits
  save automatically to your browser (`localStorage`).
- **Undo** (`↩ Ongedaan`) reverts the last badge edit.
- **June & July** show every observer column (GMA, JPA, QPI, AYS, FCA); a
  toggle switches between all persons and only GMA + JPA.
- **Photo upload** with on-device OCR (Tesseract.js) — reads a schedule photo
  entirely in the browser, no API key or server required. Results are
  best-effort and fully editable.
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
data integrity, bug-fix regressions, the June/July multi-column layout and
toggle, the stale-cache migration, OCR helpers, and performance thresholds.

```sh
node perf-test.js
```

## Deployment

Hosted on GitHub Pages from `main`. `.nojekyll` disables Jekyll processing so
the static files are served as-is.
