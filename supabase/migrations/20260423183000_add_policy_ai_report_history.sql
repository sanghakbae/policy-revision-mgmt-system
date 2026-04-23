create table if not exists public.policy_ai_report_history (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  selection_summary text not null,
  selection_counts jsonb not null default '{}'::jsonb,
  guidance jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists policy_ai_report_history_owner_created_idx
  on public.policy_ai_report_history (owner_user_id, created_at desc);

alter table public.policy_ai_report_history enable row level security;

drop policy if exists "policy actors can read their ai report history" on public.policy_ai_report_history;
create policy "policy actors can read their ai report history"
  on public.policy_ai_report_history
  for select
  using (owner_user_id = auth.uid());

drop policy if exists "policy actors can create their ai report history" on public.policy_ai_report_history;
create policy "policy actors can create their ai report history"
  on public.policy_ai_report_history
  for insert
  with check (owner_user_id = auth.uid());

drop policy if exists "policy actors can delete their ai report history" on public.policy_ai_report_history;
create policy "policy actors can delete their ai report history"
  on public.policy_ai_report_history
  for delete
  using (owner_user_id = auth.uid());

grant select, insert, delete on public.policy_ai_report_history to authenticated;
