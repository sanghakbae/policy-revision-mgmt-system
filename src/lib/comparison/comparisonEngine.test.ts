import { describe, expect, it } from "vitest";
import {
  compareStructuredSections,
  type ComparableSection,
} from "../../../shared/comparisonEngine";

function section(input: Partial<ComparableSection> & Pick<ComparableSection, "id">): ComparableSection {
  return {
    parentSectionId: null,
    hierarchyType: "article",
    hierarchyLabel: "제1조",
    hierarchyOrder: 1,
    normalizedText: "기본 텍스트",
    originalText: "기본 텍스트",
    pathDisplay: "제1조",
    ...input,
  };
}

describe("compareStructuredSections", () => {
  it("detects structural modifications first", () => {
    const sourceSections = [
      section({
        id: "source-1",
        hierarchyLabel: "제1조",
        pathDisplay: "제1장 > 제1조",
        originalText: "제1조(목적)\n기존 기준",
        normalizedText: "제1조(목적) 기존 기준",
      }),
    ];
    const targetSections = [
      section({
        id: "target-1",
        hierarchyLabel: "제1조",
        pathDisplay: "제1장 > 제1조",
        originalText: "제1조(목적)\n개정 기준",
        normalizedText: "제1조(목적) 개정 기준",
      }),
    ];

    const result = compareStructuredSections({ sourceSections, targetSections });

    expect(result.warnings).toHaveLength(0);
    expect(result.results).toEqual([
      expect.objectContaining({
        diffType: "MODIFICATION",
        matchType: "STRUCTURAL_EXACT",
        sourceSectionId: "source-1",
        targetSectionId: "target-1",
      }),
    ]);
  });

  it("detects additions and deletions when structural keys are unmatched", () => {
    const sourceSections = [
      section({
        id: "source-1",
        hierarchyLabel: "제1조",
        pathDisplay: "제1장 > 제1조",
      }),
    ];
    const targetSections = [
      section({
        id: "target-2",
        hierarchyLabel: "제2조",
        pathDisplay: "제1장 > 제2조",
      }),
    ];

    const result = compareStructuredSections({ sourceSections, targetSections });

    expect(result.results).toEqual([
      expect.objectContaining({
        diffType: "DELETION",
        sourceSectionId: "source-1",
        targetSectionId: null,
      }),
      expect.objectContaining({
        diffType: "ADDITION",
        sourceSectionId: null,
        targetSectionId: "target-2",
      }),
    ]);
  });

  it("keeps unmatched child sections as add/delete and emits parent-level fallback warnings", () => {
    const sourceSections = [
      section({
        id: "source-item-1",
        hierarchyType: "item",
        hierarchyLabel: "1)",
        hierarchyOrder: 1,
        pathDisplay: "제1장 > 제1조 > 1)",
        originalText: "1) 기존 항목",
        normalizedText: "1) 기존 항목",
      }),
    ];
    const targetSections = [
      section({
        id: "target-item-1",
        hierarchyType: "item",
        hierarchyLabel: "2)",
        hierarchyOrder: 2,
        pathDisplay: "제1장 > 제1조 > 2)",
        originalText: "1) 개정 항목",
        normalizedText: "1) 개정 항목",
      }),
    ];

    const result = compareStructuredSections({ sourceSections, targetSections });

    expect(result.results).toEqual([
      expect.objectContaining({
        diffType: "DELETION",
        sourceSectionId: "source-item-1",
        targetSectionId: null,
      }),
      expect.objectContaining({
        diffType: "ADDITION",
        sourceSectionId: null,
        targetSectionId: "target-item-1",
      }),
    ]);
    expect(result.warnings[0]).toContain("nearest-parent review may be required");
  });
});
