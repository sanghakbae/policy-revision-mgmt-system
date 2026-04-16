alter table public.policy_review_execution_history
  add column if not exists result_status text not null default 'pending';

update public.policy_review_execution_history
set result_status = case
  when coalesce(array_length(comparison_run_ids, 1), 0) > 0 then 'comparison_completed'
  else 'pending'
end
where result_status not in ('pending', 'ai_completed', 'comparison_completed')
   or result_status is null;

alter table public.policy_review_execution_history
  drop constraint if exists policy_review_execution_history_result_status_check;

alter table public.policy_review_execution_history
  add constraint policy_review_execution_history_result_status_check
  check (result_status in ('pending', 'ai_completed', 'comparison_completed'));

drop policy if exists "policy actors can update their review execution history" on public.policy_review_execution_history;
create policy "policy actors can update their review execution history"
  on public.policy_review_execution_history
  for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

grant update on public.policy_review_execution_history to authenticated;
