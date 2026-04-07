import mammoth from "mammoth";
import {
  getSupabaseClient,
} from "./supabaseClient";
import type {
  AiRevisionGuidance,
  AggregatedComparisonResultRecord,
  ComparisonReviewAggregate,
  ComparisonResultRecord,
  ComparisonReviewDetail,
  ComparisonRunSummary,
  DocumentDetail,
  DocumentSummary,
  LawDetail,
  LawVersionSummary,
} from "../types";

interface ComparisonRunMetaRow {
  id: string;
  source_document_version_id: string;
  target_law_version_id: string;
  policy_document_versions:
    | {
        document_id?: string;
      }
    | Array<{
        document_id?: string;
      }>
    | null;
}

export async function uploadDocument(input: {
  file: File;
  title: string;
  description: string;
}) {
  try {
    const session = await ensureAuthenticatedSession();
    const currentUser = await ensureAuthenticatedUser(session.access_token);
    const fileContentBase64 = await encodeFileAsBase64(input.file);
    const fileText = await extractDocumentText(input.file);
    return await invokeEdgeFunction(
      "register-document",
      {
        title: input.title,
        description: input.description,
        documentType: "POLICY",
        originalFileName: input.file.name,
        fileContentBase64,
        contentType: input.file.type || guessContentType(input.file.name),
        rawText: fileText,
      },
      {
        stage: "edge-function",
        fileName: input.file.name,
        session,
        userId: currentUser.id,
      },
    );
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error("업로드 중 알 수 없는 오류가 발생했습니다.");
  }
}

export async function listDocuments(): Promise<DocumentSummary[]> {
  await ensureAuthenticatedSession();
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("policy_documents")
    .select(
      "id, title, document_type, created_at, policy_document_versions(id, version_number, created_at, policy_document_sections(count))",
    )
    .order("created_at", { ascending: false });

  if (error) {
    throwAuthAwareError(error.message);
  }

  return (data ?? []).map((row) => {
    const latestVersion = [...(row.policy_document_versions ?? [])].sort(
      (left, right) => right.version_number - left.version_number,
    )[0];

    return {
      id: row.id,
      title: row.title,
      document_type: row.document_type,
      version_number: latestVersion?.version_number ?? 0,
      version_id: latestVersion?.id,
      created_at: latestVersion?.created_at ?? row.created_at,
      section_count: latestVersion?.policy_document_sections?.[0]?.count ?? 0,
    };
  });
}

export async function getDocumentDetail(
  documentId: string,
): Promise<DocumentDetail> {
  await ensureAuthenticatedSession();
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("policy_document_details")
    .select("*")
    .eq("id", documentId)
    .single();

  if (error) {
    throwAuthAwareError(error.message);
  }

  return {
    ...data,
    metadata: deriveDocumentMetadata(data.raw_text),
  };
}

export async function listComparisonRuns(): Promise<ComparisonRunSummary[]> {
  await ensureAuthenticatedSession();
  const supabase = getSupabaseClient();
  const [overviewResponse, runResponse] = await Promise.all([
    supabase
    .from("policy_comparison_review_overview")
    .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("policy_comparison_runs")
      .select(
        "id, source_document_version_id, target_law_version_id, policy_document_versions!inner(document_id)",
      ),
  ]);

  if (overviewResponse.error) {
    throwAuthAwareError(overviewResponse.error.message);
  }

  if (runResponse.error) {
    throwAuthAwareError(runResponse.error.message);
  }

  const runMetaById = new Map(
    ((runResponse.data ?? []) as ComparisonRunMetaRow[]).map((row) => [
      row.id,
      {
        document_id: Array.isArray(row.policy_document_versions)
          ? row.policy_document_versions[0]?.document_id
          : row.policy_document_versions?.document_id,
        document_version_id: row.source_document_version_id,
        law_version_id: row.target_law_version_id,
      },
    ]),
  );

  return (overviewResponse.data ?? []).map((row) => ({
    ...row,
    ...runMetaById.get(row.id),
  }));
}

