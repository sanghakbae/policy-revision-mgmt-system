import type { ComparisonRunSummary } from "../types";

interface ComparisonRunListProps {
  runs: ComparisonRunSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ComparisonRunList({
  runs,
  selectedId,
  onSelect,
}: ComparisonRunListProps) {
  if (runs.length === 0) {
    return (
      <div className="empty-state">
        <strong>비교 실행 이력이 없습니다.</strong>
        <p>정책과 법령 비교를 실행하면 검토 목록이 채워집니다.</p>
      </div>
    );
  }

  return (
    <div className="list">
      {runs.map((run) => (
        <button
          key={run.id}
          className={`list-item ${run.id === selectedId ? "selected" : ""}`}
          onClick={() => onSelect(run.id)}
          type="button"
        >
          <span className="muted-label">비교 실행</span>
          <strong>{run.policy_title}</strong>
          <span>
            법령: {run.law_title}
            {run.law_version_label ? ` · ${run.law_version_label}` : ""}
          </span>
          <div className="pill-row">
            <span className="pill neutral">변경 {run.diff_count}건</span>
            <span className={`pill ${getStatusTone(run.revision_status)}`}>
              {toRevisionStatusLabel(run.revision_status) ?? "권고 대기"}
            </span>
            {run.revision_confidence !== null ? (
              <span className="pill neutral">
                신뢰도 {Math.round(run.revision_confidence * 100)}%
              </span>
            ) : null}
          </div>
        </button>
      ))}
    </div>
  );
}

function toRevisionStatusLabel(status: ComparisonRunSummary["revision_status"]) {
  switch (status) {
    case "REQUIRED":
      return "개정 필요";
    case "RECOMMENDED":
      return "개정 권장";
    case "NOT_REQUIRED":
      return "개정 불필요";
    case "LOW_CONFIDENCE_REVIEW":
      return "저신뢰 검토 필요";
    default:
      return null;
  }
}

function getStatusTone(status: ComparisonRunSummary["revision_status"]) {
  switch (status) {
    case "REQUIRED":
      return "danger";
    case "RECOMMENDED":
      return "warning";
    case "NOT_REQUIRED":
      return "success";
    case "LOW_CONFIDENCE_REVIEW":
      return "neutral";
    default:
      return "neutral";
  }
}
