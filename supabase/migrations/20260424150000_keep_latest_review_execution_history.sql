delete from public.policy_review_execution_history
where id not in (
  select id
  from public.policy_review_execution_history
  order by created_at desc, id desc
  limit 1
);
