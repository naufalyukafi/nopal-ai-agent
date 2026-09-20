-- Enable necessary extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgsodium";

-- 1. Users table (Root Identity)
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint unique not null,
  first_name text,
  username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Email Accounts (Gmail OAuth per user, supports 1 user -> N Gmail)
create table if not exists public.email_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  email text not null,
  encrypted_refresh_token_id uuid, -- Reference to Vault secret
  last_synced_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint unique_user_email unique (user_id, email)
);

-- 3. Categories
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade, -- NULL means default system category
  name text not null,
  created_at timestamptz not null default now()
);

-- 4. Budgets
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  period text not null, -- e.g., '2026-09'
  limit_amount numeric(15, 2) not null check (limit_amount > 0),
  created_at timestamptz not null default now(),
  constraint unique_user_category_period unique (user_id, category_id, period)
);

-- 5. Transactions (Ledger Source of Truth)
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  amount numeric(15, 2) not null,
  category_id uuid references public.categories(id) on delete set null,
  description text,
  source text not null check (source in ('manual', 'gmail')),
  status text not null check (status in ('pending_confirmation', 'confirmed', 'rejected')),
  gmail_message_id text unique, -- Prevents duplicate ingestion
  raw_metadata jsonb,
  transaction_date timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- 6. Agent Runs (Traceability per AI invocation)
create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  input_text text,
  output_text text,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- 7. Tool Calls (Details of functions called during agent run)
create table if not exists public.tool_calls (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid not null references public.agent_runs(id) on delete cascade,
  tool_name text not null,
  input_params jsonb,
  output_result jsonb,
  created_at timestamptz not null default now()
);

-- 8. Audit Logs (Append-only audit trail)
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  actor text not null check (actor in ('user', 'agent', 'system')),
  action text not null,
  entity text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- Basic Indexes for Performance
create index if not exists idx_users_telegram_id on public.users(telegram_id);
create index if not exists idx_transactions_user_date on public.transactions(user_id, transaction_date);
create index if not exists idx_transactions_status on public.transactions(user_id, status);
create index if not exists idx_budgets_user_period on public.budgets(user_id, period);
create index if not exists idx_email_accounts_user on public.email_accounts(user_id);
