import { useEffect, useState } from "react";
import {
  analyzeSelectedRevisions,
  classifyRevision,
  getAggregatedComparisonReview,
  getComparisonReview,
} from "../lib/documentService";
import type {
  AiRevisionGuidance,
  ComparisonReviewAggregate,
  ComparisonReviewDetail,
} from "../types";

interface ComparisonReviewPanelProps {
  comparisonRunId: string | null;
  comparisonRunIds?: string[];
  selectedDocumentIds?: string[];
  selectedLawVersionIds?: string[];
  analysisRequestKey?: number;
  setStatus: (value: string) => void;
}

export function ComparisonReviewPanel({
  comparisonRunId,
  comparisonRunIds = [],
  selectedDocumentIds = [],
  selectedLawVersionIds = [],
  analysisRequestKey = 0,
  setStatus,
}: ComparisonReviewPanelProps) {
  const [detail, setDetail] = useState<ComparisonReviewDetail | null>(null);
  const [aggregate, setAggregate] = useState<ComparisonReviewAggregate | null>(null);
  const [aiGuidance, setAiGuidance] = useState<AiRevisionGuidance | null>(null);
  const [isAnalyzingSelection, setIsAnalyzingSelection] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);

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
    if (selectedDocumentIds.length === 0 || selectedLawVersionIds.length === 0) {
      setAiGuidance(null);
      return;
    }

    if (analysisRequestKey === 0) {
      return;
    }

    setIsAnalyzingSelection(true);
    analyzeSelectedRevisions({
      documentIds: selectedDocumentIds,
      lawVersionIds: selectedLawVersionIds,
    })
      .then((data) => {
        setAiGuidance(data);
      })
      .catch((error: Error) => {
        setStatus(error.message);
        setAiGuidance(null);
      })
      .finally(() => {
        setIsAnalyzingSelection(false);
      });
  }, [analysisRequestKey, selectedDocumentIds, selectedLawVersionIds, setStatus]);

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
    selectedDocumentIds.length > 0 && selectedLawVersionIds.length > 0;

  if (!comparisonRunId && comparisonRunIds.length === 0 && !hasSelectionContext) {
    return (
      <div className="empty-state">
        <strong>비교 검토</strong>
        <p>비교 실행을 선택하면 정책 원문, 법령 원문, 차이점, 권고를 확인할 수 있습니다.</p>
      </div>
    );
  }

  if (!comparisonRunId && comparisonRunIds.length === 0 && hasSelectionContext) {
    return (
      <div className="stack">
        <div className="section-header">
          <h2>비교 검토</h2>
          <p>선택된 정책·지침과 등록된 법령을 기준으로 종합 개정 검토 리포트를 표시합니다.</p>
        </div>
        <AiGuidancePanel guidance={aiGuidance} isLoading={isAnalyzingSelection} className="ai-guidance-offset" />
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
      <div className="stack">
        <div className="section-header">
          <h2>비교 검토</h2>
          <p>선택된 정책·지침과 지정된 법령을 한 묶음으로 분석한 종합 결과입니다.</p>
        </div>

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
            <strong>{aiGuidance?.api_call_count ?? 0}건</strong>
          </div>
        </div>

        {aggregate.warning_messages.length > 0 ? (
          <div className="warning-card">
            <strong>비교 경고</strong>
            <ul className="plain-list">
              {aggregate.warning_messages.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <AiGuidancePanel guidance={aiGuidance} isLoading={isAnalyzingSelection} className="ai-guidance-offset" />
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
    <div className="stack">
      <div className="section-header">
        <h2>비교 검토</h2>
        <p>
          법령 변경에 따라 현행 정책을 개정해야 하는지 검토하기 위한 결과만 표시합니다.
        </p>
      </div>

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

      <AiGuidancePanel guidance={aiGuidance} isLoading={isAnalyzingSelection} className="ai-guidance-offset" />
    </div>
  );
}

function AiGuidancePanel(input: {
  guidance: AiRevisionGuidance | null;
  isLoading: boolean;
  className?: string;
}) {
  return (
    <section className={`review-column ${input.className ?? ""}`.trim()}>
      <div className="section-header">
        <h3>AI 비교 결과</h3>
        <p>선택한 정책·지침과 등록한 법령을 OpenAI 프롬프트로 비교한 결과입니다.</p>
      </div>

      {input.isLoading ? (
        <div className="info-card">
          <strong>AI가 선택된 정책·지침과 법령을 비교하는 중입니다.</strong>
        </div>
      ) : null}

      {!input.isLoading && !input.guidance ? (
        <div className="info-card">
          <strong>선택된 정책·지침과 법령을 고르면 AI 비교 결과가 여기에 표시됩니다.</strong>
        </div>
      ) : null}

      {input.guidance ? (
        <div className="stack">
          <div className="recommendation-card ai-summary-card">
            <p className="recommendation-copy">{input.guidance.summary}</p>
            <p className="helper-text">
              모델: {input.guidance.model ?? "미기록"}
            </p>
          </div>

          <GuidanceSection
            title="현행 정책에 추가해야 할 내용 및 근거"
            emptyText="추가 필요 항목이 없습니다."
            emptyReason={input.guidance.additions_empty_reason}
            items={input.guidance.additions.map((item, index) => ({
              id: `add-${item.document_id}-${index}`,
              title: item.document_title,
              targetPath: item.target_section_path,
              lawTitle: item.law_title,
              policyEvidence: item.policy_evidence_paths,
              lawEvidence: item.law_evidence_paths,
              action: item.suggested_action,
              confidence: item.confidence,
              reason: item.rationale,
            }))}
          />

          <GuidanceSection
            title="현행 정책에 불필요한 내용 및 근거"
            emptyText="불필요 항목이 없습니다."
            emptyReason={input.guidance.removals_empty_reason}
            items={input.guidance.removals.map((item, index) => ({
              id: `remove-${item.document_id}-${index}`,
              title: item.document_title,
              targetPath: item.target_section_path,
              lawTitle: item.law_title,
              policyEvidence: item.policy_evidence_paths,
              lawEvidence: item.law_evidence_paths,
              action: item.suggested_action,
              confidence: item.confidence,
              reason: item.rationale,
            }))}
          />

          {input.guidance.low_confidence_notes.length > 0 ? (
            <div className="warning-card">
              <strong>저신뢰 메모</strong>
              <ul className="plain-list">
                {input.guidance.low_confidence_notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

type GuidanceItem = {
  id: string;
  title: string;
  targetPath: string;
  lawTitle: string;
  policyEvidence: string[];
  lawEvidence: string[];
  action: string;
  confidence: number;
  reason: string;
};

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
                <span className="pill neutral">반영 위치 {item.targetPath}</span>
                <span className="pill neutral">법령 {item.lawTitle}</span>
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
                <span className="muted-label">법령 근거 위치</span>
                <pre className="source-block compact">
                  {item.lawEvidence.length > 0 ? item.lawEvidence.join("\n") : "해당 없음"}
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
