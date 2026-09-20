-- Enable pgmq and pg_cron extensions
create extension if not exists "pgmq";
create extension if not exists "pg_cron";
create extension if not exists "pg_net";

-- Create pgmq queues for background processing
select pgmq.create('gmail_ingestion_queue');
select pgmq.create('pending_confirmation_queue');

-- Seed Default Categories (Clean Enterprise Level where user_id is NULL)
insert into public.categories (name) values
  ('Makanan & Minuman'),
  ('Transportasi'),
  ('Belanja'),
  ('Tagihan & Utilitas'),
  ('Hiburan & Rekreasi'),
  ('Kesehatan'),
  ('Pendidikan'),
  ('Lain-lain')
on conflict do nothing;