export async function listLawVersions(): Promise<LawVersionSummary[]> {
  await ensureAuthenticatedSession();
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("policy_law_versions")
    .select(
      "id, law_source_id, version_label, effective_date, created_at, policy_law_sources!inner(source_title, source_link), policy_law_sections(count)",
    )
    .order("created_at", { ascending: false });

  if (error) {
    throwAuthAwareError(error.message);
  }

  return (data ?? []).map((row) => {
    const lawSource = Array.isArray(row.policy_law_sources)
      ? row.policy_law_sources[0]
      : row.policy_law_sources;

    return {
      id: row.id,
      law_source_id: row.law_source_id,
      source_title: lawSource?.source_title ?? null,
      source_link: lawSource?.source_link ?? "",
      version_label: row.version_label,
      effective_date: row.effective_date,
      created_at: row.created_at,
      section_count: row.policy_law_sections?.[0]?.count ?? 0,
    };
  });
}

export async function getLawDetail(
  lawVersionId: string,
): Promise<LawDetail> {
  await ensureAuthenticatedSession();
  const supabase = getSupabaseClient();

  const [versionResponse, sectionResponse] = await Promise.all([
    supabase
      .from("policy_law_versions")
      .select(
        "id, version_label, effective_date, raw_text, parse_warnings, policy_law_sources!inner(source_title, source_link)",
      )
      .eq("id", lawVersionId)
      .single(),
    supabase
      .from("policy_law_sections")
      .select(
        "id, hierarchy_type, hierarchy_label, hierarchy_order, original_text, path_display, chapter_label, chapter_text, article_label, article_text, paragraph_label, paragraph_text, item_label, item_text, sub_item_label, sub_item_text",
      )
      .eq("law_version_id", lawVersionId)
      .order("hierarchy_order", { ascending: true }),
  ]);

  if (versionResponse.error) {
    throwAuthAwareError(versionResponse.error.message);
  }

  if (sectionResponse.error) {
    throwAuthAwareError(sectionResponse.error.message);
  }

  const lawSource = Array.isArray(versionResponse.data.policy_law_sources)
    ? versionResponse.data.policy_law_sources[0]
    : versionResponse.data.policy_law_sources;

  return {
    id: versionResponse.data.id,
    source_title: lawSource?.source_title ?? null,
    source_link: lawSource?.source_link ?? "",
    version_label: versionResponse.data.version_label,
    effective_date: versionResponse.data.effective_date,
    raw_text: versionResponse.data.raw_text,
    parse_warnings: Array.isArray(versionResponse.data.parse_warnings)
      ? versionResponse.data.parse_warnings.filter((value): value is string => typeof value === "string")
      : [],
    sections: (sectionResponse.data ?? []) as LawDetail["sections"],
  };
}

export async function registerLawSource(input: {
  sourceLink: string;
  sourceTitle?: string;
  versionLabel?: string;
  effectiveDate?: string;
}) {
  const session = await ensureAuthenticatedSession();
  const currentUser = await ensureAuthenticatedUser(session.access_token);
  return await invokeEdgeFunction("register-law-source", input, {
    stage: "register-law-source",
    session,
    userId: currentUser.id,
  });
}

export async function uploadLawDocument(input: {
  file: File;
  sourceTitle?: string;
  versionLabel?: string;
  effectiveDate?: string;
}) {
  const session = await ensureAuthenticatedSession();
  const currentUser = await ensureAuthenticatedUser(session.access_token);
  const fileContentBase64 = await encodeFileAsBase64(input.file);
  const rawText = isLegacyWordDocument(input.file.name)
    ? ""
    : await extractDocumentText(input.file);
  return await invokeEdgeFunction(
    "register-law-source",
    {
      sourceType: "file",
      sourceTitle: input.sourceTitle,
      versionLabel: input.versionLabel,
      effectiveDate: input.effectiveDate,
      originalFileName: input.file.name,
      fileContentBase64,
      contentType: input.file.type || guessContentType(input.file.name),
      rawText,
    },
    {
      stage: "upload-law-document",
      fileName: input.file.name,
      session,
      userId: currentUser.id,
    },
  );
}

