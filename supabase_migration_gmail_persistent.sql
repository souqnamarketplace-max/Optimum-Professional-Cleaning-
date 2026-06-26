-- ============================================
-- Migration: Persistent Gmail connection (refresh tokens)
-- Run this in Supabase SQL Editor on an EXISTING project
--
-- This stores Google's refresh token server-side (never exposed to the
-- browser) so "Connect Gmail" only needs to happen once, instead of every
-- ~1 hour or every time the browser tab/window closes.
-- ============================================

create table if not exists gmail_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  refresh_token text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id)
);

alter table gmail_tokens enable row level security;

-- Only the Edge Functions (using the service role key, which bypasses RLS)
-- ever read or write the refresh_token column directly. These policies
-- exist so a logged-in user can check whether THEY have a connection
-- (email + existence) without ever being able to select the refresh_token
-- itself through the public Supabase client.
create policy "Users can check their own Gmail connection status"
  on gmail_tokens for select
  using (auth.uid() = user_id);

create policy "Users can remove their own Gmail connection"
  on gmail_tokens for delete
  using (auth.uid() = user_id);

-- Inserts/updates to this table happen ONLY through the Edge Functions
-- (via the service role key) — intentionally no insert/update policy for
-- the regular logged-in user, since the refresh_token must never be
-- writable directly from the browser.

-- ============================================
-- Done. Next: deploy the two Edge Functions (gmail-oauth-exchange and
-- gmail-oauth-refresh) per GMAIL_SETUP_GUIDE.md, then reconnect Gmail
-- once from Settings to get a persistent connection.
-- ============================================
