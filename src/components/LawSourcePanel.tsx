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
  const [urlSourceLink, setUrlSourceLink] = useState("");
  const [urlSourceTitle, setUrlSourceTitle] = useState("");
  const [urlVersionLabel, setUrlVersionLabel] = useState("");
  const [urlEffectiveDate, setUrlEffectiveDate] = useState("");
  const [fileSourceTitle, setFileSourceTitle] = useState("");
  const [fileVersionLabel, setFileVersionLabel] = useState("");
  const [fileEffectiveDate, setFileEffectiveDate] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceLink, setSourceLink] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [versionLabel, setVersionLabel] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [editingLawVersionId, setEditingLawVersionId] = useState<string | null>(null);
  const [isMutatingLawVersionId, setIsMutatingLawVersionId] = useState<string | null>(null);
  const [selectedRegistrationType, setSelectedRegistrationType] = useState<"url" | "file" | null>(
    null,
  );
  const urlLawVersions = lawVersions.filter(
    (lawVersion) => getLawSourceType(lawVersion.source_link) === "url",
  );
  const fileLawVersions = lawVersions.filter(
    (lawVersion) => getLawSourceType(lawVersion.source_link) === "file",
  );
  const selectedSourceType = lawVersions
    .filter((lawVersion) => selectedLawVersionIds.includes(lawVersion.id))
    .map((lawVersion) => getLawSourceType(lawVersion.source_link))[0] ?? null;
  const isUrlBlockDisabled =
    disabled || isRegistering || selectedRegistrationType === "file";
  const isFileBlockDisabled =
    disabled || isRegistering || selectedRegistrationType === "url";
  const isUrlRegistrationDisabled =
    isUrlBlockDisabled;
  const isFileRegistrationDisabled =
    isFileBlockDisabled;

  async function handleEditRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsRegistering(true);

    try {
      if (!editingLawVersionId) {
        return;
      }

      await onUpdateLawSource({
        lawVersionId: editingLawVersionId,
        sourceLink,
        sourceTitle,
        versionLabel,
        effectiveDate,
      });

      setSourceLink("");
      setSourceTitle("");
      setVersionLabel("");
      setEffectiveDate("");
      setEditingLawVersionId(null);
    } finally {
      setIsRegistering(false);
    }
  }

  async function handleUrlRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSelectedRegistrationType("url");
    setIsRegistering(true);

    try {
      await onRegisterLawSource({
        sourceLink: urlSourceLink,
        sourceTitle: urlSourceTitle,
        versionLabel: urlVersionLabel,
        effectiveDate: urlEffectiveDate,
      });
      setUrlSourceLink("");
      setUrlSourceTitle("");
      setUrlVersionLabel("");
      setUrlEffectiveDate("");
    } finally {
      setIsRegistering(false);
    }
  }

  async function handleFileRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSelectedRegistrationType("file");
    const form = event.currentTarget;
    if (!sourceFile) {
      return;
    }

    setIsRegistering(true);

    try {
      await onUploadLawDocument({
        file: sourceFile,
        sourceTitle: fileSourceTitle,
        versionLabel: fileVersionLabel,
        effectiveDate: fileEffectiveDate,
      });
      setSourceFile(null);
      setFileSourceTitle("");
      setFileVersionLabel("");
      setFileEffectiveDate("");
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
    setEditingLawVersionId(lawVersion.id);
    setSourceLink(lawVersion.source_link);
    setSourceTitle(lawVersion.source_title ?? "");
    setVersionLabel(lawVersion.version_label ?? "");
    setEffectiveDate(lawVersion.effective_date ?? "");
    setSourceFile(null);
  }

  function handleCancelEdit() {
    setEditingLawVersionId(null);
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
      {editingLawVersionId ? (
        <form className="stack" onSubmit={handleEditRegister}>
          <div className="info-card">
            <span className="muted-label">법령 수정</span>
            <strong>기존 등록 항목 수정</strong>
            <p className="helper-text">수정은 URL 기반 메타데이터 방식으로 저장합니다.</p>
          </div>
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
          <div className="inline-fields form-action-row">
            <button className="button" type="submit" disabled={disabled || isRegistering}>
              {isRegistering ? "법령 수정 중..." : "법령 수정 저장"}
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
      ) : (
        <>
          <div className="selection-summary-card">
            <span className="muted-label">비교 대상 문서</span>
            <strong>{selectedDocumentCount}건 선택됨</strong>
            <p className="helper-text">
              선택된 정책·지침만 비교합니다. 전체 등록 문서 {documents.length}건
            </p>
          </div>

          <div className="registration-columns">
          <form className={`registration-card ${selectedRegistrationType === "url" ? "active" : ""} ${isUrlBlockDisabled && selectedRegistrationType !== "url" ? "disabled" : ""}`} onSubmit={handleUrlRegister}>
            <button
              type="button"
              className="registration-card-header registration-card-header-button"
              disabled={disabled || isRegistering}
              onClick={() =>
                setSelectedRegistrationType((current) => (current === "url" ? null : "url"))
              }
            >
              <span className="registration-launch-label">URL 등록</span>
              <strong>법령 URL로 본문 수집</strong>
              <p className="helper-text">
                law.go.kr 등 허용된 주소에서 원문을 가져와 구조화합니다.
              </p>
            </button>
            <fieldset className="registration-card-fields" disabled={isUrlRegistrationDisabled}>
            <label className="field">
              <span>법령 URL</span>
              <input
                value={urlSourceLink}
                onChange={(event) => setUrlSourceLink(event.target.value)}
                placeholder="https://www.law.go.kr/..."
                disabled={isUrlRegistrationDisabled}
              />
            </label>
            <label className="field">
              <span>표시 제목</span>
              <input
                value={urlSourceTitle}
                onChange={(event) => setUrlSourceTitle(event.target.value)}
                placeholder="예: 개인정보보호법"
                disabled={isUrlRegistrationDisabled}
              />
            </label>
            <div className="inline-fields">
              <label className="field">
                <span>버전 라벨</span>
                <input
                  value={urlVersionLabel}
                  onChange={(event) => setUrlVersionLabel(event.target.value)}
                  placeholder="예: 2026-04 개정"
                  disabled={isUrlRegistrationDisabled}
                />
              </label>
              <label className="field">
                <span>시행일</span>
                <input
                  type="date"
                  value={urlEffectiveDate}
                  onChange={(event) => setUrlEffectiveDate(event.target.value)}
                  disabled={isUrlRegistrationDisabled}
                />
              </label>
            </div>
            <button className="button" type="submit" disabled={isUrlRegistrationDisabled}>
              {isRegistering ? "법령 등록 중..." : "법령 URL 등록"}
            </button>
            </fieldset>

            <div className="stack">
              <div className="info-card">
                <strong className="law-count-label">{`현재 등록된 URL: ${urlLawVersions.length}건`}</strong>
              </div>
              {urlLawVersions.length === 0 ? (
                <div className="empty-state compact-empty-state">
                  <strong>등록된 URL 법령이 없습니다.</strong>
                </div>
              ) : (
                <div className="list law-list">
                  {urlLawVersions.map((lawVersion) => renderLawVersionItem({
                    lawVersion,
                    selectedLawVersionIds,
                    selectedSourceType,
                    disabled,
                    isRegistering,
                    isMutatingLawVersionId,
                    onToggleLawVersion,
                    onStartEdit: handleStartEdit,
                    onDelete: handleDelete,
                  }))}
                </div>
              )}
            </div>
          </form>

          <form className={`registration-card ${selectedRegistrationType === "file" ? "active" : ""} ${isFileBlockDisabled && selectedRegistrationType !== "file" ? "disabled" : ""}`} onSubmit={handleFileRegister}>
            <button
              type="button"
              className="registration-card-header registration-card-header-button"
              disabled={disabled || isRegistering}
              onClick={() =>
                setSelectedRegistrationType((current) => (current === "file" ? null : "file"))
              }
            >
              <span className="registration-launch-label">첨부파일 등록</span>
              <strong>파일 업로드로 법령 등록</strong>
              <p className="helper-text">
                보유 중인 텍스트 또는 Word 문서를 바로 비교 대상으로 올립니다.
              </p>
            </button>
            <fieldset className="registration-card-fields" disabled={isFileRegistrationDisabled}>
            <label className="field">
              <span>법령 파일</span>
              <input
                id="law-file"
                name="law-file"
                type="file"
                accept=".txt,.md,.doc,.docx,text/plain,text/markdown,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) => setSourceFile(event.target.files?.[0] ?? null)}
                disabled={isFileRegistrationDisabled}
              />
            </label>
            <label className="field">
              <span>표시 제목</span>
              <input
                value={fileSourceTitle}
                onChange={(event) => setFileSourceTitle(event.target.value)}
                placeholder="예: 개인정보보호법"
                disabled={isFileRegistrationDisabled}
              />
            </label>
            <div className="inline-fields">
              <label className="field">
                <span>버전 라벨</span>
                <input
                  value={fileVersionLabel}
                  onChange={(event) => setFileVersionLabel(event.target.value)}
                  placeholder="예: 2026-04 개정"
                  disabled={isFileRegistrationDisabled}
                />
              </label>
              <label className="field">
                <span>시행일</span>
                <input
                  type="date"
                  value={fileEffectiveDate}
                  onChange={(event) => setFileEffectiveDate(event.target.value)}
                  disabled={isFileRegistrationDisabled}
                />
              </label>
            </div>
            <button className="button" type="submit" disabled={isFileRegistrationDisabled}>
              {isRegistering ? "법령 등록 중..." : "법령 파일 등록"}
            </button>
            </fieldset>
            <div className="stack">
              <div className="info-card">
                <strong className="law-count-label">{`현재 등록된 첨부파일: ${fileLawVersions.length}건`}</strong>
              </div>
              {fileLawVersions.length === 0 ? (
                <div className="empty-state compact-empty-state">
                  <strong>등록된 첨부파일 법령이 없습니다.</strong>
                </div>
              ) : (
                <div className="list law-list">
                  {fileLawVersions.map((lawVersion) => renderLawVersionItem({
                    lawVersion,
                    selectedLawVersionIds,
                    selectedSourceType,
                    disabled,
                    isRegistering,
                    isMutatingLawVersionId,
                    onToggleLawVersion,
                    onStartEdit: handleStartEdit,
                    onDelete: handleDelete,
                  }))}
                </div>
              )}
            </div>
          </form>
          </div>
        </>
      )}

      <div className="stack">
        <button
          className="button secondary comparison-run-button"
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

function renderLawVersionItem(input: {
  lawVersion: LawVersionSummary;
  selectedLawVersionIds: string[];
  selectedSourceType: "url" | "file" | null;
  disabled: boolean;
  isRegistering: boolean;
  isMutatingLawVersionId: string | null;
  onToggleLawVersion: (lawVersionId: string) => void;
  onStartEdit: (lawVersion: LawVersionSummary) => void;
  onDelete: (lawVersionId: string) => void;
}) {
  const lawSourceType = getLawSourceType(input.lawVersion.source_link);
  const isSourceTypeLocked =
    input.selectedSourceType !== null && input.selectedSourceType !== lawSourceType;

  return (
    <div
      key={input.lawVersion.id}
      className={`list-item ${input.selectedLawVersionIds.includes(input.lawVersion.id) ? "selected" : ""}`}
    >
      <div className="list-item-row">
        <div className="stack list-item-copy">
          <div className="law-version-meta-row">
            <span className="muted-label">{formatLawVersionMeta(input.lawVersion)}</span>
            <span className={`law-source-badge ${lawSourceType}`}>
              {lawSourceType === "file" ? "첨부파일" : "URL"}
            </span>
          </div>
          <strong>{input.lawVersion.source_title ?? "법령 원문"}</strong>
          <span className="helper-text">{formatSectionSummary(input.lawVersion.section_count)}</span>
        </div>
        <button
          type="button"
          className={`button select-button ${input.selectedLawVersionIds.includes(input.lawVersion.id) ? "secondary" : ""}`}
          onClick={() => input.onToggleLawVersion(input.lawVersion.id)}
          disabled={isSourceTypeLocked}
        >
          {input.selectedLawVersionIds.includes(input.lawVersion.id) ? "해제" : "선택"}
        </button>
        <button
          type="button"
          className="button ghost select-button"
          disabled={input.disabled || input.isRegistering || input.isMutatingLawVersionId === input.lawVersion.id}
          onClick={() => input.onStartEdit(input.lawVersion)}
        >
          수정
        </button>
        <button
          type="button"
          className="button ghost select-button"
          disabled={input.disabled || input.isRegistering || input.isMutatingLawVersionId === input.lawVersion.id}
          onClick={() => input.onDelete(input.lawVersion.id)}
        >
          {input.isMutatingLawVersionId === input.lawVersion.id ? "삭제 중..." : "삭제"}
        </button>
      </div>
    </div>
  );
}

function getLawSourceType(sourceLink: string) {
  return sourceLink.startsWith("storage://") ? "file" : "url";
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
