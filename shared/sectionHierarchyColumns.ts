import type { ParsedSection } from "./policyParser";

export interface SectionHierarchyColumns {
  chapter_label: string | null;
  chapter_text: string | null;
  article_label: string | null;
  article_text: string | null;
  paragraph_label: string | null;
  paragraph_text: string | null;
  item_label: string | null;
  item_text: string | null;
  sub_item_label: string | null;
  sub_item_text: string | null;
}

export function buildSectionHierarchyColumns(
  sections: ParsedSection[],
): Map<string, SectionHierarchyColumns> {
  const sectionById = new Map(sections.map((section) => [section.tempId, section]));
  const columnsById = new Map<string, SectionHierarchyColumns>();

  for (const section of sections) {
    const lineage = collectLineage(section, sectionById);

    columnsById.set(section.tempId, {
      chapter_label: lineage.chapter?.hierarchyLabel ?? null,
      chapter_text: lineage.chapter?.originalText ?? null,
      article_label: lineage.article?.hierarchyLabel ?? null,
      article_text: lineage.article?.originalText ?? null,
      paragraph_label: lineage.paragraph?.hierarchyLabel ?? null,
      paragraph_text: lineage.paragraph?.originalText ?? null,
      item_label: lineage.item?.hierarchyLabel ?? null,
      item_text: lineage.item?.originalText ?? null,
      sub_item_label: lineage.sub_item?.hierarchyLabel ?? null,
      sub_item_text: lineage.sub_item?.originalText ?? null,
    });
  }

  return columnsById;
}

function collectLineage(
  section: ParsedSection,
  sectionById: Map<string, ParsedSection>,
) {
  const lineage: Partial<Record<ParsedSection["hierarchyType"], ParsedSection>> = {};
  let current: ParsedSection | undefined = section;

  while (current) {
    if (current.hierarchyType !== "document" && !lineage[current.hierarchyType]) {
      lineage[current.hierarchyType] = current;
    }

    current = current.parentTempId
      ? sectionById.get(current.parentTempId)
      : undefined;
  }

  return lineage;
}
