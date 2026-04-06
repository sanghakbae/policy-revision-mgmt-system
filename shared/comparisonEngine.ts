import type { HierarchyType } from "./policyParser";

export type MatchType = "STRUCTURAL_EXACT" | "STRUCTURAL_FALLBACK" | "UNMATCHED";
export type DiffType = "ADDITION" | "DELETION" | "MODIFICATION";

export interface ComparableSection {
  id: string;
  parentSectionId: string | null;
  hierarchyType: HierarchyType;
  hierarchyLabel: string;
  hierarchyOrder: number;
  normalizedText: string;
  originalText: string;
  pathDisplay: string;
}

export interface StructuredDiffResult {
  sourceSectionId: string | null;
  targetSectionId: string | null;
  affectedHierarchyType: HierarchyType;
  affectedHierarchyLabel: string;
  affectedPath: string;
  matchType: MatchType;
  diffType: DiffType;
  confidence: number;
  beforeText: string;
  afterText: string;
  explanation: string;
  reasoningTrace: string[];
  aiUsed: false;
}

export interface ComparisonRunOutput {
  results: StructuredDiffResult[];
  warnings: string[];
}

export function compareStructuredSections(input: {
  sourceSections: ComparableSection[];
  targetSections: ComparableSection[];
}): ComparisonRunOutput {
  const warnings: string[] = [];
  const results: StructuredDiffResult[] = [];

  const sourceByExactKey = new Map<string, ComparableSection>();
  const targetByExactKey = new Map<string, ComparableSection>();

  for (const section of input.sourceSections) {
    sourceByExactKey.set(buildExactKey(section), section);
  }

  for (const section of input.targetSections) {
    targetByExactKey.set(buildExactKey(section), section);
  }

  const matchedSourceIds = new Set<string>();
  const matchedTargetIds = new Set<string>();

  for (const [key, source] of sourceByExactKey.entries()) {
    const target = targetByExactKey.get(key);

    if (!target) {
      continue;
    }

    matchedSourceIds.add(source.id);
    matchedTargetIds.add(target.id);

    if (source.normalizedText === target.normalizedText) {
      continue;
    }

    results.push({
      sourceSectionId: source.id,
      targetSectionId: target.id,
      affectedHierarchyType: source.hierarchyType,
      affectedHierarchyLabel: source.hierarchyLabel,
      affectedPath: source.pathDisplay,
      matchType: "STRUCTURAL_EXACT",
      diffType: "MODIFICATION",
      confidence: 1,
      beforeText: source.originalText,
      afterText: target.originalText,
      explanation:
        "Structured section matched by hierarchy path, but the preserved text changed.",
      reasoningTrace: [
        `Exact structural key matched: ${key}`,
        "Normalized text differs between source and target sections.",
      ],
      aiUsed: false,
    });
  }

  const unmatchedSource = input.sourceSections.filter(
    (section) => !matchedSourceIds.has(section.id),
  );
  const unmatchedTarget = input.targetSections.filter(
    (section) => !matchedTargetIds.has(section.id),
  );

  emitParentFallbackWarnings(unmatchedSource, unmatchedTarget, warnings);

  for (const source of unmatchedSource) {
    results.push({
      sourceSectionId: source.id,
      targetSectionId: null,
      affectedHierarchyType: source.hierarchyType,
      affectedHierarchyLabel: source.hierarchyLabel,
      affectedPath: source.pathDisplay,
      matchType: "UNMATCHED",
      diffType: "DELETION",
      confidence: 1,
      beforeText: source.originalText,
      afterText: "",
      explanation:
        "No structurally compatible target section was found, so this source section is treated as deleted.",
      reasoningTrace: [
        `No exact structural key match for ${buildExactKey(source)}`,
        `Nearest parent key considered: ${buildFallbackKey(source)}`,
      ],
      aiUsed: false,
    });
  }

  for (const target of input.targetSections) {
    if (matchedTargetIds.has(target.id)) {
      continue;
    }

    results.push({
      sourceSectionId: null,
      targetSectionId: target.id,
      affectedHierarchyType: target.hierarchyType,
      affectedHierarchyLabel: target.hierarchyLabel,
      affectedPath: target.pathDisplay,
      matchType: "UNMATCHED",
      diffType: "ADDITION",
      confidence: 1,
      beforeText: "",
      afterText: target.originalText,
      explanation:
        "No structurally compatible source section was found, so this target section is treated as an addition.",
      reasoningTrace: [
        `No source section matched exact structural key ${buildExactKey(target)}`,
        `No source section matched fallback key ${buildFallbackKey(target)} at hierarchy order ${target.hierarchyOrder}`,
      ],
      aiUsed: false,
    });
  }

  return {
    results: sortResults(results),
    warnings,
  };
}

function emitParentFallbackWarnings(
  unmatchedSource: ComparableSection[],
  unmatchedTarget: ComparableSection[],
  warnings: string[],
) {
  const sourceParentKeys = new Set(unmatchedSource.map(buildFallbackKey));
  const targetParentKeys = new Set(unmatchedTarget.map(buildFallbackKey));

  for (const parentKey of sourceParentKeys) {
    if (!targetParentKeys.has(parentKey)) {
      continue;
    }

    warnings.push(
      `Child-level structural matching failed under parent ${parentKey}; nearest-parent review may be required.`,
    );
  }
}

function buildExactKey(section: ComparableSection) {
  return [
    section.hierarchyType,
    section.pathDisplay || section.hierarchyLabel,
  ].join("::");
}

function buildFallbackKey(section: ComparableSection) {
  const pathParts = section.pathDisplay
    .split(" > ")
    .map((part) => part.trim())
    .filter(Boolean);
  const parentPath = pathParts.slice(0, -1).join(" > ");
  return [section.hierarchyType, parentPath].join("::");
}

function sortResults(results: StructuredDiffResult[]) {
  const diffWeight: Record<DiffType, number> = {
    MODIFICATION: 0,
    ADDITION: 1,
    DELETION: 2,
  };

  return [...results].sort((left, right) => {
    const pathCompare = left.affectedPath.localeCompare(right.affectedPath, "ko");
    if (pathCompare !== 0) {
      return pathCompare;
    }

    return diffWeight[left.diffType] - diffWeight[right.diffType];
  });
}
