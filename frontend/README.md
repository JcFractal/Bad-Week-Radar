# Bad Week Radar frontend

React + TypeScript + Vite. Static single-page app with no backend, login or API key.

## Setup

Requires Node 18+ (tested on Node 20).

```bash
cd frontend
npm ci
npm run dev        # http://localhost:5173
npm test           # unit tests (replay, import, baselines)
npm run build      # production build -> frontend/dist
npm run preview    # serve the production build at http://localhost:4173
```

## Screens

- **Roster** (`#/`): search, status filters, summary counts, links to patient review. Status comes from each patient's latest record.
- **Patient review** (`#/patient/:id`): aligned steps / sleep / resting heart rate charts with a prior-28-day personal
  baseline, status and check-in tracks, As-of replay, dated explanation, data coverage, session notes and review completion.
- **Evidence** (`#/evidence`): the committed aggregate results in `../analysis/results/`, including baselines, the
  `today_feeling_missing` subgroup, the non-oncology fatigue study, and limitations.

Status labels: `alert` = "Review suggested", `no_alert` = "No alert", `insufficient_data` = "Insufficient data".
Scores are shown as uncalibrated numbers, never as percentages.

## Data and privacy

- The app starts with **illustrative examples** (`src/data/examples.ts`): invented histories with a hand-written example
  rule, labelled as such. They are not challenge records or model output.
- **Import JSON** reads a file in the format of `docs/frontend_contract.md` with the browser File API. The data stays in
  React memory only. It is not uploaded, persisted (no localStorage or cookies) or tracked, and reloading clears it.
- The production build sets a Content Security Policy with `connect-src 'none'`, so the page cannot make network requests.
- Never commit or bundle patient-level exports. `frontend/.gitignore` blocks `*.json` data files and `*.csv`/`*.zip`.
  Generate a demo export locally with `python analysis/export.py` (writes to `~/bwr_outputs/`) and import it in the browser.

## Replay rules

For As-of date `D` the review screen uses `analysis.daily.find(r => r.prediction_date === D)` and never `analysis.latest`.
If there is no record for `D`, nothing is shown. Days after `D` stay hidden from charts, baselines, explanations and summaries
until **Reveal following days** is selected, and changing `D` hides them again (`src/lib/replay.ts`).

## Static hosting

`npm run build` creates `dist/` with relative asset paths and hash routing, so it works from any static host or sub-path
with no rewrite rules, environment variables or backend. The build contains only the illustrative examples and the
committed aggregate results; imported files never leave the browser.

### GitHub Pages (current deployment)

The built `dist/` is published on the `gh-pages` branch (build output only; nothing is merged into `main`). Once Pages is
enabled (Settings → Pages → Source: Deploy from a branch → `gh-pages` / `/ (root)`), the app is served at
https://jcfractal.github.io/Bad-Week-Radar/.

To republish after frontend changes:

```bash
cd frontend && npm ci && npm run build
rm -rf /tmp/bwr-pages && mkdir /tmp/bwr-pages && cp -r dist/. /tmp/bwr-pages/ && touch /tmp/bwr-pages/.nojekyll
cd /tmp/bwr-pages && git init -q -b gh-pages && git add -A && git commit -qm "Deploy frontend"
git push -f https://github.com/JcFractal/Bad-Week-Radar.git gh-pages
```

Before publishing, check that `dist/` holds only `index.html`, `favicon.svg` and `assets/`, and that it has no patient
IDs from the challenge data (`grep -rE 'P0[0-9]{4}' dist` should print nothing).

Other hosts work too: Netlify / Cloudflare Pages (base directory `frontend`, build `npm ci && npm run build`,
publish `dist`), or any S3-style bucket.

## Archie source (JcFractal/Bad-Week-Radar-UI)

Archie's generated source was reviewed at commit `f86b73f`, and **no code was reused**. The interface here matches the
screenshots' light navy/teal layout and was written independently. Reasons the source wasn't merged in:

- Its patient status map (`src/presentation/status-map.ts`) includes `Watch` and `Stable`. The analysis contract
  only has `alert`, `no_alert` and `insufficient_data`, and `no_alert` must not be shown as stable or healthy.
- It is built around Archie's generated SDK, login screens and in-memory fixtures (React 19, Tailwind 4, shadcn/ui,
  Bun). Wiring the contract import, dated replay and reveal rules into it would take longer than the time left before
  the deadline and would add auth screens this static app doesn't need.
