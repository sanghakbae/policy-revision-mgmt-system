import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  classifyRevision,
  getAggregatedComparisonReview,
  getComparisonReview,
} from "../lib/documentService";
import type {
  AiComparisonReport,
  AiGroupReport,
  AiRevisionGuidance,
  ComparisonReviewAggregate,
  ComparisonReviewDetail,
  SavedAnalysisHistoryEntry,
} from "../types";

interface ComparisonReviewPanelProps {
  comparisonRunId: string | null;
  comparisonRunIds?: string[];
  selectedDocumentIds?: string[];
  referenceDocumentIds?: string[];
  selectedLawVersionIds?: string[];
  historyStorageKey?: string;
  viewMode?: "results" | "history";
  setStatus: (value: string) => void;
  onOverviewChange?: (value: ComparisonReviewOverviewSnapshot) => void;
  analysisState: ComparisonReviewAnalysisState;
}

const STAGE_REQUEST_TIMEOUT_MS = 190_000;
export type AnalysisStagePhase =
  | "left"
  | "left-wait"
  | "right"
  | "right-wait"
  | "parallel"
  | "final"
  | "complete"
  | null;

export type ComparisonReviewAnalysisState = {
  aiGuidance: AiRevisionGuidance | null;
  leftGroupReport: AiGroupReport | null;
  rightGroupReport: AiGroupReport | null;
  comparisonReport: AiComparisonReport | null;
  aiAnalysisError: string | null;
  apiCallCount: number;
  isAnalyzingSelection: boolean;
  analysisStageLabel: string | null;
  analysisStagePhase: AnalysisStagePhase;
  analysisStageStartedAt: number | null;
};

export type ComparisonReviewOverviewSnapshot = {
  selectionSummary: string;
  selectionCounts: {
    leftDocumentCount: number;
    rightDocumentCount: number;
    rightLawCount: number;
  };
  apiCallCount: number;
  stageProgress: ReturnType<typeof getStageProgress>;
};

