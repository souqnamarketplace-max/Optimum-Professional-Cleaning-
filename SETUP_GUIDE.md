# Billing System — Setup Guide

A standalone Quote → Invoice → Receipt billing system with login, company settings, and PDF generation. Fully independent — your own Supabase, GitHub, and Vercel accounts.

---

## What you're setting up

- **Login page** → only you (the business owner) can access the dashboard
- **Billing tab** → create Quotes, convert to Invoices, convert to Receipts. Supports grouped "systems" with subtotals, per-item discounts, show/hide unit prices, multi-currency, multi-page PDF export
- **Settings tab** → your company name, email, website, address, logo — auto-applied to every PDF

---

## Step 1 — Create accounts (5 minutes, all free tier)

1. **Supabase** → https://supabase.com → Sign up → "New Project"
   - Pick a name (e.g. "my-billing-system"), a strong database password (save it), and a region close to you.
   - Wait ~2 minutes for it to provision.
2. **GitHub** → https://github.com → Sign up (if you don't have an account)
3. **Vercel** → https://vercel.com → Sign up using "Continue with GitHub" (this links them automatically)

---

## Step 2 — Set up the Supabase database

1. In your new Supabase project, go to **SQL Editor** (left sidebar) → **New Query**
2. Open the file `supabase_schema.sql` (included in this project) and copy its entire contents
3. Paste into the SQL Editor and click **Run**
4. You should see "Success. No rows returned" — this created your tables, security policies, and the logo storage bucket

### Create your login user
1. Go to **Authentication → Users** (left sidebar) → **Add User**
2. Enter your email and a password → check "Auto Confirm User" → **Create User**
3. This is what you'll use to log into the dashboard

### Get your API keys
1. Go to **Project Settings → API**
2. Copy the **Project URL** and the **anon public** key — you'll need both in Step 4

---

## Step 3 — Push the code to GitHub

```bash
cd billing-system
git init
git add .
git commit -m "Initial billing system"
```

1. On GitHub, click **New Repository** (top right → "+") → name it (e.g. `my-billing-system`) → keep it **Private** → **Create repository**
2. GitHub will show you a remote URL. Run:

```bash
git remote add origin https://github.com/YOUR_USERNAME/my-billing-system.git
git branch -M main
git push -u origin main
```

---

## Step 4 — Deploy to Vercel

1. Go to https://vercel.com/new
2. Select the GitHub repo you just pushed → **Import**
3. Before clicking Deploy, expand **Environment Variables** and add:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | (from Step 2 — Project URL) |
| `VITE_SUPABASE_ANON_KEY` | (from Step 2 — anon public key) |

4. Click **Deploy**
5. After ~1 minute, you'll get a live URL like `my-billing-system.vercel.app`

From now on, every `git push` to `main` auto-redeploys.

---

## Step 5 — First login

1. Visit your live URL → you'll land on `/login`
2. Sign in with the email/password you created in Step 2
3. Go to **Settings** tab → fill in company name, email, website, address, upload logo → **Save**
4. Go to **Billing** tab → **+ New Document** → create your first quote

---

## Day-to-day usage

- **Create a Quote** → fill client info, add items (or toggle "Group items by system" for multi-section quotes) → Save
- **Convert Quote → Invoice** → one click from the list view, copies all items over automatically
- **Convert Invoice → Receipt** → marks it paid, one click
- **Download PDF** → matches your company branding from Settings
- **Send** → opens IONOS webmail (or your email provider) pre-filled with the document info — attach the downloaded PDF manually

---

## Updating the code later

If you want changes made to this system in the future, just say so in a new chat and reference this project — the same standard push pattern applies:

```bash
cd billing-system && git add . && git commit -m "your message" && git push origin main
```

Vercel auto-deploys on every push, no manual deploy step needed.

---

## Custom domain (optional)

In Vercel → your project → **Settings → Domains** → add your domain → follow the DNS records Vercel gives you → add them at your domain registrar (e.g. IONOS, GoDaddy, Namecheap).
