import { useState } from "react";
import type { DocumentSummary, LawVersionSummary } from "../types";

interface LawSourcePanelProps {
  documents: DocumentSummary[];
  selectedDocumentCount: number;
  lawVersions: LawVersionSummary[];
  selectedLawVersionIds: string[];
  disabled: boolean;
  onToggleLawVersion: (lawVersionId: string) => void;
  onRegisterLawSource: (input: {
    sourceLink: string;
    sourceTitle: string;
    versionLabel: string;
    effectiveDate: string;
  }) => Promise<void>;
  onRunComparison: () => Promise<void>;
}

export function LawSourcePanel({
  documents,
  selectedDocumentCount,
  lawVersions,
  selectedLawVersionIds,
  disabled,
  onToggleLawVersion,
  onRegisterLawSource,
  onRunComparison,
}: LawSourcePanelProps) {
  const [sourceLink, setSourceLink] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [versionLabel, setVersionLabel] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [isComparing, setIsComparing] = useState(false);

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsRegistering(true);

    try {
      await onRegisterLawSource({
        sourceLink,
        sourceTitle,
        versionLabel,
        effectiveDate,
      });
      setSourceLink("");
      setSourceTitle("");
      setVersionLabel("");
      setEffectiveDate("");
    } finally {
      setIsRegistering(false);
    }
  }

  async function handleRunComparison() {
    setIsComparing(true);

    try {
      await onRunComparison();
    } finally {
      setIsComparing(false);
    }
  }

  return (
    <div className="stack">
      <div className="section-header">
        <h2>법령 URL 등록 · 비교 실행</h2>
        <p>파일 URL이 우선이면 다운로드하고, 아니면 본문을 추출해 구조화한 뒤 비교합니다.</p>
      </div>

      <form className="stack" onSubmit={handleRegister}>
        <label className="field">
          <span>법령 URL</span>
          <input
            value={sourceLink}
            onChange={(event) => setSourceLink(event.target.value)}
            placeholder="https://www.law.go.kr/..."
            disabled={disabled || isRegistering}
          />
        </label>
        <label className="field">
          <span>표시 제목</span>
          <input
            value={sourceTitle}
            onChange={(event) => setSourceTitle(event.target.value)}
            placeholder="예: 개인정보보호법"
            disabled={disabled || isRegistering}
          />
        </label>
        <div className="inline-fields">
          <label className="field">
            <span>버전 라벨</span>
            <input
              value={versionLabel}
              onChange={(event) => setVersionLabel(event.target.value)}
              placeholder="예: 2026-04 개정"
              disabled={disabled || isRegistering}
            />
          </label>
          <label className="field">
            <span>시행일</span>
            <input
              type="date"
              value={effectiveDate}
              onChange={(event) => setEffectiveDate(event.target.value)}
              disabled={disabled || isRegistering}
            />
          </label>
        </div>
        <button className="button" type="submit" disabled={disabled || isRegistering}>
          {isRegistering ? "법령 등록 중..." : "법령 URL 등록"}
        </button>
      </form>

      <div className="stack">
        <div className="info-card">
          <span className="muted-label">비교 대상 문서</span>
          <strong>{selectedDocumentCount}건 선택</strong>
          <p className="helper-text">
            선택된 정책과 지침만 법령과 비교합니다. 전체 등록 문서는 {documents.length}건입니다.
          </p>
        </div>

        {lawVersions.length === 0 ? (
          <div className="empty-state compact-empty-state">
            <strong>등록된 법령이 없습니다.</strong>
            <p>위 URL 등록을 먼저 실행하세요.</p>
          </div>
        ) : (
          <div className="list law-list">
            {lawVersions.map((lawVersion) => (
              <div
                key={lawVersion.id}
                className={`list-item ${selectedLawVersionIds.includes(lawVersion.id) ? "selected" : ""}`}
              >
                <div className="list-item-row">
                  <div className="stack list-item-copy">
                    <span className="muted-label">
                      {lawVersion.version_label ?? "버전 정보 없음"}
                      {lawVersion.effective_date ? ` · ${lawVersion.effective_date}` : ""}
                    </span>
                    <strong>{lawVersion.source_title ?? "법령 원문"}</strong>
                    <span>구조 섹션 {lawVersion.section_count}건 저장됨</span>
                  </div>
                  <button
                    type="button"
                    className={`button select-button ${selectedLawVersionIds.includes(lawVersion.id) ? "secondary" : ""}`}
                    onClick={() => onToggleLawVersion(lawVersion.id)}
                  >
                    {selectedLawVersionIds.includes(lawVersion.id) ? "해제" : "선택"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          className="button secondary"
          type="button"
          disabled={
            disabled ||
            isComparing ||
            selectedDocumentCount === 0 ||
            selectedLawVersionIds.length === 0
          }
          onClick={handleRunComparison}
        >
          {isComparing ? "비교 실행 중..." : "선택 정책·지침과 법령 비교 실행"}
        </button>
      </div>
    </div>
  );
}
