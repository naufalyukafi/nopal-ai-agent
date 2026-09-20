-- Add refresh_token column to email_accounts table if not exists
alter table public.email_accounts add column if not exists refresh_token text;