export function ComparisonReviewPanel({
  comparisonRunId,
  comparisonRunIds = [],
  selectedDocumentIds = [],
  referenceDocumentIds = [],
  selectedLawVersionIds = [],
  historyStorageKey,
  viewMode = "results",
  setStatus,
  onOverviewChange,
  analysisState,
}: ComparisonReviewPanelProps) {
  const emitStatus = useEffectEvent((message: string) => {
    setStatus(message);
  });
  const [detail, setDetail] = useState<ComparisonReviewDetail | null>(null);
  const [aggregate, setAggregate] = useState<ComparisonReviewAggregate | null>(null);
  const [progressNow, setProgressNow] = useState(() => Date.now());
  const [isLoading, setIsLoading] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const [savedHistory, setSavedHistory] = useState<SavedAnalysisHistoryEntry[]>([]);
  const [loadedHistoryEntry, setLoadedHistoryEntry] = useState<SavedAnalysisHistoryEntry | null>(null);
  const lastAutoSavedSignatureRef = useRef<string | null>(null);
  const selectionSummary = getSelectionSummary(
    selectedDocumentIds.length,
    referenceDocumentIds.length,
    selectedLawVersionIds.length,
  );
  const selectionCounts = {
    leftDocumentCount: selectedDocumentIds.length,
    rightDocumentCount: referenceDocumentIds.length,
    rightLawCount: selectedLawVersionIds.length,
  };
  const stageProgress = getStageProgress({
    leftGroupReport: analysisState.leftGroupReport,
    rightGroupReport: analysisState.rightGroupReport,
    comparisonReport: analysisState.comparisonReport,
    isAnalyzingSelection: analysisState.isAnalyzingSelection,
    analysisStageLabel: analysisState.analysisStageLabel,
    analysisStagePhase: analysisState.analysisStagePhase,
    analysisStageStartedAt: analysisState.analysisStageStartedAt,
    now: progressNow,
  });

  useEffect(() => {
    if (!analysisState.isAnalyzingSelection || !analysisState.analysisStageStartedAt) {
      return;
    }

    const timer = window.setInterval(() => {
      setProgressNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [analysisState.analysisStageStartedAt, analysisState.isAnalyzingSelection]);

  useEffect(() => {
    setSavedHistory(readSavedAnalysisHistory(historyStorageKey));
  }, [historyStorageKey]);

  useEffect(() => {
    onOverviewChange?.({
      selectionSummary,
      selectionCounts,
      apiCallCount: analysisState.apiCallCount,
      stageProgress,
    });
  }, [analysisState.apiCallCount, onOverviewChange, selectionCounts, selectionSummary, stageProgress]);

  useEffect(() => {
    if (!analysisState.aiGuidance) {
      return;
    }

    const signature = buildSavedHistorySignature({
      selectionCounts,
      guidance: analysisState.aiGuidance,
    });
    if (lastAutoSavedSignatureRef.current === signature) {
      return;
    }

    const exists = savedHistory.some((entry) =>
      buildSavedHistorySignature({
        selectionCounts: entry.selectionCounts,
        guidance: entry.guidance,
      }) === signature,
    );
    if (exists) {
      lastAutoSavedSignatureRef.current = signature;
      return;
    }

    const next = [createSavedHistoryEntry({
      selectionSummary,
      selectionCounts,
      guidance: analysisState.aiGuidance,
    }), ...savedHistory].slice(0, 20);
    setSavedHistory(next);
    writeSavedAnalysisHistory(historyStorageKey, next);
    lastAutoSavedSignatureRef.current = signature;
    emitStatus("현재 AI 비교 리포트를 이력에 자동 저장했습니다.");
  }, [analysisState.aiGuidance, emitStatus, historyStorageKey, savedHistory, selectionCounts, selectionSummary]);

  useEffect(() => {
    if (comparisonRunIds.length > 1) {
      setLoadedHistoryEntry(null);
      setIsLoading(true);
      getAggregatedComparisonReview(comparisonRunIds)
        .then((data) => {
          setAggregate(data);
          setDetail(null);
        })
        .catch((error: Error) => {
          emitStatus(error.message);
          setAggregate(null);
          setDetail(null);
        })
        .finally(() => {
          setIsLoading(false);
        });
      return;
    }

    if (!comparisonRunId) {
      setDetail(null);
      setAggregate(null);
      return;
    }

    setLoadedHistoryEntry(null);
    setIsLoading(true);
    getComparisonReview(comparisonRunId)
      .then((data) => {
        setDetail(data);
        setAggregate(null);
      })
      .catch((error: Error) => {
        emitStatus(error.message);
        setDetail(null);
        setAggregate(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [comparisonRunId, comparisonRunIds]);

  async function handleClassify() {
    if (!comparisonRunId) {
      return;
    }

    setIsClassifying(true);
    setStatus("백엔드 AI 분류기에 개정 권고 생성을 요청하는 중입니다...");

    try {
      await classifyRevision(comparisonRunId);
      const updated = await getComparisonReview(comparisonRunId);
      setDetail(updated);
      setStatus("개정 권고를 갱신했습니다.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "개정 권고 분류에 실패했습니다.",
      );
    } finally {
      setIsClassifying(false);
    }
  }

  function handleSaveCurrentReport() {
    if (!analysisState.aiGuidance) {
      return;
    }

    const entry = createSavedHistoryEntry({
      selectionSummary,
      selectionCounts,
      guidance: analysisState.aiGuidance,
    });
    const next = [entry, ...savedHistory].slice(0, 20);
    setSavedHistory(next);
    writeSavedAnalysisHistory(historyStorageKey, next);
    lastAutoSavedSignatureRef.current = buildSavedHistorySignature({
      selectionCounts,
      guidance: analysisState.aiGuidance,
    });
    emitStatus("현재 AI 비교 리포트를 이력에 저장했습니다.");
  }

  function handleLoadSavedReport(entryId: string) {
    const entry = savedHistory.find((item) => item.id === entryId);
    if (!entry) {
      return;
    }

    setLoadedHistoryEntry(entry);
    setDetail(null);
    setAggregate(null);
    setIsLoading(false);
    emitStatus(`저장된 AI 리포트 이력을 불러왔습니다. (${formatSavedHistoryTimestamp(entry.createdAt)})`);
  }

  function handleDeleteSavedReport(entryId: string) {
    const next = savedHistory.filter((item) => item.id !== entryId);
    setSavedHistory(next);
    writeSavedAnalysisHistory(historyStorageKey, next);
    emitStatus("선택한 AI 리포트 이력을 삭제했습니다.");
  }

  const hasSelectionContext =
    selectedDocumentIds.length > 0 &&
    (referenceDocumentIds.length > 0 || selectedLawVersionIds.length > 0);
  const overviewSelectionSummary = loadedHistoryEntry?.selectionSummary ?? selectionSummary;
  const overviewSelectionCounts = loadedHistoryEntry?.selectionCounts ?? selectionCounts;
  const shouldShowHistory = viewMode === "history";
  const shouldShowResults = viewMode === "results" || loadedHistoryEntry !== null;
  const displayedGuidance = loadedHistoryEntry?.guidance ?? analysisState.aiGuidance;
  const displayedLeftGroupReport = loadedHistoryEntry?.guidance.left_group_report ?? analysisState.leftGroupReport;
  const displayedRightGroupReport = loadedHistoryEntry?.guidance.right_group_report ?? analysisState.rightGroupReport;
  const displayedComparisonReport =
    loadedHistoryEntry?.guidance.comparison_report ?? analysisState.comparisonReport;
  const displayedApiCallCount = loadedHistoryEntry?.guidance.api_call_count ?? analysisState.apiCallCount;
  const displayedAnalysisStageLabel =
    loadedHistoryEntry ? "저장된 이력을 불러왔습니다." : analysisState.analysisStageLabel;
  const displayedAiAnalysisError = loadedHistoryEntry ? null : analysisState.aiAnalysisError;
  const displayedIsAnalyzingSelection = loadedHistoryEntry ? false : analysisState.isAnalyzingSelection;

  if (loadedHistoryEntry) {
    return (
      <div className="stack comparison-review-shell">
        <div className="section-header comparison-review-header">
          <div>
            <h2>비교 검토</h2>
            <p>저장된 AI 리포트 이력을 불러온 화면입니다.</p>
          </div>
          <button
            type="button"
            className="button ghost"
            onClick={() => {
              setLoadedHistoryEntry(null);
            }}
          >
            이력 닫기
          </button>
        </div>
        {shouldShowHistory ? (
          <SavedAnalysisHistorySection
            entries={savedHistory}
            onLoad={handleLoadSavedReport}
            onDelete={handleDeleteSavedReport}
          />
        ) : null}
        <div className="info-card comparison-history-loaded-card">
          <span className="muted-label">저장된 리포트</span>
          <strong>{loadedHistoryEntry.title}</strong>
          <p className="helper-text detailed-empty-reason">
            저장 시각 {formatSavedHistoryTimestamp(loadedHistoryEntry.createdAt)}
          </p>
        </div>
        <AiGuidancePanel
          guidance={displayedGuidance}
          leftGroupReport={displayedLeftGroupReport}
          rightGroupReport={displayedRightGroupReport}
          comparisonReport={displayedComparisonReport}
          error={displayedAiAnalysisError}
          isLoading={displayedIsAnalyzingSelection}
          analysisStageLabel={displayedAnalysisStageLabel}
          apiCallCount={displayedApiCallCount}
          className="ai-guidance-offset"
          onSaveCurrentReport={handleSaveCurrentReport}
        />
      </div>
    );
  }

  if (shouldShowHistory && !comparisonRunId && comparisonRunIds.length === 0 && !hasSelectionContext) {
    return (
      <div className="empty-state">
        <strong>{shouldShowHistory ? "이력 관리" : "검토 결과"}</strong>
        <p>
          {shouldShowHistory
            ? "저장된 검토 이력이 없거나 아직 비교 대상이 준비되지 않았습니다."
            : "아직 비교 대상이 준비되지 않았습니다. 비교 대상과 기준을 먼저 구성하세요."}
        </p>
      </div>
    );
  }

  if (!shouldShowHistory && !comparisonRunId && comparisonRunIds.length === 0 && !hasSelectionContext) {
    return (
      <div className="stack comparison-review-shell">
        <AiGuidancePanel
          guidance={displayedGuidance}
          leftGroupReport={displayedLeftGroupReport}
          rightGroupReport={displayedRightGroupReport}
          comparisonReport={displayedComparisonReport}
          error={displayedAiAnalysisError}
          isLoading={displayedIsAnalyzingSelection}
          analysisStageLabel={displayedAnalysisStageLabel}
          apiCallCount={displayedApiCallCount}
          className="ai-guidance-offset"
          onSaveCurrentReport={handleSaveCurrentReport}
        />
      </div>
    );
  }

  if (shouldShowHistory && loadedHistoryEntry === null) {
    return (
      <div className="stack comparison-review-shell">
        <div className="section-header comparison-review-header">
          <h2>AI 리포트 이력</h2>
          <p>저장된 AI 비교 리포트를 다시 열거나 삭제할 수 있습니다.</p>
        </div>
        <SavedAnalysisHistorySection
          entries={savedHistory}
          onLoad={handleLoadSavedReport}
          onDelete={handleDeleteSavedReport}
        />
      </div>
    );
  }

  if ((!detail && !aggregate) && isLoading) {
    return (
      <div className="empty-state">
        <strong>비교 검토 데이터를 불러오는 중입니다...</strong>
      </div>
    );
  }

  if (aggregate) {
    return (
      <div className="stack comparison-review-shell">
        <div className="section-header comparison-review-header">
          <h2>{shouldShowHistory ? "이력 관리" : "검토 결과"}</h2>
          <p>선택된 정책·지침과 지정된 법령을 한 묶음으로 분석한 종합 결과입니다.</p>
        </div>
        {shouldShowHistory ? (
          <SavedAnalysisHistorySection
            entries={savedHistory}
            onLoad={handleLoadSavedReport}
            onDelete={handleDeleteSavedReport}
          />
        ) : null}
        {isLoading ? (
          <div className="info-card">
            <span className="muted-label">로딩 상태</span>
            <strong>선택된 비교 결과를 다시 불러오는 중입니다.</strong>
          </div>
        ) : null}
        <div className="comparison-summary-strip">
          <div className="info-card comparison-summary-box comparison-summary-box-policy">
            <span className="muted-label">선택 정책 및 지침</span>
            <strong>{aggregate.policy_titles.length}건</strong>
          </div>
          <div className="comparison-summary-vs">VS</div>
          <div className="info-card comparison-summary-box comparison-summary-box-law">
            <span className="muted-label">법령</span>
            <strong>{aggregate.law_titles.join(", ")}</strong>
          </div>
          <div className="info-card comparison-summary-box comparison-summary-box-api">
            <span className="muted-label">OpenAI API 호출</span>
            <strong>{displayedApiCallCount}건</strong>
          </div>
        </div>

        {aggregate.warning_messages.length > 0 ? (
          <div className="warning-card detail-card">
            <strong>비교 경고</strong>
            <div className="stack">
              {aggregate.warning_messages.map((warning) => {
                const detail = describeComparisonWarning(warning);
                return (
                  <div key={warning} className="warning-detail-item">
                    <div className="pill-row">
                      <span className={`pill ${detail.tone}`}>{detail.label}</span>
                    </div>
                    <strong>{detail.title}</strong>
                    <p className="helper-text detailed-empty-reason">{detail.impact}</p>
                    <p className="helper-text detailed-empty-reason">권장 조치: {detail.action}</p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {shouldShowResults ? (
          <AiGuidancePanel
            guidance={displayedGuidance}
            leftGroupReport={displayedLeftGroupReport}
            rightGroupReport={displayedRightGroupReport}
            comparisonReport={displayedComparisonReport}
            error={displayedAiAnalysisError}
            isLoading={displayedIsAnalyzingSelection}
            analysisStageLabel={displayedAnalysisStageLabel}
            apiCallCount={displayedApiCallCount}
            className="ai-guidance-offset"
            onSaveCurrentReport={handleSaveCurrentReport}
          />
        ) : null}
      </div>
    );
  }

  if (!detail) {
    if (shouldShowHistory) {
      return (
        <div className="empty-state">
          <strong>비교 검토 데이터를 찾지 못했습니다.</strong>
        </div>
      );
    }

    return (
      <div className="stack comparison-review-shell">
        <AiGuidancePanel
          guidance={displayedGuidance}
          leftGroupReport={displayedLeftGroupReport}
          rightGroupReport={displayedRightGroupReport}
          comparisonReport={displayedComparisonReport}
          error={displayedAiAnalysisError}
          isLoading={displayedIsAnalyzingSelection}
          analysisStageLabel={displayedAnalysisStageLabel}
          apiCallCount={displayedApiCallCount}
          className="ai-guidance-offset"
          onSaveCurrentReport={handleSaveCurrentReport}
        />
      </div>
    );
  }

  const detailData = detail;

  return (
    <div className="stack comparison-review-shell">
      <div className="section-header comparison-review-header">
        <h2>{shouldShowHistory ? "이력 관리" : "검토 결과"}</h2>
        <p>
          법령 변경에 따라 현행 정책을 개정해야 하는지 검토하기 위한 결과만 표시합니다.
        </p>
      </div>
      {shouldShowHistory ? (
        <SavedAnalysisHistorySection
          entries={savedHistory}
          onLoad={handleLoadSavedReport}
          onDelete={handleDeleteSavedReport}
        />
      ) : null}
      {isLoading ? (
        <div className="info-card">
          <span className="muted-label">로딩 상태</span>
          <strong>선택된 비교 결과를 다시 불러오는 중입니다.</strong>
        </div>
      ) : null}
      <div className="meta-grid comparison-meta-grid">
        <div className="info-card">
          <span className="muted-label">정책 문서</span>
          <strong>{detailData.policy_title}</strong>
          <p className="helper-text">버전 {detailData.policy_version_number}</p>
        </div>
        <div className="info-card">
          <span className="muted-label">법령 문서</span>
          <strong>{detailData.law_title}</strong>
          <p className="helper-text">
            {detailData.law_version_label ?? "버전 정보 없음"}
            {detailData.law_effective_date ? ` · ${detailData.law_effective_date}` : ""}
          </p>
        </div>
        <div className="info-card">
          <span className="muted-label">개정 권고</span>
          <strong>{toRevisionStatusLabel(detailData.revision_status) ?? "아직 분류되지 않음"}</strong>
          <p className="helper-text">
            {detailData.revision_confidence !== null
              ? `신뢰도 ${Math.round(detailData.revision_confidence * 100)}%`
              : "AI 권고가 아직 없습니다"}
          </p>
        </div>
      </div>

      <div className="section-header inline-header">
        <div>
          <h3>개정 검토 결과</h3>
          <p>정책 개정 필요 여부와 가이드만 표시합니다.</p>
        </div>
        <button
          className="button secondary"
          onClick={handleClassify}
          disabled={isClassifying}
          type="button"
        >
          {isClassifying ? "분류 중..." : "권고 다시 생성"}
        </button>
      </div>

      <div className="recommendation-card">
        <div className="pill-row">
          <span className={`pill ${getStatusTone(detailData.revision_status)}`}>
            {toRevisionStatusLabel(detailData.revision_status) ?? "미분류"}
          </span>
          <span className="pill neutral">
            {detailData.revision_confidence !== null
              ? `신뢰도 ${Math.round(detailData.revision_confidence * 100)}%`
              : "신뢰도 대기"}
          </span>
          <span className="pill neutral">
            {detailData.revision_ai_used ? "AI 설명 사용" : "결정론 결과만 사용"}
          </span>
        </div>
        <p className="recommendation-copy">
          {detailData.revision_rationale ??
            "이 비교 실행에 대해 아직 저장된 개정 권고가 없습니다."}
        </p>
        <p className="helper-text">
          사람 검토 필요 여부: {detailData.human_review_required ? "예" : "아니오"}
        </p>
      </div>

      {detailData.warning_messages.length > 0 ? (
        <div className="warning-card detail-card">
          <strong>비교 경고</strong>
          <div className="stack">
            {detailData.warning_messages.map((warning) => {
              const detail = describeComparisonWarning(warning);
              return (
                <div key={warning} className="warning-detail-item">
                  <div className="pill-row">
                    <span className={`pill ${detail.tone}`}>{detail.label}</span>
                  </div>
                  <strong>{detail.title}</strong>
                  <p className="helper-text detailed-empty-reason">{detail.impact}</p>
                  <p className="helper-text detailed-empty-reason">권장 조치: {detail.action}</p>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {shouldShowResults ? (
        <AiGuidancePanel
          guidance={displayedGuidance}
          leftGroupReport={displayedLeftGroupReport}
          rightGroupReport={displayedRightGroupReport}
          comparisonReport={displayedComparisonReport}
          error={displayedAiAnalysisError}
          isLoading={displayedIsAnalyzingSelection}
          analysisStageLabel={displayedAnalysisStageLabel}
          apiCallCount={displayedApiCallCount}
          className="ai-guidance-offset"
          onSaveCurrentReport={handleSaveCurrentReport}
        />
      ) : null}
    </div>
  );
}

function AiGuidancePanel(input: {
  guidance: AiRevisionGuidance | null;
  leftGroupReport: AiGroupReport | null;
  rightGroupReport: AiGroupReport | null;
  comparisonReport: AiComparisonReport | null;
  error: string | null;
  isLoading: boolean;
  analysisStageLabel: string | null;
  apiCallCount: number;
  className?: string;
  onSaveCurrentReport: () => void;
}) {
  return (
    <section className={`review-column comparison-ai-shell ${input.className ?? ""}`.trim()}>
      <div className="comparison-result-columns">
        <GroupReportSection
          stepLabel="1단계"
          frameClassName="comparison-review-stage-frame-step-1"
          title="비교 대상 정리"
          description="비교 대상 문서를 통합 정리합니다."
          summary={input.leftGroupReport?.summary ?? "비교 대상 리포트를 생성하면 여기에 결과가 표시됩니다."}
          keyFindings={input.leftGroupReport?.key_findings ?? []}
          documents={(input.leftGroupReport?.documents ?? []).map((item) => ({
            id: `left-document-${item.document_id}`,
            title: item.document_title,
            evidencePairs: normalizeDocumentEvidencePairs(item),
          }))}
          requirements={(input.leftGroupReport?.merged_requirements ?? []).map((item, index) => ({
            id: `left-requirement-${index}-${item.topic}`,
            topic: item.topic,
            detail: item.detail,
            evidencePairs: normalizeRequirementEvidencePairs(item),
            notes: item.notes,
          }))}
        />
        <GroupReportSection
          stepLabel="2단계"
          frameClassName="comparison-review-stage-frame-step-2"
          title="기준 정리"
          description="기준 문서·법률 묶음을 기준 요구사항으로 정리합니다."
          summary={input.rightGroupReport?.summary ?? "기준 리포트를 생성하면 여기에 결과가 표시됩니다."}
          keyFindings={input.rightGroupReport?.key_findings ?? []}
          documents={(input.rightGroupReport?.documents ?? []).map((item) => ({
            id: `right-document-${item.document_id}`,
            title: item.document_title,
            evidencePairs: normalizeDocumentEvidencePairs(item),
          }))}
          requirements={(input.rightGroupReport?.merged_requirements ?? []).map((item, index) => ({
            id: `right-requirement-${index}-${item.topic}`,
            topic: item.topic,
            detail: item.detail,
            evidencePairs: normalizeRequirementEvidencePairs(item),
            notes: item.notes,
          }))}
        />
        <ComparisonReportSection
          stepLabel="3단계"
          frameClassName="comparison-review-stage-frame-step-3"
          title="최종 비교 리포트"
          description="좌우 정리본을 비교해 개정 포인트를 도출합니다."
          guidance={input.comparisonReport}
          apiCallCount={input.apiCallCount}
          model={input.guidance?.model ?? "미기록"}
          analysisStageLabel={input.error ?? input.analysisStageLabel}
        />
      </div>
    </section>
  );
}

function SavedAnalysisHistorySection(input: {
  entries: SavedAnalysisHistoryEntry[];
  onLoad: (entryId: string) => void;
  onDelete: (entryId: string) => void;
}) {
  const [page, setPage] = useState(1);
  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(input.entries.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageEntries = input.entries.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setPage((current) => Math.min(current, Math.max(1, Math.ceil(input.entries.length / pageSize))));
  }, [input.entries.length]);

  return (
    <section className="review-column comparison-history-shell">
      <div className="section-header">
        <h3>AI 리포트 이력</h3>
        <p>저장한 AI 비교 리포트를 다시 열어 현재 패널에서 확인할 수 있습니다.</p>
      </div>
      {input.entries.length === 0 ? (
        <div className="info-card">
          <strong>저장된 AI 리포트 이력이 없습니다.</strong>
          <p className="helper-text detailed-empty-reason">AI 비교 결과가 생성되면 `결과 저장`으로 보관할 수 있습니다.</p>
        </div>
      ) : (
        <div className="stack">
          <div className="comparison-table-wrap comparison-history-table-wrap">
            <table className="comparison-data-table comparison-history-table">
              <thead>
                <tr>
                  <th>저장 시각</th>
                  <th>리포트</th>
                  <th>비교 범위</th>
                  <th>선택 건수</th>
                  <th>OpenAI 호출</th>
                  <th>작업</th>
                </tr>
              </thead>
              <tbody>
                {pageEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatSavedHistoryTimestamp(entry.createdAt)}</td>
                    <td>
                      <strong>{entry.title}</strong>
                    </td>
                    <td>{entry.selectionSummary}</td>
                    <td>
                      좌측 {entry.selectionCounts.leftDocumentCount}건
                      <br />
                      우측 문서 {entry.selectionCounts.rightDocumentCount}건
                      <br />
                      법령 {entry.selectionCounts.rightLawCount}건
                    </td>
                    <td>{entry.guidance.api_call_count}건</td>
                    <td>
                      <div className="comparison-history-table-actions">
                        <button type="button" className="button ghost" onClick={() => input.onLoad(entry.id)}>
                          열기
                        </button>
                        <button type="button" className="button ghost" onClick={() => input.onDelete(entry.id)}>
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 ? (
            <div className="comparison-history-pagination">
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  className={`button ghost comparison-history-page-button ${pageNumber === currentPage ? "is-active" : ""}`}
                  onClick={() => setPage(pageNumber)}
                >
                  {pageNumber}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

type GuidanceItem = {
  id: string;
  title: string;
  targetPath: string;
  comparisonSourceTitle: string;
  policyEvidence: string[];
  comparisonEvidence: string[];
  action: string;
  confidence: number;
  reason: string;
};

type GroupDocumentItem = {
  id: string;
  title: string;
  evidencePairs: Array<{
    keyPoint: string;
    sourcePath: string;
  }>;
};

type GroupRequirementItem = {
  id: string;
  topic: string;
  detail: string;
  evidencePairs: Array<{
    sourceTitle: string;
    sourcePath: string;
  }>;
  notes: string;
};

function GroupReportSection(input: {
  stepLabel: string;
  frameClassName?: string;
  title: string;
  description: string;
  summary: string;
  keyFindings: string[];
  documents: GroupDocumentItem[];
  requirements: GroupRequirementItem[];
}) {
  return (
    <section
      className={`review-column comparison-source-column comparison-review-stage-frame comparison-report-block ${input.frameClassName ?? ""}`.trim()}
    >
      <div className="section-header comparison-frame-header comparison-stage-frame-header">
        <div className="comparison-stage-frame-head">
          <h3>{input.title}</h3>
          <span className="comparison-report-stage-step">{input.stepLabel}</span>
        </div>
        <p>{input.description}</p>
      </div>
      <SummarySection summary={input.summary} emptyText="요약이 없습니다." />
      <ReportTableSection
        title="핵심 정리"
        columns={["번호", "내용"]}
        rows={input.keyFindings.map((item, index) => [String(index + 1), item])}
        emptyText="핵심 정리 항목이 없습니다."
      />
      <section className="review-column">
        <div className="section-header compact-section-header">
          <h3>{`${input.title} 문서별 정리`}</h3>
        </div>
        <ReportTableSection
          title=""
          columns={["문서", "핵심 정리", "근거 경로"]}
          rows={buildDocumentRows(input.documents)}
          emptyText="문서별 정리 항목이 없습니다."
          hideTitle
        />
      </section>
      <section className="review-column">
        <div className="section-header compact-section-header">
          <h3>{`${input.title} 통합 요구사항`}</h3>
        </div>
        <ReportTableSection
          title=""
          columns={["주제", "내용", "출처 문서", "근거 경로", "비고"]}
          rows={buildRequirementRows(input.requirements)}
          emptyText="통합 요구사항이 없습니다."
          hideTitle
        />
      </section>
    </section>
  );
}

function ComparisonReportSection(input: {
  stepLabel: string;
  frameClassName?: string;
  title: string;
  description: string;
  guidance: AiComparisonReport | null;
  apiCallCount: number;
  model: string;
  analysisStageLabel: string | null;
}) {
  const report = input.guidance;

  return (
    <section
      className={`review-column comparison-source-column comparison-review-stage-frame comparison-report-block ${input.frameClassName ?? ""}`.trim()}
    >
      <div className="section-header comparison-frame-header comparison-stage-frame-header">
        <div className="comparison-stage-frame-head">
          <h3>{input.title}</h3>
          <span className="comparison-report-stage-step">{input.stepLabel}</span>
        </div>
        <p>{input.description}</p>
      </div>
      <SummarySection
        summary={report?.summary ?? "비교 대상/기준 정리가 끝난 뒤 최종 비교 리포트를 생성합니다."}
        emptyText="요약이 없습니다."
      />
      <GuidanceSection
        title="개정 필요 항목"
        emptyText="개정 필요 항목이 없습니다."
        emptyReason={
          report
            ? "오른쪽 기준 대비 즉시 보완이 필요한 차이를 특정하지 못했습니다."
            : "최종 비교 단계가 아직 완료되지 않았습니다."
        }
        items={(report?.gaps ?? []).map((item, index) => ({
          id: `gap-${index}-${item.topic}`,
          title: `${item.topic} · ${item.target_document_title}`,
          targetPath: item.target_section_path,
          comparisonSourceTitle: item.comparison_source_title,
          policyEvidence: item.policy_evidence_paths,
          comparisonEvidence: item.comparison_evidence_paths,
          action: item.recommended_revision,
          confidence: item.confidence,
          reason: `${item.gap_type} | 우측 기준: ${item.right_requirement}\n현재 상태: ${item.left_current_state}\n위험: ${item.risk}`,
        }))}
      />
      <ReportTableSection
        title="이미 충분히 반영된 항목"
        columns={["주제", "판단", "정책 근거", "기준 근거"]}
        rows={(report?.well_covered_items ?? []).map((item) => [
          item.topic,
          item.reason,
          joinListForCell(item.policy_evidence_paths),
          joinListForCell(item.comparison_evidence_paths),
        ])}
        emptyText="이미 충분히 반영된 항목이 없습니다."
      />
      <ReportTableSection
        title="문서별 조치"
        columns={["문서", "조치"]}
        rows={(report?.document_actions ?? []).map((item) => [
          item.document_title,
          joinListForCell(
            item.actions.map(
              (action) => `[${action.action}] ${action.target_section_path} - ${action.instruction}`,
            ),
          ),
        ])}
        emptyText="문서별 조치가 없습니다."
      />
      <ReportTableSection
        title="남은 관찰 포인트"
        columns={["번호", "내용"]}
        rows={(report?.remaining_watchpoints ?? []).map((item, index) => [String(index + 1), item])}
        emptyText="남은 관찰 포인트가 없습니다."
      />
      <ReportTableSection
        title="저신뢰 메모"
        columns={["번호", "내용"]}
        rows={(report?.low_confidence_notes ?? []).map((item, index) => [String(index + 1), item])}
        emptyText="저신뢰 메모가 없습니다."
      />
    </section>
  );
}

function runStageWithTimeout<T>(label: string, promise: Promise<T>) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error(`${label} 응답이 ${Math.round(STAGE_REQUEST_TIMEOUT_MS / 1000)}초를 넘겨 지연되고 있습니다.`));
      }, STAGE_REQUEST_TIMEOUT_MS);
    }),
  ]);
}

function readSavedAnalysisHistory(storageKey?: string) {
  if (!storageKey || typeof window === "undefined") {
    return [] as SavedAnalysisHistoryEntry[];
  }

  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return [] as SavedAnalysisHistoryEntry[];
  }

  try {
    const parsed = JSON.parse(raw) as SavedAnalysisHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as SavedAnalysisHistoryEntry[];
  }
}

function writeSavedAnalysisHistory(storageKey: string | undefined, entries: SavedAnalysisHistoryEntry[]) {
  if (!storageKey || typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(entries));
}

function formatSavedHistoryTimestamp(value: string) {
  try {
    return new Date(value).toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function createSavedHistoryEntry(input: {
  selectionSummary: string;
  selectionCounts: SavedAnalysisHistoryEntry["selectionCounts"];
  guidance: AiRevisionGuidance;
}): SavedAnalysisHistoryEntry {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    title: `좌측 ${input.selectionCounts.leftDocumentCount}건 · 우측 ${input.selectionCounts.rightDocumentCount}건 · 법령 ${input.selectionCounts.rightLawCount}건`,
    selectionSummary: input.selectionSummary,
    selectionCounts: input.selectionCounts,
    guidance: input.guidance,
  };
}

function buildSavedHistorySignature(input: {
  selectionCounts: SavedAnalysisHistoryEntry["selectionCounts"];
  guidance: AiRevisionGuidance;
}) {
  return JSON.stringify({
    selectionCounts: input.selectionCounts,
    model: input.guidance.model,
    apiCallCount: input.guidance.api_call_count,
    leftSummary: input.guidance.left_group_report.summary,
    rightSummary: input.guidance.right_group_report.summary,
    comparisonSummary: input.guidance.comparison_report.summary,
  });
}

export function getStageProgress(input: {
  leftGroupReport: AiGroupReport | null;
  rightGroupReport: AiGroupReport | null;
  comparisonReport: AiComparisonReport | null;
  isAnalyzingSelection: boolean;
  analysisStageLabel: string | null;
  analysisStagePhase: AnalysisStagePhase;
  analysisStageStartedAt: number | null;
  now: number;
}) {
  const steps = [
    {
      id: "left",
      label: "1단계",
      status: input.leftGroupReport ? "done" : input.isAnalyzingSelection ? "active" : "idle",
      statusLabel: input.leftGroupReport ? "완료" : input.isAnalyzingSelection ? "진행 중" : "대기",
      percent: input.leftGroupReport ? 100 : 0,
    },
    {
      id: "right",
      label: "2단계",
      status: input.rightGroupReport
        ? "done"
        : input.isAnalyzingSelection && input.analysisStagePhase === "right"
          ? "active"
          : "idle",
      statusLabel: input.rightGroupReport
        ? "완료"
        : input.isAnalyzingSelection && input.analysisStagePhase === "right"
          ? "진행 중"
          : "대기",
      percent: input.rightGroupReport ? 100 : 0,
    },
    {
      id: "final",
      label: "3단계",
      status: input.comparisonReport
        ? "done"
        : input.rightGroupReport && input.isAnalyzingSelection
          ? "active"
          : "idle",
      statusLabel: input.comparisonReport
        ? "완료"
        : input.rightGroupReport && input.isAnalyzingSelection
          ? "진행 중"
          : "대기",
      percent: input.comparisonReport ? 100 : 0,
    },
  ] as const;

  if (input.comparisonReport) {
    return {
      label: "최종 비교 완료",
      detail: "비교 대상 정리, 기준 정리, 최종 비교 리포트가 모두 채워졌습니다.",
      percent: 100,
      steps,
    };
  }

  if (input.rightGroupReport) {
    return {
      label: input.isAnalyzingSelection ? "최종 비교 진행 중" : "기준 정리 완료",
      detail:
        input.analysisStageLabel ?? "기준 정리가 끝났고 최종 비교 리포트를 준비하고 있습니다.",
      percent: input.isAnalyzingSelection ? 66 : 66,
      steps,
    };
  }

  if (input.leftGroupReport) {
    return {
      label: input.isAnalyzingSelection ? "기준 정리 진행 중" : "비교 대상 정리 완료",
      detail:
        input.analysisStageLabel ?? "비교 대상 정리가 끝났고 기준 정리를 준비하고 있습니다.",
      percent: input.rightGroupReport ? 66 : 33,
      steps,
    };
  }

  if (input.isAnalyzingSelection) {
    return {
      label: "왼쪽 정리 진행 중",
      detail: input.analysisStageLabel ?? "단계 리포트를 생성하고 있습니다.",
      percent: 0,
      steps,
    };
  }

  return {
    label: "실행 대기",
    detail: "좌우 그룹 비교 실행 후 단계별 리포트가 순차적으로 채워집니다.",
    percent: 0,
    steps,
  };
}

function GuidanceSection(input: {
  title: string;
  emptyText: string;
  emptyReason: string;
  items: GuidanceItem[];
}) {
  return (
    <section className="review-column">
      <div className="section-header">
        <h3>{input.title}</h3>
      </div>
      {input.items.length === 0 ? (
        <ReportTableSection
          title=""
          columns={["상태", "내용"]}
          rows={[["안내", `${input.emptyText}\n${input.emptyReason}`]]}
          emptyText={input.emptyText}
          hideTitle
        />
      ) : (
        <ReportTableSection
          title=""
          columns={["주제", "대상 경로", "기준", "정책 근거", "기준 근거", "조치", "신뢰도", "사유"]}
          rows={buildGuidanceRows(input.items)}
          emptyText={input.emptyText}
          hideTitle
        />
      )}
    </section>
  );
}

function ReportTableSection(input: {
  title: string;
  columns: string[];
  rows: string[][];
  emptyText: string;
  hideTitle?: boolean;
}) {
  return (
    <section className="review-column comparison-table-section">
      {!input.hideTitle ? (
        <div className="section-header compact-section-header">
          <h3>{input.title}</h3>
        </div>
      ) : null}
      <div className="comparison-table-wrap">
        <table className="comparison-data-table">
          <thead>
            <tr>
              {input.columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {input.rows.length === 0 ? (
              <tr>
                {input.columns.map((column, index) => (
                  <td
                    key={`${input.title}-empty-${column}`}
                    className={`comparison-table-empty ${index === 0 ? "comparison-table-empty-primary" : ""}`.trim()}
                  >
                    {index === 0 ? input.emptyText : "-"}
                  </td>
                ))}
              </tr>
            ) : (
              input.rows.map((row, index) => (
                <tr key={`${input.title}-${index}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${input.title}-${index}-${cellIndex}`}>{cell}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SummarySection(input: { summary: string; emptyText: string }) {
  const content = input.summary.trim() || input.emptyText;

  return (
    <section className="review-column comparison-summary-section">
      <div className="info-card comparison-report-summary-card ai-summary-card">
        <p className="comparison-report-summary-copy">{content}</p>
      </div>
    </section>
  );
}

function joinListForCell(items: string[]) {
  if (items.length === 0) {
    return "-";
  }

  return items.join("\n");
}

function buildDocumentRows(items: GroupDocumentItem[]) {
  return items.flatMap((item) => {
    const rowCount = Math.max(item.evidencePairs.length, 1);
    return Array.from({ length: rowCount }, (_, index) => [
      index === 0 ? item.title : "",
      item.evidencePairs[index]?.keyPoint ?? "-",
      item.evidencePairs[index]?.sourcePath ?? "-",
    ]);
  });
}

function buildRequirementRows(items: GroupRequirementItem[]) {
  return items.flatMap((item) => {
    const rowCount = Math.max(item.evidencePairs.length, 1);
    return Array.from({ length: rowCount }, (_, index) => [
      index === 0 ? item.topic : "",
      index === 0 ? item.detail : "",
      item.evidencePairs[index]?.sourceTitle ?? "-",
      item.evidencePairs[index]?.sourcePath ?? "-",
      index === 0 ? item.notes || "-" : "",
    ]);
  });
}

function normalizeDocumentEvidencePairs(item: AiGroupReport["documents"][number]) {
  if (item.evidence_pairs && item.evidence_pairs.length > 0) {
    return item.evidence_pairs
      .map((pair) => ({
        keyPoint: pair.key_point.trim() || "-",
        sourcePath: pair.source_path.trim() || "-",
      }));
  }

  return zipEvidencePairs(item.key_points, item.source_paths).map(([keyPoint, sourcePath]) => ({
    keyPoint,
    sourcePath,
  }));
}

function normalizeRequirementEvidencePairs(item: AiGroupReport["merged_requirements"][number]) {
  if (item.evidence_pairs && item.evidence_pairs.length > 0) {
    return item.evidence_pairs
      .map((pair) => ({
        sourceTitle: pair.source_title.trim() || "-",
        sourcePath: pair.source_path.trim() || "-",
      }));
  }

  return zipEvidencePairs(item.source_titles, item.source_paths).map(([sourceTitle, sourcePath]) => ({
    sourceTitle,
    sourcePath,
  }));
}

function zipEvidencePairs(left: string[], right: string[]) {
  const rowCount = Math.max(left.length, right.length, 1);
  return Array.from({ length: rowCount }, (_, index) => [
    left[index]?.trim() || "-",
    right[index]?.trim() || "-",
  ] as const);
}

function buildGuidanceRows(items: GuidanceItem[]) {
  return items.flatMap((item) => {
    const rowCount = Math.max(item.policyEvidence.length, item.comparisonEvidence.length, 1);
    return Array.from({ length: rowCount }, (_, index) => [
      index === 0 ? item.title : "",
      index === 0 ? item.targetPath : "",
      index === 0 ? item.comparisonSourceTitle : "",
      item.policyEvidence[index] ?? "-",
      item.comparisonEvidence[index] ?? "-",
      index === 0 ? item.action : "",
      index === 0 ? `${Math.round(item.confidence * 100)}%` : "",
      index === 0 ? item.reason : "",
    ]);
  });
}

function toRevisionStatusLabel(status: ComparisonReviewDetail["revision_status"]) {
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

function getStatusTone(status: ComparisonReviewDetail["revision_status"]) {
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

function getSelectionSummary(
  selectedDocumentCount: number,
  referenceDocumentCount: number,
  selectedLawVersionCount: number,
) {
  return `비교 대상 ${selectedDocumentCount}개, 기준 ${referenceDocumentCount + selectedLawVersionCount}개가 현재 분석 범위에 포함되어 있습니다.`;
}

function describeComparisonWarning(warning: string) {
  const normalized = warning.toLowerCase();

  if (/누락|missing|없음|찾지 못/.test(normalized)) {
    return {
      tone: "danger",
      label: "차단 가능",
      title: warning,
      impact: "비교 범위 일부가 비어 있어 결과가 누락되거나 신뢰도가 크게 낮아질 수 있습니다.",
      action: "누락된 문서 또는 법령 구조를 먼저 보완한 뒤 비교를 다시 실행하세요.",
    };
  }

  if (/신뢰|애매|모호|불일치|정렬/.test(normalized)) {
    return {
      tone: "warning",
      label: "검토 필요",
      title: warning,
      impact: "자동 비교는 완료됐지만 결과 근거 위치나 권고 강도를 사람이 확인하는 편이 안전합니다.",
      action: "하단 권고의 근거 위치와 원문을 함께 대조하세요.",
    };
  }

  return {
    tone: "warning",
    label: "주의",
    title: warning,
    impact: "비교는 가능하지만 결과 해석에 추가 검토가 필요합니다.",
    action: "경고 내용을 기준으로 우선순위를 정하고 재파싱 또는 재실행 여부를 판단하세요.",
  };
}
