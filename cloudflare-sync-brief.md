# Set up Marginalia's sync Worker on Cloudflare

I am already signed in to Cloudflare at https://dash.cloudflare.com in this browser.
Do the steps below on that site. Do not sign in to anything, and do not enter any password.
Tell me if a step looks different from what is written here, rather than guessing.

## 1. Create the storage
- Go to **Storage & Databases → KV**.
- Click **Create a namespace**.
- Name it exactly: `marginalia-sync`
- Create it.

## 2. Create the Worker
- Go to **Compute (Workers) → Workers & Pages**.
- Click **Create**, choose the **Hello World** starter, and click **Deploy**.
- Name it exactly: `marginalia-sync`

## 3. Paste in the real code
- Open this page in a new tab and copy ALL of its text:
  https://raw.githubusercontent.com/Sherry-Xu8/marginalia/main/workers/sync/worker.js
- Back on the Worker, click **Edit code**.
- Select everything already in the editor and delete it.
- Paste in the copied code.
- Click **Deploy**.

## 4. Connect the storage to the Worker
- Worker → **Settings → Bindings → Add → KV namespace**.
- Variable name, exactly (capitals matter): `SYNC`
- KV namespace: `marginalia-sync`
- Save / deploy.

## 5. Allow my app's address
- Worker → **Settings → Variables and Secrets → Add**, type **Text** (NOT Secret).
- Name, exactly: `ALLOWED_ORIGIN`
- Value, exactly, with no slash at the end: `https://sherry-xu8.github.io`
- Save / deploy.

## 6. Give me the address
- Copy the Worker's address from the top of its page. It ends in `.workers.dev`.
- Tell me that address.

## Please do not
- Do not create any API token or key.
- Do not change billing, add a payment method, or upgrade any plan.
- Do not delete or alter any other Worker, namespace or site in this account.
- Do not enter passwords or two-factor codes. If sign-in is needed, stop and tell me.
