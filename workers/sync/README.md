# Marginalia sync (optional)

This keeps your phone and computer in step. It's a tiny Cloudflare Worker that stores **one scrambled copy**
of your plans. The app scrambles (encrypts) your trips on your device using your sync code before sending,
so the service only ever holds unreadable data. Cloudflare's free plan is plenty.

You only need this if you want your phone and computer to share the same trips. Backup files and the
read-only share link work without it.

## Set it up (about 10 minutes, no command line)

1. Sign in at https://dash.cloudflare.com (free account).
2. **Storage and databases → KV → Create a namespace.** Name it `marginalia-sync`.
3. **Workers and Pages → Create → Create Worker.** Name it `marginalia-sync`, press **Deploy**, then **Edit code**.
4. Delete everything in the editor, paste in the whole of `worker.js` from this folder, press **Deploy**.
5. Go to the Worker's **Settings → Bindings → Add → KV namespace.**
   Variable name: `SYNC`. Namespace: the one you made in step 2. Save.
6. **Settings → Variables and Secrets → Add → Text.**
   Name: `ALLOWED_ORIGIN`. Value: your app's address, such as `https://your-site.netlify.app` (no slash at the end).
   Press **Deploy**.
7. Copy the Worker's address (it ends in `.workers.dev`).

## Connect the app

On your computer: **Settings (gear) → Sync**. Paste the Worker address and press **Create a sync code**.
Write the code down. On your phone: open the app, **Settings → Sync**, paste the same address,
choose **I already have a code**, and type the code.

If you lose the code, the data in the cloud can't be read by anyone, including you. Keep a backup file as well.
