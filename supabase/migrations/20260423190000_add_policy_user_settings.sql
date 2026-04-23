create table if not exists public.policy_user_settings (
  owner_user_id uuid primary key references auth.users (id) on delete cascade,
  openai_api_key text not null default '',
  openai_model text not null default 'gpt-5.2',
  updated_at timestamptz not null default now()
);

alter table public.policy_user_settings enable row level security;

drop policy if exists "policy actors can read their user settings" on public.policy_user_settings;
create policy "policy actors can read their user settings"
  on public.policy_user_settings
  for select
  using (owner_user_id = auth.uid());

drop policy if exists "policy actors can upsert their user settings" on public.policy_user_settings;
create policy "policy actors can upsert their user settings"
  on public.policy_user_settings
  for insert
  with check (owner_user_id = auth.uid());

drop policy if exists "policy actors can update their user settings" on public.policy_user_settings;
create policy "policy actors can update their user settings"
  on public.policy_user_settings
  for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

grant select, insert, update on public.policy_user_settings to authenticated;
