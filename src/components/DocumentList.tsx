import type { DocumentSummary } from "../types";

interface DocumentListProps {
  documents: DocumentSummary[];
  selectedId: string | null;
  checkedIds: string[];
  onToggleSelect: (id: string) => void;
}

export function DocumentList({
  documents,
  selectedId,
  checkedIds,
  onToggleSelect,
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
        <button
          key={document.id}
          className={`list-item ${checkedIds.includes(document.id) || document.id === selectedId ? "selected" : ""}`}
          onClick={() => onToggleSelect(document.id)}
          type="button"
        >
          <span className="muted-label">
            버전 {document.version_number} · {document.document_type}
          </span>
          <strong>{document.title}</strong>
          <span>구조 섹션 {document.section_count}건 저장됨</span>
          <span className="timestamp">
            업로드 일시 {new Date(document.created_at).toLocaleString("ko-KR")}
          </span>
        </button>
      ))}
    </div>
  );
}
