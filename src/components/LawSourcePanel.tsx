import { useEffect, useRef, useState } from "react";
import type { DocumentSummary, LawVersionSummary } from "../types";

type WorkspaceFavoriteOption = {
  id: string;
  name: string;
  updatedAt: string;
};

interface LawSourcePanelProps {
  documents: DocumentSummary[];
  targetDocumentIds: string[];
  referenceDocumentIds: string[];
  draggingDocumentId: string | null;
  lawVersions: LawVersionSummary[];
  selectedLawVersionIds: string[];
  disabled: boolean;
  disabledReason?: string | null;
  onAddLawVersion: (lawVersionId: string) => void;
  onRemoveLawVersion: (lawVersionId: string) => void;
  onDropTargetDocument: (documentId: string) => void;
  onRemoveTargetDocument: (documentId: string) => void;
  onDropReferenceDocument: (documentId: string) => void;
  onRemoveReferenceDocument: (documentId: string) => void;
  onDeleteLawSource: (lawVersionId: string) => Promise<void>;
  onReparseLawSource: (lawVersionId: string) => Promise<void>;
  onRunComparison: () => Promise<void>;
  favorites: WorkspaceFavoriteOption[];
  activeFavoriteId: string | null;
  onSaveFavorite: () => void;
  onApplyFavorite: (favoriteId: string) => void;
  onDeleteFavorite: (favoriteId: string) => void;
}

const POLICY_DRAG_PREFIX = "policy-document:";
const LAW_DRAG_PREFIX = "law-version:";

