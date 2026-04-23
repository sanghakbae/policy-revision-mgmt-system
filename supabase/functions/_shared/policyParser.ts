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
  lastParagraphNumberByParent: Map<string, number>;
  lastItemNumberByParent: Map<string, number>;
  lastSubItemNumberByParent: Map<string, number>;
}

type StructuredHierarchyType = Exclude<HierarchyType, "document">;

const CHAPTER_PATTERN = /^제\s*([0-9]+)\s*장(?:\s+(.+))?$/u;
const ARTICLE_PATTERN = /^제\s*([0-9]+)\s*조(?:\s*의\s*([0-9]+))?(?:\s*\((.+?)\))?(?=\s|$)/u;
const CIRCLED_PARAGRAPH_PATTERN = /^([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])\s*(.+)$/u;
const DECIMAL_PATTERN = /^([0-9]+)(?:\s*의\s*([0-9]+))?\.(?!\s*[0-9]+\.)\s*(.+)$/u;
const PAREN_ITEM_PATTERN = /^([0-9]+)(?:\s*의\s*([0-9]+))?\)\s*(.+)$/u;
const AMENDED_ITEM_PATTERN = /^([0-9]+)\s*의\s*([0-9]+)\s+(.+)$/u;
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
  let hierarchyOrder = 0;
  const state: ParserState = {
    chapter: null,
    article: null,
    paragraph: null,
    item: null,
    subItem: null,
    currentLeaf: null,
    documentBlock: null,
    lastParagraphNumberByParent: new Map(),
    lastItemNumberByParent: new Map(),
    lastSubItemNumberByParent: new Map(),
  };

  for (const rawLine of rawLines) {
    const line = normalizeHierarchySpacing(rawLine.trim());

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
          hierarchyLabel: `document-${hierarchyOrder + 1}`,
          hierarchyOrder: nextOrder(() => {
            hierarchyOrder += 1;
            return hierarchyOrder;
          }),
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
      hierarchyOrder: nextOrder(() => {
        hierarchyOrder += 1;
        return hierarchyOrder;
      }),
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
    .replace(/\r/g, "\n")
    .replace(/([^\n])\s*([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])/gu, "$1\n$2")
    .split(/\n/u)
    .flatMap(splitInlineSectionTitleMarkers);
}

function splitInlineSectionTitleMarkers(line: string): string[] {
  const normalized = line.trim();
  if (!normalized) {
    return [line];
  }

  return splitBeforeInlineHierarchyMarkers(normalized);
}

function splitBeforeInlineHierarchyMarkers(line: string) {
  const parts: string[] = [];
  let remaining = line;
  const markerPattern = /\s+(?=(?:제\s*[0-9]+\s*조(?:\s*의\s*[0-9]+)?\s*\()|(?:[0-9]+\s*의\s*[0-9]+\.))/u;

  while (remaining) {
    const match = markerPattern.exec(remaining);
    if (!match?.index) {
      parts.push(remaining);
      break;
    }

    const head = remaining.slice(0, match.index).trim();
    if (head) {
      parts.push(head);
    }
    remaining = remaining.slice(match.index).trimStart();
  }

  return parts.length > 0 ? parts : [line];
}

function normalizeHierarchySpacing(value: string) {
  return value
    .replace(/제\s*([0-9]+)\s*장/gu, "제$1장")
    .replace(/제\s*([0-9]+)\s*조(?:\s*의\s*([0-9]+))?/gu, (_match, main: string, sub?: string) => `제${main}조${sub ? `의${sub}` : ""}`);
}

function isDeletedProvisionLine(line: string) {
  const normalized = normalizeText(line);

  if (!normalized.includes("삭제") || !containsDateLikeText(normalized)) {
    return false;
  }

  return (
    /^제\s*[0-9]+\s*조(?:\s*의\s*[0-9]+)?/u.test(normalized) ||
    /^제\s*[0-9]+\s*장/u.test(normalized) ||
    /^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/u.test(normalized) ||
    /^[0-9]+(?:\s*의\s*[0-9]+)?[.)]?/u.test(normalized) ||
    /^[가-힣A-Za-z]\./u.test(normalized)
  );
}

