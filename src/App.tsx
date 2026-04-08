import { useEffect, useState } from "react";
import { AuthPanel } from "./components/AuthPanel";
import {
  ComparisonReviewPanel,
  type ComparisonReviewAnalysisState,
  getStageProgress,
  type ComparisonReviewOverviewSnapshot,
} from "./components/ComparisonReviewPanel";
import { DocumentList } from "./components/DocumentList";
import { DocumentUploadForm } from "./components/DocumentUploadForm";
import { DocumentViewer } from "./components/DocumentViewer";
import { LawSourcePanel } from "./components/LawSourcePanel";
import { LawVersionPreview } from "./components/LawVersionPreview";
import { PromptSettingsPanel } from "./components/PromptSettingsPanel";
import {
  COMPARISON_REPORT_INSTRUCTIONS,
  LEFT_REPORT_INSTRUCTIONS,
  RIGHT_REPORT_INSTRUCTIONS,
} from "../shared/analysisPrompts";
import {
  analyzeSelectedRevisionsStage,
  deleteLawSource,
  deleteDocument,
  listComparisonRuns,
  listDocuments,
  listLawVersions,
  reparseLawSource,
  reparseDocument,
  runComparison,
  uploadDocument,
} from "./lib/documentService";
import {
  clearSupabaseAuthStorage,
  exchangeAuthCodeForSessionIfPresent,
  getSupabaseClient,
  hasSupabaseEnv,
} from "./lib/supabaseClient";
import type {
  AiRevisionPromptOverrides,
  ComparisonRunSummary,
  DocumentSummary,
  LawVersionSummary,
} from "./types";
import type { Session } from "@supabase/supabase-js";

type NoticeTone = "info" | "success" | "warning" | "danger";
type PersistedWorkspaceSelection = {
  selectedDocumentId: string | null;
  targetDocumentIds: string[];
  referenceDocumentIds: string[];
  lawVersionIds: string[];
};
type WorkspaceFavorite = {
  id: string;
  name: string;
  updatedAt: string;
  selection: PersistedWorkspaceSelection;
};

type AppNotice = {
  tone: NoticeTone;
  label: string;
  title: string;
  detail?: string;
  actions?: string[];
  debug?: string[];
};

type WorkspaceSection = "documents" | "comparison" | "results" | "history" | "settings";

