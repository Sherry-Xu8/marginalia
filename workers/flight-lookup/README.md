# Live flight times for Marginalia (optional)

Without this, entering a flight number fills in the airline and airport names. With it, the app also fills in the
**departure and arrival times, the airports and the terminals** for your date.

You will set up two free things: a **flight-data account** (to get a key) and a **Cloudflare Worker** (a tiny service that keeps
that key private). The key is never put in the app, so nobody can copy it from your website.

Everything below is clicking in websites; no command line is needed.

## 1. Get a flight-data key (AeroDataBox)

1. Go to **rapidapi.com**, create a free account, and search for **AeroDataBox**.
2. Subscribe to its **Basic (free)** plan. *Check the plan's monthly limit on that page: free plans change, and some need a card on file.*
3. Open the API's page and find your key. It's shown in the code sample as `X-RapidAPI-Key`. Copy it.

(If you'd rather use **API.Market**, which also offers AeroDataBox, use that key and set `PROVIDER` to `apimarket` in step 2.)

## 2. Create the Worker on Cloudflare

1. Go to **dash.cloudflare.com** and make a free account.
2. Left menu: **Workers & Pages → Create → Create Worker**. Name it `marginalia-flights` and click **Deploy**.
3. Click **Edit code**, delete what's there, and paste in the whole of `worker.js` from this folder. Click **Deploy**.
4. Go to the Worker's **Settings → Variables and Secrets → Add** and create:
   - `API_KEY`: type **Secret**, value = the key from step 1.
   - `ALLOWED_ORIGIN`: type **Text**, value = your website address, for example `https://effulgent-fox-25b21f.netlify.app` (no slash at the end).
   - `PROVIDER`: only if you used API.Market: type **Text**, value `apimarket`.
5. Click **Deploy** again. Your Worker's address is shown at the top, like `https://marginalia-flights.your-name.workers.dev`.

## 3. Tell the app

In Marginalia, open a trip's **Overview**, scroll to **Trip settings → Flight times service**, paste the Worker address, and press **Save**.
This is saved on that device, so do it once on your phone and once on your computer.

## 4. Try it

Add a journey, choose **Flight**, type a flight number such as `KE 123`, and press **Fill in the details**. Check the date first, because
times are looked up for that date. Always check the result against your booking.

## Good to know

- **Limits:** each lookup uses one request from your free monthly allowance. The Worker remembers answers for an hour, so asking
  again about the same flight doesn't cost another.
- **Dates:** airlines publish schedules a limited time ahead, so a flight many months away may not be found yet.
- **Safety:** the Worker only accepts valid flight numbers and dates, only answers your website, and never shows the key.
- **Something wrong?** If the app says the service couldn't find the flight, check the number and date. If it never works,
  re-check that `API_KEY` and `ALLOWED_ORIGIN` are set exactly, and that your plan hasn't run out.
- **Different provider:** only the `shape` function and the web addresses in `worker.js` are specific to AeroDataBox, so another
  service can be swapped in without touching the app.
