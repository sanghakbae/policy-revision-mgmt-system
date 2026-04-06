import { describe, expect, it } from "vitest";
import {
  buildClassificationInput,
  buildDeterministicNoChangeDecision,
  normalizeRevisionDecision,
  shouldBypassAi,
} from "../../../shared/revisionClassifier";

describe("revisionClassifier", () => {
  it("bypasses AI when the deterministic diff is empty", () => {
    expect(shouldBypassAi({ diffs: [], warnings: [] })).toBe(true);
    expect(buildDeterministicNoChangeDecision()).toMatchObject({
      status: "NOT_REQUIRED",
      humanReviewRequired: false,
    });
  });

  it("builds a compact classification payload from diff results", () => {
    const payload = buildClassificationInput({
      warnings: ["Child-level structural matching failed under parent item::제1조"],
      diffs: [
        {
          id: "diff-1",
          affectedPath: "제1장 > 제1조",
          hierarchyType: "article",
          matchType: "STRUCTURAL_EXACT",
          diffType: "MODIFICATION",
          confidence: 1,
          beforeText: "개정 전",
          afterText: "개정 후",
          explanation: "Text changed.",
          reasoningTrace: ["exact key matched"],
        },
      ],
    });

    expect(payload).toMatchObject({
      totals: {
        modifications: 1,
        warnings: 1,
      },
    });
    expect(payload.diffs[0]).toMatchObject({
      id: "diff-1",
      path: "제1장 > 제1조",
    });
  });

  it("validates and normalizes the AI response schema", () => {
    const result = normalizeRevisionDecision({
      status: "RECOMMENDED",
      explanation: "제1조의 변경이 내부 정책 검토를 요구합니다.",
      confidence: 0.74,
      human_review_required: true,
      cited_diff_ids: ["diff-1"],
    });

    expect(result).toEqual({
      status: "RECOMMENDED",
      explanation: "제1조의 변경이 내부 정책 검토를 요구합니다.",
      confidence: 0.74,
      humanReviewRequired: true,
      citedDiffIds: ["diff-1"],
    });
  });
});