export default function App() {
  const emptyComparisonAnalysisState: ComparisonReviewAnalysisState = {
    aiGuidance: null,
    leftGroupReport: null,
    rightGroupReport: null,
    comparisonReport: null,
    aiAnalysisError: null,
    apiCallCount: 0,
    isAnalyzingSelection: false,
    analysisStageLabel: null,
    analysisStagePhase: null,
    analysisStageStartedAt: null,
  };
  const [session, setSession] = useState<Session | null>(null);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [comparisonRuns, setComparisonRuns] = useState<ComparisonRunSummary[]>([]);
  const [lawVersions, setLawVersions] = useState<LawVersionSummary[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(
    null,
  );
  const [checkedDocumentIds, setCheckedDocumentIds] = useState<string[]>([]);
  const [comparisonTargetDocumentIds, setComparisonTargetDocumentIds] = useState<string[]>([]);
  const [comparisonReferenceDocumentIds, setComparisonReferenceDocumentIds] = useState<string[]>([]);
  const [draggingDocumentId, setDraggingDocumentId] = useState<string | null>(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  const [reparsingDocumentId, setReparsingDocumentId] = useState<string | null>(null);
  const [selectedLawVersionIds, setSelectedLawVersionIds] = useState<string[]>([]);
  const [selectedComparisonRunId, setSelectedComparisonRunId] = useState<string | null>(
    null,
  );
  const [analysisRequestKey, setAnalysisRequestKey] = useState(0);
  const [documentPreviewRefreshKey, setDocumentPreviewRefreshKey] = useState(0);
  const [lawPreviewRefreshKey, setLawPreviewRefreshKey] = useState(0);
  const [workspaceSelectionHydrated, setWorkspaceSelectionHydrated] = useState(false);
  const [workspaceFavorites, setWorkspaceFavorites] = useState<WorkspaceFavorite[]>([]);
  const [activeWorkspaceSection, setActiveWorkspaceSection] = useState<WorkspaceSection>("documents");
  const [appNotice, setAppNoticeState] = useState<AppNotice | null>(null);
  const [comparisonOverview, setComparisonOverview] = useState<ComparisonReviewOverviewSnapshot | null>(null);
  const [comparisonAnalysisState, setComparisonAnalysisState] = useState<ComparisonReviewAnalysisState>(
    emptyComparisonAnalysisState,
  );
  const [promptOverrides, setPromptOverrides] = useState<AiRevisionPromptOverrides>({
    left: LEFT_REPORT_INSTRUCTIONS,
    right: RIGHT_REPORT_INSTRUCTIONS,
    final: COMPARISON_REPORT_INSTRUCTIONS,
  });
  const isSupabaseConfigured = hasSupabaseEnv();
  const sessionUserId = session?.user.id ?? null;

  function setAppNotice(nextNotice: AppNotice) {
    setAppNoticeState(nextNotice);
  }

  function setStatus(message: string) {
    setAppNotice({
      tone: inferNoticeTone(message),
      label: "작업 상태",
      title: message,
      detail: inferNoticeDetail(message),
      actions: inferNoticeActions(message),
    });
  }

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAppNotice({
        tone: "warning",
        label: "설정 필요",
        title: "Supabase 환경 변수가 비어 있습니다.",
        detail: "인증과 데이터 기능은 비활성화된 상태입니다.",
        actions: [
          ".env에 VITE_SUPABASE_URL을 설정하세요.",
          ".env에 VITE_SUPABASE_ANON_KEY를 설정하세요.",
        ],
        debug: ["환경 변수 누락으로 인증/데이터 기능 비활성화"],
      });
      return;
    }

    const supabase = getSupabaseClient();
    let cancelled = false;

    (async () => {
      try {
        await exchangeAuthCodeForSessionIfPresent();
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          if (cancelled) {
            return;
          }
          setSession(null);
          setAppNotice({
            tone: "danger",
            label: "인증 오류",
            title: "세션을 확인하지 못했습니다.",
            detail: error.message,
            actions: ["Supabase 프로젝트 URL과 키를 확인하세요.", "로그인 상태를 새로 고침한 뒤 다시 시도하세요."],
            debug: [`auth.getSession 오류: ${error.message}`],
          });
          return;
        }

        if (data.session) {
          const {
            data: { user },
            error: userError,
          } = await supabase.auth.getUser(data.session.access_token);

          if (userError || !user) {
            if (cancelled) {
              return;
            }
            clearSupabaseAuthStorage();
            setSession(null);
            setAppNotice({
              tone: "warning",
              label: "인증 복구 필요",
              title: "저장된 로그인 세션이 유효하지 않아 초기화했습니다.",
              detail: "다시 로그인해야 삭제, 재파싱, 비교 실행이 동작합니다.",
              actions: ["Google로 다시 로그인하세요.", "필요하면 세션 강제 초기화를 다시 실행하세요."],
              debug: [`startup auth validation failed: ${userError?.message ?? "Invalid JWT"}`],
            });
            return;
          }
        }

        if (cancelled) {
          return;
        }

        setSession(data.session);
        setAppNotice(
          data.session
            ? {
                tone: "success",
                label: "인증 상태",
                title: "인증되었습니다.",
                detail: "문서 업로드, 법령 선택, 비교 실행을 진행할 수 있습니다.",
                actions: ["문서를 업로드하거나 기존 문서를 선택하세요.", "좌우 그룹을 구성한 뒤 비교를 실행하세요."],
                debug: ["초기 세션 확인 완료", `user=${data.session.user.email ?? "unknown"}`],
              }
            : {
                tone: "info",
                label: "인증 대기",
                title: "로그인 후 계속 진행하세요.",
                detail: "현재 화면은 보이지만 업로드와 비교 실행은 잠겨 있습니다.",
                actions: ["Google 로그인으로 인증하세요."],
                debug: ["인증 세션 없음"],
              },
        );
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message =
          error instanceof Error ? error.message : "OAuth 세션 교환 중 오류가 발생했습니다.";
        setSession(null);
        setAppNotice({
          tone: "danger",
          label: "인증 오류",
          title: "로그인 세션을 복원하지 못했습니다.",
          detail: message,
          actions: ["Google 로그인을 다시 진행하세요.", "필요하면 세션 강제 초기화를 실행하세요."],
          debug: [`auth bootstrap error=${message}`],
        });
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (event === "SIGNED_OUT") {
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();

        if (currentSession) {
          setSession(currentSession);
          setAppNotice({
            tone: "success",
            label: "인증 상태",
            title: "인증되었습니다.",
            detail: "세션이 유지되어 작업을 계속할 수 있습니다.",
            debug: ["SIGNED_OUT 이벤트 수신 후 기존 세션 유지 확인"],
          });
          return;
        }

        setSession(null);
        setAppNotice({
          tone: "warning",
          label: "인증 상태",
          title: "로그아웃되었습니다.",
          detail: "다시 로그인하기 전까지 업로드와 비교 실행은 비활성화됩니다.",
          actions: ["Google 로그인을 다시 진행하세요."],
          debug: ["SIGNED_OUT 이벤트 처리 완료", "현재 세션 없음"],
        });
        return;
      }

      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        setSession(nextSession);
        setAppNotice({
          tone: "success",
          label: "인증 상태",
          title: "인증되었습니다.",
          detail: "세션이 준비되었습니다.",
          debug: [`auth event=${event}`, `user=${nextSession?.user.email ?? "unknown"}`],
        });
        return;
      }

      if (event === "TOKEN_REFRESHED") {
        setSession(nextSession);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [isSupabaseConfigured]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }

    if (!sessionUserId) {
      setDocuments([]);
      setLawVersions([]);
      setComparisonRuns([]);
      setSelectedDocumentId(null);
      setCheckedDocumentIds([]);
      setComparisonTargetDocumentIds([]);
      setComparisonReferenceDocumentIds([]);
      setDraggingDocumentId(null);
      setSelectedLawVersionIds([]);
      setSelectedComparisonRunId(null);
      setAnalysisRequestKey(0);
      setDocumentPreviewRefreshKey(0);
      setLawPreviewRefreshKey(0);
      setWorkspaceSelectionHydrated(false);
      setWorkspaceFavorites([]);
      return;
    }

    Promise.all([listDocuments(), listLawVersions(), listComparisonRuns()])
      .then(([documentItems, lawVersionItems, comparisonItems]) => {
        const savedSelection = readWorkspaceSelection(sessionUserId);
        const savedFavorites = readWorkspaceFavorites(sessionUserId);
        setDocuments(documentItems);
        setLawVersions(lawVersionItems);
        setComparisonRuns(comparisonItems);
        setWorkspaceFavorites(savedFavorites);
        setSelectedDocumentId((current) => {
          const nextSelectedId =
            workspaceSelectionHydrated && current
              ? current
              : (savedSelection?.selectedDocumentId ?? null);
          return nextSelectedId && documentItems.some((item) => item.id === nextSelectedId)
            ? nextSelectedId
            : null;
        });
        setCheckedDocumentIds((current) =>
          current.filter((id) => documentItems.some((item) => item.id === id)),
        );
        setComparisonTargetDocumentIds((current) =>
          filterExistingIds(
            workspaceSelectionHydrated ? current : (savedSelection?.targetDocumentIds ?? []),
            documentItems,
          ),
        );
        setComparisonReferenceDocumentIds((current) =>
          filterExistingIds(
            workspaceSelectionHydrated ? current : (savedSelection?.referenceDocumentIds ?? []),
            documentItems,
          ),
        );
        setSelectedLawVersionIds((current) =>
          filterExistingIds(
            workspaceSelectionHydrated ? current : (savedSelection?.lawVersionIds ?? []),
            lawVersionItems,
          ),
        );
        setSelectedComparisonRunId((current) =>
          current && comparisonItems.some((item) => item.id === current) ? current : null,
        );
        setWorkspaceSelectionHydrated(true);
      })
      .catch((error: Error) => {
        setAppNotice({
          tone: "danger",
          label: "데이터 로드 오류",
          title: "작업 공간 데이터를 불러오지 못했습니다.",
          detail: error.message,
          actions: ["인증 상태를 확인하세요.", "Supabase 테이블과 뷰가 배포되어 있는지 확인하세요."],
          debug: [`workspace bootstrap error=${error.message}`],
        });
      })
      .finally(() => undefined);
  }, [sessionUserId, isSupabaseConfigured, workspaceSelectionHydrated]);

  useEffect(() => {
    const hasSelectionContext =
      comparisonTargetDocumentIds.length > 0 &&
      (comparisonReferenceDocumentIds.length > 0 || selectedLawVersionIds.length > 0);

    if (!hasSelectionContext) {
      setComparisonAnalysisState(emptyComparisonAnalysisState);
      return;
    }

    if (analysisRequestKey === 0) {
      return;
    }

    let cancelled = false;

    setComparisonAnalysisState({
      ...emptyComparisonAnalysisState,
      isAnalyzingSelection: true,
      analysisStageLabel: "1단계 검토 비교 대상 정리 중",
      analysisStagePhase: "left",
      analysisStageStartedAt: Date.now(),
    });

    (async () => {
      setStatus("1단계 검토 비교 대상 정리를 시작했습니다.");
      const leftStage = await runComparisonStageWithTimeout(
        "1단계 왼쪽 그룹 정리",
        analyzeSelectedRevisionsStage({
          stage: "left",
          targetDocumentIds: comparisonTargetDocumentIds,
          referenceDocumentIds: comparisonReferenceDocumentIds,
          lawVersionIds: selectedLawVersionIds,
          promptOverrides,
        }),
      );

      if (cancelled) {
        return;
      }

      setComparisonAnalysisState((current) => ({
        ...current,
        leftGroupReport: leftStage.left_group_report,
        apiCallCount: leftStage.api_call_count,
        analysisStageLabel: "2단계 기준 정리 중",
        analysisStagePhase: "right",
        analysisStageStartedAt: Date.now(),
      }));

      setStatus("2단계 기준 정리를 시작했습니다.");
      const rightStage = await runComparisonStageWithTimeout(
        "2단계 기준 정리",
        analyzeSelectedRevisionsStage({
          stage: "right",
          targetDocumentIds: comparisonTargetDocumentIds,
          referenceDocumentIds: comparisonReferenceDocumentIds,
          lawVersionIds: selectedLawVersionIds,
          promptOverrides,
        }),
      );

      if (cancelled) {
        return;
      }

      setComparisonAnalysisState((current) => ({
        ...current,
        rightGroupReport: rightStage.right_group_report,
        apiCallCount: Math.max(current.apiCallCount, rightStage.api_call_count),
        analysisStageLabel: "3단계 최종 비교 리포트 생성 중",
        analysisStagePhase: "final",
        analysisStageStartedAt: Date.now(),
      }));

      setStatus("3단계 최종 비교 리포트 생성을 시작했습니다.");
      const finalStage = await runComparisonStageWithTimeout(
        "3단계 최종 비교 리포트 생성",
        analyzeSelectedRevisionsStage({
          stage: "final",
          targetDocumentIds: comparisonTargetDocumentIds,
          referenceDocumentIds: comparisonReferenceDocumentIds,
          lawVersionIds: selectedLawVersionIds,
          leftGroupReport: leftStage.left_group_report,
          rightGroupReport: rightStage.right_group_report,
          promptOverrides,
        }),
      );

      if (cancelled) {
        return;
      }

      setComparisonAnalysisState({
        aiGuidance: {
          left_group_report: leftStage.left_group_report as NonNullable<typeof leftStage.left_group_report>,
          right_group_report: rightStage.right_group_report as NonNullable<typeof rightStage.right_group_report>,
          comparison_report: finalStage.comparison_report as NonNullable<typeof finalStage.comparison_report>,
          model: finalStage.model,
          api_call_count: finalStage.api_call_count,
        },
        leftGroupReport: leftStage.left_group_report,
        rightGroupReport: rightStage.right_group_report,
        comparisonReport: finalStage.comparison_report,
        aiAnalysisError: null,
        apiCallCount: finalStage.api_call_count,
        isAnalyzingSelection: false,
        analysisStageLabel: "3단계 리포트 생성 완료",
        analysisStagePhase: "complete",
        analysisStageStartedAt: Date.now(),
      });
      setStatus("3단계 최종 비교 리포트 생성이 완료되었습니다.");
      setActiveWorkspaceSection("results");
    })().catch((error: Error) => {
      if (cancelled) {
        return;
      }

      setComparisonAnalysisState({
        ...emptyComparisonAnalysisState,
        aiAnalysisError: error.message,
      });
      setStatus(error.message);
    });

    return () => {
      cancelled = true;
    };
  }, [
    analysisRequestKey,
    comparisonReferenceDocumentIds,
    comparisonTargetDocumentIds,
    promptOverrides,
    selectedLawVersionIds,
  ]);

  useEffect(() => {
    const hasSelectionContext =
      comparisonTargetDocumentIds.length > 0 &&
      (comparisonReferenceDocumentIds.length > 0 || selectedLawVersionIds.length > 0);

    if (!hasSelectionContext || analysisRequestKey === 0) {
      setComparisonOverview(null);
      return;
    }

    setComparisonOverview({
      selectionSummary: `비교 대상 ${comparisonTargetDocumentIds.length}개, 기준 ${
        comparisonReferenceDocumentIds.length + selectedLawVersionIds.length
      }개가 현재 분석 범위에 포함되어 있습니다.`,
      selectionCounts: {
        leftDocumentCount: comparisonTargetDocumentIds.length,
        rightDocumentCount: comparisonReferenceDocumentIds.length,
        rightLawCount: selectedLawVersionIds.length,
      },
      apiCallCount: comparisonAnalysisState.apiCallCount,
      stageProgress: getStageProgress({
        leftGroupReport: comparisonAnalysisState.leftGroupReport,
        rightGroupReport: comparisonAnalysisState.rightGroupReport,
        comparisonReport: comparisonAnalysisState.comparisonReport,
        isAnalyzingSelection: comparisonAnalysisState.isAnalyzingSelection,
        analysisStageLabel: comparisonAnalysisState.analysisStageLabel,
        analysisStagePhase: comparisonAnalysisState.analysisStagePhase,
        analysisStageStartedAt: comparisonAnalysisState.analysisStageStartedAt,
        now: Date.now(),
      }),
    });
  }, [
    analysisRequestKey,
    comparisonAnalysisState,
    comparisonReferenceDocumentIds.length,
    comparisonTargetDocumentIds.length,
    selectedLawVersionIds.length,
  ]);

  useEffect(() => {
    if (!sessionUserId || !workspaceSelectionHydrated) {
      return;
    }

    writeWorkspaceSelection(sessionUserId, {
      selectedDocumentId,
      targetDocumentIds: comparisonTargetDocumentIds,
      referenceDocumentIds: comparisonReferenceDocumentIds,
      lawVersionIds: selectedLawVersionIds,
    });
  }, [
    sessionUserId,
    workspaceSelectionHydrated,
    selectedDocumentId,
    comparisonTargetDocumentIds,
    comparisonReferenceDocumentIds,
    selectedLawVersionIds,
  ]);

  useEffect(() => {
    if (!sessionUserId || !workspaceSelectionHydrated) {
      return;
    }

    writeWorkspaceFavorites(sessionUserId, workspaceFavorites);
  }, [sessionUserId, workspaceSelectionHydrated, workspaceFavorites]);

  async function handleUpload(file: File, title: string, description: string) {
    setAppNotice({
      tone: "info",
      label: "업로드 진행",
      title: "문서를 업로드하고 구조화 섹션을 등록하는 중입니다...",
      detail: `${file.name} 파일을 읽어 장·조·항·호·목 구조로 파싱합니다.`,
      actions: ["업로드가 끝날 때까지 현재 탭을 유지하세요."],
      debug: [`upload file=${file.name}`, `title=${title || file.name}`, `size=${file.size}`],
    });
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
      setSelectedDocumentId((current) =>
        current && documentItems.some((item) => item.id === current) ? current : null,
      );
      setCheckedDocumentIds((current) =>
        current.filter((id) => documentItems.some((item) => item.id === id)),
      );
      setComparisonTargetDocumentIds((current) =>
        current.filter((id) => documentItems.some((item) => item.id === id)),
      );
      setComparisonReferenceDocumentIds((current) =>
        current.filter((id) => documentItems.some((item) => item.id === id)),
      );
      setSelectedLawVersionIds((current) =>
        current.filter((id) => lawVersionItems.some((item) => item.id === id)),
      );
      setSelectedComparisonRunId((current) =>
        current && comparisonItems.some((item) => item.id === current) ? current : null,
      );
      setAppNotice({
        tone: "success",
        label: "업로드 완료",
        title: "문서 업로드와 구조 파싱이 완료되었습니다.",
        detail: `"${title || file.name}" 문서가 목록에 반영되었습니다.`,
        actions: ["문서 목록에서 방금 올린 문서를 선택해 구조를 확인하세요.", "비교 대상 그룹으로 드래그해 비교 플로우를 이어가세요."],
        debug: [`documents=${documentItems.length}`, `comparison_runs=${comparisonItems.length}`],
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "문서 업로드 중 오류가 발생했습니다.";
      setAppNotice({
        tone: "danger",
        label: "업로드 실패",
        title: "문서 업로드 중 오류가 발생했습니다.",
        detail: message,
        actions: ["지원 형식(txt, md, docx)인지 확인하세요.", "로그인 세션이 유효한지 확인한 뒤 다시 시도하세요."],
        debug: [`upload error=${message}`],
      });
    }
  }

  async function handleDeleteDocument(document: DocumentSummary) {
    const confirmationCode = createDeleteConfirmationCode();
    const copiedToClipboard = await copyTextToClipboard(confirmationCode);
    const input = window.prompt(
      [
        `문서 "${document.title}" 를 삭제합니다.`,
        "삭제를 계속하려면 아래 확인 코드를 정확히 입력하세요.",
        confirmationCode,
        copiedToClipboard
          ? "확인 코드를 클립보드에 복사했습니다."
          : "확인 코드를 직접 선택해 복사하세요.",
      ].join("\n"),
    );

    if (input === null) {
      setAppNotice({
        tone: "info",
        label: "삭제 취소",
        title: "문서 삭제를 취소했습니다.",
        detail: "입력 확인 단계에서 작업이 중단되었습니다.",
        debug: [`delete cancel document_id=${document.id}`],
      });
      return;
    }

    if (input.trim() !== confirmationCode) {
      setAppNotice({
        tone: "warning",
        label: "삭제 차단",
        title: "확인 코드가 일치하지 않아 문서를 삭제하지 않았습니다.",
        detail: "실수로 삭제되는 것을 막기 위해 코드가 일치할 때만 삭제를 진행합니다.",
        actions: ["문서를 다시 삭제하려면 표시된 확인 코드를 정확히 입력하세요."],
        debug: [`delete blocked document_id=${document.id}`],
      });
      return;
    }

    setDeletingDocumentId(document.id);
    setAppNotice({
      tone: "warning",
      label: "삭제 진행",
      title: "문서를 삭제하는 중입니다...",
      detail: `"${document.title}"와 연결된 선택 상태를 함께 정리합니다.`,
      debug: [`delete start document_id=${document.id}`],
    });

    try {
      await deleteDocument({ documentId: document.id });
      const [documentItems, lawVersionItems, comparisonItems] = await Promise.all([
        listDocuments(),
        listLawVersions(),
        listComparisonRuns(),
      ]);
      setDocuments(documentItems);
      setLawVersions(lawVersionItems);
      setComparisonRuns(comparisonItems);
      setSelectedDocumentId((current) =>
        current && documentItems.some((item) => item.id === current) ? current : null,
      );
      setCheckedDocumentIds((current) =>
        current.filter((id) => documentItems.some((item) => item.id === id)),
      );
      setComparisonTargetDocumentIds((current) =>
        current.filter((id) => documentItems.some((item) => item.id === id)),
      );
      setComparisonReferenceDocumentIds((current) =>
        current.filter((id) => documentItems.some((item) => item.id === id)),
      );
      setSelectedComparisonRunId((current) =>
        current && comparisonItems.some((item) => item.id === current) ? current : null,
      );
      setAppNotice({
        tone: "success",
        label: "삭제 완료",
        title: "문서 삭제가 완료되었습니다.",
        detail: "문서 목록과 비교 대상 그룹에서 해당 항목을 정리했습니다.",
        debug: [`documents=${documentItems.length}`, `comparison_runs=${comparisonItems.length}`],
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "문서 삭제 중 오류가 발생했습니다.";
      setAppNotice({
        tone: "danger",
        label: "삭제 실패",
        title: "문서 삭제 중 오류가 발생했습니다.",
        detail: message,
        debug: [`delete error=${message}`],
      });
    } finally {
      setDeletingDocumentId(null);
    }
  }

  async function handleReparseDocument(document: DocumentSummary) {
    setReparsingDocumentId(document.id);
    setAppNotice({
      tone: "info",
      label: "문서 재파싱",
      title: "문서 구조를 최신 규칙으로 다시 파싱하는 중입니다...",
      detail: `"${document.title}"의 장·조·항·호·목 구조를 다시 계산합니다.`,
      debug: [`reparse start document_id=${document.id}`],
    });

    try {
      await reparseDocument({ documentId: document.id });
      const [documentItems, comparisonItems] = await Promise.all([
        listDocuments(),
        listComparisonRuns(),
      ]);
      setDocuments(documentItems);
      setComparisonRuns(comparisonItems);
      setSelectedDocumentId((current) =>
        current && documentItems.some((item) => item.id === current) ? current : document.id,
      );
      setCheckedDocumentIds((current) =>
        current.filter((id) => documentItems.some((item) => item.id === id)),
      );
      setComparisonTargetDocumentIds((current) =>
        current.filter((id) => documentItems.some((item) => item.id === id)),
      );
      setComparisonReferenceDocumentIds((current) =>
        current.filter((id) => documentItems.some((item) => item.id === id)),
      );
      setSelectedComparisonRunId((current) =>
        current && comparisonItems.some((item) => item.id === current) ? current : null,
      );
      setAppNotice({
        tone: "success",
        label: "문서 재파싱",
        title: "문서 구조를 최신 규칙으로 다시 파싱했습니다.",
        detail: `"${document.title}"의 구조화 섹션을 새 규칙으로 갱신했습니다.`,
        actions: ["문서 보기 패널에서 항·호 분리가 올바른지 확인하세요."],
        debug: [`documents=${documentItems.length}`, `comparison_runs=${comparisonItems.length}`],
      });
      setDocumentPreviewRefreshKey((current) => current + 1);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "문서 재파싱 중 오류가 발생했습니다.";
      setAppNotice({
        tone: "danger",
        label: "문서 재파싱 실패",
        title: "문서 재파싱 중 오류가 발생했습니다.",
        detail: message,
        debug: [`reparse error=${message}`],
      });
    } finally {
      setReparsingDocumentId(null);
    }
  }

  async function handleDeleteLawSource(lawVersionId: string) {
    setAppNotice({
      tone: "warning",
      label: "법령 정리",
      title: "법령을 삭제하는 중입니다...",
      detail: "선택된 기준 그룹에서도 함께 제거됩니다.",
      debug: [`delete law_version_id=${lawVersionId}`],
    });

    try {
      await deleteLawSource({ lawVersionId });
      const lawVersionItems = await listLawVersions();
      setLawVersions(lawVersionItems);
      setSelectedLawVersionIds((current) => current.filter((id) => id !== lawVersionId));
      setAppNotice({
        tone: "success",
        label: "법령 정리",
        title: "법령 삭제가 완료되었습니다.",
        detail: "기준과 등록된 법령 목록을 새로 고쳤습니다.",
        debug: [`law_versions=${lawVersionItems.length}`],
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "법령 삭제 중 오류가 발생했습니다.";
      setAppNotice({
        tone: "danger",
        label: "법령 정리 실패",
        title: "법령 삭제 중 오류가 발생했습니다.",
        detail: message,
        debug: [`law delete error=${message}`],
      });
    }
  }

  async function handleReparseLawSource(lawVersionId: string) {
    setAppNotice({
      tone: "info",
      label: "법령 재파싱",
      title: "법령 구조를 최신 규칙으로 다시 파싱하는 중입니다...",
      detail: "장·조·항·호·목 구조를 다시 계산해 비교 정확도를 높입니다.",
      debug: [`reparse law_version_id=${lawVersionId}`],
    });

    try {
      await reparseLawSource({ lawVersionId });
      const lawVersionItems = await listLawVersions();
      setLawVersions(lawVersionItems);
      setSelectedLawVersionIds((current) =>
        current.filter((id) => lawVersionItems.some((item) => item.id === id)),
      );
      setAppNotice({
        tone: "success",
        label: "법령 재파싱",
        title: "법령 구조를 최신 규칙으로 다시 파싱했습니다.",
        detail: "선택 상태는 유지한 채 구조 정보만 갱신했습니다.",
        debug: [`law_versions=${lawVersionItems.length}`],
      });
      setLawPreviewRefreshKey((current) => current + 1);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "법령 재파싱 중 오류가 발생했습니다.";
      setAppNotice({
        tone: "danger",
        label: "법령 재파싱 실패",
        title: "법령 재파싱 중 오류가 발생했습니다.",
        detail: message,
        actions: ["원문 링크 또는 저장된 원문 데이터를 확인하세요.", "필요하면 법령을 다시 등록하세요."],
        debug: [`law reparse error=${message}`],
      });
    }
  }

  async function handleRunComparison() {
    const selectedDocuments = documents.filter(
      (document) => comparisonTargetDocumentIds.includes(document.id) && document.version_id,
    );
    const selectedReferenceDocuments = documents.filter((document) =>
      comparisonReferenceDocumentIds.includes(document.id),
    );

    if (selectedDocuments.length === 0) {
      setAppNotice({
        tone: "warning",
        label: "비교 실행 차단",
        title: "비교할 정책 또는 지침을 선택하세요.",
        detail: "비교 대상이 비어 있으면 비교를 시작할 수 없습니다.",
        actions: ["문서 목록에서 문서를 비교 대상으로 드래그하세요."],
        debug: ["comparison blocked target_count=0"],
      });
      return;
    }

    if (selectedReferenceDocuments.length === 0 && selectedLawVersionIds.length === 0) {
      setAppNotice({
        tone: "warning",
        label: "비교 실행 차단",
        title: "기준에 비교 기준 문서 또는 기준 법률을 선택하세요.",
        detail: "비교 기준이 없으면 차이 분석과 AI 권고를 만들 수 없습니다.",
        actions: ["문서를 기준으로 드래그하거나 등록된 법령을 추가하세요."],
        debug: ["comparison blocked reference_count=0", "comparison blocked law_count=0"],
      });
      return;
    }

    setAppNotice({
      tone: "info",
      label: "검토 실행 시작",
      title: "검토 실행을 시작했습니다.",
      detail: `${selectedDocuments.length}개 비교 대상과 ${selectedReferenceDocuments.length + selectedLawVersionIds.length}개 기준으로 분석을 준비 중입니다.`,
      actions: ["하단 진행 박스에서 현재 분석 범위와 단계 진행 상태를 확인하세요."],
      debug: [
        `target_count=${selectedDocuments.length}`,
        `reference_count=${selectedReferenceDocuments.length}`,
        `law_count=${selectedLawVersionIds.length}`,
        "ai_analysis_requested=true",
      ],
    });

    if (selectedLawVersionIds.length === 0) {
      setAnalysisRequestKey((current) => current + 1);
      setAppNotice({
        tone: "info",
        label: "검토 실행 중",
        title: `좌측 정책·지침 ${selectedDocuments.length}건과 우측 기준 문서 ${selectedReferenceDocuments.length}건의 AI 검토를 진행 중입니다.`,
        detail: "법령 없이 문서 간 갭 분석만 순차 실행합니다.",
        actions: ["하단 진행 박스에서 1단계, 2단계, 3단계 진행 상태를 확인하세요."],
        debug: [`target_count=${selectedDocuments.length}`, `reference_count=${selectedReferenceDocuments.length}`, "law_count=0"],
      });
      return;
    }

    setAnalysisRequestKey((current) => current + 1);

    setAppNotice({
      tone: "info",
      label: "비교 실행",
      title: "좌우 그룹 AI 비교 리포트와 법령 비교를 함께 실행하는 중입니다...",
      detail: `${selectedDocuments.length}개 정책·지침과 ${selectedLawVersionIds.length}개 법령 조합의 결정론 비교를 진행하면서, 좌우 그룹 OpenAI 리포트도 별도로 생성합니다.`,
      actions: ["하단 비교 검토 패널에서 3단계 AI 리포트가 먼저 표시되는지 확인하세요."],
      debug: [
        `target_count=${selectedDocuments.length}`,
        `reference_count=${selectedReferenceDocuments.length}`,
        `law_count=${selectedLawVersionIds.length}`,
        "ai_analysis_requested=true",
      ],
    });

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
      setAppNotice({
        tone: "success",
        label: "비교 완료",
        title: `좌측 정책·지침 ${selectedDocuments.length}건, 우측 기준 문서 ${selectedReferenceDocuments.length}건, 기준 법률 ${selectedLawVersionIds.length}건의 결정론 비교가 완료되었습니다.`,
        detail: "AI 3단계 리포트와 비교 결과를 함께 검토할 수 있습니다.",
        actions: ["하단 비교 검토 패널에서 왼쪽 정리, 오른쪽 정리, 최종 비교 리포트를 확인하세요."],
        debug: [
          `comparison_runs=${comparisonItems.length}`,
          `selected_run=${comparisonRunId ?? "none"}`,
          "ai_analysis_requested=true",
        ],
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "비교 실행 중 오류가 발생했습니다.";
      setAppNotice({
        tone: "warning",
        label: "결정론 비교 실패",
        title: "법령 기준 결정론 비교 실행 중 오류가 발생했습니다.",
        detail: `결정론 비교는 실패했지만, 좌우 그룹 OpenAI 리포트는 별도로 생성됩니다. ${message}`,
        actions: ["하단 비교 검토 패널에서 3단계 AI 리포트가 생성됐는지 먼저 확인하세요.", "필요하면 구조 섹션과 법령 비교 데이터를 다시 점검하세요."],
        debug: [`comparison error=${message}`, "ai_analysis_requested=true"],
      });
    }
  }

  function handleAddLawVersion(lawVersionId: string) {
    setSelectedLawVersionIds((current) =>
      current.includes(lawVersionId) ? current : [...current, lawVersionId],
    );
    const lawVersion = lawVersions.find((item) => item.id === lawVersionId);
    setAppNotice({
      tone: "info",
      label: "선택 변경",
      title: "기준 법률을 비교 그룹에 추가했습니다.",
      detail: lawVersion?.source_title ?? "선택된 법률을 우측 기준 그룹에 반영했습니다.",
      debug: [`law_version_id=${lawVersionId}`],
    });
  }

  function handleSelectDocument(documentId: string) {
    setSelectedDocumentId(documentId);
    setDocumentPreviewRefreshKey((current) => current + 1);
    const document = documents.find((item) => item.id === documentId);
    setAppNotice({
      tone: "info",
      label: "문서 선택",
      title: "문서 보기에 표시할 문서를 선택했습니다.",
      detail: document ? document.title : "선택한 문서를 불러옵니다.",
      debug: [`document_id=${documentId}`],
    });
  }

  function handleRemoveLawVersion(lawVersionId: string) {
    setSelectedLawVersionIds((current) => current.filter((id) => id !== lawVersionId));
    const lawVersion = lawVersions.find((item) => item.id === lawVersionId);
    setAppNotice({
      tone: "info",
      label: "선택 변경",
      title: "기준 법률을 비교 그룹에서 제거했습니다.",
      detail: lawVersion?.source_title ?? "선택한 법률을 우측 기준 그룹에서 제외했습니다.",
      debug: [`law_version_id=${lawVersionId}`],
    });
  }

  function handleDropTargetDocument(documentId: string) {
    setComparisonTargetDocumentIds((current) =>
      current.includes(documentId) ? current : [...current, documentId],
    );
    setComparisonReferenceDocumentIds((current) => current.filter((id) => id !== documentId));
    const document = documents.find((item) => item.id === documentId);
    setAppNotice({
      tone: "info",
      label: "그룹 이동",
      title: "문서를 비교 대상 그룹으로 이동했습니다.",
      detail: document ? document.title : "선택한 문서를 비교 대상에 배치했습니다.",
      debug: [`document_id=${documentId}`, "group=target"],
    });
  }

  function handleRemoveTargetDocument(documentId: string) {
    setComparisonTargetDocumentIds((current) => current.filter((id) => id !== documentId));
    const document = documents.find((item) => item.id === documentId);
    setAppNotice({
      tone: "info",
      label: "그룹 이동",
      title: "문서를 비교 대상 그룹에서 해제했습니다.",
      detail: document ? document.title : "문서 목록으로 다시 표시됩니다.",
      debug: [`document_id=${documentId}`, "group=target_removed"],
    });
  }

  function handleDropReferenceDocument(documentId: string) {
    setComparisonReferenceDocumentIds((current) =>
      current.includes(documentId) ? current : [...current, documentId],
    );
    setComparisonTargetDocumentIds((current) => current.filter((id) => id !== documentId));
    const document = documents.find((item) => item.id === documentId);
    setAppNotice({
      tone: "info",
      label: "그룹 이동",
      title: "문서를 기준 문서 그룹으로 이동했습니다.",
      detail: document ? document.title : "선택한 문서를 우측 기준 그룹에 배치했습니다.",
      debug: [`document_id=${documentId}`, "group=reference"],
    });
  }

  function handleRemoveReferenceDocument(documentId: string) {
    setComparisonReferenceDocumentIds((current) => current.filter((id) => id !== documentId));
    const document = documents.find((item) => item.id === documentId);
    setAppNotice({
      tone: "info",
      label: "그룹 이동",
      title: "문서를 기준 문서 그룹에서 해제했습니다.",
      detail: document ? document.title : "문서 목록으로 다시 표시됩니다.",
      debug: [`document_id=${documentId}`, "group=reference_removed"],
    });
  }

  function handleSaveWorkspaceFavorite() {
    const snapshot = createWorkspaceSelectionSnapshot({
      selectedDocumentId,
      targetDocumentIds: comparisonTargetDocumentIds,
      referenceDocumentIds: comparisonReferenceDocumentIds,
      lawVersionIds: selectedLawVersionIds,
    });

    if (
      snapshot.targetDocumentIds.length === 0 &&
      snapshot.referenceDocumentIds.length === 0 &&
      snapshot.lawVersionIds.length === 0
    ) {
      setAppNotice({
        tone: "warning",
        label: "즐겨찾기 저장 차단",
        title: "비어 있는 비교 구성을 즐겨찾기로 저장할 수 없습니다.",
        detail: "먼저 좌우 그룹에 문서나 법령을 배치하세요.",
      });
      return;
    }

    const input = window.prompt("현재 비교 구성을 저장할 이름을 입력하세요.");
    if (input === null) {
      return;
    }

    const name = input.trim();
    if (!name) {
      setAppNotice({
        tone: "warning",
        label: "즐겨찾기 저장 차단",
        title: "즐겨찾기 이름이 비어 있어 저장하지 않았습니다.",
      });
      return;
    }

    const updatedAt = new Date().toISOString();
    setWorkspaceFavorites((current) => {
      const existing = current.find((item) => item.name === name);
      if (existing) {
        return current.map((item) =>
          item.id === existing.id
            ? { ...item, updatedAt, selection: snapshot }
            : item,
        );
      }

      return [
        {
          id: crypto.randomUUID(),
          name,
          updatedAt,
          selection: snapshot,
        },
        ...current,
      ];
    });

    setAppNotice({
      tone: "success",
      label: "즐겨찾기 저장",
      title: `"${name}" 즐겨찾기를 저장했습니다.`,
      detail: "따로 해제하거나 다른 즐겨찾기를 불러오기 전까지 현재 배치 상태를 다시 불러올 수 있습니다.",
      debug: [
        `target_count=${snapshot.targetDocumentIds.length}`,
        `reference_count=${snapshot.referenceDocumentIds.length}`,
        `law_count=${snapshot.lawVersionIds.length}`,
      ],
    });
  }

  function handleApplyWorkspaceFavorite(favoriteId: string) {
    const favorite = workspaceFavorites.find((item) => item.id === favoriteId);
    if (!favorite) {
      return;
    }

    const targetIds = filterExistingIds(favorite.selection.targetDocumentIds, documents);
    const referenceIds = filterExistingIds(favorite.selection.referenceDocumentIds, documents);
    const lawIds = filterExistingIds(favorite.selection.lawVersionIds, lawVersions);
    const nextSelectedDocumentId =
      favorite.selection.selectedDocumentId &&
      documents.some((item) => item.id === favorite.selection.selectedDocumentId)
        ? favorite.selection.selectedDocumentId
        : null;

    setSelectedDocumentId(nextSelectedDocumentId);
    setComparisonTargetDocumentIds(targetIds);
    setComparisonReferenceDocumentIds(referenceIds);
    setSelectedLawVersionIds(lawIds);
    if (nextSelectedDocumentId) {
      setDocumentPreviewRefreshKey((current) => current + 1);
    }

    setAppNotice({
      tone: "success",
      label: "즐겨찾기 적용",
      title: `"${favorite.name}" 구성을 불러왔습니다.`,
      detail: "저장된 좌우 그룹과 법령 선택 상태를 현재 작업 화면에 반영했습니다.",
      debug: [
        `target_count=${targetIds.length}`,
        `reference_count=${referenceIds.length}`,
        `law_count=${lawIds.length}`,
      ],
    });
  }

  function handleDeleteWorkspaceFavorite(favoriteId: string) {
    const favorite = workspaceFavorites.find((item) => item.id === favoriteId);
    if (!favorite) {
      return;
    }

    setWorkspaceFavorites((current) => current.filter((item) => item.id !== favoriteId));
    setAppNotice({
      tone: "info",
      label: "즐겨찾기 삭제",
      title: `"${favorite.name}" 즐겨찾기를 삭제했습니다.`,
      detail: "현재 화면 배치는 유지되며 저장된 즐겨찾기 목록에서만 제거됩니다.",
    });
  }

  const activeComparisonRunIds = comparisonRuns
    .filter((run) =>
      comparisonTargetDocumentIds.includes(run.document_id ?? "") &&
      selectedLawVersionIds.includes(run.law_version_id ?? ""),
    )
    .map((run) => run.id);
  const highlightedDocumentIds = Array.from(
    new Set([
      ...checkedDocumentIds,
      ...comparisonTargetDocumentIds,
      ...comparisonReferenceDocumentIds,
    ]),
  );
  const workspaceNavigationItems: {
    id: WorkspaceSection;
    label: string;
  }[] = [
    {
      id: "documents",
      label: "문서 관리",
    },
    {
      id: "comparison",
      label: "비교덱 구성",
    },
    {
      id: "results",
      label: "검토 결과",
    },
    {
      id: "history",
      label: "이력 관리",
    },
    {
      id: "settings",
      label: "설정",
    },
  ];
  const activeWorkspaceMeta = getWorkspaceSectionMeta(activeWorkspaceSection);
  const showWorkspaceNavigation = Boolean(session) && isSupabaseConfigured;
  const headerStatus = appNotice ?? {
    tone: "info" as const,
    label: "상태",
    title: "대기 중",
    detail: "현재 실행 중인 작업이 없습니다.",
  };

  return (
    <div className="app-shell">
      <div className="app-frame">
        <div className="app-main-column">
          <div className={`workspace-shell ${showWorkspaceNavigation ? "" : "no-sidebar"}`.trim()}>
            {showWorkspaceNavigation ? (
              <aside className="workspace-sidebar" aria-label="작업 탐색">
                <div className="workspace-sidebar-title">
                  <strong>준거성 검토 시스템</strong>
                </div>
                <nav className="workspace-nav">
                  {workspaceNavigationItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`workspace-nav-item ${activeWorkspaceSection === item.id ? "is-active" : ""}`}
                      onClick={() => {
                        setActiveWorkspaceSection(item.id);
                        if (item.id === "documents") {
                          setSelectedDocumentId(documents[0]?.id ?? null);
                        }
                      }}
                    >
                      <strong>{item.label}</strong>
                    </button>
                  ))}
                </nav>
              </aside>
            ) : null}

            <div className="workspace-content">
              <div className="workspace-hero-row">
                <header
                  className={`hero ${activeWorkspaceSection === "documents" ? "hero-documents" : ""}`.trim()}
                >
                  <div
                    className={`hero-main ${activeWorkspaceSection === "documents" ? "hero-main-documents" : ""}`.trim()}
                  >
                    <p
                      className={`eyebrow ${activeWorkspaceSection === "documents" ? "hero-documents-eyebrow" : ""}`.trim()}
                    >
                      {showWorkspaceNavigation ? activeWorkspaceMeta.kicker : "로그인"}
                    </p>
                    <h1
                      className={`hero-title-single-line ${activeWorkspaceSection === "documents" ? "hero-documents-title" : ""}`.trim()}
                    >
                      {showWorkspaceNavigation ? activeWorkspaceMeta.title : "로그인"}
                    </h1>
                    <p
                      className={`hero-copy ${activeWorkspaceSection === "documents" ? "hero-documents-copy" : ""}`.trim()}
                    >
                      {showWorkspaceNavigation
                        ? activeWorkspaceMeta.description
                        : "로그인 화면을 별도 페이지로 분리했습니다. 인증 후 문서 관리 화면으로 이동합니다."}
                    </p>
                  </div>
                </header>
                <aside className="workspace-status-side">
                  <section className="workspace-status-box" aria-label="상태">
                    <span className="workspace-status-box-label">{headerStatus.label}</span>
                    <strong>{headerStatus.title}</strong>
                    {headerStatus.detail ? <p>{headerStatus.detail}</p> : null}
                  </section>
                </aside>
              </div>

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

                {!showWorkspaceNavigation ? (
                  <section className="panel panel-equal-height workspace-body-card workspace-login-page">
                    <div className="workspace-login-layout">
                      <div className="workspace-login-copy">
                        <p className="workspace-login-kicker">Policy Revision Mgmt</p>
                        <h2>준거성 검토 시스템 로그인</h2>
                        <p>
                          정책 문서 등록, 비교덱 구성, 단계별 AI 검토 결과 확인까지 한 화면에서 처리합니다.
                        </p>
                        <div className="workspace-login-feature-list">
                          <div className="workspace-login-feature">
                            <strong>문서 관리</strong>
                            <p>등록된 정책·지침 문서를 구조화 섹션 기준으로 바로 검토합니다.</p>
                          </div>
                          <div className="workspace-login-feature">
                            <strong>비교덱 구성</strong>
                            <p>비교 대상, 기준 문서, 기준 법령을 배치해 검토 실행 조건을 맞춥니다.</p>
                          </div>
                          <div className="workspace-login-feature">
                            <strong>검토 결과</strong>
                            <p>1, 2, 3단계 AI 리포트와 비교 결과를 프레임 단위로 확인합니다.</p>
                          </div>
                        </div>
                      </div>
                      <AuthPanel session={session} />
                    </div>
                  </section>
                ) : null}

                {activeWorkspaceSection === "documents" ? (
                  <div className="review-shell workspace-documents-layout">
                    <div className="workspace-documents-column">
                      <section className="panel workspace-body-card workspace-documents-panel">
                        <div className="section-header workspace-section-header">
                          <h2>문서 목록</h2>
                          <p>문서 목록에서 선택한 문서를 오른쪽에서 구조와 본문으로 바로 검토할 수 있습니다.</p>
                        </div>
                        <DocumentList
                          documents={documents}
                          selectedId={selectedDocumentId}
                          checkedIds={highlightedDocumentIds}
                          onSelect={handleSelectDocument}
                          onDragDocumentStart={setDraggingDocumentId}
                          onDragDocumentEnd={() => setDraggingDocumentId(null)}
                          onDelete={handleDeleteDocument}
                          onReparse={handleReparseDocument}
                          deletingDocumentId={deletingDocumentId}
                          reparsingDocumentId={reparsingDocumentId}
                        />
                      </section>
                      <section className="panel workspace-documents-upload-panel">
                        <div className="section-header workspace-section-header">
                          <h2>정책·지침 업로드</h2>
                          <p>새 문서를 등록하고 구조화 섹션을 생성합니다.</p>
                        </div>
                        <DocumentUploadForm
                          disabled={!session || !isSupabaseConfigured}
                          onUpload={handleUpload}
                          setStatus={setStatus}
                          disabledReason={getUploadDisabledReason(session, isSupabaseConfigured)}
                        />
                      </section>
                    </div>
                    <section className="panel panel-wide workspace-body-card workspace-document-viewer-panel">
                      <div className="section-header workspace-section-header">
                        <h2>문서 보기</h2>
                        <p>선택한 문서의 구조화 섹션과 세부 내용을 바로 확인합니다.</p>
                      </div>
                      <DocumentViewer
                        documentId={selectedDocumentId}
                        refreshKey={documentPreviewRefreshKey}
                      />
                    </section>
                  </div>
                ) : null}

                {activeWorkspaceSection === "comparison" ? (
                  <section
                    className={`workspace-body-plain workspace-comparison-layout ${selectedLawVersionIds[0] ? "has-law-preview" : "no-law-preview"}`.trim()}
                  >
                    <div className="workspace-comparison-main">
                      <LawSourcePanel
                        documents={documents}
                        targetDocumentIds={comparisonTargetDocumentIds}
                        referenceDocumentIds={comparisonReferenceDocumentIds}
                        draggingDocumentId={draggingDocumentId}
                        lawVersions={lawVersions}
                        selectedLawVersionIds={selectedLawVersionIds}
                        disabled={!session || !isSupabaseConfigured}
                        onAddLawVersion={handleAddLawVersion}
                        onRemoveLawVersion={handleRemoveLawVersion}
                        onDropTargetDocument={handleDropTargetDocument}
                        onRemoveTargetDocument={handleRemoveTargetDocument}
                        onDropReferenceDocument={handleDropReferenceDocument}
                        onRemoveReferenceDocument={handleRemoveReferenceDocument}
                        onDeleteLawSource={handleDeleteLawSource}
                        onReparseLawSource={handleReparseLawSource}
                        onRunComparison={handleRunComparison}
                        favorites={workspaceFavorites.map((item) => ({
                          id: item.id,
                          name: item.name,
                          updatedAt: item.updatedAt,
                        }))}
                        activeFavoriteId={
                          workspaceFavorites.find((item) =>
                            isSameWorkspaceSelection(
                              item.selection,
                              createWorkspaceSelectionSnapshot({
                                selectedDocumentId,
                                targetDocumentIds: comparisonTargetDocumentIds,
                                referenceDocumentIds: comparisonReferenceDocumentIds,
                                lawVersionIds: selectedLawVersionIds,
                              }),
                            ),
                          )?.id ?? null
                        }
                        onSaveFavorite={handleSaveWorkspaceFavorite}
                        onApplyFavorite={handleApplyWorkspaceFavorite}
                        onDeleteFavorite={handleDeleteWorkspaceFavorite}
                        disabledReason={getComparisonDisabledReason(session, isSupabaseConfigured)}
                        overview={comparisonOverview}
                      />
                    </div>
                    {selectedLawVersionIds[0] ? (
                      <aside className="workspace-comparison-side">
                        <LawVersionPreview
                          lawVersionId={selectedLawVersionIds[0] ?? null}
                          refreshKey={lawPreviewRefreshKey}
                        />
                      </aside>
                    ) : null}
                  </section>
                ) : null}

                {activeWorkspaceSection === "results" ? (
                  <section className="workspace-body-plain workspace-results-body">
                    <ComparisonReviewPanel
                      comparisonRunId={selectedComparisonRunId}
                      comparisonRunIds={activeComparisonRunIds}
                      selectedDocumentIds={comparisonTargetDocumentIds}
                      referenceDocumentIds={comparisonReferenceDocumentIds}
                      selectedLawVersionIds={selectedLawVersionIds}
                      historyStorageKey={
                        sessionUserId ? `policy-revision-mgmt-ai-analysis-history:${sessionUserId}` : undefined
                      }
                      viewMode="results"
                      setStatus={setStatus}
                      onOverviewChange={setComparisonOverview}
                      analysisState={comparisonAnalysisState}
                    />
                  </section>
                ) : null}

                {activeWorkspaceSection === "history" ? (
                  <section className="panel panel-wide workspace-body-card">
                    <div className="section-header workspace-section-header">
                      <h2>이력 관리</h2>
                      <p>저장된 검토 결과 이력을 확인하고 다시 불러오거나 삭제합니다.</p>
                    </div>
                    <ComparisonReviewPanel
                      comparisonRunId={selectedComparisonRunId}
                      comparisonRunIds={activeComparisonRunIds}
                      selectedDocumentIds={comparisonTargetDocumentIds}
                      referenceDocumentIds={comparisonReferenceDocumentIds}
                      selectedLawVersionIds={selectedLawVersionIds}
                      historyStorageKey={
                        sessionUserId ? `policy-revision-mgmt-ai-analysis-history:${sessionUserId}` : undefined
                      }
                      viewMode="history"
                      setStatus={setStatus}
                      onOverviewChange={setComparisonOverview}
                      analysisState={comparisonAnalysisState}
                    />
                  </section>
                ) : null}

                {activeWorkspaceSection === "settings" ? (
                  <section className="workspace-body-plain workspace-results-body">
                    <PromptSettingsPanel
                      promptOverrides={promptOverrides}
                      onPromptChange={(stage, value) => {
                        setPromptOverrides((current) => ({
                          ...current,
                          [stage]: value,
                        }));
                      }}
                      onPromptReset={(stage) => {
                        setPromptOverrides((current) => ({
                          ...current,
                          [stage]:
                            stage === "left"
                              ? LEFT_REPORT_INSTRUCTIONS
                              : stage === "right"
                                ? RIGHT_REPORT_INSTRUCTIONS
                                : COMPARISON_REPORT_INSTRUCTIONS,
                        }));
                      }}
                    />
                  </section>
                ) : null}
              </main>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function inferNoticeTone(message: string): NoticeTone {
  if (/오류|실패|missing|유효하지|찾지 못/i.test(message)) {
    return "danger";
  }
  if (/선택하세요|취소|대기|필요|비활성|차단/i.test(message)) {
    return "warning";
  }
  if (/완료|인증|불러왔습니다|생성했습니다/i.test(message)) {
    return "success";
  }
  return "info";
}

function inferNoticeDetail(message: string) {
  if (/선택하세요/.test(message)) {
    return "필수 입력이 없어서 다음 단계로 진행하지 못했습니다.";
  }
  if (/완료|불러왔습니다|생성했습니다/.test(message)) {
    return "결과를 확인한 뒤 다음 작업으로 이어갈 수 있습니다.";
  }
  if (/오류|실패/.test(message)) {
    return "원인 메시지를 확인한 뒤 설정, 인증, 데이터 상태를 점검하세요.";
  }
  return undefined;
}

function inferNoticeActions(message: string) {
  if (/선택하세요/.test(message)) {
    return ["누락된 입력이나 선택 항목을 먼저 채우세요."];
  }
  if (/오류|실패/.test(message)) {
    return ["세부 오류 메시지를 확인하고 다시 시도하세요."];
  }
  return undefined;
}

function getWorkspaceSelectionStorageKey(userId: string) {
  return `policy-revision-mgmt-workspace-selection:${userId}`;
}

function readWorkspaceSelection(userId: string): PersistedWorkspaceSelection | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(getWorkspaceSelectionStorageKey(userId));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedWorkspaceSelection>;
    return {
      selectedDocumentId:
        typeof parsed.selectedDocumentId === "string" ? parsed.selectedDocumentId : null,
      targetDocumentIds: Array.isArray(parsed.targetDocumentIds)
        ? parsed.targetDocumentIds.filter((entry): entry is string => typeof entry === "string")
        : [],
      referenceDocumentIds: Array.isArray(parsed.referenceDocumentIds)
        ? parsed.referenceDocumentIds.filter((entry): entry is string => typeof entry === "string")
        : [],
      lawVersionIds: Array.isArray(parsed.lawVersionIds)
        ? parsed.lawVersionIds.filter((entry): entry is string => typeof entry === "string")
        : [],
    };
  } catch {
    return null;
  }
}

function writeWorkspaceSelection(userId: string, selection: PersistedWorkspaceSelection) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    getWorkspaceSelectionStorageKey(userId),
    JSON.stringify(selection),
  );
}

function getWorkspaceFavoritesStorageKey(userId: string) {
  return `policy-revision-mgmt-workspace-favorites:${userId}`;
}

function readWorkspaceFavorites(userId: string): WorkspaceFavorite[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(getWorkspaceFavoritesStorageKey(userId));
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => normalizeWorkspaceFavorite(entry))
      .filter((entry): entry is WorkspaceFavorite => entry !== null);
  } catch {
    return [];
  }
}

