create table if not exists public.policy_security_settings (
  owner_user_id uuid primary key references auth.users (id) on delete cascade,
  allowed_email_domain text not null default 'muhayu.com',
  session_idle_timeout_minutes integer not null default 60,
  updated_at timestamptz not null default now(),
  constraint policy_security_settings_domain_not_empty check (length(trim(allowed_email_domain)) > 0),
  constraint policy_security_settings_timeout_range check (
    session_idle_timeout_minutes between 1 and 1440
  )
);

alter table public.policy_security_settings enable row level security;

drop policy if exists "policy actors can read their security settings" on public.policy_security_settings;
create policy "policy actors can read their security settings"
  on public.policy_security_settings
  for select
  using (owner_user_id = auth.uid());

drop policy if exists "policy actors can insert their security settings" on public.policy_security_settings;
create policy "policy actors can insert their security settings"
  on public.policy_security_settings
  for insert
  with check (owner_user_id = auth.uid());

drop policy if exists "policy actors can update their security settings" on public.policy_security_settings;
create policy "policy actors can update their security settings"
  on public.policy_security_settings
  for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

grant select, insert, update on public.policy_security_settings to authenticated;
