-- ============================================
-- Migration: Public branding for the login page
--
-- The login page runs BEFORE anyone is authenticated, so it can't read
-- site_settings directly (that table requires auth.role() = 'authenticated'
-- for every column, including the logo — and it also holds payment/bank
-- details that should never be readable anonymously).
--
-- This creates a narrow view exposing ONLY company_name and logo_url,
-- readable by anyone, so the login page can show your logo without
-- opening up the rest of site_settings (email, address, bank details, etc).
-- ============================================

create or replace view public_branding as
select company_name, logo_url
from site_settings
limit 1;

grant select on public_branding to anon;
grant select on public_branding to authenticated;

-- ============================================
-- Done. The login page will now show your logo automatically once one
-- is uploaded in Settings — nothing else from site_settings is exposed.
-- ============================================