function writeWorkspaceFavorites(userId: string, favorites: WorkspaceFavorite[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    getWorkspaceFavoritesStorageKey(userId),
    JSON.stringify(favorites),
  );
}

function filterExistingIds<T extends { id: string }>(ids: string[], items: T[]) {
  const itemIds = new Set(items.map((item) => item.id));
  return ids.filter((id) => itemIds.has(id));
}

function createWorkspaceSelectionSnapshot(selection: PersistedWorkspaceSelection): PersistedWorkspaceSelection {
  return {
    selectedDocumentId: selection.selectedDocumentId,
    targetDocumentIds: Array.from(new Set(selection.targetDocumentIds)),
    referenceDocumentIds: Array.from(new Set(selection.referenceDocumentIds)),
    lawVersionIds: Array.from(new Set(selection.lawVersionIds)),
  };
}

function normalizeWorkspaceFavorite(value: unknown): WorkspaceFavorite | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<WorkspaceFavorite>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.name !== "string" ||
    typeof candidate.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    name: candidate.name,
    updatedAt: candidate.updatedAt,
    selection: createWorkspaceSelectionSnapshot({
      selectedDocumentId:
        candidate.selection && typeof candidate.selection.selectedDocumentId === "string"
          ? candidate.selection.selectedDocumentId
          : null,
      targetDocumentIds: Array.isArray(candidate.selection?.targetDocumentIds)
        ? candidate.selection.targetDocumentIds.filter(
            (entry): entry is string => typeof entry === "string",
          )
        : [],
      referenceDocumentIds: Array.isArray(candidate.selection?.referenceDocumentIds)
        ? candidate.selection.referenceDocumentIds.filter(
            (entry): entry is string => typeof entry === "string",
          )
        : [],
      lawVersionIds: Array.isArray(candidate.selection?.lawVersionIds)
        ? candidate.selection.lawVersionIds.filter(
            (entry): entry is string => typeof entry === "string",
          )
        : [],
    }),
  };
}

