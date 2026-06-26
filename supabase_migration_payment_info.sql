-- ============================================
-- Migration: Payment information (e-Transfer / bank details)
-- Run this in Supabase SQL Editor on an EXISTING project
-- ============================================

alter table site_settings
  add column if not exists etransfer_email text,
  add column if not exists bank_institution text,
  add column if not exists bank_transit text,
  add column if not exists bank_account text;

-- ============================================
-- Done. Go to Settings in the app and fill in whichever payment
-- method(s) you use — fields left blank simply won't appear on
-- generated PDFs.
-- ============================================
