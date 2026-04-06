export type HierarchyType =
  | "document"
  | "chapter"
  | "article"
  | "paragraph"
  | "item"
  | "sub_item";

export interface DocumentSummary {
  id: string;
  title: string;
  document_type: string;
  version_number: number;
  version_id?: string;
  created_at: string;
  section_count: number;
}

export interface LawVersionSummary {
  id: string;
  law_source_id: string;
  source_title: string | null;
  source_link: string;
  version_label: string | null;
  effective_date: string | null;
  created_at: string;
  section_count: number;
}

export interface DocumentSectionRecord {
  id: string;
  hierarchy_type: HierarchyType;
  hierarchy_label: string;
  hierarchy_order: number;
  original_text: string;
  path_display: string;
  chapter_label?: string | null;
  chapter_text?: string | null;
  article_label?: string | null;
  article_text?: string | null;
  paragraph_label?: string | null;
  paragraph_text?: string | null;
  item_label?: string | null;
  item_text?: string | null;
  sub_item_label?: string | null;
  sub_item_text?: string | null;
}

export interface DocumentDetail {
  id: string;
  title: string;
  description: string | null;
  document_type: string;
  version_number: number;
  parse_warnings: string[];
  metadata?: {
    title: string | null;
    revisionDate: string | null;
    documentNotes: string[];
  };
  sections: DocumentSectionRecord[];
}

export type DiffType = "ADDITION" | "DELETION" | "MODIFICATION";
export type RevisionStatus =
  | "REQUIRED"
  | "RECOMMENDED"
  | "NOT_REQUIRED"
  | "LOW_CONFIDENCE_REVIEW";

export interface ComparisonRunSummary {
  id: string;
  created_at: string;
  document_id?: string;
  document_version_id?: string;
  law_version_id?: string;
  policy_title: string;
  policy_version_number: number;
  law_title: string;
  law_version_label: string | null;
  law_effective_date: string | null;
  diff_count: number;
  revision_status: RevisionStatus | null;
  revision_confidence: number | null;
  revision_ai_used: boolean | null;
  human_review_required: boolean | null;
}

export interface ComparisonResultRecord {
  id: string;
  affected_path: string;
  hierarchy_type: HierarchyType;
  match_type: string;
  diff_type: DiffType;
  confidence: number;
  before_text: string;
  after_text: string;
  explanation: string;
  reasoning_trace: string[];
  ai_used: boolean;
}

export interface ComparisonReviewDetail {
  id: string;
  created_at: string;
  warning_messages: string[];
  policy_title: string;
  policy_version_number: number;
  policy_raw_text: string;
  law_title: string;
  law_version_label: string | null;
  law_effective_date: string | null;
  law_raw_text: string;
  revision_decision_id: string | null;
  revision_status: RevisionStatus | null;
  revision_rationale: string | null;
  revision_confidence: number | null;
  revision_ai_used: boolean | null;
  human_review_required: boolean | null;
  results: ComparisonResultRecord[];
}

export interface AggregatedComparisonResultRecord extends ComparisonResultRecord {
  comparison_run_id: string;
  policy_title: string;
  law_title: string;
}

export interface ComparisonReviewAggregate {
  run_ids: string[];
  warning_messages: string[];
  policy_titles: string[];
  law_titles: string[];
  revision_statuses: RevisionStatus[];
  results: AggregatedComparisonResultRecord[];
}

export interface AiRevisionGuidanceItem {
  document_id: string;
  document_title: string;
  target_section_path: string;
  law_title: string;
  policy_evidence_paths: string[];
  law_evidence_paths: string[];
  rationale: string;
  confidence: number;
  suggested_action: string;
}

export interface AiRevisionGuidance {
  summary: string;
  additions: AiRevisionGuidanceItem[];
  removals: AiRevisionGuidanceItem[];
  low_confidence_notes: string[];
  model: string | null;
  api_call_count: number;
}