export async function updateLawSource(input: {
  lawVersionId: string;
  sourceLink: string;
  sourceTitle?: string;
  versionLabel?: string;
  effectiveDate?: string;
}) {
  const session = await ensureAuthenticatedSession();
  const currentUser = await ensureAuthenticatedUser(session.access_token);
  return await invokeEdgeFunction(
    "manage-law-source",
    {
      action: "update",
      ...input,
    },
    {
      stage: "update-law-source",
      session,
      userId: currentUser.id,
    },
  );
}

export async function deleteLawSource(input: { lawVersionId: string }) {
  const session = await ensureAuthenticatedSession();
  const currentUser = await ensureAuthenticatedUser(session.access_token);
  return await invokeEdgeFunction(
    "manage-law-source",
    {
      action: "delete",
      ...input,
    },
    {
      stage: "delete-law-source",
      session,
      userId: currentUser.id,
    },
  );
}

export async function runComparison(input: {
  documentVersionId: string;
  lawVersionId: string;
}) {
  const session = await ensureAuthenticatedSession();
  const currentUser = await ensureAuthenticatedUser(session.access_token);
  return await invokeEdgeFunction("run-comparison", input, {
    stage: "run-comparison",
    session,
    userId: currentUser.id,
  });
}

export async function runBulkComparison(input: {
  lawVersionId: string;
}) {
  const session = await ensureAuthenticatedSession();
  const currentUser = await ensureAuthenticatedUser(session.access_token);
  return await invokeEdgeFunction("run-bulk-comparison", input, {
    stage: "run-bulk-comparison",
    session,
    userId: currentUser.id,
  });
}

export async function getComparisonReview(
  comparisonRunId: string,
): Promise<ComparisonReviewDetail> {
  await ensureAuthenticatedSession();
  const supabase = getSupabaseClient();

  const [detailResponse, resultResponse] = await Promise.all([
    supabase
      .from("policy_comparison_review_detail")
      .select("*")
      .eq("id", comparisonRunId)
      .single(),
    supabase
      .from("policy_comparison_results")
      .select(
        "id, affected_path, hierarchy_type, match_type, diff_type, confidence, before_text, after_text, explanation, reasoning_trace, ai_used",
      )
      .eq("comparison_run_id", comparisonRunId)
      .order("affected_path", { ascending: true }),
  ]);

  if (detailResponse.error) {
    throwAuthAwareError(detailResponse.error.message);
  }

  if (resultResponse.error) {
    throwAuthAwareError(resultResponse.error.message);
  }

  const detail = detailResponse.data as Omit<ComparisonReviewDetail, "results"> & {
    warning_messages: unknown;
  };
  const rawResults = (resultResponse.data ?? []) as Array<
    Omit<ComparisonResultRecord, "reasoning_trace"> & {
      reasoning_trace: unknown;
    }
  >;
  const results: ComparisonResultRecord[] = rawResults.map((row) => ({
    ...row,
    reasoning_trace: Array.isArray(row.reasoning_trace)
      ? row.reasoning_trace.filter((value): value is string => typeof value === "string")
      : [],
  }));

  return {
    ...detail,
    warning_messages: Array.isArray(detail.warning_messages)
      ? detail.warning_messages
      : [],
    results,
  };
}

