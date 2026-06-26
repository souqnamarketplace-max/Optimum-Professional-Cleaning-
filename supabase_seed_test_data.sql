-- ============================================
-- Seed data: sample Quotes, Invoices, Receipts covering every variation
-- Run this in Supabase SQL Editor after the schema + migrations are applied
--
-- Covers:
--   1. Quote  — short, 1 page, with both Notes and Terms
--   2. Quote  — long (22 items), spans 2-3 PDF pages, both Notes and Terms
--   3. Invoice — grouped by "systems" (2 systems), 1 page, Notes only
--   4. Invoice — long (30 items), unit prices HIDDEN, spans pages, HST tax
--   5. Receipt — short, 1 page, no Notes/Terms at all (tests the "hide if empty" path)
--   6. Receipt — converted-from-invoice style, 1 page, Terms only, no tax
--
-- Uses get_next_doc_number() so seeded docs get real sequential numbers
-- that won't collide with anything already created through the app.
-- Safe to re-run — each run just adds another batch of seed documents.
-- ============================================

do $$
declare
  v_quote_num int;
  v_invoice_num int;
  v_receipt_num int;
  v_items_short jsonb;
  v_items_long jsonb;
  v_items_invoice_long jsonb;
  v_systems jsonb;
  i int;
  v_long_items jsonb := '[]'::jsonb;
  v_long_invoice_items jsonb := '[]'::jsonb;
