-- ============================================
-- Migration: Clients tab + flexible tax (GST/HST/etc) + CAD default
-- Run this in Supabase SQL Editor on an EXISTING project
-- (safe to run even if you've already run earlier migrations)
-- ============================================

-- 1. New columns on site_settings — default currency + default tax settings
alter table site_settings
  add column if not exists default_currency text default 'CAD',
  add column if not exists default_tax_label text default 'GST',
  add column if not exists default_tax_rate numeric default 5;

-- 2. New columns on billing_documents
alter table billing_documents
  add column if not exists client_phone text,
  add column if not exists tax_label text default 'GST';

-- Change the default for NEW rows going forward (existing rows keep their value)
alter table billing_documents
  alter column currency set default 'CAD';

-- 3. New clients table
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  address text,
  phone text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table clients enable row level security;

create policy "Authenticated users can manage clients"
  on clients for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ============================================
-- Done. After running this, go to Settings in the app
-- and set your default Tax Label (e.g. "GST") and Tax Rate (e.g. 5).
-- ============================================
