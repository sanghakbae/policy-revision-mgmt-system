import { useEffect, useState } from "react";
import { AuthPanel } from "./components/AuthPanel";
import { ComparisonReviewPanel } from "./components/ComparisonReviewPanel";
import { DocumentList } from "./components/DocumentList";
import { DocumentUploadForm } from "./components/DocumentUploadForm";
import { DocumentViewer } from "./components/DocumentViewer";
import { LawSourcePanel } from "./components/LawSourcePanel";
import {
  deleteLawSource,
  listComparisonRuns,
  listDocuments,
  listLawVersions,
  registerLawSource,
  runComparison,
  uploadLawDocument,
  updateLawSource,
  uploadDocument,
} from "./lib/documentService";
import {
  getSupabaseClient,
  hasSupabaseEnv,
} from "./lib/supabaseClient";
import type { ComparisonRunSummary, DocumentSummary, LawVersionSummary } from "./types";
import type { Session } from "@supabase/supabase-js";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [comparisonRuns, setComparisonRuns] = useState<ComparisonRunSummary[]>([]);
  const [lawVersions, setLawVersions] = useState<LawVersionSummary[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(
    null,
  );
  const [checkedDocumentIds, setCheckedDocumentIds] = useState<string[]>([]);
  const [selectedLawVersionIds, setSelectedLawVersionIds] = useState<string[]>([]);
  const [selectedComparisonRunId, setSelectedComparisonRunId] = useState<string | null>(
    null,
  );
  const [analysisRequestKey, setAnalysisRequestKey] = useState(0);
  const [status, setStatus] = useState<string>("Supabase에 연결하는 중입니다...");
  const [isLoading, setIsLoading] = useState(true);
  const isSupabaseConfigured = hasSupabaseEnv();

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setStatus(
        "Supabase environment is missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.",
      );
      setIsLoading(false);
      return;
    }

    const supabase = getSupabaseClient();
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          setSession(null);
          setStatus(error.message);
          return;
        }

        setSession(data.session);
        setStatus(data.session ? "인증되었습니다." : "로그인 후 계속 진행하세요.");
      })
      .finally(() => {
        setIsLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (event === "SIGNED_OUT") {
        setSession(null);
        setStatus("로그아웃되었습니다.");
        return;
      }

      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        setSession(nextSession);
        setStatus("인증되었습니다.");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [isSupabaseConfigured]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }

    if (!session) {
      setDocuments([]);
      setLawVersions([]);
      setComparisonRuns([]);
      setSelectedDocumentId(null);
      setCheckedDocumentIds([]);
      setSelectedLawVersionIds([]);
      setSelectedComparisonRunId(null);
      setAnalysisRequestKey(0);
      return;
    }

    setIsLoading(true);
    Promise.all([listDocuments(), listLawVersions(), listComparisonRuns()])
      .then(([documentItems, lawVersionItems, comparisonItems]) => {
        setDocuments(documentItems);
        setLawVersions(lawVersionItems);
        setComparisonRuns(comparisonItems);
        setSelectedDocumentId((current) => current ?? documentItems[0]?.id ?? null);
        setCheckedDocumentIds((current) => {
          const preserved = current.filter((id) => documentItems.some((item) => item.id === id));
          if (preserved.length > 0) {
            return preserved;
          }

          return documentItems[0] ? [documentItems[0].id] : [];
        });
        setSelectedLawVersionIds((current) => {
          const preserved = current.filter((id) => lawVersionItems.some((item) => item.id === id));
          if (preserved.length > 0) {
            return preserved;
          }

          return lawVersionItems[0] ? [lawVersionItems[0].id] : [];
        });
        setSelectedComparisonRunId(
          (current) => current ?? comparisonItems[0]?.id ?? null,
        );
        setStatus(
          `문서 ${documentItems.length}건, 법령 ${lawVersionItems.length}건, 비교 실행 ${comparisonItems.length}건을 불러왔습니다.`,
        );
      })
      .catch((error: Error) => {
        setStatus(error.message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [session, isSupabaseConfigured]);

  async function handleUpload(file: File, title: string, description: string) {
    setStatus("문서를 업로드하고 구조화 섹션을 등록하는 중입니다...");
    try {
      await uploadDocument({ file, title, description });
      const [documentItems, lawVersionItems, comparisonItems] = await Promise.all([
        listDocuments(),
        listLawVersions(),
        listComparisonRuns(),
      ]);
      setDocuments(documentItems);
      setLawVersions(lawVersionItems);
      setComparisonRuns(comparisonItems);
      setSelectedDocumentId(documentItems[0]?.id ?? null);
      setCheckedDocumentIds((current) => {
        const preserved = current.filter((id) => documentItems.some((item) => item.id === id));
        if (preserved.length > 0) {
          return preserved;
        }

        return documentItems[0] ? [documentItems[0].id] : [];
      });
      setSelectedLawVersionIds((current) => {
        const preserved = current.filter((id) => lawVersionItems.some((item) => item.id === id));
        if (preserved.length > 0) {
          return preserved;
        }

        return lawVersionItems[0] ? [lawVersionItems[0].id] : [];
      });
      setSelectedComparisonRunId(comparisonItems[0]?.id ?? null);
      setStatus("문서 업로드와 구조 파싱이 완료되었습니다.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "문서 업로드 중 오류가 발생했습니다.";
      setStatus(message);
      throw error;
    }
  }

  async function handleRegisterLawSource(input: {
    sourceLink: string;
    sourceTitle: string;
    versionLabel: string;
    effectiveDate: string;
  }) {
    setStatus("법령 URL에서 원문을 수집하고 구조를 등록하는 중입니다...");

    try {
      await registerLawSource(input);
      const lawVersionItems = await listLawVersions();
      setLawVersions(lawVersionItems);
      setSelectedLawVersionIds((current) => {
        const preserved = current.filter((id) => lawVersionItems.some((item) => item.id === id));
        if (preserved.length > 0) {
          return preserved;
        }

        return lawVersionItems[0] ? [lawVersionItems[0].id] : [];
      });
      setStatus("법령 원문 등록과 구조 파싱이 완료되었습니다.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "법령 URL 등록 중 오류가 발생했습니다.";
      setStatus(message);
      throw error;
    }
  }

  async function handleUploadLawDocument(input: {
    file: File;
    sourceTitle: string;
    versionLabel: string;
    effectiveDate: string;
  }) {
    setStatus("법령 첨부파일을 업로드하고 구조를 등록하는 중입니다...");

    try {
      await uploadLawDocument(input);
      const lawVersionItems = await listLawVersions();
      setLawVersions(lawVersionItems);
      setSelectedLawVersionIds((current) => {
        const preserved = current.filter((id) => lawVersionItems.some((item) => item.id === id));
        if (preserved.length > 0) {
          return preserved;
        }

        return lawVersionItems[0] ? [lawVersionItems[0].id] : [];
      });
      setStatus("법령 첨부파일 등록과 구조 파싱이 완료되었습니다.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "법령 첨부파일 등록 중 오류가 발생했습니다.";
      setStatus(message);
      throw error;
    }
  }

  async function handleUpdateLawSource(input: {
    lawVersionId: string;
    sourceLink: string;
    sourceTitle: string;
    versionLabel: string;
    effectiveDate: string;
  }) {
    setStatus("법령 정보를 수정하는 중입니다...");

    try {
      await updateLawSource(input);
      const lawVersionItems = await listLawVersions();
      setLawVersions(lawVersionItems);
      setSelectedLawVersionIds((current) =>
        current.filter((id) => lawVersionItems.some((item) => item.id === id)),
      );
      setStatus("법령 정보 수정이 완료되었습니다.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "법령 수정 중 오류가 발생했습니다.";
      setStatus(message);
      throw error;
    }
  }

  async function handleDeleteLawSource(lawVersionId: string) {
    setStatus("법령을 삭제하는 중입니다...");

    try {
      await deleteLawSource({ lawVersionId });
      const lawVersionItems = await listLawVersions();
      setLawVersions(lawVersionItems);
      setSelectedLawVersionIds((current) => current.filter((id) => id !== lawVersionId));
      setStatus("법령 삭제가 완료되었습니다.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "법령 삭제 중 오류가 발생했습니다.";
      setStatus(message);
      throw error;
    }
  }

  async function handleRunComparison() {
    const selectedDocuments = documents.filter(
      (document) => checkedDocumentIds.includes(document.id) && document.version_id,
    );

    if (selectedDocuments.length === 0) {
      setStatus("비교할 정책 또는 지침을 선택하세요.");
      return;
    }

    if (selectedLawVersionIds.length === 0) {
      setStatus("비교할 법령 버전을 선택하세요.");
      return;
    }

    setStatus("선택한 정책·지침과 법령 조합의 비교를 실행하는 중입니다...");

    try {
      const results = [];

      for (const document of selectedDocuments) {
        for (const lawVersionId of selectedLawVersionIds) {
          const result = await runComparison({
            documentVersionId: document.version_id as string,
            lawVersionId,
          });
          results.push(result);
        }
      }

      const comparisonItems = await listComparisonRuns();
      setComparisonRuns(comparisonItems);
      const comparisonRunId =
        results[0]?.data?.comparisonRunId ??
        comparisonItems[0]?.id ??
        null;
      setSelectedComparisonRunId(comparisonRunId);
      setAnalysisRequestKey((current) => current + 1);
      setStatus(`선택한 정책·지침 ${selectedDocuments.length}건과 법령 ${selectedLawVersionIds.length}건의 비교 실행이 완료되었습니다.`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "비교 실행 중 오류가 발생했습니다.";
      setStatus(message);
      throw error;
    }
  }

  const selectedComparison = comparisonRuns.find(
    (comparison) => comparison.id === selectedComparisonRunId,
  );
  const recommendationLabel = selectedComparison?.revision_status
    ? toRevisionStatusLabel(selectedComparison.revision_status)
    : "권고 대기";

  function handleToggleLawVersion(lawVersionId: string) {
    setSelectedLawVersionIds((current) =>
      current.includes(lawVersionId)
        ? current.filter((id) => id !== lawVersionId)
        : [...current, lawVersionId],
    );
  }

  function handleToggleDocumentSelection(documentId: string) {
    setSelectedDocumentId(documentId);
    setCheckedDocumentIds((current) =>
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId],
    );
  }

  const activeComparisonRunIds = comparisonRuns
    .filter((run) =>
      checkedDocumentIds.includes(run.document_id ?? "") &&
      selectedLawVersionIds.includes(run.law_version_id ?? ""),
    )
    .map((run) => run.id);

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-main">
          <p className="eyebrow">정책·법령 개정 관리 시스템</p>
          <h1 className="hero-title-single-line">정책 원문, 비교 결과, 개정 권고를 한 화면에서 검토</h1>
          <p className="hero-copy">
            이 화면은 인증 기반 문서 업로드, 장·조·항·호·목 단위의
            결정론적 파싱, 추적 가능한 비교 결과, 개정 권고 검토를 위한
            기본 작업 공간입니다.
          </p>
          <div className="hero-pill-row">
            <span className="hero-pill">구조 파싱</span>
            <span className="hero-pill">결정론 비교</span>
            <span className="hero-pill">AI 권고 분리 표시</span>
          </div>
        </div>
        <div className="hero-side">
          <div className="status-panel status-panel-highlight">
            <span className="status-label">현재 상태</span>
            <strong>{isLoading ? "불러오는 중..." : status}</strong>
            <p className="helper-text">
              인증, 업로드, 비교, 권고 흐름을 한 작업 공간에서 이어서 확인합니다.
            </p>
          </div>
          <div className="hero-mini-grid">
            <div className="mini-card">
              <span className="muted-label">선택된 권고</span>
              <strong>{recommendationLabel}</strong>
            </div>
            <div className="mini-card">
              <span className="muted-label">검토 대상 문서</span>
              <strong>{documents.length}건</strong>
            </div>
          </div>
        </div>
      </header>

      <main className="workspace-stack">
        {!isSupabaseConfigured ? (
          <section className="panel">
            <div className="warning-card">
              <strong>Supabase 설정이 필요합니다</strong>
              <p>
                `.env.example`를 기준으로 `.env`를 만든 뒤
                `VITE_SUPABASE_URL`과 `VITE_SUPABASE_ANON_KEY`를 설정하세요.
              </p>
              <p className="helper-text">
                지금은 화면만 로컬에서 보이는 상태이며, 해당 값이 없으면
                인증, 업로드, 비교, 권고 기능은 비활성화됩니다.
              </p>
            </div>
          </section>
        ) : null}

        <section className="overview-grid">
          <article className="metric-card primary">
            <span className="muted-label">등록 문서</span>
            <strong>{documents.length}</strong>
            <p className="helper-text">현재 계정에서 구조화 저장된 정책·지침 문서 수</p>
          </article>
          <article className="metric-card">
            <span className="muted-label">비교 실행</span>
            <strong>{comparisonRuns.length}</strong>
            <p className="helper-text">검토 가능한 정책-법령 비교 이력</p>
          </article>
          <article className="metric-card">
            <span className="muted-label">선택 문서</span>
            <strong>
              {documents.find((document) => document.id === selectedDocumentId)?.title ??
                "선택 없음"}
            </strong>
            <p className="helper-text">원문과 구조 섹션을 바로 검토할 수 있습니다.</p>
          </article>
          <article className="metric-card accent">
            <span className="muted-label">선택 비교</span>
            <strong>{selectedComparison?.policy_title ?? "선택 없음"}</strong>
            <p className="helper-text">
              {selectedComparison
                ? `${selectedComparison.diff_count}건 변경 · ${recommendationLabel}`
                : "비교 실행을 선택하면 diff와 권고가 표시됩니다."}
            </p>
          </article>
        </section>

        <div className="layout-grid">
          <section className="panel">
            <AuthPanel session={session} />
            <DocumentUploadForm
              disabled={!session || !isSupabaseConfigured}
              onUpload={handleUpload}
              setStatus={setStatus}
            />
          </section>

          <section className="panel">
            <div className="section-header">
              <h2>문서 목록</h2>
              <p>현재 사용자 기준으로 등록된 정책·지침 문서를 보여줍니다.</p>
            </div>
            <DocumentList
              documents={documents}
              selectedId={selectedDocumentId}
              checkedIds={checkedDocumentIds}
              onToggleSelect={handleToggleDocumentSelection}
            />
          </section>

          <section className="panel">
            <div className="section-header">
              <h2>비교 실행</h2>
              <p>정책과 법령 비교 결과를 선택해 검토할 수 있습니다.</p>
            </div>
            <LawSourcePanel
              documents={documents}
              selectedDocumentCount={checkedDocumentIds.length}
              lawVersions={lawVersions}
              selectedLawVersionIds={selectedLawVersionIds}
              disabled={!session || !isSupabaseConfigured}
              onToggleLawVersion={handleToggleLawVersion}
              onRegisterLawSource={handleRegisterLawSource}
              onUploadLawDocument={handleUploadLawDocument}
              onUpdateLawSource={handleUpdateLawSource}
              onDeleteLawSource={handleDeleteLawSource}
              onRunComparison={handleRunComparison}
            />
          </section>
        </div>

        <div className="review-shell">
          <section className="panel panel-wide">
          <DocumentViewer documentId={selectedDocumentId} />
        </section>
          <section className="panel panel-wide">
            <ComparisonReviewPanel
              comparisonRunId={selectedComparisonRunId}
              comparisonRunIds={activeComparisonRunIds}
              selectedDocumentIds={checkedDocumentIds}
              selectedLawVersionIds={selectedLawVersionIds}
              analysisRequestKey={analysisRequestKey}
              setStatus={setStatus}
            />
          </section>
        </div>
      </main>
    </div>
  );
}

function toRevisionStatusLabel(
  status: ComparisonRunSummary["revision_status"],
) {
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
