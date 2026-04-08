import { useEffect, useState } from "react";
import { getLawDetail } from "../lib/documentService";
import type { LawDetail } from "../types";

interface LawVersionPreviewProps {
  lawVersionId: string | null;
  refreshKey?: number;
}

export function LawVersionPreview({ lawVersionId, refreshKey = 0 }: LawVersionPreviewProps) {
  const [lawDetail, setLawDetail] = useState<LawDetail | null>(null);
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!lawVersionId) {
      setLawDetail(null);
      setStatus("");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setStatus("법령 구조를 불러오는 중입니다...");
    getLawDetail(lawVersionId)
      .then((detail) => {
        setLawDetail(detail);
        setStatus("법령 파싱 결과를 불러왔습니다.");
      })
      .catch((error: Error) => {
        setLawDetail(null);
        setStatus(error.message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [lawVersionId, refreshKey]);

  if (!lawDetail) {
    return status || isLoading ? (
      <div className="empty-state">
        <strong>법령 미리보기</strong>
        <p>{isLoading ? "선택한 법령의 구조와 원문 미리보기를 준비하고 있습니다." : status}</p>
      </div>
    ) : null;
  }

  const rows = sortStructuredRows(
    orderStructuredSections(lawDetail.sections).map((section) => ({
      id: section.id,
      hierarchyOrder: section.hierarchy_order,
      content: section.original_text,
      ...toStructuredRow(section),
    })),
  );
  const visibleColumns = getVisibleStructuredColumns();
  const hasStructuredRows = rows.length > 0;
  const previewText = extractPreviewText(lawDetail.raw_text);

  return (
    <div className="stack document-viewer law-preview">
      <div className="section-header">
        <h2>{lawDetail.source_title ?? "법령 파싱 미리보기"}</h2>
        <p>
          비교 실행 전에 선택한 법령의 구조화된 장·조·항·호·목을 먼저 검토합니다.
        </p>
      </div>

      <div className="info-card">
        <span className="muted-label">구조화 섹션</span>
        {hasStructuredRows ? (
          <div className="structured-section-table-wrap">
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
                {rows.map((row) => (
                  <tr key={row.id}>
                    {visibleColumns.includes("chapter") ? <td className={getStructuredKeyCellClass(row.chapter)}>{row.chapter}</td> : null}
                    {visibleColumns.includes("article") ? <td className={getStructuredKeyCellClass(row.article)}>{row.article}</td> : null}
                    {visibleColumns.includes("paragraph") ? <td className={getStructuredKeyCellClass(row.paragraph)}>{row.paragraph}</td> : null}
                    {visibleColumns.includes("item") ? <td className={getStructuredKeyCellClass(row.item)}>{row.item}</td> : null}
                    {visibleColumns.includes("subItem") ? <td className={getStructuredKeyCellClass(row.subItem)}>{row.subItem}</td> : null}
                    <td className="structured-content-cell">{normalizeDisplayedSectionContent(row.content)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="stack">
            <p className="helper-text">
              장·조·항·호·목 구조를 아직 추출하지 못했습니다. 아래 원문 미리보기로 등록 내용을 먼저 확인하세요.
            </p>
            <pre className="raw-preview">{previewText}</pre>
          </div>
        )}
      </div>

      <div className="info-card">
        <span className="muted-label">선택 법령</span>
        <strong>
          {lawDetail.version_label ?? "버전 미지정"}
          {lawDetail.effective_date ? ` · 시행일 ${lawDetail.effective_date}` : ""}
        </strong>
        <p className="helper-text">
          구조화 섹션 {lawDetail.sections.length}건
        </p>
      </div>
    </div>
  );
}

function normalizeDisplayedSectionContent(value: string) {
  return value
    .replace(/제\s*([0-9]+)\s*장/gu, "제$1장")
    .replace(/제\s*([0-9]+(?:의[0-9]+)?)\s*조/gu, "제$1조");
}

function extractPreviewText(rawText: string) {
  const normalized = rawText.trim();
  if (!normalized) {
    return "원문 내용이 없습니다.";
  }

  const chapterStartIndex = normalized.search(/제\s*1\s*장/u);
  const previewBase = chapterStartIndex >= 0 ? normalized.slice(chapterStartIndex).trim() : normalized;

  if (previewBase.length <= 4000) {
    return previewBase;
  }

  return `${previewBase.slice(0, 4000)}\n\n...`;
}

function toStructuredRow(section: LawDetail["sections"][number]) {
  const markers = inferHierarchyMarkers(
    section.original_text,
    section.path_display,
    section.hierarchy_type,
  );

  return {
    chapter: markers.chapter ? "✓" : "",
    article: markers.article ? "✓" : "",
    paragraph: markers.paragraph ? "✓" : "",
    item: markers.item ? "✓" : "",
    subItem: markers.subItem ? "✓" : "",
  };
}

function inferHierarchyMarkers(
  originalText: string,
  pathDisplay: string,
  hierarchyType: LawDetail["sections"][number]["hierarchy_type"],
) {
  const firstLine = originalText
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean) ?? "";
  const pathParts = pathDisplay
    .split(">")
    .map((value) => value.trim())
    .filter(Boolean);
  const currentPathLabel = pathParts.at(-1) ?? "";

  const hasChapterMarker =
    /^제\s*\d+\s*장/u.test(firstLine) ||
    /^제\s*\d+\s*장/u.test(currentPathLabel);
  const hasArticleMarker =
    /^제\s*\d+(?:의\d+)?\s*조/u.test(firstLine) ||
    /^제\s*\d+(?:의\d+)?\s*조/u.test(currentPathLabel);
  const hasParagraphMarker =
    /^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/u.test(firstLine) ||
    /^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/u.test(currentPathLabel);
  const hasItemMarker =
    /^[0-9]+[.)]/u.test(firstLine) ||
    /^[0-9]+[.)]/u.test(currentPathLabel);
  const hasSubItemMarker =
    /^[가-힣A-Za-z]\./u.test(firstLine) ||
    /^[가-힣A-Za-z]\./u.test(currentPathLabel);

  const explicitType = hasChapterMarker
    ? "chapter"
    : hasArticleMarker
      ? "article"
      : hasItemMarker
        ? "item"
        : hasParagraphMarker
          ? "paragraph"
          : hasSubItemMarker
            ? "sub_item"
            : hierarchyType;

  return {
    chapter: explicitType === "chapter",
    article: explicitType === "article",
    paragraph: explicitType === "paragraph",
    item: explicitType === "item",
    subItem: explicitType === "sub_item",
  };
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

function orderStructuredSections(sections: LawDetail["sections"]) {
  const structuredSections = sections.filter((section) => section.hierarchy_type !== "document");
  const childrenByParentPath = new Map<string, LawDetail["sections"]>();

  for (const section of structuredSections) {
    const parentPath = getParentPath(section.path_display);
    const siblings = childrenByParentPath.get(parentPath) ?? [];
    siblings.push(section);
    childrenByParentPath.set(parentPath, siblings);
  }

  const ordered: LawDetail["sections"] = [];

  for (const root of sortSections(childrenByParentPath.get("") ?? [])) {
    traverseSection(root, childrenByParentPath, ordered);
  }

  return ordered;
}

function traverseSection(
  section: LawDetail["sections"][number],
  childrenByParentPath: Map<string, LawDetail["sections"]>,
  ordered: LawDetail["sections"],
) {
  ordered.push(section);

  const children = sortSections(childrenByParentPath.get(section.path_display.trim()) ?? []);
  for (const child of children) {
    traverseSection(child, childrenByParentPath, ordered);
  }
}

function sortSections(sections: LawDetail["sections"]) {
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
  left: LawDetail["sections"][number],
  right: LawDetail["sections"][number],
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
    default:
      return 0;
  }
}

function hierarchyTypeRank(hierarchyType: LawDetail["sections"][number]["hierarchy_type"]) {
  switch (hierarchyType) {
    case "chapter":
      return 1;
    case "article":
      return 2;
    case "paragraph":
      return 3;
    case "item":
      return 4;
    case "sub_item":
      return 5;
    default:
      return 99;
  }
}

function parseChapterLabel(label: string) {
  const match = label.match(/제\s*(\d+)\s*장/u);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function parseArticleLabel(label: string) {
  const match = label.match(/제\s*(\d+)(?:의\s*(\d+))?\s*조/u);
  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  const main = Number(match[1]);
  const sub = match[2] ? Number(match[2]) / 1000 : 0;
  return main + sub;
}

function parseCircledLabel(label: string) {
  const circledNumbers = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
  const index = circledNumbers.indexOf(label.trim());
  return index >= 0 ? index + 1 : Number.MAX_SAFE_INTEGER;
}

function parseNumericLabel(label: string) {
  const match = label.match(/^(\d+)[.)]/u);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function parseSubItemLabel(label: string) {
  const trimmed = label.trim().replace(/\.$/u, "");
  const korean = "가나다라마바사아자차카타파하";
  const koreanIndex = korean.indexOf(trimmed);
  if (koreanIndex >= 0) {
    return koreanIndex + 1;
  }

  const alphabet = trimmed.toLowerCase();
  if (/^[a-z]$/u.test(alphabet)) {
    return alphabet.charCodeAt(0) - 96;
  }

  return Number.MAX_SAFE_INTEGER;
}

function sortStructuredRows(
  rows: Array<{
    id: string;
    hierarchyOrder: number;
    chapter: string;
    article: string;
    paragraph: string;
    item: string;
    subItem: string;
    content: string;
  }>,
) {
  return [...rows].sort((left, right) => {
    const chapterDiff = parseChapterLabel(left.chapter) - parseChapterLabel(right.chapter);
    if (chapterDiff !== 0) {
      return chapterDiff;
    }

    const articleDiff = parseArticleLabel(left.article) - parseArticleLabel(right.article);
    if (articleDiff !== 0) {
      return articleDiff;
    }

    const paragraphDiff = parseCircledLabel(left.paragraph) - parseCircledLabel(right.paragraph);
    if (paragraphDiff !== 0) {
      return paragraphDiff;
    }

    const itemDiff = parseNumericLabel(left.item) - parseNumericLabel(right.item);
    if (itemDiff !== 0) {
      return itemDiff;
    }

    const subItemDiff = parseSubItemLabel(left.subItem) - parseSubItemLabel(right.subItem);
    if (subItemDiff !== 0) {
      return subItemDiff;
    }

    return left.hierarchyOrder - right.hierarchyOrder;
  });
}

function getVisibleStructuredColumns() {
  return ["chapter", "article", "paragraph", "item", "subItem"] as const;
}

function getStructuredKeyCellClass(value: string) {
  return value ? "structured-key-cell" : "structured-key-cell is-empty";
}