export function LawSourcePanel({
  documents,
  targetDocumentIds,
  referenceDocumentIds,
  draggingDocumentId,
  lawVersions,
  selectedLawVersionIds,
  disabled,
  disabledReason = null,
  onAddLawVersion,
  onRemoveLawVersion,
  onDropTargetDocument,
  onRemoveTargetDocument,
  onDropReferenceDocument,
  onRemoveReferenceDocument,
  onDeleteLawSource,
  onReparseLawSource,
  onRunComparison,
  favorites,
  activeFavoriteId,
  onSaveFavorite,
  onApplyFavorite,
  onDeleteFavorite,
}: LawSourcePanelProps) {
  const [isComparing, setIsComparing] = useState(false);
  const [isMutatingLawVersionId, setIsMutatingLawVersionId] = useState<string | null>(null);
  const [draggingPolicyDocumentId, setDraggingPolicyDocumentId] = useState<string | null>(null);
  const [isTargetDropActive, setIsTargetDropActive] = useState(false);
  const [isReferenceDropActive, setIsReferenceDropActive] = useState(false);
  const [draggingLawVersionId, setDraggingLawVersionId] = useState<string | null>(null);
  const [selectedFavoriteId, setSelectedFavoriteId] = useState<string>("");
  const lawDropZoneRef = useRef<HTMLDivElement | null>(null);

  const targetDocuments = documents.filter((document) => targetDocumentIds.includes(document.id));
  const referenceDocuments = documents.filter((document) => referenceDocumentIds.includes(document.id));
  const selectedLawVersions = lawVersions.filter((lawVersion) =>
    selectedLawVersionIds.includes(lawVersion.id),
  );
  const availableLawVersions = lawVersions.filter(
    (lawVersion) => !selectedLawVersionIds.includes(lawVersion.id),
  );
  const rightGroupCount = referenceDocuments.length + selectedLawVersions.length;
  const comparisonBlockingReason = getComparisonBlockingReason({
    disabled,
    disabledReason,
    targetCount: targetDocuments.length,
    rightGroupCount,
  });

  useEffect(() => {
    if (activeFavoriteId && favorites.some((favorite) => favorite.id === activeFavoriteId)) {
      setSelectedFavoriteId(activeFavoriteId);
      return;
    }

    setSelectedFavoriteId((current) =>
      current && favorites.some((favorite) => favorite.id === current) ? current : "",
    );
  }, [activeFavoriteId, favorites]);

  async function handleRunComparison() {
    setIsComparing(true);
    try {
      await onRunComparison();
    } finally {
      setIsComparing(false);
    }
  }

  async function handleDelete(lawVersionId: string) {
    setIsMutatingLawVersionId(lawVersionId);
    try {
      await onDeleteLawSource(lawVersionId);
    } finally {
      setIsMutatingLawVersionId(null);
    }
  }

  async function handleReparse(lawVersionId: string) {
    setIsMutatingLawVersionId(lawVersionId);
    try {
      await onReparseLawSource(lawVersionId);
    } finally {
      setIsMutatingLawVersionId(null);
    }
  }

  function extractPolicyDocumentId(event: React.DragEvent<HTMLElement>) {
    const explicit = event.dataTransfer.getData("application/x-policy-document-id");
    if (explicit) {
      return explicit;
    }

    const plainText = event.dataTransfer.getData("text/plain");
    return plainText.startsWith(POLICY_DRAG_PREFIX)
      ? plainText.slice(POLICY_DRAG_PREFIX.length)
      : "";
  }

  function extractLawVersionId(event: React.DragEvent<HTMLElement>) {
    const explicit = event.dataTransfer.getData("application/x-law-version-id");
    if (explicit) {
      return explicit;
    }

    const plainText = event.dataTransfer.getData("text/plain");
    if (plainText.startsWith(LAW_DRAG_PREFIX)) {
      return plainText.slice(LAW_DRAG_PREFIX.length);
    }

    return "";
  }

  function hasPolicyDragPayload(event: React.DragEvent<HTMLElement>) {
    const types = Array.from(event.dataTransfer.types ?? []);
    return (
      types.includes("application/x-policy-document-id") ||
      types.includes("text/plain") ||
      extractPolicyDocumentId(event).length > 0 ||
      draggingPolicyDocumentId !== null ||
      draggingDocumentId !== null
    );
  }

  function hasLawDragPayload(event: React.DragEvent<HTMLElement>) {
    const types = Array.from(event.dataTransfer.types ?? []);
    return (
      types.includes("application/x-law-version-id") ||
      types.includes("text/plain") ||
      extractLawVersionId(event).length > 0 ||
      draggingLawVersionId !== null
    );
  }

  function handlePolicyDragStart(
    event: React.DragEvent<HTMLElement>,
    documentId: string,
  ) {
    setDraggingPolicyDocumentId(documentId);
    event.dataTransfer.clearData();
    event.dataTransfer.setData("application/x-policy-document-id", documentId);
    event.dataTransfer.setData("text/plain", `${POLICY_DRAG_PREFIX}${documentId}`);
    event.dataTransfer.effectAllowed = "copyMove";
  }

  function handleLawDragStart(
    event: React.DragEvent<HTMLElement>,
    lawVersionId: string,
  ) {
    setDraggingLawVersionId(lawVersionId);
    event.dataTransfer.clearData();
    event.dataTransfer.setData("application/x-law-version-id", lawVersionId);
    event.dataTransfer.setData("text/plain", `${LAW_DRAG_PREFIX}${lawVersionId}`);
    event.dataTransfer.effectAllowed = "move";
  }

  function handleLawDragEnd(event: React.DragEvent<HTMLElement>) {
    if (!draggingLawVersionId || selectedLawVersionIds.includes(draggingLawVersionId)) {
      setDraggingLawVersionId(null);
      return;
    }

    const rect = lawDropZoneRef.current?.getBoundingClientRect();
    if (rect) {
      const isInsideDropZone =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (isInsideDropZone) {
        onAddLawVersion(draggingLawVersionId);
      }
    }

    setDraggingLawVersionId(null);
  }

  function handlePolicyDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const documentId =
      extractPolicyDocumentId(event) ||
      draggingPolicyDocumentId ||
      draggingDocumentId ||
      "";
    if (!documentId) {
      return;
    }

    onDropTargetDocument(documentId);
    setDraggingPolicyDocumentId(null);
    setIsTargetDropActive(false);
  }

  function handleReferencePolicyDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const documentId =
      extractPolicyDocumentId(event) ||
      draggingPolicyDocumentId ||
      draggingDocumentId ||
      "";
    if (!documentId) {
      return;
    }

    onDropReferenceDocument(documentId);
    setDraggingPolicyDocumentId(null);
    setIsReferenceDropActive(false);
  }

  function handleLawDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const lawVersionId = extractLawVersionId(event) || draggingLawVersionId || "";
    if (!lawVersionId || selectedLawVersionIds.includes(lawVersionId)) {
      setDraggingLawVersionId(null);
      return;
    }

    onAddLawVersion(lawVersionId);
    setDraggingLawVersionId(null);
    setIsReferenceDropActive(false);
  }

  function handleDragCancel() {
    setDraggingPolicyDocumentId(null);
    setDraggingLawVersionId(null);
    setIsTargetDropActive(false);
    setIsReferenceDropActive(false);
  }

  return (
    <div className="stack">
      <div className="info-card detail-card favorite-toolbar">
        <div className="favorite-toolbar-copy">
          <strong>배치 즐겨찾기</strong>
          <p className="helper-text">
            현재 좌우 문서 배치와 기준 법률 선택을 이름으로 저장하고 다시 불러옵니다.
          </p>
        </div>
        <div className="favorite-toolbar-controls">
          <select
            className="favorite-select"
            value={selectedFavoriteId}
            onChange={(event) => setSelectedFavoriteId(event.target.value)}
            disabled={favorites.length === 0}
          >
            <option value="">저장된 즐겨찾기 선택</option>
            {favorites.map((favorite) => (
              <option key={favorite.id} value={favorite.id}>
                {favorite.name}
              </option>
            ))}
          </select>
          <button type="button" className="button ghost select-button" onClick={onSaveFavorite}>
            현재 배치 저장
          </button>
          <button
            type="button"
            className="button ghost select-button"
            disabled={!selectedFavoriteId}
            onClick={() => onApplyFavorite(selectedFavoriteId)}
          >
            불러오기
          </button>
          <button
            type="button"
            className="button ghost select-button"
            disabled={!selectedFavoriteId}
            onClick={() => onDeleteFavorite(selectedFavoriteId)}
          >
            삭제
          </button>
        </div>
      </div>
      <div className="info-card detail-card">
        <strong>비교 플로우 안내</strong>
        <ul className="plain-list">
          <li>좌측 그룹에는 개정 여부를 검토할 정책·지침을 넣습니다.</li>
          <li>우측 그룹에는 비교 기준이 되는 문서나 법령을 넣습니다.</li>
          <li>법령은 아래 목록에서 끌어오거나, 이미 선택된 항목을 재파싱할 수 있습니다.</li>
        </ul>
      </div>
      {comparisonBlockingReason ? (
        <div className="warning-card detail-card">
          <strong>지금은 비교를 실행할 수 없습니다.</strong>
          <p className="helper-text detailed-empty-reason">{comparisonBlockingReason}</p>
        </div>
      ) : (
        <div className="info-card detail-card">
          <strong>실행 조건 충족</strong>
          <p className="helper-text detailed-empty-reason">
            좌우 그룹이 모두 준비되었습니다. 비교를 실행하면 하단 검토 패널에 경고와 권고가 함께 표시됩니다.
          </p>
        </div>
      )}
      <div className="comparison-drop-grid">
        <div
          className={`comparison-drop-zone ${isTargetDropActive ? "drop-target-active" : ""}`}
          onDragEnter={(event) => {
            if (disabled || !hasPolicyDragPayload(event)) {
              return;
            }

            event.preventDefault();
            setIsTargetDropActive(true);
          }}
          onDragOver={(event) => {
            if (disabled || !hasPolicyDragPayload(event)) {
              return;
            }

            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            if (!isTargetDropActive) {
              setIsTargetDropActive(true);
            }
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setIsTargetDropActive(false);
            }
          }}
          onDrop={handlePolicyDrop}
        >
          <div className="selection-summary-card">
            <div className="document-list-header">
              <strong>비교 대상 정책 및 지침</strong>
              <span className="document-title-prefix">{`${targetDocuments.length}건 선택됨`}</span>
            </div>
            <span className="timestamp">
              문서 목록에서 끌어다 놓아 비교할 정책·지침 그룹을 구성합니다.
            </span>
          </div>
          {targetDocuments.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>비교할 정책·지침이 없습니다.</strong>
              <p>문서 목록에서 이 영역으로 끌어다 놓으세요.</p>
            </div>
          ) : (
            <div className="list law-list">
              {targetDocuments.map((document) => (
                <div
                  key={document.id}
                  className={`list-item document-list-item ${getDocumentKindClassName(document.title)} selected`}
                  draggable
                  onDragStart={(event) => handlePolicyDragStart(event, document.id)}
                  onDragEnd={handleDragCancel}
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
                      disabled={disabled}
                      onClick={() => onRemoveTargetDocument(document.id)}
                    >
                      해제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          ref={lawDropZoneRef}
          className={`comparison-drop-zone ${isReferenceDropActive ? "drop-target-active" : ""}`}
          onDragEnter={(event) => {
            if (disabled || (!hasPolicyDragPayload(event) && !hasLawDragPayload(event))) {
              return;
            }

            event.preventDefault();
            setIsReferenceDropActive(true);
          }}
          onDragOver={(event) => {
            if (disabled || (!hasPolicyDragPayload(event) && !hasLawDragPayload(event))) {
              return;
            }

            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            if (!isReferenceDropActive) {
              setIsReferenceDropActive(true);
            }
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setIsReferenceDropActive(false);
            }
          }}
          onDrop={(event) => {
            if (hasPolicyDragPayload(event)) {
              handleReferencePolicyDrop(event);
              return;
            }

            handleLawDrop(event);
          }}
        >
          <div className="selection-summary-card">
            <div className="document-list-header">
              <strong>기준 법률</strong>
              <span className="document-title-prefix">{`${rightGroupCount}건 선택됨`}</span>
            </div>
            <span className="timestamp">
              문서 목록과 아래 기준 법률 목록에서 이 영역으로 끌어다 놓으세요.
            </span>
          </div>
          {referenceDocuments.length === 0 && selectedLawVersions.length === 0 ? (
            <div className="empty-state compact-empty-state">
              <strong>선택된 문서가 없습니다.</strong>
              <p>문서 목록이나 아래 기준 법률 목록에서 이 영역으로 끌어다 놓으세요.</p>
            </div>
          ) : (
            <div className="list law-list">
              {referenceDocuments.map((document) => (
                <div
                  key={document.id}
                  className={`list-item document-list-item ${getDocumentKindClassName(document.title)} selected`}
                  draggable
                  onDragStart={(event) => handlePolicyDragStart(event, document.id)}
                  onDragEnd={handleDragCancel}
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
                      disabled={disabled}
                      onClick={() => onRemoveReferenceDocument(document.id)}
                    >
                      해제
                    </button>
                  </div>
                </div>
              ))}
              {selectedLawVersions.map((lawVersion) => (
                <div
                  key={lawVersion.id}
                  className="list-item selected"
                  draggable
                  onDragStart={(event) => handleLawDragStart(event, lawVersion.id)}
                  onDragEnd={(event) => handleLawDragEnd(event)}
                >
                  <div className="list-item-row">
                    <div className="stack list-item-copy">
                      <div className="document-list-header">
                        <strong>{lawVersion.source_title ?? "법령 원문"}</strong>
                      </div>
                      <span className="timestamp">{formatLawVersionMeta(lawVersion)}</span>
                    </div>
                    <button
                      type="button"
                      className="button ghost select-button"
                      disabled={disabled}
                      onClick={() => onRemoveLawVersion(lawVersion.id)}
                    >
                      해제
                    </button>
                    <button
                      type="button"
                      className="button ghost select-button"
                      disabled={disabled || isMutatingLawVersionId === lawVersion.id}
                      onClick={() => handleReparse(lawVersion.id)}
                    >
                      {isMutatingLawVersionId === lawVersion.id ? "처리 중..." : "재파싱"}
                    </button>
                    <button
                      type="button"
                      className="button ghost select-button"
                      disabled={disabled || isMutatingLawVersionId === lawVersion.id}
                      onClick={() => handleDelete(lawVersion.id)}
                    >
                      {isMutatingLawVersionId === lawVersion.id ? "삭제 중..." : "삭제"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {lawVersions.length > 0 ? (
        <div className="stack">
          <div className="info-card">
            <strong className="law-count-label">{`등록된 기준 법률: ${lawVersions.length}건`}</strong>
          </div>
          <div className="list law-list">
            {availableLawVersions.map((lawVersion) => (
              <div
                key={lawVersion.id}
                className="list-item"
                draggable
                onDragStart={(event) => handleLawDragStart(event, lawVersion.id)}
                onDragEnd={(event) => handleLawDragEnd(event)}
              >
                <div className="list-item-row">
                  <div className="stack list-item-copy">
                    <div className="document-list-header">
                      <strong>{lawVersion.source_title ?? "법령 원문"}</strong>
                    </div>
                    <span className="timestamp">{formatLawVersionMeta(lawVersion)}</span>
                  </div>
                  <button
                    type="button"
                    className="button ghost select-button"
                    disabled={disabled || isMutatingLawVersionId === lawVersion.id}
                    onClick={() => handleReparse(lawVersion.id)}
                  >
                    {isMutatingLawVersionId === lawVersion.id ? "처리 중..." : "재파싱"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="stack">
        <button
          className="button secondary comparison-run-button"
          type="button"
          disabled={
            disabled ||
            isComparing ||
            targetDocuments.length === 0 ||
            rightGroupCount === 0
          }
          onClick={handleRunComparison}
        >
          {isComparing ? "비교 실행 중..." : "좌우 그룹 비교 실행"}
        </button>
        <p className="helper-text">
          {comparisonBlockingReason ??
            "비교 실행 후에는 하단 패널에서 차이, 경고, AI 권고를 함께 검토할 수 있습니다."}
        </p>
      </div>
    </div>
  );
}

function getComparisonBlockingReason(input: {
  disabled: boolean;
  disabledReason: string | null;
  targetCount: number;
  rightGroupCount: number;
}) {
  if (input.disabled) {
    return input.disabledReason ?? "현재 세션 또는 설정 상태 때문에 비교 기능이 잠겨 있습니다.";
  }
  if (input.targetCount === 0) {
    return "좌측 그룹에 정책·지침이 없어 비교를 시작할 수 없습니다. 문서 목록에서 검토 대상을 먼저 드래그하세요.";
  }
  if (input.rightGroupCount === 0) {
    return "우측 그룹에 기준 문서나 법령이 없습니다. 비교 기준을 추가해야 차이 분석과 권고를 생성할 수 있습니다.";
  }
  return null;
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