export async function getAggregatedComparisonReview(
  comparisonRunIds: string[],
): Promise<ComparisonReviewAggregate> {
  await ensureAuthenticatedSession();
  const supabase = getSupabaseClient();

  const [detailResponse, resultResponse] = await Promise.all([
    supabase
      .from("policy_comparison_review_detail")
      .select("*")
      .in("id", comparisonRunIds),
    supabase
      .from("policy_comparison_results")
      .select(
        "id, comparison_run_id, affected_path, hierarchy_type, match_type, diff_type, confidence, before_text, after_text, explanation, reasoning_trace, ai_used",
      )
      .in("comparison_run_id", comparisonRunIds)
      .order("affected_path", { ascending: true }),
  ]);

  if (detailResponse.error) {
    throwAuthAwareError(detailResponse.error.message);
  }

  if (resultResponse.error) {
    throwAuthAwareError(resultResponse.error.message);
  }

  const details = (detailResponse.data ?? []) as Array<
    Omit<ComparisonReviewDetail, "results"> & { warning_messages: unknown }
  >;
  const detailById = new Map(details.map((detail) => [detail.id, detail]));

  const rawResults = (resultResponse.data ?? []) as Array<
    Omit<AggregatedComparisonResultRecord, "reasoning_trace" | "policy_title" | "law_title"> & {
      reasoning_trace: unknown;
    }
  >;

  const results: AggregatedComparisonResultRecord[] = rawResults.map((row) => {
    const detail = detailById.get(row.comparison_run_id);

    return {
      ...row,
      policy_title: detail?.policy_title ?? "정책 문서",
      law_title: detail?.law_title ?? "법령 문서",
      reasoning_trace: Array.isArray(row.reasoning_trace)
        ? row.reasoning_trace.filter((value): value is string => typeof value === "string")
        : [],
    };
  });

  return {
    run_ids: comparisonRunIds,
    warning_messages: [...new Set(
      details.flatMap((detail) => Array.isArray(detail.warning_messages) ? detail.warning_messages : []),
    )],
    policy_titles: [...new Set(details.map((detail) => detail.policy_title))],
    law_titles: [...new Set(details.map((detail) => detail.law_title))],
    revision_statuses: details
      .map((detail) => detail.revision_status)
      .filter((status): status is NonNullable<typeof status> => Boolean(status)),
    results,
  };
}

export async function classifyRevision(comparisonRunId: string) {
  const session = await ensureAuthenticatedSession();
  const currentUser = await ensureAuthenticatedUser(session.access_token);
  return await invokeEdgeFunction(
    "classify-revision",
    {
      comparisonRunId,
    },
    {
      stage: "classify-revision",
      session,
      userId: currentUser.id,
    },
  );
}

export async function analyzeSelectedRevisions(input: {
  documentIds: string[];
  lawVersionIds: string[];
}): Promise<AiRevisionGuidance> {
  const session = await ensureAuthenticatedSession();
  const currentUser = await ensureAuthenticatedUser(session.access_token);
  const payload = await invokeEdgeFunction("analyze-selected-revisions", input, {
    stage: "analyze-selected-revisions",
    session,
    userId: currentUser.id,
  });
  return normalizeAiRevisionGuidance(payload.data);
}

