# Connecting Gmail — Setup Guide

This lets the app send quotes/invoices/receipts directly from your own Gmail account, PDF attached, no manual steps. **You connect once — it stays connected** (no hourly reconnects, survives closing the browser), until you click Disconnect or revoke access from Google's side.

---

## What you're creating

A free Google Cloud project with OAuth credentials scoped to **send-only** Gmail access (`gmail.send`). The app can never read your inbox, contacts, or anything else — only send a message on your behalf when you click Send. A small piece of server-side code (a Supabase Edge Function) securely stores Google's renewal credential — that credential never touches the browser.

---

## Step 1 — Create a Google Cloud project

1. Go to https://console.cloud.google.com/projectcreate
2. Name it anything (e.g. "Billing System") → **Create**
3. Wait a few seconds for it to provision, then make sure it's selected in the top project dropdown

## Step 2 — Enable the Gmail API

1. Go to https://console.cloud.google.com/apis/library/gmail.googleapis.com
2. Make sure your new project is selected (top dropdown)
3. Click **Enable**

## Step 3 — Configure the OAuth consent screen

1. Go to https://console.cloud.google.com/apis/credentials/consent
2. Choose **External** → **Create**
3. Fill in:
   - App name: your company name
   - User support email: your email
   - Developer contact email: your email
4. **Save and Continue** through Scopes
5. On the **Test users** screen, click **Add Users** and add the Gmail address(es) that will use this app
6. Save and finish

This keeps the app in **Testing** mode — works immediately for the test users you listed, no Google review needed.

## Step 4 — Add the Gmail scope to Data access

1. Go to https://console.cloud.google.com/auth/scopes (left sidebar: **Data access**)
2. Click **Add or remove scopes**
3. Search for `gmail.send`, check the row where API = Gmail API, Scope = `.../auth/gmail.send`
4. **Update**, then **Save** on the Data access page

## Step 5 — Create OAuth credentials

1. Go to https://console.cloud.google.com/apis/credentials
2. Click **Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. Name: anything (e.g. "Billing System Web")
5. Under **Authorized JavaScript origins**, add your live site's origin (no trailing slash or path), e.g.:
   `https://your-app-name.vercel.app`
6. Click **Create**
7. A popup shows your **Client ID** and **Client Secret** — copy both. Unlike the simpler setup this app used before, the Client Secret is now required (it's used server-side only, never in the browser).

## Step 6 — Add environment variables

**In Vercel** (Settings → Environment Variables):

| Name | Value |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | the Client ID from Step 5 |

Redeploy after adding it (Vercel → Deployments → ⋯ → Redeploy).

**In Supabase** (Project Settings → Edge Functions → Secrets, or via CLI — see Step 7):

| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | the same Client ID from Step 5 |
| `GOOGLE_CLIENT_SECRET` | the Client Secret from Step 5 |
| `SUPABASE_ANON_KEY` | your project's anon public key (Project Settings → API) |

(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically available to every Edge Function — you don't need to set those yourself.)

## Step 7 — Deploy the Edge Functions

This requires the Supabase CLI. If you don't have it:

```bash
npm install -g supabase
```

Then, from inside the project folder:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

(`YOUR_PROJECT_REF` is in your Supabase project URL: `https://YOUR_PROJECT_REF.supabase.co`)

Set the secrets (if you'd rather do it via CLI than the dashboard):

```bash
supabase secrets set GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
supabase secrets set GOOGLE_CLIENT_SECRET=your-client-secret
supabase secrets set SUPABASE_ANON_KEY=your-anon-key
```

Deploy all three functions:

```bash
supabase functions deploy gmail-oauth-exchange
supabase functions deploy gmail-oauth-refresh
supabase functions deploy gmail-oauth-disconnect
```

## Step 8 — Run the database migration

In Supabase → SQL Editor, run `supabase_migration_gmail_persistent.sql` (included in this project) — this creates the table that stores the renewal credential.

## Step 9 — Connect in the app

1. Go to your live app → **Settings**
2. Scroll to **Sending emails** → click **Connect Gmail**
3. Sign in with a test user's Gmail account, click through the "unverified app" warning, **Allow** the permissions
4. You'll see "Connected as you@gmail.com"

That's it — from now on, this stays connected. Closing the browser, waking up the next day, none of that disconnects it.

---

## If you already connected under the old (hourly) setup

Google only issues a renewal credential on a **fresh** consent — if this Gmail account already approved this app once before, reconnecting might not get one. If Settings shows an error mentioning a missing refresh token after you click Connect Gmail:

1. Go to https://myaccount.google.com/permissions
2. Find this app → **Remove access**
3. Go back to the app and click **Connect Gmail** again

---

## Good to know

- **Only test users you've added can connect**, while the app is in Testing mode.
- **To fully disconnect:** click **Disconnect** in Settings (this also revokes the credential with Google), or remove access directly at https://myaccount.google.com/permissions.
- **If the connection ever stops working on its own** (e.g. you changed your Google password, or it's been fully inactive for 6 months under Testing mode's limits), Settings will show "Not connected" again — just click Connect Gmail once more.

