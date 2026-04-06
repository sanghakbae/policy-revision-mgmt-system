export type HierarchyType =
  | "document"
  | "chapter"
  | "article"
  | "paragraph"
  | "item"
  | "sub_item";

export interface ParsedSection {
  tempId: string;
  parentTempId: string | null;
  hierarchyType: HierarchyType;
  hierarchyLabel: string;
  hierarchyOrder: number;
  originalText: string;
  normalizedText: string;
  path: string[];
}

export interface ParseResult {
  sections: ParsedSection[];
  warnings: string[];
  metadata: {
    title: string | null;
    revisionDate: string | null;
    documentNotes: string[];
  };
}

interface SectionDraft {
  tempId: string;
  parentTempId: string | null;
  hierarchyType: HierarchyType;
  hierarchyLabel: string;
  hierarchyOrder: number;
  path: string[];
  lines: string[];
}

interface ParserState {
  chapter: SectionDraft | null;
  article: SectionDraft | null;
  paragraph: SectionDraft | null;
  item: SectionDraft | null;
  subItem: SectionDraft | null;
  currentLeaf: SectionDraft | null;
  documentBlock: SectionDraft | null;
}

type StructuredHierarchyType = Exclude<HierarchyType, "document">;

const CHAPTER_PATTERN = /^제\s*([0-9]+)\s*장(?:\s+(.+))?$/u;
const ARTICLE_PATTERN = /^제\s*([0-9]+(?:의[0-9]+)?)\s*조(?:\s*\((.+)\))?$/u;
const CIRCLED_PARAGRAPH_PATTERN = /^([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])\s*(.+)$/u;
const DECIMAL_PATTERN = /^([0-9]+)\.\s*(.+)$/u;
const PAREN_ITEM_PATTERN = /^([0-9]+)\)\s*(.+)$/u;
const SUB_ITEM_PATTERN = /^([가-힣A-Za-z])\.\s*(.+)$/u;

export function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function parsePolicyText(rawText: string): ParseResult {
  const rawLines = splitIntoLogicalLines(rawText);
  const warnings: string[] = [];
  const metadata = {
    title: null as string | null,
    revisionDate: null as string | null,
    documentNotes: [] as string[],
  };
  const sections: SectionDraft[] = [];
  const orderByType: Record<HierarchyType, number> = {
    document: 0,
    chapter: 0,
    article: 0,
    paragraph: 0,
    item: 0,
    sub_item: 0,
  };
  const state: ParserState = {
    chapter: null,
    article: null,
    paragraph: null,
    item: null,
    subItem: null,
    currentLeaf: null,
    documentBlock: null,
  };

  for (const rawLine of rawLines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const marker = detectMarker(line, state);

    if (!marker) {
      if (state.currentLeaf) {
        state.currentLeaf.lines.push(line);
        continue;
      }

      const metadataMatched = consumeTopLevelMetadata(line, metadata);
      if (!metadataMatched) {
        warnings.push(`Unmatched top-level text preserved as document-level content: "${line}"`);
      }

      if (!state.documentBlock) {
        state.documentBlock = createSectionDraft({
          hierarchyType: "document",
          hierarchyLabel: `document-${orderByType.document + 1}`,
          hierarchyOrder: nextOrder(orderByType, "document"),
          lines: [],
          parentTempId: null,
          path: [],
        });
        sections.push(state.documentBlock);
      }

      state.documentBlock.lines.push(line);
      continue;
    }

    state.documentBlock = null;

    const hierarchyLabel = marker.label;
    const parent = resolveParentSection(state, marker.type, warnings, hierarchyLabel);
    const path = [...(parent?.path ?? []), hierarchyLabel];
    const section = createSectionDraft({
      hierarchyType: marker.type,
      hierarchyLabel,
      hierarchyOrder: nextOrder(orderByType, marker.type),
      lines: [line],
      parentTempId: parent?.tempId ?? null,
      path,
    });

    sections.push(section);
    updateStateForSection(state, section);
  }

  if (sections.length === 0) {
    warnings.push("No structured markers detected. Document stored as raw text only.");
  }

  return {
    sections: sections.map((section) => ({
      tempId: section.tempId,
      parentTempId: section.parentTempId,
      hierarchyType: section.hierarchyType,
      hierarchyLabel: section.hierarchyLabel,
      hierarchyOrder: section.hierarchyOrder,
      originalText: section.lines.join("\n"),
      normalizedText: normalizeText(section.lines.join(" ")),
      path: section.path,
    })),
    warnings,
    metadata,
  };
}

function splitIntoLogicalLines(rawText: string) {
  return rawText
    .replace(/\r\n/g, "\n")
    .replace(/\s+(?=제\s*[0-9]+\s*장)/gu, "\n")
    .replace(/\s+(?=제\s*[0-9]+(?:의[0-9]+)?\s*조)/gu, "\n")
    .replace(/(?<=[^\n])(?=[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])/gu, "\n")
    .split(/\n/u);
}

