-- ============================================
-- Billing System — Supabase Schema
-- Run this entire file in Supabase SQL Editor
-- (Dashboard → SQL Editor → New Query → paste → Run)
-- ============================================

-- 1. site_settings table (company branding info)
create table if not exists site_settings (
  id uuid primary key default gen_random_uuid(),
  company_name text,
  email text,
  website text,
  address text,
  phone text,
  logo_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. billing_documents table (quotes/invoices/receipts)
create table if not exists billing_documents (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null check (doc_type in ('quote','invoice','receipt')),
  doc_number text,
  doc_title text,
  client_name text,
  client_email text,
  client_address text,
  issue_date date,
  due_date date,
  valid_until date,
  items jsonb default '[]',
  systems jsonb default '[]',
  subtotal numeric default 0,
  tax_rate numeric default 0,
  tax_amount numeric default 0,
  total numeric default 0,
  notes text,
  terms text,
  currency text default 'USD',
  status text default 'pending',
  linked_invoice_id uuid,
  show_unit_prices boolean default true,
  use_systems boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. Enable Row Level Security
alter table site_settings enable row level security;
alter table billing_documents enable row level security;

-- 4. Policies — only authenticated users (the business owner) can read/write
create policy "Authenticated users can manage site_settings"
  on site_settings for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can manage billing_documents"
  on billing_documents for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- 5. Storage bucket for logo uploads
insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do nothing;

create policy "Public read access to assets"
  on storage.objects for select
  using (bucket_id = 'assets');

create policy "Authenticated users can upload assets"
  on storage.objects for insert
  with check (bucket_id = 'assets' and auth.role() = 'authenticated');

create policy "Authenticated users can update their assets"
  on storage.objects for update
  using (bucket_id = 'assets' and auth.role() = 'authenticated');

-- ============================================
-- Done. Next step: create the admin login user
-- via Supabase Dashboard → Authentication → Users → Add User
-- ============================================
