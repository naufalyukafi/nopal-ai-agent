-- Enable pg_cron and pg_net extensions if not already enabled
create extension if not exists "pg_cron";
create extension if not exists "pg_net";

-- Remove any existing job with the same name to prevent duplicates
select cron.unschedule('morning-briefing-daily-05wib')
where exists (
  select 1 from cron.job where jobname = 'morning-briefing-daily-05wib'
);

-- Schedule automated daily morning briefing at 05:00 WIB (which is 22:00 UTC)
select cron.schedule(
  'morning-briefing-daily-05wib',
  '0 22 * * *',
  $$
  select
    net.http_post(
      url:='https://pobbqgnckilmqmrpiaod.supabase.co/functions/v1/telegram-webhook/morning-briefing',
      headers:='{"Content-Type": "application/json"}'::jsonb
    );
  $$
);
