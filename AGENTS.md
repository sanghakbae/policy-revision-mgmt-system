# AGENTS.md

## Objective
Build a policy and guideline revision management service using:
- React + Vite for the frontend
- Supabase for backend services (Auth, Postgres, Storage, Edge Functions)
- OpenAI API for revision analysis and explanation generation

The system must:
- upload current policies and guidelines
- parse documents into hierarchical legal/policy units (장/조/항/호/목)
- store structured content and versions in the database
- ingest revised laws from links or source documents
- compare stored policies/guidelines with revised laws
- determine whether current policies/guidelines should be revised
- explain which sections are affected and why

This is a compliance and revision-support system.
Do not implement features that fabricate legal conclusions, silently alter source text, or hide uncertainty.

---

## Stack Constraints

Frontend:
- React
- Vite
- TypeScript preferred
- Keep UI simple, traceable, and review-friendly

Backend:
- Supabase Auth
- Supabase Postgres
- Supabase Storage
- Supabase Edge Functions for server-side workflows

AI:
- OpenAI API is used only where deterministic logic is insufficient:
  - revision necessity classification
  - explanation generation
  - low-confidence semantic comparison assistance

Do NOT use OpenAI API for:
- raw file storage
- primary structural parsing
- version persistence
- deterministic diff logic

---

## Product Scope

Core capabilities:
- upload current policy/guideline documents
- parse and normalize structured units
- register structured content in database
- register revised laws from links
- maintain document versions
- compare current internal policy/guideline with revised law
- classify whether revision is required
- show affected sections with traceable evidence
- provide human-readable revision guidance

Out of scope:
- legal opinion generation without evidence
- automated rewriting of official policy text without user review
- silent document replacement
- unsupported speculation about legal effect

---

## Core Principles

- Prefer deterministic logic before AI inference
- Prefer structured data over raw text
- Always preserve traceability to original text
- Keep all comparisons explainable
- Make minimal, scoped code changes
- Reuse existing patterns in the repository
- Security, correctness, and auditability are critical

---

## Invariants (MANDATORY)

### Document Structure
- Every uploaded policy/guideline must be parsed into structured hierarchy where possible:
  - chapter (장)
  - article (조)
  - paragraph (항)
  - item (호)
  - sub-item (목)

- Store original raw text and normalized structured units separately
- Never overwrite original source content
- Maintain version history for both internal policy/guideline documents and external law documents

### Comparison
- Do not compare raw text blobs directly as the primary method
- Use structured comparison first
- If structure cannot be matched at child level, fallback to nearest valid parent unit
- Every diff must include:
  - source document/version
  - target document/version
  - affected unit
  - before text
  - after text
  - change type
  - confidence level
  - explanation or reasoning trace

### Legal Update Sources
- Every revised law record must include:
  - source link
  - retrieval timestamp
  - source title if available
  - document version or effective date if available

- Never treat an unverified URL as authoritative without retrieval and persistence of source content

### Revision Guidance
- The system must classify revision status as one of:
  - REQUIRED
  - RECOMMENDED
  - NOT_REQUIRED
  - LOW_CONFIDENCE_REVIEW

- The system must clearly indicate:
  - whether revision is needed
  - which exact sections are affected
  - what changed
  - why the recommendation was made
  - whether AI was used in the decision

### Security and Auditability
- All non-public operations must require authentication
- All resource access must enforce authorization
- All uploads and URLs must be validated server-side
- All important actions must be logged:
  - actor
  - action
  - target document
  - timestamp
  - result

- Never expose service role keys to the frontend
- Never call OpenAI directly from the browser with secret credentials
- OpenAI API calls must be made only from secure backend execution paths such as Supabase Edge Functions or equivalent server-side code

---

## Forbidden Capabilities

Never implement:
- silent modification of official source text
- deletion of revision history without explicit admin workflow
- unsupported legal interpretation presented as fact
- AI-only decisioning without traceable comparison evidence
- client-side storage of privileged secrets
- unrestricted document scraping from arbitrary URLs without validation controls