function containsDateLikeText(value: string) {
  return /[12][0-9]{3}\s*\.\s*[0-9]{1,2}\s*\.\s*[0-9]{1,2}\.*/u.test(value);
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

function nextOrder(nextValue: () => number) {
  return nextValue();
}

function buildLabel(type: StructuredHierarchyType, match: RegExpMatchArray) {
  switch (type) {
    case "chapter":
      return `제${match[1]}장`;
    case "article":
      return `제${match[1]}조${match[2] ? `의${match[2]}` : ""}`;
    case "paragraph":
      return `${match[1]}.`;
    case "item":
      return `${match[1]}${match[2] ? `의${match[2]}` : ""})`;
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
    const label = buildLabel("article", articleMatch);
    const hasExplicitArticleTitle = Boolean(articleMatch[3]);
    if (!hasExplicitArticleTitle && !isExpectedArticleTransition(state.article?.hierarchyLabel ?? null, label)) {
      return null;
    }

    return {
      type: "article",
      label,
    };
  }

  const circledParagraphMatch = line.match(CIRCLED_PARAGRAPH_PATTERN);
  if (circledParagraphMatch) {
    const label = `${circledParagraphMatch[1]}`;
    if (!isExpectedNumberedTransition(
      state.lastParagraphNumberByParent,
      state.article?.tempId ?? state.chapter?.tempId ?? "root",
      parseCircledNumber(label),
    )) {
      return null;
    }

    return {
      type: "paragraph",
      label,
    };
  }

  const decimalMatch = line.match(DECIMAL_PATTERN);
  if (decimalMatch) {
    const type = state.paragraph && isCircledParagraphLabel(state.paragraph.hierarchyLabel)
      ? "item"
      : (!state.paragraph && state.article)
        ? "item"
      : "paragraph";
    const number = parseAmendedNumber(decimalMatch[1], decimalMatch[2]);
    const parentKey = type === "item"
      ? state.paragraph?.tempId ?? state.article?.tempId ?? state.chapter?.tempId ?? "root"
      : state.article?.tempId ?? state.chapter?.tempId ?? "root";
    const tracker = type === "item"
      ? state.lastItemNumberByParent
      : state.lastParagraphNumberByParent;
    if (!isExpectedNumberedTransition(tracker, parentKey, number)) {
      return null;
    }

    return {
      type,
      label: `${decimalMatch[1]}${decimalMatch[2] ? `의${decimalMatch[2]}` : ""}.`,
    };
  }

  const parenItemMatch = line.match(PAREN_ITEM_PATTERN);
  if (parenItemMatch) {
    const number = parseAmendedNumber(parenItemMatch[1], parenItemMatch[2]);
    const parentKey = state.paragraph?.tempId ?? state.article?.tempId ?? state.chapter?.tempId ?? "root";
    if (!isExpectedNumberedTransition(state.lastItemNumberByParent, parentKey, number)) {
      return null;
    }

    return {
      type: "item",
      label: buildLabel("item", parenItemMatch),
    };
  }

  const amendedItemMatch = line.match(AMENDED_ITEM_PATTERN);
  if (amendedItemMatch) {
    const number = parseAmendedNumber(amendedItemMatch[1], amendedItemMatch[2]);
    const parentKey = state.paragraph?.tempId ?? state.article?.tempId ?? state.chapter?.tempId ?? "root";
    if (!isExpectedNumberedTransition(state.lastItemNumberByParent, parentKey, number)) {
      return null;
    }

    return {
      type: "item",
      label: `${amendedItemMatch[1]}의${amendedItemMatch[2]}`,
    };
  }

  const subItemMatch = line.match(SUB_ITEM_PATTERN);
  if (subItemMatch) {
    const parentKey = state.item?.tempId ?? state.paragraph?.tempId ?? state.article?.tempId ?? state.chapter?.tempId ?? "root";
    if (!isExpectedNumberedTransition(state.lastSubItemNumberByParent, parentKey, parseSubItemNumber(subItemMatch[1]))) {
      return null;
    }

    return {
      type: "sub_item",
      label: buildLabel("sub_item", subItemMatch),
    };
  }

  return null;
}

function isExpectedArticleTransition(
  currentLabel: string | null,
  nextLabel: string,
) {
  const next = parseArticleLabelParts(nextLabel);
  if (!next) {
    return true;
  }

  const current = currentLabel ? parseArticleLabelParts(currentLabel) : null;
  if (!current) {
    return true;
  }

  if (next.main === current.main + 1) {
    return true;
  }

  if (next.main === current.main && next.sub === current.sub + 1) {
    return true;
  }

  return false;
}

function isExpectedNumberedTransition(
  tracker: Map<string, number>,
  parentKey: string,
  nextNumber: number | null,
) {
  if (nextNumber === null || !Number.isFinite(nextNumber)) {
    return true;
  }

  const currentNumber = tracker.get(parentKey);
  if (typeof currentNumber !== "number") {
    return true;
  }

  const currentMain = Math.floor(currentNumber);
  const nextMain = Math.floor(nextNumber);
  const currentSub = Math.round((currentNumber - currentMain) * 1000);
  const nextSub = Math.round((nextNumber - nextMain) * 1000);

  if (nextMain === currentMain + 1 && nextSub === 0) {
    return true;
  }

  if (nextMain === currentMain && nextSub === currentSub + 1) {
    return true;
  }

  if (nextMain === currentMain && nextSub > currentSub) {
    return true;
  }

  return false;
}

function parseCircledNumber(label: string) {
  const labels = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];
  const index = labels.indexOf(label.trim());
  return index >= 0 ? index + 1 : null;
}

