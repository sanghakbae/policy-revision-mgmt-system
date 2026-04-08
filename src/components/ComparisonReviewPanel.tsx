import { useEffect, useState } from "react";
import {
  analyzeSelectedRevisionsStage,
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
} from "../types";

interface ComparisonReviewPanelProps {
  comparisonRunId: string | null;
  comparisonRunIds?: string[];
  selectedDocumentIds?: string[];
  referenceDocumentIds?: string[];
  selectedLawVersionIds?: string[];
  analysisRequestKey?: number;
  setStatus: (value: string) => void;
}

export function ComparisonReviewPanel({
  comparisonRunId,
  comparisonRunIds = [],
  selectedDocumentIds = [],
  referenceDocumentIds = [],
  selectedLawVersionIds = [],
  analysisRequestKey = 0,
  setStatus,
}: ComparisonReviewPanelProps) {
  const [detail, setDetail] = useState<ComparisonReviewDetail | null>(null);
  const [aggregate, setAggregate] = useState<ComparisonReviewAggregate | null>(null);
  const [aiGuidance, setAiGuidance] = useState<AiRevisionGuidance | null>(null);
  const [leftGroupReport, setLeftGroupReport] = useState<AiGroupReport | null>(null);
  const [rightGroupReport, setRightGroupReport] = useState<AiGroupReport | null>(null);
  const [comparisonReport, setComparisonReport] = useState<AiComparisonReport | null>(null);
  const [aiAnalysisError, setAiAnalysisError] = useState<string | null>(null);
  const [apiCallCount, setApiCallCount] = useState(0);
  const [isAnalyzingSelection, setIsAnalyzingSelection] = useState(false);
  const [analysisStageLabel, setAnalysisStageLabel] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const selectionSummary = getSelectionSummary(
    selectedDocumentIds.length,
    referenceDocumentIds.length,
    selectedLawVersionIds.length,
  );
  const stageProgress = getStageProgress({
    leftGroupReport,
    rightGroupReport,
    comparisonReport,
    isAnalyzingSelection,
    analysisStageLabel,
  });

  useEffect(() => {
    if (comparisonRunIds.length > 1) {
      setIsLoading(true);
      getAggregatedComparisonReview(comparisonRunIds)
        .then((data) => {
          setAggregate(data);
          setDetail(null);
        })
        .catch((error: Error) => {
          setStatus(error.message);
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

    setIsLoading(true);
    getComparisonReview(comparisonRunId)
      .then((data) => {
        setDetail(data);
        setAggregate(null);
      })
      .catch((error: Error) => {
        setStatus(error.message);
        setDetail(null);
        setAggregate(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [comparisonRunId, comparisonRunIds, setStatus]);

  useEffect(() => {
    if (
      selectedDocumentIds.length === 0 ||
      (referenceDocumentIds.length === 0 && selectedLawVersionIds.length === 0)
    ) {
      setAiGuidance(null);
      setLeftGroupReport(null);
      setRightGroupReport(null);
      setComparisonReport(null);
      setAiAnalysisError(null);
      setAnalysisStageLabel(null);
      return;
    }

    if (analysisRequestKey === 0) {
      return;
    }

    setIsAnalyzingSelection(true);
    setAiAnalysisError(null);
    setLeftGroupReport(null);
    setRightGroupReport(null);
    setComparisonReport(null);
    setAiGuidance(null);
    setAnalysisStageLabel("왼쪽 그룹 정리 중");
    let cancelled = false;

    (async () => {
      const leftStage = await analyzeSelectedRevisionsStage({
        stage: "left",
        targetDocumentIds: selectedDocumentIds,
        referenceDocumentIds,
        lawVersionIds: selectedLawVersionIds,
      });
      if (cancelled) {
        return;
      }
      setLeftGroupReport(leftStage.left_group_report);
      setApiCallCount((current) => Math.max(current, leftStage.api_call_count));

      setAnalysisStageLabel("오른쪽 그룹 정리 중");
      const rightStage = await analyzeSelectedRevisionsStage({
        stage: "right",
        targetDocumentIds: selectedDocumentIds,
        referenceDocumentIds,
        lawVersionIds: selectedLawVersionIds,
      });
      if (cancelled) {
        return;
      }
      setRightGroupReport(rightStage.right_group_report);
      setApiCallCount((current) => Math.max(current, rightStage.api_call_count));

      setAnalysisStageLabel("최종 비교 리포트 생성 중");
      const finalStage = await analyzeSelectedRevisionsStage({
        stage: "final",
        targetDocumentIds: selectedDocumentIds,
        referenceDocumentIds,
        lawVersionIds: selectedLawVersionIds,
        leftGroupReport: leftStage.left_group_report,
        rightGroupReport: rightStage.right_group_report,
      });
      if (cancelled) {
        return;
      }
      setComparisonReport(finalStage.comparison_report);
      setApiCallCount((current) => Math.max(current, finalStage.api_call_count));
      setAiGuidance({
        left_group_report: leftStage.left_group_report as AiGroupReport,
        right_group_report: rightStage.right_group_report as AiGroupReport,
        comparison_report: finalStage.comparison_report as AiComparisonReport,
        model: finalStage.model,
        api_call_count: finalStage.api_call_count,
      });
      setAiAnalysisError(null);
      setAnalysisStageLabel("3단계 리포트 생성 완료");
    })()
      .catch((error: Error) => {
        if (cancelled) {
          return;
        }
        setStatus(error.message);
        setAiGuidance(null);
        setLeftGroupReport(null);
        setRightGroupReport(null);
        setComparisonReport(null);
        setAiAnalysisError(error.message);
        setAnalysisStageLabel(null);
      })
      .finally(() => {
        if (cancelled) {
          return;
        }
        setIsAnalyzingSelection(false);
      });

    return () => {
      cancelled = true;
    };
  }, [analysisRequestKey, selectedDocumentIds, referenceDocumentIds, selectedLawVersionIds, setStatus]);

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

  const hasSelectionContext =
    selectedDocumentIds.length > 0 &&
    (referenceDocumentIds.length > 0 || selectedLawVersionIds.length > 0);

  if (!comparisonRunId && comparisonRunIds.length === 0 && !hasSelectionContext) {
    return (
      <div className="empty-state">
        <strong>비교 검토</strong>
        <p>아직 비교 대상이 준비되지 않았습니다. 좌측과 우측 그룹을 먼저 구성하세요.</p>
      </div>
    );
  }

  if (!comparisonRunId && comparisonRunIds.length === 0 && hasSelectionContext) {
    return (
      <div className="stack comparison-review-shell">
        <div className="section-header comparison-review-header">
          <h2>비교 검토</h2>
          <p>좌측 정책·지침과 우측 그룹 전체를 기준으로 종합 개정 검토 리포트를 표시합니다.</p>
        </div>
        <ComparisonReviewOverview
          selectionSummary={selectionSummary}
          apiCallCount={apiCallCount}
          stageProgress={stageProgress}
        />
        <AiGuidancePanel
          guidance={aiGuidance}
          leftGroupReport={leftGroupReport}
          rightGroupReport={rightGroupReport}
          comparisonReport={comparisonReport}
          error={aiAnalysisError}
          isLoading={isAnalyzingSelection}
          analysisStageLabel={analysisStageLabel}
          apiCallCount={apiCallCount}
          className="ai-guidance-offset"
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
          <h2>비교 검토</h2>
          <p>선택된 정책·지침과 지정된 법령을 한 묶음으로 분석한 종합 결과입니다.</p>
        </div>
        <ComparisonReviewOverview
          selectionSummary={selectionSummary}
          apiCallCount={apiCallCount}
          stageProgress={stageProgress}
        />

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
            <strong>{apiCallCount}건</strong>
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

        <AiGuidancePanel
          guidance={aiGuidance}
          leftGroupReport={leftGroupReport}
          rightGroupReport={rightGroupReport}
          comparisonReport={comparisonReport}
          error={aiAnalysisError}
          isLoading={isAnalyzingSelection}
          analysisStageLabel={analysisStageLabel}
          apiCallCount={apiCallCount}
          className="ai-guidance-offset"
        />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="empty-state">
        <strong>비교 검토 데이터를 찾지 못했습니다.</strong>
      </div>
    );
  }

  const detailData = detail;

  return (
    <div className="stack comparison-review-shell">
      <div className="section-header comparison-review-header">
        <h2>비교 검토</h2>
        <p>
          법령 변경에 따라 현행 정책을 개정해야 하는지 검토하기 위한 결과만 표시합니다.
        </p>
      </div>
      <ComparisonReviewOverview
        selectionSummary={selectionSummary}
        apiCallCount={apiCallCount}
        stageProgress={stageProgress}
      />

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

      <AiGuidancePanel
        guidance={aiGuidance}
        leftGroupReport={leftGroupReport}
        rightGroupReport={rightGroupReport}
        comparisonReport={comparisonReport}
        error={aiAnalysisError}
        isLoading={isAnalyzingSelection}
        analysisStageLabel={analysisStageLabel}
        apiCallCount={apiCallCount}
        className="ai-guidance-offset"
      />
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
}) {
  return (
    <section className={`review-column comparison-ai-shell ${input.className ?? ""}`.trim()}>
      <div className="section-header comparison-ai-header">
        <h3>AI 비교 결과</h3>
        <p>기준 법률 대비 비교 대상 정책·지침의 누락 및 개정 필요 항목과 반영 가이드를 표시합니다.</p>
      </div>

      {input.isLoading ? (
        <div className="info-card detail-card">
          <strong>AI가 좌우 그룹을 비교하는 중입니다.</strong>
          <p className="helper-text detailed-empty-reason">
            {input.analysisStageLabel
              ? `${input.analysisStageLabel} 단계 결과를 먼저 받고 있습니다.`
              : "선택된 정책·지침과 기준 그룹을 함께 읽고 누락, 충돌, 반영 위치를 정리하고 있습니다."}
          </p>
        </div>
      ) : null}

      {!input.isLoading && input.error ? (
        <div className="warning-card detail-card">
          <strong>AI 비교 결과를 생성하지 못했습니다.</strong>
          <p className="helper-text detailed-empty-reason">{input.error}</p>
          <p className="helper-text detailed-empty-reason">
            권장 조치: 선택된 문서와 법령에 구조 섹션이 있는지, OpenAI 시크릿과 Edge Function이 준비되어 있는지 확인하세요.
          </p>
        </div>
      ) : null}

      {!input.isLoading && !input.guidance && !input.error ? (
        <div className="info-card detail-card">
          <strong>좌측과 우측 그룹을 고르면 AI 비교 결과가 여기에 표시됩니다.</strong>
          <p className="helper-text detailed-empty-reason">
            결과에는 누락 항목, 현재 정책이 이미 커버하는 내용, 남은 관찰 포인트, 문서별 반영 가이드가 포함됩니다.
          </p>
        </div>
      ) : null}

      {input.leftGroupReport || input.rightGroupReport || input.comparisonReport ? (
        <div className="stack">
          <div className="comparison-report-stage-strip comparison-report-stage-strip-detailed">
            <article className="comparison-report-stage comparison-report-stage-left">
              <span className="comparison-report-stage-step">1단계</span>
              <strong>왼쪽 그룹 정리</strong>
              <p>정책·지침 묶음을 통합 정리합니다.</p>
            </article>
            <article className="comparison-report-stage comparison-report-stage-right">
              <span className="comparison-report-stage-step">2단계</span>
              <strong>오른쪽 그룹 정리</strong>
              <p>기준 문서·법률 묶음을 기준 요구사항으로 정리합니다.</p>
            </article>
            <article className="comparison-report-stage comparison-report-stage-final">
              <span className="comparison-report-stage-step">3단계</span>
              <strong>최종 비교 리포트</strong>
              <p>좌우 정리본을 비교해 개정 포인트를 도출합니다.</p>
            </article>
          </div>
          <div className="recommendation-card ai-summary-card comparison-report-summary-card">
            <p className="recommendation-copy">
              {input.comparisonReport?.summary ??
                input.rightGroupReport?.summary ??
                input.leftGroupReport?.summary ??
                "단계별 리포트를 생성하는 중입니다."}
            </p>
            <div className="pill-row">
              <span
                className={`pill ${
                  input.comparisonReport?.revision_needed ? "warning" : "success"
                }`}
              >
                {input.comparisonReport?.revision_needed
                  ? "개정 검토 필요"
                  : input.comparisonReport
                    ? "즉시 개정 필요성 낮음"
                    : "단계 실행 중"}
              </span>
              <span className="pill neutral">OpenAI 호출 {input.apiCallCount}건</span>
            </div>
            <p className="recommendation-copy">
              {input.comparisonReport?.overall_comment ??
                input.analysisStageLabel ??
                "좌우 그룹 정리와 최종 비교를 차례로 수행합니다."}
            </p>
            <p className="helper-text">
              모델: {input.guidance?.model ?? "미기록"}
            </p>
          </div>
          <GroupReportSection
            title="왼쪽 그룹 정리"
            summary={input.leftGroupReport?.summary ?? "왼쪽 그룹 리포트를 생성하는 중입니다."}
            keyFindings={input.leftGroupReport?.key_findings ?? []}
            documents={(input.leftGroupReport?.documents ?? []).map((item) => ({
              id: `left-document-${item.document_id}`,
              title: item.document_title,
              keyPoints: item.key_points,
              sourcePaths: item.source_paths,
            }))}
            requirements={(input.leftGroupReport?.merged_requirements ?? []).map((item, index) => ({
              id: `left-requirement-${index}-${item.topic}`,
              topic: item.topic,
              detail: item.detail,
              sourceTitles: item.source_titles,
              sourcePaths: item.source_paths,
              notes: item.notes,
            }))}
          />
          <GroupReportSection
            title="오른쪽 그룹 정리"
            summary={input.rightGroupReport?.summary ?? "오른쪽 그룹 리포트를 생성하는 중입니다."}
            keyFindings={input.rightGroupReport?.key_findings ?? []}
            documents={(input.rightGroupReport?.documents ?? []).map((item) => ({
              id: `right-document-${item.document_id}`,
              title: item.document_title,
              keyPoints: item.key_points,
              sourcePaths: item.source_paths,
            }))}
            requirements={(input.rightGroupReport?.merged_requirements ?? []).map((item, index) => ({
              id: `right-requirement-${index}-${item.topic}`,
              topic: item.topic,
              detail: item.detail,
              sourceTitles: item.source_titles,
              sourcePaths: item.source_paths,
              notes: item.notes,
            }))}
          />
          <ComparisonReportSection guidance={input.comparisonReport} />
        </div>
      ) : null}
    </section>
  );
}

function ComparisonReviewOverview(input: {
  selectionSummary: string;
  apiCallCount: number;
  stageProgress: ReturnType<typeof getStageProgress>;
}) {
  return (
    <section className="comparison-review-overview">
      <article className="comparison-overview-card comparison-overview-card-summary">
        <span className="muted-label">현재 분석 범위</span>
        <strong>좌우 그룹 선택 상태</strong>
        <p className="helper-text detailed-empty-reason">{input.selectionSummary}</p>
      </article>
      <article className="comparison-overview-card comparison-overview-card-progress">
        <span className="muted-label">AI 단계 진행</span>
        <strong>전체 진행률</strong>
        <div className="comparison-progress-section">
          <div className="comparison-stage-progress-head">
            <span>{input.stageProgress.label}</span>
            <strong>{input.stageProgress.percent}%</strong>
          </div>
          <p className="helper-text detailed-empty-reason">{input.stageProgress.detail}</p>
          <div className="comparison-progress-track" aria-hidden="true">
            <div
              className="comparison-progress-fill"
              style={{ width: `${input.stageProgress.percent}%` }}
            />
          </div>
        </div>
        <div className="comparison-stage-progress-list">
          {input.stageProgress.steps.map((step) => (
            <div
              key={step.id}
              className={`comparison-stage-progress-item comparison-stage-progress-item-${step.status}`}
            >
              <div className="comparison-stage-progress-head">
                <span>{step.label}</span>
                <strong>{step.percent}% · {step.statusLabel}</strong>
              </div>
              <div className="comparison-stage-progress-track" aria-hidden="true">
                <div
                  className="comparison-stage-progress-fill"
                  style={{ width: `${step.percent}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </article>
      <article className="comparison-overview-card comparison-overview-card-usage">
        <span className="muted-label">OpenAI 호출</span>
        <strong>{input.apiCallCount}건</strong>
        <p className="helper-text detailed-empty-reason">동시에 처리하지 않고 한 단계씩 순차 실행합니다.</p>
      </article>
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
  keyPoints: string[];
  sourcePaths: string[];
};

type GroupRequirementItem = {
  id: string;
  topic: string;
  detail: string;
  sourceTitles: string[];
  sourcePaths: string[];
  notes: string;
};

function GroupReportSection(input: {
  title: string;
  summary: string;
  keyFindings: string[];
  documents: GroupDocumentItem[];
  requirements: GroupRequirementItem[];
}) {
  const stageClassName = getGroupStageClassName(input.title);
  return (
    <section className={`review-column comparison-report-block ${stageClassName}`.trim()}>
      <div className="section-header">
        <h3>{input.title}</h3>
      </div>
      <div className="info-card">
        <strong>요약</strong>
        <p className="helper-text detailed-empty-reason">{input.summary}</p>
      </div>
      {input.keyFindings.length > 0 ? (
        <div className="info-card">
          <strong>핵심 정리</strong>
          <ul className="plain-list">
            {input.keyFindings.map((item) => (
              <li key={`${input.title}-${item}`}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <section className="review-column">
        <div className="section-header">
          <h3>{`${input.title} 문서별 정리`}</h3>
        </div>
        {input.documents.length === 0 ? (
          <div className="info-card">
            <strong>문서별 정리 항목이 없습니다.</strong>
          </div>
        ) : (
          <div className="stack">
            {input.documents.map((item) => (
              <article key={item.id} className="diff-card guidance-card">
                <strong className="guidance-card-title">{item.title}</strong>
                {item.keyPoints.length > 0 ? (
                  <ul className="plain-list">
                    {item.keyPoints.map((point) => (
                      <li key={`${item.id}-${point}`}>{point}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="text-compare-card after">
                  <span className="muted-label">근거 경로</span>
                  <pre className="source-block compact">
                    {item.sourcePaths.length > 0 ? item.sourcePaths.join("\n") : "해당 없음"}
                  </pre>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="review-column">
        <div className="section-header">
          <h3>{`${input.title} 통합 요구사항`}</h3>
        </div>
        {input.requirements.length === 0 ? (
          <div className="info-card">
            <strong>통합 요구사항이 없습니다.</strong>
          </div>
        ) : (
          <div className="stack">
            {input.requirements.map((item) => (
              <article key={item.id} className="diff-card guidance-card">
                <strong className="guidance-card-title">{item.topic}</strong>
                <p>{item.detail}</p>
                {item.sourceTitles.length > 0 ? (
                  <p className="helper-text">출처 문서: {item.sourceTitles.join(", ")}</p>
                ) : null}
                <div className="text-compare-card after">
                  <span className="muted-label">근거 경로</span>
                  <pre className="source-block compact">
                    {item.sourcePaths.length > 0 ? item.sourcePaths.join("\n") : "해당 없음"}
                  </pre>
                </div>
                {item.notes ? <p className="helper-text detailed-empty-reason">{item.notes}</p> : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function ComparisonReportSection(input: { guidance: AiComparisonReport | null }) {
  const report = input.guidance;

  return (
    <section className="review-column comparison-report-block comparison-report-block-final">
      <div className="section-header">
        <h3>최종 비교 리포트</h3>
      </div>
      <div className="info-card">
        <strong>비교 요약</strong>
        <p className="helper-text detailed-empty-reason">
          {report?.summary ?? "왼쪽/오른쪽 그룹 정리가 끝난 뒤 최종 비교 리포트를 생성합니다."}
        </p>
      </div>
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
      {report && report.well_covered_items.length > 0 ? (
        <div className="info-card">
          <strong>이미 충분히 반영된 항목</strong>
          <div className="stack">
            {report.well_covered_items.map((item) => (
              <article key={`${item.topic}-${item.reason}`} className="diff-card guidance-card">
                <strong className="guidance-card-title">{item.topic}</strong>
                <p>{item.reason}</p>
                <div className="text-compare-card after">
                  <span className="muted-label">정책 근거</span>
                  <pre className="source-block compact">
                    {item.policy_evidence_paths.length > 0
                      ? item.policy_evidence_paths.join("\n")
                      : "해당 없음"}
                  </pre>
                </div>
                <div className="text-compare-card after">
                  <span className="muted-label">기준 근거</span>
                  <pre className="source-block compact">
                    {item.comparison_evidence_paths.length > 0
                      ? item.comparison_evidence_paths.join("\n")
                      : "해당 없음"}
                  </pre>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
      {report && report.document_actions.length > 0 ? (
        <div className="warning-card">
          <strong>문서별 조치</strong>
          <div className="stack">
            {report.document_actions.map((item) => (
              <article key={`${item.document_id}-${item.document_title}`} className="diff-card guidance-card">
                <strong className="guidance-card-title">{item.document_title}</strong>
                <ul className="plain-list">
                  {item.actions.map((action, index) => (
                    <li key={`${item.document_id}-${index}-${action.target_section_path}`}>
                      [{action.action}] {action.target_section_path} - {action.instruction}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      ) : null}
      {report && report.remaining_watchpoints.length > 0 ? (
        <div className="warning-card">
          <strong>남은 관찰 포인트</strong>
          <ul className="plain-list">
            {report.remaining_watchpoints.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {report && report.low_confidence_notes.length > 0 ? (
        <div className="warning-card">
          <strong>저신뢰 메모</strong>
          <ul className="plain-list">
            {report.low_confidence_notes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function getGroupStageClassName(title: string) {
  if (title.includes("왼쪽")) {
    return "comparison-report-block-left";
  }

  if (title.includes("오른쪽")) {
    return "comparison-report-block-right";
  }

  return "";
}

function getStageProgress(input: {
  leftGroupReport: AiGroupReport | null;
  rightGroupReport: AiGroupReport | null;
  comparisonReport: AiComparisonReport | null;
  isAnalyzingSelection: boolean;
  analysisStageLabel: string | null;
}) {
  const steps = [
    {
      id: "left",
      label: "1단계 프로그레스바",
      status: input.leftGroupReport ? "done" : input.isAnalyzingSelection ? "active" : "idle",
      statusLabel: input.leftGroupReport ? "완료" : input.isAnalyzingSelection ? "진행 중" : "대기",
      percent: input.leftGroupReport ? 100 : input.isAnalyzingSelection ? 56 : 0,
    },
    {
      id: "right",
      label: "2단계 프로그레스바",
      status: input.rightGroupReport
        ? "done"
        : input.leftGroupReport && input.isAnalyzingSelection
          ? "active"
          : "idle",
      statusLabel: input.rightGroupReport
        ? "완료"
        : input.leftGroupReport && input.isAnalyzingSelection
          ? "진행 중"
          : "대기",
      percent: input.rightGroupReport ? 100 : input.leftGroupReport && input.isAnalyzingSelection ? 56 : 0,
    },
    {
      id: "final",
      label: "3단계 프로그레스바",
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
      percent: input.comparisonReport ? 100 : input.rightGroupReport && input.isAnalyzingSelection ? 56 : 0,
    },
  ] as const;

  if (input.comparisonReport) {
    return {
      label: "최종 비교 완료",
      detail: "왼쪽 정리, 오른쪽 정리, 최종 비교 리포트가 모두 채워졌습니다.",
      percent: 100,
      steps,
    };
  }

  if (input.rightGroupReport) {
    return {
      label: input.isAnalyzingSelection ? "최종 비교 진행 중" : "오른쪽 정리 완료",
      detail:
        input.analysisStageLabel ?? "오른쪽 그룹 정리가 끝났고 최종 비교 리포트를 준비하고 있습니다.",
      percent: input.isAnalyzingSelection ? 82 : 66,
      steps,
    };
  }

  if (input.leftGroupReport) {
    return {
      label: input.isAnalyzingSelection ? "오른쪽 정리 진행 중" : "왼쪽 정리 완료",
      detail:
        input.analysisStageLabel ?? "왼쪽 그룹 정리가 끝났고 오른쪽 그룹 정리를 준비하고 있습니다.",
      percent: input.isAnalyzingSelection ? 48 : 33,
      steps,
    };
  }

  if (input.isAnalyzingSelection) {
    return {
      label: "왼쪽 정리 진행 중",
      detail: input.analysisStageLabel ?? "첫 단계 리포트를 생성하고 있습니다.",
      percent: 16,
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
        <div className="info-card">
          <strong>{input.emptyText}</strong>
          <p className="helper-text detailed-empty-reason">{input.emptyReason}</p>
        </div>
      ) : (
        <div className="stack">
          {input.items.map((item) => (
            <article key={item.id} className="diff-card guidance-card">
              <strong className="guidance-card-title">{item.title}</strong>
              <div className="pill-row">
                <span className="pill neutral">반영 대상 {item.targetPath}</span>
                <span className="pill neutral">비교 기준 {item.comparisonSourceTitle}</span>
                <span className="pill neutral">
                  신뢰도 {Math.round(item.confidence * 100)}%
                </span>
              </div>
              <div className="text-compare-card after">
                <span className="muted-label">정책/지침 근거 위치</span>
                <pre className="source-block compact">
                  {item.policyEvidence.length > 0 ? item.policyEvidence.join("\n") : "해당 없음"}
                </pre>
              </div>
              <div className="text-compare-card after">
                <span className="muted-label">우측 그룹 근거 위치</span>
                <pre className="source-block compact">
                  {item.comparisonEvidence.length > 0 ? item.comparisonEvidence.join("\n") : "해당 없음"}
                </pre>
              </div>
              <div className="text-compare-card after">
                <span className="muted-label">조치 가이드</span>
                <pre className="source-block compact">{item.action}</pre>
              </div>
              <p>{item.reason}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
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
  return `좌측 정책·지침 ${selectedDocumentCount}건, 우측 기준 문서 ${referenceDocumentCount}건, 기준 법률 ${selectedLawVersionCount}건이 현재 분석 범위에 포함되어 있습니다.`;
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
