# Marginalia

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

## Put it online

See [DEPLOY.md](DEPLOY.md) for step-by-step instructions (Netlify Drop or GitHub Pages).

## Test data

`test-data-Korea-3.kmz` is a sample Google My Maps export (47 places in Korea).
Import it on the **Places** tab.

## How the app is laid out

- **Your trips** (front page): all trips, and a way to start a new one.
- **Overview** (inside a trip): stops with progress, what's next, checklists, sharing and backup.
- **Places** (list and map together), **Days**, **Budget**: the working screens.

## Progress

- [x] Stage 1 — trips and stops, KML/KMZ import, map
- [x] Stage 2 — location groups and tags
- [x] Stage 3 — daily plan, checklist, countdown
- [x] Stage 4 — suggested itinerary
- [x] Stage 5 — commute times
- [x] Stage 6 — free hosting (instructions and GitHub Pages workflow; you press the buttons)
- [x] Offline support, budget and expense tracker, sharing and backup via JSON file


## Settings, offline maps and sync

- **Settings** (the gear icon in the top bar): appearance, sync, backup and restore, offline maps, photo lookup and the flight service.
- **Offline maps:** Settings → Offline maps saves the map around each stop on this device.
- **Sync (optional):** keeps your devices in step through a small Cloudflare Worker of your own. See `workers/sync/README.md`.
- **Must-do stars** on places: Suggest my days schedules starred places first and never sets them aside.
- **Closed days:** Suggest my days avoids putting a place on a day its opening hours say it is closed.