function isSameWorkspaceSelection(
  left: PersistedWorkspaceSelection,
  right: PersistedWorkspaceSelection,
) {
  return (
    left.selectedDocumentId === right.selectedDocumentId &&
    isSameIdList(left.targetDocumentIds, right.targetDocumentIds) &&
    isSameIdList(left.referenceDocumentIds, right.referenceDocumentIds) &&
    isSameIdList(left.lawVersionIds, right.lawVersionIds)
  );
}

function isSameIdList(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function getWorkspaceActions(documentCount: number, lawCount: number) {
  if (documentCount === 0) {
    return ["정책 또는 지침 문서를 먼저 업로드하세요."];
  }
  if (lawCount === 0) {
    return ["법령을 추가하지 않았다면 우선 문서 간 비교부터 진행할 수 있습니다.", "법령 기반 비교가 필요하면 기준 법령을 등록하거나 선택하세요."];
  }
  return ["비교 대상과 기준을 구성한 뒤 비교를 실행하세요."];
}

function getWorkspaceSectionMeta(section: WorkspaceSection) {
  if (section === "documents") {
    return {
      kicker: "문서 관리",
      title: "문서 관리",
      description: "문서 목록을 관리하고, 선택한 문서를 오른쪽에서 바로 검토합니다.",
    };
  }

  if (section === "comparison") {
    return {
      kicker: "비교덱 구성",
      title: "비교덱 구성",
      description: "비교 대상과 기준 문서, 기준 법률을 한 화면에서 배치하고 실행합니다.",
    };
  }

  if (section === "settings") {
    return {
      kicker: "설정",
      title: "설정",
      description: "단계별 프롬프트와 검토 실행 기본 설정을 관리합니다.",
    };
  }

  if (section === "history") {
    return {
      kicker: "이력 관리",
      title: "이력 관리",
      description: "저장된 검토 결과 이력을 확인하고 다시 불러오거나 삭제합니다.",
    };
  }

  return {
    kicker: "검토 결과",
    title: "검토 결과",
    description: "1단계, 2단계, 3단계 결과를 프레임 단위로 검토합니다.",
  };
}

function getUploadDisabledReason(session: Session | null, isSupabaseConfigured: boolean) {
  if (!isSupabaseConfigured) {
    return "Supabase 환경 변수가 없어 업로드를 시작할 수 없습니다.";
  }
  if (!session) {
    return "로그인 후에만 문서 업로드와 파싱을 실행할 수 있습니다.";
  }
  return null;
}

function getComparisonDisabledReason(session: Session | null, isSupabaseConfigured: boolean) {
  if (!isSupabaseConfigured) {
    return "Supabase 환경 변수가 없어 비교 기능이 잠겨 있습니다.";
  }
  if (!session) {
    return "로그인 후에만 비교 실행과 법령 변경 작업을 수행할 수 있습니다.";
  }
  return null;
}

const APP_STAGE_REQUEST_TIMEOUT_MS = 190_000;

function runComparisonStageWithTimeout<T>(label: string, promise: Promise<T>) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error(`${label} 응답이 ${Math.round(APP_STAGE_REQUEST_TIMEOUT_MS / 1000)}초를 넘겨 지연되고 있습니다.`));
      }, APP_STAGE_REQUEST_TIMEOUT_MS);
    }),
  ]);
}

function createDeleteConfirmationCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function copyTextToClipboard(value: string) {
  if (!navigator.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