function isCircledParagraphLabel(label: string) {
  return parseCircledNumber(label) !== null;
}

function currentArticleIntroducesItems(article: SectionDraft | null) {
  if (!article) {
    return false;
  }

  return article.lines.some((line) => /각\s*호/u.test(normalizeText(line)));
}

function parseSubItemNumber(label: string) {
  const labels = "가나다라마바사아자차카타파하abcdefghijklmnopqrstuvwxyz".split("");
  const index = labels.indexOf(label.trim().toLowerCase());
  return index >= 0 ? index + 1 : null;
}

function parseArticleLabelParts(label: string) {
  const match = label.match(/^제([0-9]+)조(?:의([0-9]+))?$/u);
  if (!match) {
    return null;
  }

  return {
    main: Number(match[1]),
    sub: match[2] ? Number(match[2]) : 0,
  };
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
      if (state.paragraph) {
        return state.paragraph;
      }

      if (state.article) {
        return state.article;
      }

      return requireNearestParent(
        [state.chapter],
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
      state.lastParagraphNumberByParent.set(
        state.article?.tempId ?? state.chapter?.tempId ?? "root",
        parseSectionLabelNumber(section.hierarchyLabel, "paragraph") ?? section.hierarchyOrder,
      );
      break;
    case "item":
      state.item = section;
      state.subItem = null;
      state.lastItemNumberByParent.set(
        state.paragraph?.tempId ?? state.article?.tempId ?? state.chapter?.tempId ?? "root",
        parseSectionLabelNumber(section.hierarchyLabel, "item") ?? section.hierarchyOrder,
      );
      break;
    case "sub_item":
      state.subItem = section;
      state.lastSubItemNumberByParent.set(
        state.item?.tempId ?? state.paragraph?.tempId ?? state.article?.tempId ?? state.chapter?.tempId ?? "root",
        parseSectionLabelNumber(section.hierarchyLabel, "sub_item") ?? section.hierarchyOrder,
      );
      break;
  }

  state.currentLeaf = section;
}

function parseSectionLabelNumber(
  label: string,
  type: "paragraph" | "item" | "sub_item",
) {
  if (type === "paragraph") {
    return parseCircledNumber(label);
  }

  if (type === "sub_item") {
    return parseSubItemNumber(label.replace(/\.$/u, ""));
  }

  const match = label.match(/^([0-9]+)/u);
  const amendedMatch = label.match(/^([0-9]+)(?:의([0-9]+))?/u);
  return amendedMatch ? parseAmendedNumber(amendedMatch[1], amendedMatch[2]) : (match ? Number(match[1]) : null);
}

function parseAmendedNumber(main: string, sub?: string) {
  return Number(main) + (sub ? Number(sub) / 1000 : 0);
}
