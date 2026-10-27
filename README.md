# Trip Planner

A personal trip planner that runs entirely in your browser. No server, no accounts —
everything is saved on your device. Works on a phone; can be added to the home screen
and used offline (map tiles only for areas you've already looked at).

## Run it on your computer

You need [Node.js](https://nodejs.org) (the "LTS" version) installed once.

```bash
npm install
npm run dev
```

Then open the address it prints (usually http://localhost:5173).

## Build the files for hosting

```bash
npm run build
```

This creates a `dist` folder — plain website files you can put on any free static host.
(Stage 6 walks through this step by step.)

## Test data

`test-data-Korea-3.kmz` is a sample Google My Maps export (47 places in Korea).
Import it on the **Places** tab.

## Progress

- [x] Stage 1 — trips and stops, KML/KMZ import, map
- [x] Stage 2 — location groups and tags
- [x] Stage 3 — daily plan, checklist, countdown
- [x] Stage 4 — suggested itinerary
- [x] Stage 5 — commute times
- [ ] Stage 6 — free hosting
- [ ] Also requested: offline mode (set up now), budget and expense tracker, sharing via file
