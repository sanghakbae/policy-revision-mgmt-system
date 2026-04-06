import { useEffect, useState } from "react";
import { getDocumentDetail } from "../lib/documentService";
import type { DocumentDetail } from "../types";

interface DocumentViewerProps {
  documentId: string | null;
}

export function DocumentViewer({ documentId }: DocumentViewerProps) {
  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [status, setStatus] = useState("문서를 선택하세요.");

  useEffect(() => {
    if (!documentId) {
      setDocument(null);
      setStatus("문서를 선택하세요.");
      return;
    }

    getDocumentDetail(documentId)
      .then((detail) => {
        setDocument(detail);
        setStatus("문서를 불러왔습니다.");
      })
      .catch((error: Error) => {
        setDocument(null);
        setStatus(error.message);
      });
  }, [documentId]);

  if (!document) {
    return (
      <div className="empty-state">
        <strong>문서 보기</strong>
        <p>{status}</p>
      </div>
    );
  }

  return (
    <div className="stack document-viewer">
      <div className="section-header">
        <h2>{document.title}</h2>
        <p>
          구조화된 장·조·항·호·목 섹션을 기준으로 문서를 검토합니다.
        </p>
      </div>

      <div className="info-card">
        <span className="muted-label">구조화 섹션</span>
        <div className="structured-section-table-wrap">
          {(() => {
            const rows = orderStructuredSections(document.sections)
              .map((section) => ({
                id: section.id,
                content: section.original_text,
                ...toStructuredRow(section),
              }));
            const visibleColumns = getVisibleStructuredColumns(rows);

            return (
          <table className="structured-section-table">
            <thead>
              <tr>
                {visibleColumns.includes("chapter") ? <th className="structured-key-cell">장</th> : null}
                {visibleColumns.includes("article") ? <th className="structured-key-cell">조</th> : null}
                {visibleColumns.includes("paragraph") ? <th className="structured-key-cell">항</th> : null}
                {visibleColumns.includes("item") ? <th className="structured-key-cell">호</th> : null}
                {visibleColumns.includes("subItem") ? <th className="structured-key-cell">목</th> : null}
                <th className="structured-content-cell">내용</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                return (
                  <tr key={row.id}>
                    {visibleColumns.includes("chapter") ? <td className={getStructuredKeyCellClass(row.chapter)}>{row.chapter}</td> : null}
                    {visibleColumns.includes("article") ? <td className={getStructuredKeyCellClass(row.article)}>{row.article}</td> : null}
                    {visibleColumns.includes("paragraph") ? <td className={getStructuredKeyCellClass(row.paragraph)}>{row.paragraph}</td> : null}
                    {visibleColumns.includes("item") ? <td className={getStructuredKeyCellClass(row.item)}>{row.item}</td> : null}
                    {visibleColumns.includes("subItem") ? <td className={getStructuredKeyCellClass(row.subItem)}>{row.subItem}</td> : null}
                    <td className="structured-content-cell">{row.content}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

function toStructuredRow(section: DocumentDetail["sections"][number]) {
  const fallbackLabels = parsePathDisplay(section.path_display);
  const chapter = section.chapter_label ?? fallbackLabels.chapter ?? "";
  const article = section.article_label ?? fallbackLabels.article ?? "";
  const paragraph = section.paragraph_label ?? fallbackLabels.paragraph ?? "";
  const item = section.item_label ?? fallbackLabels.item ?? "";
  const subItem = section.sub_item_label ?? fallbackLabels.subItem ?? "";

  switch (section.hierarchy_type) {
    case "chapter":
      return { chapter, article: "", paragraph: "", item: "", subItem: "" };
    case "article":
      return { chapter: "", article, paragraph: "", item: "", subItem: "" };
    case "paragraph":
      return { chapter: "", article: "", paragraph, item: "", subItem: "" };
    case "item":
      return { chapter: "", article: "", paragraph: "", item, subItem: "" };
    case "sub_item":
      return { chapter: "", article: "", paragraph: "", item: "", subItem };
    case "document":
      return { chapter: "", article: "", paragraph: "", item: "", subItem: "" };
  }
}

function parsePathDisplay(pathDisplay: string) {
  const parts = pathDisplay
    .split(">")
    .map((value) => value.trim())
    .filter(Boolean);

  const row: {
    chapter?: string;
    article?: string;
    paragraph?: string;
    item?: string;
    subItem?: string;
  } = {};

  for (const part of parts) {
    if (part.includes("장")) {
      row.chapter = part;
      continue;
    }

    if (part.includes("조")) {
      row.article = part;
      continue;
    }

    if (/^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/u.test(part)) {
      row.paragraph = part;
      continue;
    }

    if (/^[0-9]+\.$/u.test(part) || /^[0-9]+\)$/u.test(part)) {
      row.item = part;
      continue;
    }

    if (/^[가-힣A-Za-z]\.$/u.test(part)) {
      row.subItem = part;
    }
  }

  return row;
}

function orderStructuredSections(sections: DocumentDetail["sections"]) {
  const structuredSections = sections.filter((section) => section.hierarchy_type !== "document");
  const childrenByParentPath = new Map<string, DocumentDetail["sections"]>();

  for (const section of structuredSections) {
    const parentPath = getParentPath(section.path_display);
    const siblings = childrenByParentPath.get(parentPath) ?? [];
    siblings.push(section);
    childrenByParentPath.set(parentPath, siblings);
  }

  const ordered: DocumentDetail["sections"] = [];

  for (const root of sortSections(childrenByParentPath.get("") ?? [])) {
    traverseSection(root, childrenByParentPath, ordered);
  }

  return ordered;
}

function traverseSection(
  section: DocumentDetail["sections"][number],
  childrenByParentPath: Map<string, DocumentDetail["sections"]>,
  ordered: DocumentDetail["sections"],
) {
  ordered.push(section);

  const children = sortSections(childrenByParentPath.get(section.path_display.trim()) ?? []);
  for (const child of children) {
    traverseSection(child, childrenByParentPath, ordered);
  }
}

function sortSections(sections: DocumentDetail["sections"]) {
  return [...sections].sort((left, right) => {
    const rankDiff = hierarchyTypeRank(left.hierarchy_type) - hierarchyTypeRank(right.hierarchy_type);
    if (rankDiff !== 0) {
      return rankDiff;
    }

    const labelDiff = compareHierarchyLabel(left, right);
    if (labelDiff !== 0) {
      return labelDiff;
    }

    return left.hierarchy_order - right.hierarchy_order;
  });
}

function getParentPath(pathDisplay: string) {
  const parts = pathDisplay
    .split(">")
    .map((value) => value.trim())
    .filter(Boolean);

  return parts.slice(0, -1).join(" > ");
}

function compareHierarchyLabel(
  left: DocumentDetail["sections"][number],
  right: DocumentDetail["sections"][number],
) {
  const leftFallback = parsePathDisplay(left.path_display);
  const rightFallback = parsePathDisplay(right.path_display);

  switch (left.hierarchy_type) {
    case "chapter":
      return parseChapterLabel(left.chapter_label ?? leftFallback.chapter ?? "")
        - parseChapterLabel(right.chapter_label ?? rightFallback.chapter ?? "");
    case "article":
      return parseArticleLabel(left.article_label ?? leftFallback.article ?? "")
        - parseArticleLabel(right.article_label ?? rightFallback.article ?? "");
    case "paragraph":
      return parseCircledLabel(left.paragraph_label ?? leftFallback.paragraph ?? "")
        - parseCircledLabel(right.paragraph_label ?? rightFallback.paragraph ?? "");
    case "item":
      return parseNumericLabel(left.item_label ?? leftFallback.item ?? "")
        - parseNumericLabel(right.item_label ?? rightFallback.item ?? "");
    case "sub_item":
      return parseSubItemLabel(left.sub_item_label ?? leftFallback.subItem ?? "")
        - parseSubItemLabel(right.sub_item_label ?? rightFallback.subItem ?? "");
    case "document":
      return 0;
  }
}

function parseChapterLabel(value: string) {
  const match = value.match(/제\s*([0-9]+)/u);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function parseArticleLabel(value: string) {
  const match = value.match(/제\s*([0-9]+)(?:의([0-9]+))?/u);
  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  const main = Number(match[1]);
  const sub = match[2] ? Number(match[2]) / 1000 : 0;
  return main + sub;
}

function parseCircledLabel(value: string) {
  const labels = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];
  const index = labels.indexOf(value.trim());
  return index >= 0 ? index + 1 : Number.MAX_SAFE_INTEGER;
}

function parseNumericLabel(value: string) {
  const match = value.match(/^([0-9]+)/u);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function parseSubItemLabel(value: string) {
  const labels = "가나다라마바사아자차카타파하abcdefghijklmnopqrstuvwxyz".split("");
  const normalized = value.replace(/\./g, "").trim().toLowerCase();
  const index = labels.indexOf(normalized);
  return index >= 0 ? index + 1 : Number.MAX_SAFE_INTEGER;
}

function hierarchyTypeRank(value: DocumentDetail["sections"][number]["hierarchy_type"]) {
  switch (value) {
    case "chapter":
      return 0;
    case "article":
      return 1;
    case "paragraph":
      return 2;
    case "item":
      return 3;
    case "sub_item":
      return 4;
    case "document":
      return 5;
  }
}

type StructuredRow = {
  id: string;
  chapter: string;
  article: string;
  paragraph: string;
  item: string;
  subItem: string;
  content: string;
};

function getVisibleStructuredColumns(rows: StructuredRow[]) {
  const columns: Array<keyof Omit<StructuredRow, "id" | "content">> = [
    "chapter",
    "article",
    "paragraph",
    "item",
    "subItem",
  ];

  return columns.filter((column) => rows.some((row) => row[column].trim().length > 0));
}

function getStructuredKeyCellClass(value: string) {
  return value.trim().length > 0
    ? "structured-key-cell structured-key-cell-filled"
    : "structured-key-cell";
}
