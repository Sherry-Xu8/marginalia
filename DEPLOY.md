# Putting the app online (free)

The app is just a folder of ordinary web files, so any free "static site" host works.
Nothing you enter is sent anywhere — your trips stay in your own browser.

## Step 1 — make the website files

```bash
npm run build
```

This creates a folder called `dist`. That folder *is* your website.

## Option A (easiest): Netlify Drop

1. Go to <https://app.netlify.com/drop> and sign up for a free account.
2. Drag the `dist` folder onto the page.
3. You get an address like `https://something-random.netlify.app`. Open it on your phone.
4. To change the name: Site configuration → Change site name.

To update later: run `npm run build` again, then on Netlify open your site → Deploys → drag the new `dist` folder onto it.

## Option B: GitHub Pages (updates automatically)

1. Create a free account at <https://github.com> and make a new, empty repository.
2. In the repository: Settings → Pages → Source → **GitHub Actions**.
3. Upload this project to the repository (the `.github/workflows/deploy.yml` file here does the rest).
4. After a minute or two your site appears at `https://<your-name>.github.io/<repository>/`.

## On your phone

1. Open the address in Safari (iPhone) or Chrome (Android).
2. **Add to Home Screen** — iPhone: Share button → Add to Home Screen. Android: menu → Install app.
3. Open it once while online. After that the app itself works without a connection; map tiles only for areas you've already looked at.

Your data lives on *that device*. To move a plan between phone and computer, use **Share and back up** on the Trip tab.

## Later: accurate public-transport times (optional)

Without a key, public transport times are labelled "approx." (estimated from distance). To use Google's real transit times
you need a small web service that holds your Google Maps API key privately — **never put the key in this app**, because
anyone could read it. Once that service exists, set its address when building:

```bash
VITE_TRANSIT_PROXY_URL=https://your-service.example/transit npm run build
```

It must answer `GET ?from=lat,lon&to=lat,lon` with `{"km": 4.2, "minutes": 25}`.

## Later: automatic flight times (optional)

Entering a flight number fills in the airline and, if you type airport codes like ICN or PUS, the airport names. Times and the exact
route change from day to day, so they come from a flight-data service. Those need an account and a key, which must **never** go in
this app's code. If you set up a small web service that holds the key privately, point the app at it when building:

```bash
VITE_FLIGHT_PROXY_URL=https://your-service.example/flight npm run build
```

It must answer `GET ?flight=KE123&date=2026-11-13` with `{"from":"ICN","to":"PUS","departTime":"09:10","arriveTime":"10:20","note":"Terminal 2"}`.
