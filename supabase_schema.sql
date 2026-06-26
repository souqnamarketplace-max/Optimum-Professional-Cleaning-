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
  default_currency text default 'CAD',
  default_tax_label text default 'GST',
  default_tax_rate numeric default 5,
  etransfer_email text,
  bank_institution text,
  bank_transit text,
  bank_account text,
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
  client_phone text,
  issue_date date,
  due_date date,
  valid_until date,
  items jsonb default '[]',
  systems jsonb default '[]',
  subtotal numeric default 0,
  tax_label text default 'GST',
  tax_rate numeric default 0,
  tax_amount numeric default 0,
  total numeric default 0,
  notes text,
  terms text,
  currency text default 'CAD',
  status text default 'pending',
  linked_invoice_id uuid,
  converted_from text,
  show_unit_prices boolean default true,
  use_systems boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2b. clients table — saved client list for quick reuse on new documents
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

-- 3. doc_counters table — tracks the next sequence number per document type
create table if not exists doc_counters (
  doc_type text primary key,
  next_number integer not null default 100
);

insert into doc_counters (doc_type, next_number) values
  ('quote', 100),
  ('invoice', 100),
  ('receipt', 100)
on conflict (doc_type) do nothing;

-- Atomically reads-and-increments the counter for a doc type, so two
-- people saving at the same time can never get the same number.
create or replace function get_next_doc_number(p_doc_type text)
returns integer
language plpgsql
as $$
declare
  v_number integer;
begin
  update doc_counters
    set next_number = next_number + 1
    where doc_type = p_doc_type
    returning next_number - 1 into v_number;

  if v_number is null then
    insert into doc_counters (doc_type, next_number)
      values (p_doc_type, 101)
      on conflict (doc_type) do nothing;
    v_number := 100;
  end if;

  return v_number;
end;
$$;

-- 4. Enable Row Level Security
alter table site_settings enable row level security;
alter table billing_documents enable row level security;
alter table doc_counters enable row level security;
alter table clients enable row level security;

-- 5. Policies — only authenticated users (the business owner) can read/write
create policy "Authenticated users can manage site_settings"
  on site_settings for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can manage billing_documents"
  on billing_documents for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can manage doc_counters"
  on doc_counters for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can manage clients"
  on clients for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- 6. Storage bucket for logo uploads
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