---

## Architecture Guidance

The system should include these logical modules:

### 1. Frontend (React + Vite)
Responsibilities:
- authentication UI
- document upload UI
- document/version list UI
- structured section viewer
- comparison results UI
- revision guidance UI
- review and confirmation workflows

Guidance:
- prefer React + TypeScript
- keep state management simple
- use typed API responses
- clearly separate source text, diff result, and AI explanation in the UI
- show confidence and uncertainty explicitly

### 2. Supabase Storage
Responsibilities:
- store uploaded original files
- store retrieved law source artifacts if needed
- preserve original source documents for auditability

Guidance:
- use secure bucket policies
- validate file type and size
- do not trust MIME type alone

### 3. Supabase Postgres
Responsibilities:
- document metadata
- document versions
- hierarchical sections
- normalized text units
- comparison results
- revision decisions
- audit logs

Guidance:
- preserve immutable history records
- design schema for traceable version comparison
- keep structured hierarchy explicit rather than embedded only in JSON

### 4. Supabase Edge Functions
Responsibilities:
- secure upload orchestration
- URL ingestion and retrieval workflow
- parsing pipeline execution
- diff execution
- OpenAI API orchestration
- secure response shaping

Guidance:
- perform privileged operations here, not in the client
- validate auth context for every request
- isolate external HTTP fetch logic
- apply SSRF controls for URL ingestion

### 5. Comparison Engine
Responsibilities:
- structured matching
- deterministic diff
- change classification
- fallback matching when structure differs

Guidance:
- deterministic logic first
- semantic similarity only as secondary support
- keep results explainable

### 6. AI Analysis Layer (OpenAI API)
Responsibilities:
- classify revision necessity when deterministic rules are insufficient
- produce concise, traceable explanations
- assist in low-confidence semantic comparison

Guidance:
- send only necessary data
- prefer structured JSON input/output
- require responses to cite affected units from supplied data
- never allow the model to invent unseen clauses
- mark AI-derived outputs distinctly from deterministic outputs

---

## OpenAI Usage Rules

Use OpenAI API for:
- classification of revision necessity
- explanation generation for users
- disambiguation when wording changed but structural mapping exists
- flagging low-confidence cases for human review

Do not use OpenAI API for:
- parsing the base hierarchy as the sole parser
- storing legal truth
- replacing deterministic diff
- making unsupported legal claims

All OpenAI requests must:
- use backend-only secrets
- include only the minimal necessary text
- prefer structured prompt + JSON response schema
- record request purpose and model used
- record whether output affected user-facing recommendation

If AI confidence is low or evidence is weak:
- return LOW_CONFIDENCE_REVIEW
- do not overstate certainty

---

## Suggested Revision Decision Strategy

Use a hybrid approach:

1. Deterministic rules first
- structural additions/deletions
- mandatory wording change detection
- explicit obligation/prohibition term changes
- renamed or relocated clauses with clear mapping

2. OpenAI-assisted classification second
- ambiguous wording shifts
- semantic equivalence questions
- summarization of impact for reviewers

3. Human review escalation
- low-confidence mapping
- unclear authority source
- conflicting evidence
- materially important but ambiguous changes

---

## Data Model Rules

At minimum, model the following entities:

- users
- organizations or workspaces
- documents
- document_versions
- document_sections
- law_sources
- law_versions
- law_sections
- comparison_runs
- comparison_results
- revision_decisions
- audit_logs

Each section record should include:
- id
- document_version_id
- parent_section_id (nullable)
- hierarchy_type
- hierarchy_label
- hierarchy_order
- normalized_text
- original_text
- text_hash

Each comparison result should include:
- comparison_run_id
- source_section_id
- target_section_id
- match_type
- diff_type
- confidence
- before_text
- after_text
- explanation
- ai_used (boolean)

