import { useEffect, useState } from "react";
import { getDocumentDetail, saveStructuredSections } from "../lib/documentService";
import type { DocumentDetail } from "../types";

interface DocumentViewerProps {
  documentId: string | null;
  refreshKey?: number;
}

export function DocumentViewer({ documentId, refreshKey = 0 }: DocumentViewerProps) {
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
              {rows.map((row) => {
                return (
                  <tr key={row.id}>
                    {visibleColumns.includes("chapter") ? <td className={getStructuredKeyCellClass(row.chapter)}>{row.chapter}</td> : null}
                    {visibleColumns.includes("article") ? <td className={getStructuredKeyCellClass(row.article)}>{row.article}</td> : null}
                    {visibleColumns.includes("paragraph") ? <td className={getStructuredKeyCellClass(row.paragraph)}>{row.paragraph}</td> : null}
                    {visibleColumns.includes("item") ? <td className={getStructuredKeyCellClass(row.item)}>{row.item}</td> : null}
                    {visibleColumns.includes("subItem") ? <td className={getStructuredKeyCellClass(row.subItem)}>{row.subItem}</td> : null}
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
                      ) : normalizeDisplayedSectionContent(row.content)}
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

function applyContentToEditableRow(row: EditableStructuredRow, nextContent: string) {
  const normalizedContent = normalizeDisplayedSectionContent(nextContent);
  const markers = inferHierarchyMarkers(normalizedContent, "", "document");

  return {
    ...row,
    content: normalizedContent,
    chapter: markers.chapter ? "✓" : "",
    article: markers.article ? "✓" : "",
    paragraph: markers.paragraph ? "✓" : "",
    item: markers.item ? "✓" : "",
    subItem: markers.subItem ? "✓" : "",
  };
}

function normalizeDisplayedSectionContent(value: string) {
  return value
    .replace(/제\s*([0-9]+)\s*장/gu, "제$1장")
    .replace(/제\s*([0-9]+(?:의[0-9]+)?)\s*조/gu, "제$1조");
}

function normalizeRevisionDateInput(value: string) {
  return value.replace(/^개정\s*/u, "").trim();
}

function toStructuredRow(section: DocumentDetail["sections"][number]) {
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
  hierarchyType: DocumentDetail["sections"][number]["hierarchy_type"],
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

function orderStructuredSections(sections: DocumentDetail["sections"]) {
  return sortSections(
    sections.filter((section) => section.hierarchy_type !== "document"),
  );
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