function normalizeAiRevisionGuidance(input: unknown): AiRevisionGuidance {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const normalizeItem = (value: unknown) => {
    const item = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
    return {
      document_id: typeof item.document_id === "string" ? item.document_id : "",
      document_title: typeof item.document_title === "string" ? item.document_title : "정책/지침",
      target_section_path:
        typeof item.target_section_path === "string" ? item.target_section_path : "미지정",
      law_title: typeof item.law_title === "string" ? item.law_title : "법령",
      policy_evidence_paths: Array.isArray(item.policy_evidence_paths)
        ? item.policy_evidence_paths.filter((entry): entry is string => typeof entry === "string")
        : [],
      law_evidence_paths: Array.isArray(item.law_evidence_paths)
        ? item.law_evidence_paths.filter((entry): entry is string => typeof entry === "string")
        : [],
      rationale: typeof item.rationale === "string" ? item.rationale : "",
      confidence: typeof item.confidence === "number" ? item.confidence : 0,
      suggested_action:
        typeof item.suggested_action === "string" ? item.suggested_action : "",
    };
  };

  return {
    summary: typeof source.summary === "string" ? source.summary : "AI 비교 결과 요약이 없습니다.",
    revision_needed: typeof source.revision_needed === "boolean" ? source.revision_needed : false,
    overall_comment:
      typeof source.overall_comment === "string"
        ? source.overall_comment
        : "개정 필요 여부에 대한 종합 코멘트가 없습니다.",
    why_revision_not_immediately_needed:
      typeof source.why_revision_not_immediately_needed === "string"
        ? source.why_revision_not_immediately_needed
        : "즉시 개정 필요성이 낮은 이유에 대한 상세 설명이 없습니다.",
    existing_policy_coverage: Array.isArray(source.existing_policy_coverage)
      ? source.existing_policy_coverage.filter((entry): entry is string => typeof entry === "string")
      : [],
    remaining_watchpoints: Array.isArray(source.remaining_watchpoints)
      ? source.remaining_watchpoints.filter((entry): entry is string => typeof entry === "string")
      : [],
    affected_documents: Array.isArray(source.affected_documents)
      ? source.affected_documents.map(normalizeItem)
      : [],
    general_recommendations: Array.isArray(source.general_recommendations)
      ? source.general_recommendations.filter((entry): entry is string => typeof entry === "string")
      : [],
    low_confidence_notes: Array.isArray(source.low_confidence_notes)
      ? source.low_confidence_notes.filter((entry): entry is string => typeof entry === "string")
      : [],
    model: typeof source.model === "string" ? source.model : null,
    api_call_count: typeof source.api_call_count === "number" ? source.api_call_count : 0,
  };
}

async function ensureAuthenticatedSession() {
  const supabase = getSupabaseClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session) {
    throw new Error(
      buildAuthDebugMessage(error?.message, session),
    );
  }

  if (!session.user?.id) {
    throw new Error(buildAuthDebugMessage("사용자 정보가 없습니다.", session));
  }

  const expiresAt = session.expires_at ?? 0;
  const shouldRefresh = expiresAt * 1000 - Date.now() <= 60_000;

  if (!shouldRefresh) {
    return session;
  }

  const {
    data: { session: refreshedSession },
    error: refreshError,
  } = await supabase.auth.refreshSession({
    refresh_token: session.refresh_token,
  });

  if (refreshError || !refreshedSession) {
    throw new Error(
      buildAuthDebugMessage(refreshError?.message ?? "세션 갱신 실패", session),
    );
  }

  return refreshedSession;
}

async function forceRefreshAuthenticatedSession() {
  const supabase = getSupabaseClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.refresh_token) {
    throw new Error(buildAuthDebugMessage(error?.message ?? "세션 갱신 실패", session));
  }

  const {
    data: { session: refreshedSession },
    error: refreshError,
  } = await supabase.auth.refreshSession({
    refresh_token: session.refresh_token,
  });

  if (refreshError || !refreshedSession) {
    throw new Error(
      buildAuthDebugMessage(refreshError?.message ?? "세션 갱신 실패", session),
    );
  }

  return refreshedSession;
}

async function ensureAuthenticatedUser(accessToken: string) {
  const supabase = getSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    throw new Error(
      buildAuthDebugMessage(error?.message ?? "사용자 검증 실패", null),
    );
  }

  return user;
}

async function invokeEdgeFunction<TBody extends Record<string, unknown>>(
  functionName: string,
  body: TBody,
  contextInfo?: {
    stage: string;
    fileName?: string;
    session?: {
      user: {
        id?: string;
      };
      expires_at?: number;
    } | null;
    userId?: string;
  },
) {
  const supabase = getSupabaseClient();
  let response = await supabase.functions.invoke(functionName, { body });

  if (response.error && isJwtError(response.error.message)) {
    const refreshedSession = await forceRefreshAuthenticatedSession();
    response = await supabase.functions.invoke(functionName, {
      body,
      headers: {
        Authorization: `Bearer ${refreshedSession.access_token}`,
      },
    });
  }

  if (response.error) {
    throw new Error(formatFunctionInvokeError(response.error, contextInfo));
  }

  return response.data;
}

