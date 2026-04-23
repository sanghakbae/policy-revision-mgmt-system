import { useEffect, useState } from "react";
import { getDocumentDetail, saveStructuredSections } from "../lib/documentService";
import type { DocumentDetail } from "../types";

interface DocumentViewerProps {
  documentId: string | null;
  refreshKey?: number;
  onDocumentSaved?: () => Promise<void> | void;
}

export function DocumentViewer({ documentId, refreshKey = 0, onDocumentSaved }: DocumentViewerProps) {
  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [status, setStatus] = useState("문서를 선택하세요.");
  const [isLoading, setIsLoading] = useState(false);
  const [draftRows, setDraftRows] = useState<EditableStructuredRow[]>([]);
  const [draftRevisionDate, setDraftRevisionDate] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!documentId) {
      setDocument(null);
      setStatus("문서를 선택하세요.");
      setIsLoading(false);
      setDraftRows([]);
      setDraftRevisionDate("");
      setIsEditing(false);
      return;
    }

    setIsLoading(true);
    setStatus("문서 구조를 불러오는 중입니다...");
    getDocumentDetail(documentId)
      .then((detail) => {
        setDocument(detail);
        setDraftRows(toEditableRows(detail.sections));
        setDraftRevisionDate(detail.metadata?.revisionDate ?? "");
        setIsEditing(false);
        setStatus("문서를 불러왔습니다.");
      })
      .catch((error: Error) => {
        setDocument(null);
        setStatus(error.message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [documentId, refreshKey]);

  if (!document) {
    return (
      <div className="empty-state">
        <strong>문서 보기</strong>
        <p>{isLoading ? "선택한 문서의 구조와 메타데이터를 준비하고 있습니다." : status}</p>
      </div>
    );
  }

  const currentDocument = document;

  async function handleSaveDraft() {
    if (!currentDocument.version_id) {
      setStatus("최신 문서 버전을 찾지 못해 저장할 수 없습니다.");
      return;
    }

    setIsSaving(true);
    setStatus("구조화 섹션 변경사항을 저장하는 중입니다...");

    try {
      await saveStructuredSections({
        documentId: currentDocument.id,
        versionId: currentDocument.version_id,
        rows: draftRows.map((row) => ({
          content: row.content,
        })),
        metadata: {
          title: currentDocument.metadata?.title ?? currentDocument.title,
          revisionDate: draftRevisionDate,
          documentNotes: currentDocument.metadata?.documentNotes ?? [],
        },
      });

      const refreshed = await getDocumentDetail(currentDocument.id);
      setDocument(refreshed);
      setDraftRows(toEditableRows(refreshed.sections));
      setDraftRevisionDate(refreshed.metadata?.revisionDate ?? "");
      setIsEditing(false);
      setStatus("구조화 섹션 변경사항을 저장했습니다.");
      await onDocumentSaved?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "구조화 섹션 저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleResetDraft() {
    setDraftRows(toEditableRows(currentDocument.sections));
    setDraftRevisionDate(currentDocument.metadata?.revisionDate ?? "");
    setIsEditing(false);
    setStatus("구조화 섹션 편집을 취소했습니다.");
  }

  return (
    <div className="stack document-viewer">
      <div className="section-header inline-header">
        <div>
          <h2>{document.title}</h2>
          <p>
            구조화된 장·조·항·호·목 섹션을 기준으로 문서를 검토합니다.
          </p>
        </div>
        <div className="structured-header-actions">
          <label className="structured-metadata-field structured-metadata-field-inline">
            <span className="muted-label">시행일</span>
            {isEditing ? (
              <input
                type="text"
                value={draftRevisionDate}
                onChange={(event) => {
                  setDraftRevisionDate(normalizeRevisionDateInput(event.target.value));
                }}
                placeholder="예: 2025.10.01"
              />
            ) : (
              <strong>{currentDocument.metadata?.revisionDate ?? "미지정"}</strong>
            )}
          </label>
          <div className="structured-editor-toolbar">
            <button
              type="button"
              className="button ghost structured-toolbar-button"
              onClick={() => {
                setIsEditing(true);
                setStatus("구조화 섹션 편집 모드를 시작했습니다.");
              }}
              disabled={isEditing || isSaving}
            >
              편집
            </button>
            <button
              type="button"
              className="button structured-toolbar-button"
              onClick={handleSaveDraft}
              disabled={!isEditing || isSaving}
            >
              {isSaving ? "저장 중..." : "저장"}
            </button>
            <button
              type="button"
              className="button ghost structured-toolbar-button"
              onClick={handleResetDraft}
              disabled={!isEditing || isSaving}
            >
              취소
            </button>
          </div>
        </div>
      </div>

      <div className={`document-viewer-status ${isSaving ? "is-saving" : ""}`}>
        {status}
      </div>

      <div className="info-card">
        <span className="muted-label">구조화 섹션</span>
        <div className="structured-section-table-wrap">
          {(() => {
            const rows = draftRows;
            const visibleColumns = getVisibleStructuredColumns();

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
              {rows.map((row, index) => {
                const displayRow = rows[index];

                return (
                  <tr key={row.id}>
                    {visibleColumns.includes("chapter") ? <td className={getStructuredKeyCellClass(displayRow.chapter)}>{displayRow.chapter}</td> : null}
                    {visibleColumns.includes("article") ? <td className={getStructuredKeyCellClass(displayRow.article)}>{displayRow.article}</td> : null}
                    {visibleColumns.includes("paragraph") ? <td className={getStructuredKeyCellClass(displayRow.paragraph)}>{displayRow.paragraph}</td> : null}
                    {visibleColumns.includes("item") ? <td className={getStructuredKeyCellClass(displayRow.item)}>{displayRow.item}</td> : null}
                    {visibleColumns.includes("subItem") ? <td className={getStructuredKeyCellClass(displayRow.subItem)}>{displayRow.subItem}</td> : null}
                    <td className="structured-content-cell">
                      {isEditing ? (
                        <div className="structured-content-editor">
                          <div className="structured-content-editor-header">
                            <button
                              type="button"
                              className="button ghost structured-row-delete"
                              onClick={() => {
                                setDraftRows((current) => current.filter((entry) => entry.id !== row.id));
                              }}
                            >
                              행 삭제
                            </button>
                          </div>
                          <textarea
                            value={row.content}
                            onChange={(event) => {
                              const nextContent = event.target.value;
                              setDraftRows((current) => current.map((entry) => {
                                if (entry.id !== row.id) {
                                  return entry;
                                }

                                return applyContentToEditableRow(entry, nextContent);
                              }));
                            }}
                            rows={Math.max(2, row.content.split("\n").length)}
                          />
                        </div>
                      ) : formatStructuredContentForDisplay(row)}
                    </td>
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

type EditableStructuredRow = StructuredRow;

function toEditableRows(sections: DocumentDetail["sections"]) {
  return orderStructuredSections(sections).map((section) => ({
    id: section.id,
    content: normalizeDisplayedSectionContent(section.original_text),
    ...toStructuredRow(section),
  }));
}

function suppressRepeatedStructuredLabels(rows: EditableStructuredRow[]) {
  return rows.map((row, index) => {
    const previous = rows[index - 1];
    if (!previous) {
      return row;
    }

    return {
      ...row,
      chapter: row.chapter && row.chapter === previous.chapter ? "" : row.chapter,
      article: row.article && row.article === previous.article ? "" : row.article,
      paragraph: row.paragraph && row.paragraph === previous.paragraph ? "" : row.paragraph,
      item: row.item && row.item === previous.item ? "" : row.item,
      subItem: row.subItem && row.subItem === previous.subItem ? "" : row.subItem,
    };
  });
}

function applyContentToEditableRow(row: EditableStructuredRow, nextContent: string) {
  const normalizedContent = normalizeDisplayedSectionContent(nextContent);
  const markers = inferHierarchyLabels({
    originalText: normalizedContent,
    pathDisplay: "",
    hierarchyType: "document",
  });

  return {
    ...row,
    content: normalizedContent,
    chapter: markers.chapter,
    article: markers.article,
    paragraph: markers.paragraph,
    item: markers.item,
    subItem: markers.subItem,
  };
}

function normalizeDisplayedSectionContent(value: string) {
  return value
    .replace(/제\s*([0-9]+)\s*장/gu, "제$1장")
    .replace(/제\s*([0-9]+)\s*조(?:\s*의\s*([0-9]+))?/gu, (_match, main: string, sub?: string) => `제${main}조${sub ? `의${sub}` : ""}`);
}

function formatStructuredContentForDisplay(row: EditableStructuredRow) {
  return normalizeDisplayedSectionContent(row.content);
}

function normalizeRevisionDateInput(value: string) {
  return value.replace(/^개정\s*/u, "").trim();
}

function toStructuredRow(section: DocumentDetail["sections"][number]) {
  const fallback = parsePathDisplay(section.path_display);

  return {
    chapter: normalizeDisplayedSectionContent(section.chapter_label ?? fallback.chapter ?? ""),
    article: normalizeDisplayedSectionContent(section.article_label ?? fallback.article ?? ""),
    paragraph: section.paragraph_label ?? fallback.paragraph ?? "",
    item: section.item_label ?? fallback.item ?? "",
    subItem: section.sub_item_label ?? fallback.subItem ?? "",
  };
}

function inferHierarchyLabels(input: {
  originalText: string;
  pathDisplay: string;
  hierarchyType: DocumentDetail["sections"][number]["hierarchy_type"];
  chapterLabel?: string | null;
  articleLabel?: string | null;
  paragraphLabel?: string | null;
  itemLabel?: string | null;
  subItemLabel?: string | null;
}) {
  const firstLine = input.originalText
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean) ?? "";
  const pathParts = input.pathDisplay
    .split(">")
    .map((value) => value.trim())
    .filter(Boolean);
  const currentPathLabel = pathParts.at(-1) ?? "";
  const fallback = parsePathDisplay(input.pathDisplay);
  const lineageLabels = {
    chapter: input.chapterLabel ?? fallback.chapter ?? "",
    article: input.articleLabel ?? fallback.article ?? "",
    paragraph: input.paragraphLabel ?? fallback.paragraph ?? "",
    item: input.itemLabel ?? fallback.item ?? "",
    subItem: input.subItemLabel ?? fallback.subItem ?? "",
  };

  const hasChapterMarker =
    /^제\s*\d+\s*장/u.test(firstLine) ||
    /^제\s*\d+\s*장/u.test(currentPathLabel);
  const hasArticleMarker =
    /^제\s*\d+\s*조(?:\s*의\s*\d+)?/u.test(firstLine) ||
    /^제\s*\d+\s*조(?:\s*의\s*\d+)?/u.test(currentPathLabel);
  const hasParagraphMarker =
    /^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/u.test(firstLine) ||
    /^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/u.test(currentPathLabel);
  const hasItemMarker =
    /^[0-9]+(?:\s*의\s*[0-9]+)?[.)]?/u.test(firstLine) ||
    /^[0-9]+(?:\s*의\s*[0-9]+)?[.)]?/u.test(currentPathLabel);
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
            : input.hierarchyType;

  return {
    chapter: explicitType === "chapter" ? extractLeadingLabel(firstLine, "chapter") || currentPathLabel || lineageLabels.chapter : lineageLabels.chapter,
    article: explicitType === "article" ? extractLeadingLabel(firstLine, "article") || currentPathLabel || lineageLabels.article : lineageLabels.article,
    paragraph: explicitType === "paragraph" ? extractLeadingLabel(firstLine, "paragraph") || currentPathLabel || lineageLabels.paragraph : lineageLabels.paragraph,
    item: explicitType === "item" ? extractLeadingLabel(firstLine, "item") || currentPathLabel || lineageLabels.item : lineageLabels.item,
    subItem: explicitType === "sub_item" ? extractLeadingLabel(firstLine, "sub_item") || currentPathLabel || lineageLabels.subItem : lineageLabels.subItem,
  };
}

function extractLeadingLabel(
  text: string,
  type: Exclude<DocumentDetail["sections"][number]["hierarchy_type"], "document">,
) {
  switch (type) {
    case "chapter": {
      const match = text.match(/^(제\s*\d+\s*장)/u);
      return match ? normalizeDisplayedSectionContent(match[1]) : "";
    }
    case "article": {
      const match = text.match(/^(제\s*\d+\s*조(?:\s*의\s*\d+)?)/u);
      return match ? normalizeDisplayedSectionContent(match[1]) : "";
    }
    case "paragraph": {
      const match = text.match(/^([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])/u);
      return match?.[1] ?? "";
    }
    case "item": {
      const match = text.match(/^([0-9]+(?:\s*의\s*[0-9]+)?[.)]?)/u);
      return match?.[1] ?? "";
    }
    case "sub_item": {
      const match = text.match(/^([가-힣A-Za-z]\.)/u);
      return match?.[1] ?? "";
    }
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

    if (/^[0-9]+(?:\s*의\s*[0-9]+)?[.)]?$/u.test(part)) {
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
  return [...sections]
    .filter((section) => section.hierarchy_type !== "document")
    .sort((left, right) => left.hierarchy_order - right.hierarchy_order);
}

function sortSections(sections: DocumentDetail["sections"]) {
  return [...sections].sort((left, right) => {
    const leftPath = getHierarchySortKey(left);
    const rightPath = getHierarchySortKey(right);

    for (let index = 0; index < leftPath.length; index += 1) {
      const diff = leftPath[index] - rightPath[index];
      if (diff !== 0) {
        return diff;
      }
    }

    return left.hierarchy_order - right.hierarchy_order;
  });
}

function getHierarchySortKey(section: DocumentDetail["sections"][number]) {
  const fallback = parsePathDisplay(section.path_display);
  const chapter = parseChapterLabel(section.chapter_label ?? fallback.chapter ?? "");
  const article = parseArticleLabel(section.article_label ?? fallback.article ?? "");
  const paragraph = parseCircledLabel(section.paragraph_label ?? fallback.paragraph ?? "");
  const item = parseNumericLabel(section.item_label ?? fallback.item ?? "");
  const subItem = parseSubItemLabel(section.sub_item_label ?? fallback.subItem ?? "");

  switch (section.hierarchy_type) {
    case "chapter":
      return [chapter, 0, 0, 0, 0, 0];
    case "article":
      return [chapter, article, 0, 0, 0, 1];
    case "paragraph":
      return [chapter, article, paragraph, 0, 0, 2];
    case "item":
      return [chapter, article, paragraph, item, 0, 3];
    case "sub_item":
      return [chapter, article, paragraph, item, subItem, 4];
    case "document":
      return [Number.MAX_SAFE_INTEGER, 0, 0, 0, 0, 5];
  }
}

function parseChapterLabel(value: string) {
  const match = value.match(/제\s*([0-9]+)/u);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function parseArticleLabel(value: string) {
  const match = value.match(/제\s*([0-9]+)\s*조(?:\s*의\s*([0-9]+))?/u);
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
  const match = value.match(/^([0-9]+)(?:\s*의\s*([0-9]+))?/u);
  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Number(match[1]) + (match[2] ? Number(match[2]) / 1000 : 0);
}

function parseSubItemLabel(value: string) {
  const labels = "가나다라마바사아자차카타파하abcdefghijklmnopqrstuvwxyz".split("");
  const normalized = value.replace(/\./g, "").trim().toLowerCase();
  const index = labels.indexOf(normalized);
  return index >= 0 ? index + 1 : Number.MAX_SAFE_INTEGER;
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

function getVisibleStructuredColumns() {
  return [
    "chapter",
    "article",
    "paragraph",
    "item",
    "subItem",
  ] satisfies Array<keyof Omit<StructuredRow, "id" | "content">>;
}

function getStructuredKeyCellClass(value: string) {
  return value.trim().length > 0
    ? "structured-key-cell structured-key-cell-filled"
    : "structured-key-cell";
}
