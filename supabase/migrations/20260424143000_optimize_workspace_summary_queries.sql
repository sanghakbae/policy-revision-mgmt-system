create index if not exists idx_policy_document_versions_latest
  on public.policy_document_versions (document_id, version_number desc, created_at desc);

create index if not exists idx_policy_document_sections_version
  on public.policy_document_sections (document_version_id);

create index if not exists idx_policy_law_versions_created
  on public.policy_law_versions (created_at desc, law_source_id);

create index if not exists idx_policy_law_sections_version
  on public.policy_law_sections (law_version_id);

create index if not exists idx_policy_review_execution_history_owner_created
  on public.policy_review_execution_history (owner_user_id, created_at desc);

create index if not exists idx_policy_workspace_favorites_owner_updated
  on public.policy_workspace_favorites (owner_user_id, updated_at desc);

create or replace view public.policy_document_summary_view
with (security_invoker = true) as
select
  d.id,
  d.title,
  d.document_type,
  d.created_at as document_created_at,
  latest_version.id as version_id,
  coalesce(latest_version.version_number, 0) as version_number,
  coalesce(latest_version.created_at, d.created_at) as created_at,
  latest_version.effective_date,
  coalesce(section_counts.section_count, 0)::integer as section_count
from public.policy_documents d
left join lateral (
  select
    dv.id,
    dv.version_number,
    dv.created_at,
    dv.effective_date
  from public.policy_document_versions dv
  where dv.document_id = d.id
  order by dv.version_number desc, dv.created_at desc
  limit 1
) latest_version on true
left join lateral (
  select count(*) as section_count
  from public.policy_document_sections ds
  where ds.document_version_id = latest_version.id
) section_counts on true;

create or replace view public.policy_law_version_summary_view
with (security_invoker = true) as
select
  lv.id,
  lv.law_source_id,
  ls.source_title,
  ls.source_link,
  lv.version_label,
  lv.effective_date,
  lv.created_at,
  coalesce(section_counts.section_count, 0)::integer as section_count
from public.policy_law_versions lv
join public.policy_law_sources ls on ls.id = lv.law_source_id
left join lateral (
  select count(*) as section_count
  from public.policy_law_sections lsec
  where lsec.law_version_id = lv.id
) section_counts on true;

grant select on public.policy_document_summary_view to authenticated;
grant select on public.policy_law_version_summary_view to authenticated;
