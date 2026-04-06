# Policy and Law Revision Management System

Initial baseline for authenticated policy and guideline intake with deterministic structural parsing and Supabase-backed persistence.

## Scope in this baseline

- React + Vite frontend with Supabase auth
- Upload flow for `.txt` and `.md` policy or guideline files
- Deterministic parsing for `장/조/항/호/목` markers
- Deterministic structural comparison between stored policy sections and law sections
- Supabase Postgres schema for documents, versions, sections, workspaces, and audit logs
- Supabase Storage bucket for original source files
- Supabase Edge Functions for secure registration and structural comparison persistence
- Basic UI for document listing and structured document viewing

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and set:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

3. Configure Google OAuth in Supabase Authentication:

- Enable the `Google` provider in Supabase Authentication.
- Add your local redirect URL, for example `http://127.0.0.1:5173`, to the allowed redirect URLs.
- Register the corresponding Google OAuth client credentials in Supabase.

4. Apply Supabase migration and deploy the function:

```bash
supabase db push
supabase functions deploy register-document
```

5. Run the frontend:

```bash
npm run dev
```

## Architecture notes

- Original uploaded files remain in Supabase Storage.
- `document_versions.raw_text` stores the raw extracted text for auditability.
- `document_sections` stores normalized and original text separately.
- `comparison_results` stores structured additions, deletions, and modifications with traceable before/after text.
- Unmatched lines are not discarded; they are persisted as `document` level sections with warnings.
- The upload and comparison paths use secure Edge Functions so database writes and logging stay server-side.

## Current limitations

- File intake is intentionally limited to plain text and Markdown for deterministic parsing.
- Law ingestion UI and revision decision classification are still separate follow-on tasks.
