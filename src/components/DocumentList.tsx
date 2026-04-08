import type { DocumentSummary } from "../types";

interface DocumentListProps {
  documents: DocumentSummary[];
  selectedId: string | null;
  checkedIds: string[];
  onSelect: (id: string) => void;
  onDragDocumentStart: (id: string) => void;
  onDragDocumentEnd: () => void;
  onDelete: (document: DocumentSummary) => void;
  onReparse: (document: DocumentSummary) => void;
  deletingDocumentId?: string | null;
  reparsingDocumentId?: string | null;
}

export function DocumentList({
  documents,
  selectedId,
  checkedIds,
  onSelect,
  onDragDocumentStart,
  onDragDocumentEnd,
  onDelete,
  onReparse,
  deletingDocumentId = null,
  reparsingDocumentId = null,
}: DocumentListProps) {
  if (documents.length === 0) {
    return (
      <div className="empty-state">
        <strong>등록된 문서가 없습니다.</strong>
        <p>로그인 후 정책 또는 지침 문서를 업로드하세요.</p>
      </div>
    );
  }

  return (
    <div className="list">
      {documents.map((document) => (
        <div
          key={document.id}
          className={`list-item document-list-item ${getDocumentKindClassName(document.title)} ${checkedIds.includes(document.id) || document.id === selectedId ? "selected" : ""}`}
          onClick={() => onSelect(document.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(document.id);
            }
          }}
          role="button"
          tabIndex={0}
          draggable
          onDragStart={(event) => {
            onDragDocumentStart(document.id);
            event.dataTransfer.clearData();
            event.dataTransfer.setData("application/x-policy-document-id", document.id);
            event.dataTransfer.setData("text/plain", `policy-document:${document.id}`);
            event.dataTransfer.effectAllowed = "copy";
          }}
          onDragEnd={onDragDocumentEnd}
        >
          <div className="list-item-row">
            <div className="stack list-item-copy">
              <div className="document-list-header">
                <strong>{document.title}</strong>
              </div>
              <span className="timestamp">{formatDocumentEffectiveDate(document)}</span>
            </div>
            <button
              type="button"
              className="button ghost select-button"
              draggable={false}
              disabled={reparsingDocumentId === document.id}
              onMouseDown={(event) => {
                event.stopPropagation();
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                onReparse(document);
              }}
            >
              {reparsingDocumentId === document.id ? "재파싱 중..." : "재파싱"}
            </button>
            <button
              type="button"
              className="button ghost select-button"
              draggable={false}
              disabled={deletingDocumentId === document.id}
              onMouseDown={(event) => {
                event.stopPropagation();
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                onDelete(document);
              }}
            >
              {deletingDocumentId === document.id ? "삭제 중..." : "삭제"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatDocumentEffectiveDate(document: DocumentSummary) {
  return document.effective_date
    ? `시행일 ${document.effective_date}`
    : "시행일 미지정";
}

function getDocumentKindClassName(title: string) {
  const normalizedTitle = title.trim();

  if (
    normalizedTitle.includes("법률") ||
    normalizedTitle.includes("법") ||
    normalizedTitle.endsWith("기준")
  ) {
    return "document-kind-law";
  }

  if (normalizedTitle.endsWith("지침")) {
    return "document-kind-guideline";
  }

  if (normalizedTitle.endsWith("정책")) {
    return "document-kind-policy";
  }

  return "document-kind-default";
}
