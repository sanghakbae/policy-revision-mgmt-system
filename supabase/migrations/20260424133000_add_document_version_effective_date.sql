alter table public.policy_document_versions
  add column if not exists effective_date text;

update public.policy_document_versions
set effective_date = regexp_replace(
  (regexp_match(raw_text, '(?m)^\s*(?:개정|시행일?)\s*[:：]?\s*([0-9]{4}\.[0-9]{1,2}\.[0-9]{1,2}\.?)\s*$'))[1],
  '\.$',
  ''
)
where effective_date is null
  and raw_text ~ '(?m)^\s*(?:개정|시행일?)\s*[:：]?\s*[0-9]{4}\.[0-9]{1,2}\.[0-9]{1,2}\.?\s*$';
