-- ============================================
-- Backfill: mark invoices as 'paid' if a receipt already references them
-- Run this once after deploying the status-fix code, to catch any
-- Invoice → Receipt conversions that happened BEFORE this fix existed.
-- Safe to re-run — it's a no-op for invoices already marked paid.
-- ============================================

update billing_documents as inv
set status = 'paid'
where inv.doc_type = 'invoice'
  and inv.status != 'paid'
  and exists (
    select 1 from billing_documents as rec
    where rec.doc_type = 'receipt'
      and rec.linked_invoice_id = inv.id
  );

-- Shows which invoices just got updated, for confirmation
select inv.doc_number, inv.client_name, inv.status
from billing_documents inv
where inv.doc_type = 'invoice' and inv.status = 'paid';