function consumeTopLevelMetadata(
  line: string,
  metadata: {
    title: string | null;
    revisionDate: string | null;
    documentNotes: string[];
  },
) {
  const normalized = normalizeText(line);

  if (!metadata.title && /정\s*보\s*보\s*안\s*정\s*책/u.test(normalized)) {
    metadata.title = "정보보안 정책";
    metadata.documentNotes.push(line);
    return true;
  }

  if (!metadata.title && normalized.length <= 80) {
    metadata.title = normalized;
    metadata.documentNotes.push(line);
    return true;
  }

  const revisionMatch = normalized.match(/^개정\s*([0-9]{4}\.[0-9]{1,2}\.[0-9]{1,2}\.?)$/u);
  if (!metadata.revisionDate && revisionMatch) {
    metadata.revisionDate = revisionMatch[1].replace(/\.$/u, "");
    metadata.documentNotes.push(line);
    return true;
  }

  return false;
}

function createSectionDraft(input: {
  hierarchyType: HierarchyType;
  hierarchyLabel: string;
  hierarchyOrder: number;
  lines: string[];
  parentTempId: string | null;
  path: string[];
}): SectionDraft {
  return {
    tempId: crypto.randomUUID(),
    parentTempId: input.parentTempId,
    hierarchyType: input.hierarchyType,
    hierarchyLabel: input.hierarchyLabel,
    hierarchyOrder: input.hierarchyOrder,
    path: input.path,
    lines: input.lines,
  };
}

function nextOrder(
  orderByType: Record<HierarchyType, number>,
  type: HierarchyType,
) {
  orderByType[type] += 1;
  return orderByType[type];
}

function buildLabel(type: StructuredHierarchyType, match: RegExpMatchArray) {
  switch (type) {
    case "chapter":
      return `제${match[1]}장`;
    case "article":
      return `제${match[1]}조`;
    case "paragraph":
      return `${match[1]}.`;
    case "item":
      return `${match[1]})`;
    case "sub_item":
      return `${match[1]}.`;
  }
}

function detectMarker(
  line: string,
  state: ParserState,
): { type: StructuredHierarchyType; label: string } | null {
  const chapterMatch = line.match(CHAPTER_PATTERN);
  if (chapterMatch) {
    return {
      type: "chapter",
      label: buildLabel("chapter", chapterMatch),
    };
  }

  const articleMatch = line.match(ARTICLE_PATTERN);
  if (articleMatch) {
    return {
      type: "article",
      label: buildLabel("article", articleMatch),
    };
  }

  const circledParagraphMatch = line.match(CIRCLED_PARAGRAPH_PATTERN);
  if (circledParagraphMatch) {
    return {
      type: "paragraph",
      label: `${circledParagraphMatch[1]}`,
    };
  }

  const decimalMatch = line.match(DECIMAL_PATTERN);
  if (decimalMatch) {
    const type = state.paragraph ? "item" : "paragraph";
    return {
      type,
      label: `${decimalMatch[1]}.`,
    };
  }

  const parenItemMatch = line.match(PAREN_ITEM_PATTERN);
  if (parenItemMatch) {
    return {
      type: "item",
      label: buildLabel("item", parenItemMatch),
    };
  }

  const subItemMatch = line.match(SUB_ITEM_PATTERN);
  if (subItemMatch) {
    return {
      type: "sub_item",
      label: buildLabel("sub_item", subItemMatch),
    };
  }

  return null;
}

function resolveParentSection(
  state: ParserState,
  type: StructuredHierarchyType,
  warnings: string[],
  label: string,
) {
  switch (type) {
    case "chapter":
      return null;
    case "article":
      return state.chapter;
    case "paragraph":
      return requireNearestParent(
        [state.article, state.chapter],
        warnings,
        label,
        "article",
      );
    case "item":
      return requireNearestParent(
        [state.paragraph, state.article, state.chapter],
        warnings,
        label,
        "paragraph",
      );
    case "sub_item":
      return requireNearestParent(
        [state.item, state.paragraph, state.article, state.chapter],
        warnings,
        label,
        "item",
      );
  }
}

function requireNearestParent(
  candidates: Array<SectionDraft | null>,
  warnings: string[],
  label: string,
  expectedParent: StructuredHierarchyType,
) {
  const parent = candidates.find(
    (candidate): candidate is SectionDraft => candidate !== null,
  );

  if (!parent) {
    warnings.push(
      `Section ${label} was parsed without an active ${expectedParent}; stored at the nearest valid parent level.`,
    );
    return null;
  }

  if (parent.hierarchyType !== expectedParent) {
    warnings.push(
      `Section ${label} is missing its expected ${expectedParent} parent; attached to ${parent.hierarchyType} ${parent.hierarchyLabel}.`,
    );
  }

  return parent;
}

function updateStateForSection(state: ParserState, section: SectionDraft) {
  switch (section.hierarchyType) {
    case "document":
      state.documentBlock = section;
      state.currentLeaf = section;
      return;
    case "chapter":
      state.chapter = section;
      state.article = null;
      state.paragraph = null;
      state.item = null;
      state.subItem = null;
      break;
    case "article":
      state.article = section;
      state.paragraph = null;
      state.item = null;
      state.subItem = null;
      break;
    case "paragraph":
      state.paragraph = section;
      state.item = null;
      state.subItem = null;
      break;
    case "item":
      state.item = section;
      state.subItem = null;
      break;
    case "sub_item":
      state.subItem = section;
      break;
  }

  state.currentLeaf = section;
}