async function encodeFileAsBase64(file: File) {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary);
}

function guessContentType(fileName: string) {
  if (fileName.toLowerCase().endsWith(".doc")) {
    return "application/msword";
  }

  if (fileName.toLowerCase().endsWith(".md")) {
    return "text/markdown";
  }

  if (fileName.toLowerCase().endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  return "text/plain";
}

function buildAuthDebugMessage(message?: string, session?: { expires_at?: number } | null) {
  const normalizedMessage = message?.toLowerCase().includes("jwt")
    ? "Invalid JWT"
    : message ?? "로그인이 필요합니다.";
  const expiresAt = session?.expires_at
    ? new Date(session.expires_at * 1000).toISOString()
    : "없음";

  return `인증 단계 실패\n원인: ${normalizedMessage}\n세션 만료 시각: ${expiresAt}`;
}

function buildDebugPrefix(
  message: string,
  contextInfo?: {
    stage: string;
    fileName?: string;
    session?: {
      user: {
        id?: string;
      };
      expires_at?: number;
    } | null;
    userId?: string;
  },
) {
  const sessionExpiry = contextInfo?.session?.expires_at
    ? new Date(contextInfo.session.expires_at * 1000).toISOString()
    : "없음";
  const userId = contextInfo?.userId ?? contextInfo?.session?.user?.id ?? "없음";

  return [
    "업로드 디버그 정보",
    `단계: ${contextInfo?.stage ?? "unknown"}`,
    `파일: ${contextInfo?.fileName ?? "unknown"}`,
    `사용자 ID: ${userId}`,
    `세션 만료 시각: ${sessionExpiry}`,
    `원본 오류: ${message}`,
  ].join("\n");
}

function formatFunctionInvokeError(
  error: Error,
  contextInfo?: {
    stage: string;
    fileName?: string;
    session?: {
      user: {
        id?: string;
      };
      expires_at?: number;
    } | null;
    userId?: string;
  },
) {
  return buildDebugPrefix(error.message || "함수 호출 중 오류가 발생했습니다.", contextInfo);
}

function isJwtError(message?: string) {
  return Boolean(message?.toLowerCase().includes("jwt"));
}

function deriveDocumentMetadata(rawText: string) {
  const lines = rawText
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  let title: string | null = null;
  let revisionDate: string | null = null;
  const documentNotes: string[] = [];

  for (const line of lines) {
    const normalized = line.replace(/\s+/g, " ").trim();

    if (!title && /정\s*보\s*보\s*안\s*정\s*책/u.test(normalized)) {
      title = "정보보안 정책";
      documentNotes.push(line);
      continue;
    }

    if (!title && normalized.length <= 80) {
      title = normalized;
      documentNotes.push(line);
      continue;
    }

    const revisionMatch = normalized.match(/^개정\s*([0-9]{4}\.[0-9]{1,2}\.[0-9]{1,2}\.?)$/u);
    if (!revisionDate && revisionMatch) {
      revisionDate = revisionMatch[1].replace(/\.$/u, "");
      documentNotes.push(line);
    }
  }

  return {
    title,
    revisionDate,
    documentNotes,
  };
}

function throwAuthAwareError(message?: string): never {
  throw new Error(message ?? "요청 처리 중 오류가 발생했습니다.");
}

async function extractDocumentText(file: File) {
  if (/\.(txt|md)$/iu.test(file.name)) {
    return file.text();
  }

  if (/\.(docx)$/iu.test(file.name)) {
    const arrayBuffer = await file.arrayBuffer();
    const extraction = await mammoth.extractRawText({ arrayBuffer });
    const extractedText = extraction.value.trim();

    if (!extractedText) {
      throw new Error("Word 문서에서 텍스트를 추출하지 못했습니다.");
    }

    return extractedText;
  }

  throw new Error("지원하지 않는 문서 형식입니다.");
}

function isLegacyWordDocument(fileName: string) {
  return /\.(doc)$/iu.test(fileName);
}
