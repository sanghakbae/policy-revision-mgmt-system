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
  onUpdateLawSource: (input: {
    lawVersionId: string;
    sourceLink: string;
    sourceTitle: string;
    versionLabel: string;
    effectiveDate: string;
  }) => Promise<void>;
  onDeleteLawSource: (lawVersionId: string) => Promise<void>;
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
  onUpdateLawSource,
  onDeleteLawSource,
  onRunComparison,
}: LawSourcePanelProps) {
  const [sourceLink, setSourceLink] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [versionLabel, setVersionLabel] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [editingLawVersionId, setEditingLawVersionId] = useState<string | null>(null);
  const [isMutatingLawVersionId, setIsMutatingLawVersionId] = useState<string | null>(null);

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsRegistering(true);

    try {
      if (editingLawVersionId) {
        await onUpdateLawSource({
          lawVersionId: editingLawVersionId,
          sourceLink,
          sourceTitle,
          versionLabel,
          effectiveDate,
        });
      } else {
        await onRegisterLawSource({
          sourceLink,
          sourceTitle,
          versionLabel,
          effectiveDate,
        });
      }
      setSourceLink("");
      setSourceTitle("");
      setVersionLabel("");
      setEffectiveDate("");
      setEditingLawVersionId(null);
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

  function handleStartEdit(lawVersion: LawVersionSummary) {
    setEditingLawVersionId(lawVersion.id);
    setSourceLink(lawVersion.source_link);
    setSourceTitle(lawVersion.source_title ?? "");
    setVersionLabel(lawVersion.version_label ?? "");
    setEffectiveDate(lawVersion.effective_date ?? "");
  }

  function handleCancelEdit() {
    setEditingLawVersionId(null);
    setSourceLink("");
    setSourceTitle("");
    setVersionLabel("");
    setEffectiveDate("");
  }

  async function handleDelete(lawVersionId: string) {
    setIsMutatingLawVersionId(lawVersionId);
    try {
      await onDeleteLawSource(lawVersionId);
    } finally {
      setIsMutatingLawVersionId(null);
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
          {isRegistering
            ? editingLawVersionId
              ? "법령 수정 중..."
              : "법령 등록 중..."
            : editingLawVersionId
              ? "법령 수정 저장"
              : "법령 URL 등록"}
        </button>
        {editingLawVersionId ? (
          <button
            className="button ghost"
            type="button"
            disabled={disabled || isRegistering}
            onClick={handleCancelEdit}
          >
            수정 취소
          </button>
        ) : null}
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
                  <button
                    type="button"
                    className="button ghost select-button"
                    disabled={disabled || isRegistering || isMutatingLawVersionId === lawVersion.id}
                    onClick={() => handleStartEdit(lawVersion)}
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    className="button ghost select-button"
                    disabled={disabled || isRegistering || isMutatingLawVersionId === lawVersion.id}
                    onClick={() => handleDelete(lawVersion.id)}
                  >
                    {isMutatingLawVersionId === lawVersion.id ? "삭제 중..." : "삭제"}
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
