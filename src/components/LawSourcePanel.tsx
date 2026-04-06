import { useState } from "react";
import type { DocumentSummary, LawVersionSummary } from "../types";

type RegistrationMode = "url" | "file";

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
  onUploadLawDocument: (input: {
    file: File;
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
  onUploadLawDocument,
  onUpdateLawSource,
  onDeleteLawSource,
  onRunComparison,
}: LawSourcePanelProps) {
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(false);
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>("url");
  const [sourceLink, setSourceLink] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [versionLabel, setVersionLabel] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [editingLawVersionId, setEditingLawVersionId] = useState<string | null>(null);
  const [isMutatingLawVersionId, setIsMutatingLawVersionId] = useState<string | null>(null);

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
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
        if (registrationMode === "file") {
          if (!sourceFile) {
            return;
          }

          await onUploadLawDocument({
            file: sourceFile,
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
      }
      setSourceLink("");
      setSourceTitle("");
      setVersionLabel("");
      setEffectiveDate("");
      setSourceFile(null);
      setEditingLawVersionId(null);
      setIsRegistrationOpen(false);
      setRegistrationMode("url");
      const fileInput = form.elements.namedItem("law-file") as HTMLInputElement | null;
      if (fileInput) {
        fileInput.value = "";
      }
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
    setIsRegistrationOpen(true);
    setEditingLawVersionId(lawVersion.id);
    setRegistrationMode("url");
    setSourceLink(lawVersion.source_link);
    setSourceTitle(lawVersion.source_title ?? "");
    setVersionLabel(lawVersion.version_label ?? "");
    setEffectiveDate(lawVersion.effective_date ?? "");
    setSourceFile(null);
  }

  function handleCancelEdit() {
    setEditingLawVersionId(null);
    setIsRegistrationOpen(false);
    setRegistrationMode("url");
    setSourceLink("");
    setSourceTitle("");
    setVersionLabel("");
    setEffectiveDate("");
    setSourceFile(null);
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
        <h2>법령 등록 · 비교 실행</h2>
        <p>법령 URL 또는 첨부파일에서 본문을 구조화해 비교 대상으로 등록합니다.</p>
      </div>

      {!editingLawVersionId && !isRegistrationOpen ? (
        <div className="registration-launcher" role="group" aria-label="법령 등록 시작">
          <button
            type="button"
            className="registration-launch-card"
            disabled={disabled || isRegistering}
            onClick={() => {
              setRegistrationMode("url");
              setIsRegistrationOpen(true);
            }}
          >
            <span className="registration-launch-label">URL 등록</span>
            <strong>법령 URL로 본문 수집</strong>
            <span className="helper-text">
              law.go.kr 등 허용된 법령 주소에서 원문을 가져와 구조화합니다.
            </span>
          </button>
          <button
            type="button"
            className="registration-launch-card"
            disabled={disabled || isRegistering}
            onClick={() => {
              setRegistrationMode("file");
              setIsRegistrationOpen(true);
            }}
          >
            <span className="registration-launch-label">첨부파일 등록</span>
            <strong>파일 업로드로 법령 등록</strong>
            <span className="helper-text">
              보유 중인 텍스트 또는 Word 문서를 바로 비교 대상으로 올립니다.
            </span>
          </button>
        </div>
      ) : (
        <form className="stack" onSubmit={handleRegister}>
          {!editingLawVersionId ? (
            <div className="segmented-control" role="tablist" aria-label="법령 등록 방식">
              <button
                type="button"
                className={`segment-button ${registrationMode === "url" ? "active" : ""}`}
                disabled={disabled || isRegistering}
                onClick={() => setRegistrationMode("url")}
              >
                URL 등록
              </button>
              <button
                type="button"
                className={`segment-button ${registrationMode === "file" ? "active" : ""}`}
                disabled={disabled || isRegistering}
                onClick={() => setRegistrationMode("file")}
              >
                첨부파일 등록
              </button>
            </div>
          ) : null}

          {registrationMode === "file" && !editingLawVersionId ? (
            <label className="field">
              <span>법령 파일</span>
              <input
                id="law-file"
                name="law-file"
                type="file"
                accept=".txt,.md,.doc,.docx,text/plain,text/markdown,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) => setSourceFile(event.target.files?.[0] ?? null)}
                disabled={disabled || isRegistering}
              />
            </label>
          ) : (
            <label className="field">
              <span>법령 URL</span>
              <input
                value={sourceLink}
                onChange={(event) => setSourceLink(event.target.value)}
                placeholder="https://www.law.go.kr/..."
                disabled={disabled || isRegistering}
              />
            </label>
          )}
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
          <div className="inline-fields form-action-row">
            <button className="button" type="submit" disabled={disabled || isRegistering}>
              {isRegistering
                ? editingLawVersionId
                  ? "법령 수정 중..."
                  : "법령 등록 중..."
                : editingLawVersionId
                  ? "법령 수정 저장"
                  : registrationMode === "file"
                    ? "법령 파일 등록"
                    : "법령 URL 등록"}
            </button>
            <button
              className="button ghost"
              type="button"
              disabled={disabled || isRegistering}
              onClick={handleCancelEdit}
            >
              {editingLawVersionId ? "수정 취소" : "등록 취소"}
            </button>
          </div>
        </form>
      )}

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
                    <div className="law-version-meta-row">
                      <span className="muted-label">
                        {formatLawVersionMeta(lawVersion)}
                      </span>
                      <span className={`law-source-badge ${lawVersion.source_link.startsWith("storage://") ? "file" : "url"}`}>
                        {lawVersion.source_link.startsWith("storage://") ? "첨부파일" : "URL"}
                      </span>
                    </div>
                    <strong>{lawVersion.source_title ?? "법령 원문"}</strong>
                    <span className="helper-text">{formatSectionSummary(lawVersion.section_count)}</span>
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

function formatLawVersionMeta(lawVersion: LawVersionSummary) {
  if (lawVersion.version_label && lawVersion.effective_date) {
    return `${lawVersion.version_label} · 시행일 ${lawVersion.effective_date}`;
  }

  if (lawVersion.version_label) {
    return lawVersion.version_label;
  }

  if (lawVersion.effective_date) {
    return `시행일 ${lawVersion.effective_date}`;
  }

  return "버전 미지정";
}

function formatSectionSummary(sectionCount: number) {
  if (sectionCount <= 1) {
    return `구조 섹션 ${sectionCount}건`;
  }

  return `구조 섹션 ${sectionCount}건 저장됨`;
}
