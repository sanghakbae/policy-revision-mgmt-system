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
  LawVersionSummary,
} from "../types";

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
    const response = await fetch(buildFunctionUrl("register-document"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        title: input.title,
        description: input.description,
        documentType: "POLICY",
        originalFileName: input.file.name,
        fileContentBase64,
        contentType: input.file.type || guessContentType(input.file.name),
        rawText: fileText,
      }),
    });

    if (!response.ok) {
      throw new Error(
        await getHttpErrorMessage(response, {
          stage: "edge-function",
          fileName: input.file.name,
          session,
          userId: currentUser.id,
        }),
      );
    }

    return await response.json();
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
    (runResponse.data ?? []).map((row: any) => [
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

export async function registerLawSource(input: {
  sourceLink: string;
  sourceTitle?: string;
  versionLabel?: string;
  effectiveDate?: string;
}) {
  const session = await ensureAuthenticatedSession();
  const currentUser = await ensureAuthenticatedUser(session.access_token);
  const response = await fetch(buildFunctionUrl("register-law-source"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(
      await getHttpErrorMessage(response, {
        stage: "register-law-source",
        session,
        userId: currentUser.id,
      }),
    );
  }

  return await response.json();
}

export async function runComparison(input: {
  documentVersionId: string;
  lawVersionId: string;
}) {
  const session = await ensureAuthenticatedSession();
  const currentUser = await ensureAuthenticatedUser(session.access_token);
  const response = await fetch(buildFunctionUrl("run-comparison"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(
      await getHttpErrorMessage(response, {
        stage: "run-comparison",
        session,
        userId: currentUser.id,
      }),
    );
  }

  return await response.json();
}

export async function runBulkComparison(input: {
  lawVersionId: string;
}) {
  const session = await ensureAuthenticatedSession();
  const currentUser = await ensureAuthenticatedUser(session.access_token);
  const response = await fetch(buildFunctionUrl("run-bulk-comparison"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(
      await getHttpErrorMessage(response, {
        stage: "run-bulk-comparison",
        session,
        userId: currentUser.id,
      }),
    );
  }

  return await response.json();
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
  const response = await fetch(buildFunctionUrl("classify-revision"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      comparisonRunId,
    }),
  });

  if (!response.ok) {
    throw new Error(
      await getHttpErrorMessage(response, {
        stage: "classify-revision",
        session,
        userId: currentUser.id,
      }),
    );
  }

  return await response.json();
}

export async function analyzeSelectedRevisions(input: {
  documentIds: string[];
  lawVersionIds: string[];
}): Promise<AiRevisionGuidance> {
  const session = await ensureAuthenticatedSession();
  const currentUser = await ensureAuthenticatedUser(session.access_token);
  const response = await fetch(buildFunctionUrl("analyze-selected-revisions"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(
      await getHttpErrorMessage(response, {
        stage: "analyze-selected-revisions",
        session,
        userId: currentUser.id,
      }),
    );
  }

  const payload = await response.json();
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
    additions: Array.isArray(source.additions) ? source.additions.map(normalizeItem) : [],
    removals: Array.isArray(source.removals) ? source.removals.map(normalizeItem) : [],
    low_confidence_notes: Array.isArray(source.low_confidence_notes)
      ? source.low_confidence_notes.filter((entry): entry is string => typeof entry === "string")
      : [],
    model: typeof source.model === "string" ? source.model : null,
    api_call_count: typeof source.api_call_count === "number" ? source.api_call_count : 0,
  };
}

async function getFunctionErrorMessage(
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
  const functionError = error as Error & {
    context?: {
      json?: () => Promise<unknown>;
      text?: () => Promise<string>;
    };
  };
  const debugPrefix = buildDebugPrefix(error.message, contextInfo);

  const context = functionError.context;
  if (!context) {
    return debugPrefix;
  }

  try {
    if (typeof context.json === "function") {
      const payload = await context.json();
      if (
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
      ) {
        return `${debugPrefix}\n서버 응답: ${payload.error}`;
      }

      if (
        payload &&
        typeof payload === "object" &&
        "message" in payload &&
        typeof payload.message === "string"
      ) {
        return `${debugPrefix}\n서버 응답: ${payload.message}`;
      }
    }
  } catch {
    // Fall through to text parsing.
  }

  try {
    if (typeof context.text === "function") {
      const text = await context.text();
      if (text.trim()) {
        return `${debugPrefix}\n서버 응답: ${text}`;
      }
    }
  } catch {
    // Keep the original error message.
  }

  return debugPrefix;
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

  return session;
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

async function getHttpErrorMessage(
  response: Response,
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
  const debugPrefix = buildDebugPrefix(
    `HTTP ${response.status} ${response.statusText}`,
    contextInfo,
  );

  try {
    const payload = await response.json();
    return `${debugPrefix}\n서버 응답: ${JSON.stringify(payload)}`;
  } catch {
    try {
      const text = await response.text();
      return text ? `${debugPrefix}\n서버 응답: ${text}` : debugPrefix;
    } catch {
      return debugPrefix;
    }
  }
}

function buildFunctionUrl(functionName: string) {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  return `${baseUrl}/functions/v1/${functionName}`;
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