begin

  -- ---------- Build a 22-item array for the long quote ----------
  for i in 1..22 loop
    v_long_items := v_long_items || jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid(),
        'name', 'Window cleaning — unit ' || i,
        'detail', 'Interior and exterior glass, frame wipe-down',
        'qty', 1,
        'unitPrice', 35 + (i % 5) * 5,
        'discount', case when i % 4 = 0 then 5 else 0 end
      )
    );
  end loop;

  -- ---------- Build a 30-item array for the long invoice ----------
  for i in 1..30 loop
    v_long_invoice_items := v_long_invoice_items || jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid(),
        'name', 'Carpet shampoo — room ' || i,
        'detail', 'Stain treatment included',
        'qty', 1,
        'unitPrice', 28,
        'discount', 0
      )
    );
  end loop;

  -- ========================================
  -- 1. QUOTE — short, 1 page, Notes + Terms
  -- ========================================
  v_quote_num := get_next_doc_number('quote');
  v_items_short := jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'name', 'Standard office cleaning', 'detail', 'Weekly visit, 2 staff', 'qty', 4, 'unitPrice', 65, 'discount', 0),
    jsonb_build_object('id', gen_random_uuid(), 'name', 'Washroom sanitization', 'detail', '', 'qty', 2, 'unitPrice', 25, 'discount', 0),
    jsonb_build_object('id', gen_random_uuid(), 'name', 'Window cleaning add-on', 'detail', 'Ground floor only', 'qty', 1, 'unitPrice', 80, 'discount', 10)
  );

  insert into billing_documents (
    doc_type, doc_number, doc_title, client_name, client_email, client_address, client_phone,
    issue_date, valid_until, items, systems, subtotal, tax_label, tax_rate, tax_amount, total,
    notes, terms, currency, status, show_unit_prices, use_systems
  ) values (
    'quote', 'Q-' || v_quote_num, 'Quote',
    'Riverside Dental Clinic', 'admin@riversidedental.example', '210 River Rd, Drayton Valley, AB', '780-555-0102',
    current_date, current_date + interval '14 days',
    v_items_short, '[]'::jsonb,
    260 + 25 + 72,
    'GST', 5, (260+25+72) * 0.05, (260+25+72) * 1.05,
    'Quote covers a standard weekly cleaning package for the clinic''s main floor. Pricing assumes consistent access during agreed hours.',
    'Quote valid for 14 days from issue date. A signed service agreement is required before the first scheduled visit.',
    'CAD', 'pending', true, false
  );

  -- ========================================
  -- 2. QUOTE — long, spans multiple PDF pages, Notes + Terms
  -- ========================================
  v_quote_num := get_next_doc_number('quote');

  insert into billing_documents (
    doc_type, doc_number, doc_title, client_name, client_email, client_address, client_phone,
    issue_date, valid_until, items, systems, subtotal, tax_label, tax_rate, tax_amount, total,
    notes, terms, currency, status, show_unit_prices, use_systems
  )
  select
    'quote', 'Q-' || v_quote_num, 'Quote',
    'Sunset Tower Apartments', 'manager@sunsettower.example', '88 Sunset Blvd, Edmonton, AB', '780-555-0199',
    current_date, current_date + interval '21 days',
    v_long_items, '[]'::jsonb,
    sub, 'GST', 5, sub * 0.05, sub * 1.05,
    'This quote covers a full window-cleaning pass across all 22 units in the building, inside and out. Scheduling will be coordinated with building management to minimize disruption to tenants. Water spot removal on ground-floor units is included at no extra charge.',
    'Quote valid for 21 days from issue date above. A 50% deposit is required to confirm the booking, with the remaining balance due on completion. Reschedule requests must be made at least 48 hours in advance to avoid a rebooking fee.',
    'CAD', 'pending', true, false
  from (
    select sum((item->>'unitPrice')::numeric * (item->>'qty')::numeric * (1 - (item->>'discount')::numeric/100)) as sub
    from jsonb_array_elements(v_long_items) as item
  ) totals;

  -- ========================================
  -- 3. INVOICE — grouped by systems, 1 page, Notes only
  -- ========================================
  v_invoice_num := get_next_doc_number('invoice');
  v_systems := jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid(),
      'name', 'Kitchen Deep Clean',
      'items', jsonb_build_array(
        jsonb_build_object('id', gen_random_uuid(), 'name', 'Degreasing — hood and surfaces', 'detail', '', 'qty', 1, 'unitPrice', 120, 'discount', 0),
        jsonb_build_object('id', gen_random_uuid(), 'name', 'Floor scrub and sanitize', 'detail', '', 'qty', 1, 'unitPrice', 90, 'discount', 0)
      )
    ),
    jsonb_build_object(
      'id', gen_random_uuid(),
      'name', 'Dining Area',
      'items', jsonb_build_array(
        jsonb_build_object('id', gen_random_uuid(), 'name', 'Table and chair sanitization', 'detail', '32 seats', 'qty', 1, 'unitPrice', 75, 'discount', 0),
        jsonb_build_object('id', gen_random_uuid(), 'name', 'Floor mopping and buffing', 'detail', '', 'qty', 1, 'unitPrice', 60, 'discount', 5)
      )
    )
  );

  insert into billing_documents (
    doc_type, doc_number, doc_title, client_name, client_email, client_address, client_phone,
    issue_date, due_date, items, systems, subtotal, tax_label, tax_rate, tax_amount, total,
    notes, terms, currency, status, show_unit_prices, use_systems
  ) values (
    'invoice', 'INV-' || v_invoice_num, 'Invoice',
    'The Galley Restaurant', 'billing@thegalley.example', '14 Harbor St, Drayton Valley, AB', '780-555-0143',
    current_date, current_date + interval '15 days',
    '[]'::jsonb, v_systems,
    120+90+75+(60*0.95),
    'GST', 5, (120+90+75+(60*0.95)) * 0.05, (120+90+75+(60*0.95)) * 1.05,
    'Monthly deep-clean service for kitchen and dining areas, completed as scheduled. Photos available on request for kitchen hood degreasing.',
    null,
    'CAD', 'pending', true, true
  );

  -- ========================================
  -- 4. INVOICE — long, unit prices HIDDEN, HST tax, spans pages
  -- ========================================
  v_invoice_num := get_next_doc_number('invoice');

  insert into billing_documents (
    doc_type, doc_number, doc_title, client_name, client_email, client_address, client_phone,
    issue_date, due_date, items, systems, subtotal, tax_label, tax_rate, tax_amount, total,
    notes, terms, currency, status, show_unit_prices, use_systems
  )
  select
    'invoice', 'INV-' || v_invoice_num, 'Invoice',
    'Maple Ridge Property Management', 'accounts@mapleridge.example', '500 Maple Ave, Toronto, ON', '416-555-0177',
    current_date, current_date + interval '30 days',
    v_long_invoice_items, '[]'::jsonb,
    sub, 'HST', 13, sub * 0.13, sub * 1.13,
    'Carpet shampooing completed across all 30 units in Building C as part of the quarterly maintenance contract. Two units (14 and 22) required additional stain treatment beyond standard service — no extra charge applied per the service agreement.',
    'Payment due within 30 days of invoice date. Late payments accrue interest at 1.5% per month. This invoice is billed under the quarterly maintenance contract dated on file.',
    'CAD', 'pending', false, false
  from (
    select sum((item->>'unitPrice')::numeric * (item->>'qty')::numeric) as sub
    from jsonb_array_elements(v_long_invoice_items) as item
  ) totals;

  -- ========================================
  -- 5. RECEIPT — short, 1 page, NO notes/terms (tests hide-if-empty)
  -- ========================================
  v_receipt_num := get_next_doc_number('receipt');

  insert into billing_documents (
    doc_type, doc_number, doc_title, client_name, client_email, client_address, client_phone,
    issue_date, items, systems, subtotal, tax_label, tax_rate, tax_amount, total,
    notes, terms, currency, status, show_unit_prices, use_systems
  ) values (
    'receipt', 'REC-' || v_receipt_num, 'Receipt',
    'Northgate Veterinary Clinic', 'office@northgatevet.example', '900 Northgate Dr, Edmonton, AB', '780-555-0188',
    current_date,
    jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'name', 'One-time deep clean', 'detail', 'Reception and exam rooms', 'qty', 1, 'unitPrice', 150, 'discount', 0)
    ),
    '[]'::jsonb,
    150, 'GST', 0, 0, 150,
    null, null,
    'CAD', 'paid', true, false
  );

  -- ========================================
  -- 6. RECEIPT — converted-from-invoice style, Terms only, no tax
  -- ========================================
  v_receipt_num := get_next_doc_number('receipt');

  insert into billing_documents (
    doc_type, doc_number, doc_title, client_name, client_email, client_address, client_phone,
    issue_date, items, systems, subtotal, tax_label, tax_rate, tax_amount, total,
    notes, terms, currency, status, converted_from, show_unit_prices, use_systems
  ) values (
    'receipt', 'REC-' || v_receipt_num, 'Receipt',
    'Pinecrest Daycare Centre', 'finance@pinecrestdaycare.example', '77 Pine St, Drayton Valley, AB', '780-555-0166',
    current_date,
    jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'name', 'Monthly cleaning service', 'detail', 'February contract', 'qty', 1, 'unitPrice', 480, 'discount', 0)
    ),
    '[]'::jsonb,
    480, 'GST', 0, 0, 480,
    null,
    'Payment received in full. This receipt confirms settlement of Invoice INV-1042 — no further balance is owing.',
    'CAD', 'paid', 'INV-1042', true, false
  );

end $$;

-- ============================================
-- Done. You should now see 6 new documents in the Billing tab:
-- 2 Quotes (one short, one spanning multiple pages)
-- 2 Invoices (one grouped by systems, one long with prices hidden)
-- 2 Receipts (one with no notes/terms, one referencing a converted invoice)
-- ============================================
