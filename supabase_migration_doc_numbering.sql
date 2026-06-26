-- ============================================
-- Migration: Sequential doc numbering + conversion tracking
-- Run this in Supabase SQL Editor on an EXISTING project
-- (safe to run even if you already ran the original schema)
-- ============================================

-- 1. Add converted_from column to track "Converted from Q-105" references
alter table billing_documents
  add column if not exists converted_from text;

-- 2. Counter table for sequential numbers per doc type
create table if not exists doc_counters (
  doc_type text primary key,
  next_number integer not null default 100
);

insert into doc_counters (doc_type, next_number) values
  ('quote', 100),
  ('invoice', 100),
  ('receipt', 100)
on conflict (doc_type) do nothing;

-- 3. Atomic increment function
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

-- 4. RLS for the new table
alter table doc_counters enable row level security;

create policy "Authenticated users can manage doc_counters"
  on doc_counters for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ============================================
-- Done.
-- ============================================
