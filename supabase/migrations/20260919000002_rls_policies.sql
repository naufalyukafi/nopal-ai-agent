-- Enable Row Level Security (RLS) on all tables

alter table public.users enable row level security;
alter table public.email_accounts enable row level security;
alter table public.categories enable row level security;
alter table public.budgets enable row level security;
alter table public.transactions enable row level security;
alter table public.agent_runs enable row level security;
alter table public.tool_calls enable row level security;
alter table public.audit_logs enable row level security;

-------------------------------------------------------
-- RLS POLICIES FOR USERS
-------------------------------------------------------
create policy "Users can view own profile" on public.users
  for select to authenticated
  using (id = auth.uid());

create policy "Users can update own profile" on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-------------------------------------------------------
-- RLS POLICIES FOR EMAIL ACCOUNTS
-------------------------------------------------------
create policy "Users can view own email accounts" on public.email_accounts
  for select to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own email accounts" on public.email_accounts
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own email accounts" on public.email_accounts
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete own email accounts" on public.email_accounts
  for delete to authenticated
  using (user_id = auth.uid());

-------------------------------------------------------
-- RLS POLICIES FOR CATEGORIES
-------------------------------------------------------
create policy "Users can view own or default categories" on public.categories
  for select to authenticated
  using (user_id = auth.uid() or user_id is null);

create policy "Users can insert own categories" on public.categories
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own categories" on public.categories
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete own categories" on public.categories
  for delete to authenticated
  using (user_id = auth.uid());

-------------------------------------------------------
-- RLS POLICIES FOR BUDGETS
-------------------------------------------------------
create policy "Users can view own budgets" on public.budgets
  for select to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own budgets" on public.budgets
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own budgets" on public.budgets
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete own budgets" on public.budgets
  for delete to authenticated
  using (user_id = auth.uid());

-------------------------------------------------------
-- RLS POLICIES FOR TRANSACTIONS
-------------------------------------------------------
create policy "Users can view own transactions" on public.transactions
  for select to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own transactions" on public.transactions
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own transactions" on public.transactions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete own transactions" on public.transactions
  for delete to authenticated
  using (user_id = auth.uid());

-------------------------------------------------------
-- RLS POLICIES FOR AGENT RUNS & TOOL CALLS
-------------------------------------------------------
create policy "Users can view own agent runs" on public.agent_runs
  for select to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own agent runs" on public.agent_runs
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can view own tool calls" on public.tool_calls
  for select to authenticated
  using (exists (
    select 1 from public.agent_runs
    where agent_runs.id = tool_calls.agent_run_id
    and agent_runs.user_id = auth.uid()
  ));

-------------------------------------------------------
-- RLS POLICIES FOR AUDIT LOGS
-------------------------------------------------------
create policy "Users can view own audit logs" on public.audit_logs
  for select to authenticated
  using (user_id = auth.uid());
