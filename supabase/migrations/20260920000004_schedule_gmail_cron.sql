-- Enable pg_cron and pg_net extensions
create extension if not exists "pg_cron";
create extension if not exists "pg_net";

-- Schedule automated Gmail sync cron job every 15 minutes
select cron.schedule(
  'gmail-sync-every-15min',
  '*/15 * * * *',
  $$
  select
    net.http_post(
      url:='https://pobbqgnckilmqmrpiaod.supabase.co/functions/v1/gmail-sync/process',
      headers:='{"Content-Type": "application/json"}'::jsonb
    );
  $$
);