Each revision decision should include:
- comparison_run_id
- status
- rationale
- confidence
- ai_used (boolean)
- human_review_required (boolean)

---

## Parsing Rules

- Primary parsing must be deterministic and testable
- Prefer parser pipeline design over a single large regex
- Use normalization carefully and preserve original text
- If document structure is malformed, store parse warnings
- Never discard unmatched text silently
- Support partial parse with explicit error reporting

---

## Comparison Rules

- Compare at the smallest reliable unit level
- Match sections by structure first, then text similarity
- Detect:
  - additions
  - deletions
  - modifications
  - moves/relocations if supported
  - unmatched sections

- Every comparison must be reproducible from stored inputs
- If semantic support is used, keep deterministic evidence alongside AI explanation

---

## API Rules

- Validate all inputs server-side
- Return structured JSON responses
- Include traceability fields in comparison responses
- Separate raw source text from summarized explanation
- Never expose internal secrets or privileged metadata
- Apply authorization checks to every document, version, run, and result access

Suggested response design:
- status
- data
- warnings
- confidence
- traceability

---

## Frontend Rules

- Clearly distinguish:
  - original policy/guideline text
  - revised law text
  - deterministic diff
  - AI explanation
  - final recommendation

- Display uncertainty and confidence explicitly
- Do not hide parse failures or low-confidence cases
- Provide filters for affected sections, status, and document version
- Prefer review workflows over automatic action flows

---

## Security Rules

- Use Supabase Auth for user authentication
- Enforce row-level security where appropriate
- Keep service-role operations inside trusted backend execution only
- Validate file uploads for type, size, and basic safety
- Treat URL ingestion as SSRF-sensitive
- Restrict network fetch targets if possible
- Log admin operations and sensitive workflows
- Do not embed API keys in frontend source, environment exposure, or client bundle

---

## Development Workflow

Before coding:
1. inspect repository structure
2. read README, docs, schema, and existing utilities
3. identify reusable components and existing Supabase patterns
4. keep changes minimal and scoped

When coding:
1. separate deterministic logic from AI-assisted logic
2. keep parsing, comparison, and explanation modules separate
3. use typed interfaces/schemas
4. preserve auditability and history

After coding:
1. run lint
2. run type checks
3. run tests
4. validate parsing edge cases
5. validate comparison accuracy
6. validate auth/authz
7. update docs when behavior changes

Do not claim completion if:
- parsing fails without explicit handling
- diff output is not traceable
- OpenAI use is not clearly separated
- tests or checks fail

---

## Code Rules

- Prefer TypeScript across frontend and Edge Functions where practical
- Keep functions small and testable
- Avoid hidden side effects
- Do not mix parsing logic with UI logic
- Do not mix deterministic diff with explanation generation
- Favor explicit names over clever abstractions
- Preserve existing repository conventions

---

## Testing Priorities

Highest priority:
- structural parsing accuracy (장/조/항/호/목)
- version persistence correctness
- deterministic diff correctness
- revision status classification boundaries
- auth and authorization
- audit log generation
- URL ingestion validation
- low-confidence fallback handling
- AI response schema validation

Also test:
- malformed documents
- partial structure documents
- duplicate uploads/version handling
- large document performance
- frontend rendering of traceability and uncertainty

---

## Completion Criteria

A task is complete only if:
- uploaded and linked documents can be persisted safely
- parsing is deterministic and traceable
- comparison output is accurate and explainable
- revision decision is justified
- AI-assisted output is clearly labeled
- security and auth constraints are preserved
- tests/lint/type checks pass
- minimal necessary diff was introduced

---

## Notes for Agent

- Do not guess legal meaning
- Do not hallucinate unseen clauses or sources
- Prefer deterministic comparison over semantic inference
- Use OpenAI only where it adds clear value
- If uncertain, return low confidence and recommend review
- Preserve traceability at every stage
