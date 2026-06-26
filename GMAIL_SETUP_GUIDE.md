# Connecting Gmail — Setup Guide

This lets the app send quotes/invoices/receipts directly from your own Gmail account, PDF attached, no manual steps. You set this up once.

---

## What you're creating

A free Google Cloud project with OAuth credentials scoped to **send-only** Gmail access (`gmail.send`). The app can never read your inbox, contacts, or anything else — only send a message on your behalf when you click Send.

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
4. **Save and Continue** through Scopes (you don't need to add anything here — the app requests the scope directly)
5. On the **Test users** screen, click **Add Users** and add the Gmail address(es) that will use this app (your own, and anyone else who'll send from it)
6. Save and finish

This keeps the app in **Testing** mode — it works immediately for the test users you listed, with no Google review needed. (Submitting for verification to remove the "unverified app" warning and the test-user limit is optional and only needed if you want this used by people outside a short list you control.)

## Step 4 — Create OAuth credentials

1. Go to https://console.cloud.google.com/apis/credentials
2. Click **Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. Name: anything (e.g. "Billing System Web")
5. Under **Authorized JavaScript origins**, add your live site URL, e.g.:
   `https://your-app-name.vercel.app`
   (and `http://localhost:5173` too, if you ever run it locally)
6. Click **Create**
7. Copy the **Client ID** shown (looks like `123456789-abc...apps.googleusercontent.com`)

## Step 5 — Add the Client ID to Vercel

1. Go to your Vercel project → **Settings → Environment Variables**
2. Add:
   - Name: `VITE_GOOGLE_CLIENT_ID`
   - Value: the Client ID you copied
3. Redeploy (Vercel → Deployments → ⋯ → Redeploy), since environment variable changes need a fresh build to take effect

## Step 6 — Connect in the app

1. Go to your live app → **Settings**
2. Scroll to **Sending emails** → click **Connect Gmail**
3. A Google sign-in popup appears — sign in with the Gmail account you listed as a test user
4. Approve the "send email" permission
5. You'll see "Connected as you@gmail.com"

That's it — quotes/invoices/receipts now send for real when you click **Send**.

---

## Good to know

- **The connection lasts about an hour at a time.** This is a deliberate security choice — the app never stores a long-lived credential that could send email on your behalf indefinitely. You'll occasionally need to click Connect Gmail again; it's one click and a few seconds.
- **Only test users you've added can connect**, while the app is in Testing mode. If someone else tries to connect and gets an error, add their Gmail address under Step 3 → Test users.
- **If you ever want to revoke access** from Google's side: https://myaccount.google.com/permissions → find the app → Remove access.
