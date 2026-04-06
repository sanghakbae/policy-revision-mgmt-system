import type { DiffType, MatchType } from "./comparisonEngine";
import type { HierarchyType } from "./policyParser";

export type RevisionStatus =
  | "REQUIRED"
  | "RECOMMENDED"
  | "NOT_REQUIRED"
  | "LOW_CONFIDENCE_REVIEW";

export interface DiffForClassification {
  id: string;
  affectedPath: string;
  hierarchyType: HierarchyType;
  matchType: MatchType;
  diffType: DiffType;
  confidence: number;
  beforeText: string;
  afterText: string;
  explanation: string;
  reasoningTrace: string[];
}

export interface RevisionDecision {
  status: RevisionStatus;
  explanation: string;
  confidence: number;
  humanReviewRequired: boolean;
  citedDiffIds: string[];
}

export function shouldBypassAi(input: {
  diffs: DiffForClassification[];
  warnings: string[];
}) {
  return input.diffs.length === 0 && input.warnings.length === 0;
}

export function buildClassificationInput(input: {
  diffs: DiffForClassification[];
  warnings: string[];
}) {
  return {
    totals: {
      additions: input.diffs.filter((diff) => diff.diffType === "ADDITION").length,
      deletions: input.diffs.filter((diff) => diff.diffType === "DELETION").length,
      modifications: input.diffs.filter((diff) => diff.diffType === "MODIFICATION")
        .length,
      low_confidence_matches: input.diffs.filter((diff) => diff.confidence < 0.8).length,
      warnings: input.warnings.length,
    },
    warnings: input.warnings.slice(0, 10),
    diffs: input.diffs.slice(0, 25).map((diff) => ({
      id: diff.id,
      path: diff.affectedPath,
      hierarchy_type: diff.hierarchyType,
      match_type: diff.matchType,
      diff_type: diff.diffType,
      confidence: diff.confidence,
      before_text: clipText(diff.beforeText, 400),
      after_text: clipText(diff.afterText, 400),
      explanation: diff.explanation,
      reasoning_trace: diff.reasoningTrace.slice(0, 3),
    })),
  };
}

export function getRevisionDecisionSchema() {
  return {
    name: "revision_decision",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        status: {
          type: "string",
          enum: [
            "REQUIRED",
            "RECOMMENDED",
            "NOT_REQUIRED",
            "LOW_CONFIDENCE_REVIEW",
          ],
        },
        explanation: {
          type: "string",
        },
        confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
        },
        human_review_required: {
          type: "boolean",
        },
        cited_diff_ids: {
          type: "array",
          items: {
            type: "string",
          },
        },
      },
      required: [
        "status",
        "explanation",
        "confidence",
        "human_review_required",
        "cited_diff_ids",
      ],
    },
  };
}

export function normalizeRevisionDecision(raw: unknown): RevisionDecision {
  if (!raw || typeof raw !== "object") {
    throw new Error("AI response was not a JSON object.");
  }

  const candidate = raw as Record<string, unknown>;

  if (
    candidate.status !== "REQUIRED" &&
    candidate.status !== "RECOMMENDED" &&
    candidate.status !== "NOT_REQUIRED" &&
    candidate.status !== "LOW_CONFIDENCE_REVIEW"
  ) {
    throw new Error("AI response contained an invalid revision status.");
  }

  if (
    typeof candidate.explanation !== "string" ||
    candidate.explanation.trim().length === 0
  ) {
    throw new Error("AI response explanation was empty.");
  }

  if (
    typeof candidate.confidence !== "number" ||
    Number.isNaN(candidate.confidence)
  ) {
    throw new Error("AI response confidence was invalid.");
  }

  if (typeof candidate.human_review_required !== "boolean") {
    throw new Error("AI response human_review_required was invalid.");
  }

  if (
    !Array.isArray(candidate.cited_diff_ids) ||
    !candidate.cited_diff_ids.every((value) => typeof value === "string")
  ) {
    throw new Error("AI response cited_diff_ids was invalid.");
  }

  return {
    status: candidate.status,
    explanation: candidate.explanation.trim(),
    confidence: clampConfidence(candidate.confidence),
    humanReviewRequired: candidate.human_review_required,
    citedDiffIds: candidate.cited_diff_ids,
  };
}

export function buildDeterministicNoChangeDecision(): RevisionDecision {
  return {
    status: "NOT_REQUIRED",
    explanation:
      "The deterministic structural comparison found no additions, deletions, or modifications, so no revision is required based on the available evidence.",
    confidence: 1,
    humanReviewRequired: false,
    citedDiffIds: [],
  };
}

function clampConfidence(value: number) {
  return Math.max(0, Math.min(1, value));
}

function clipText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}
