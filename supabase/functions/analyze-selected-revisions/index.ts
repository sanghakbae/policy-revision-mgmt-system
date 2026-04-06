import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";

interface AnalyzeSelectedRevisionsRequest {
  documentIds: string[];
  lawVersionIds: string[];
}

interface OpenAIResponsesApiResponse {
  output_parsed?: unknown;
  output_text?: string;
}

interface SelectedRevisionGuidanceResponse {
  summary: string;
  revision_needed: boolean;
  overall_comment: string;
  why_revision_not_immediately_needed: string;
  existing_policy_coverage: string[];
  remaining_watchpoints: string[];
  affected_documents: Array<{
    document_id: string;
    document_title: string;
    target_section_path: string;
    law_title: string;
    policy_evidence_paths: string[];
    law_evidence_paths: string[];
    rationale: string;
    confidence: number;
    suggested_action: string;
  }>;
  general_recommendations: string[];
  low_confidence_notes: string[];
}

const MAX_SECTIONS_PER_DOCUMENT = 40;
const MAX_SECTION_TEXT_LENGTH = 280;
const OPENAI_TIMEOUT_MS = 45000;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = request.headers.get("Authorization");
    const accessToken = extractBearerToken(authHeader);
    if (!accessToken) {
      return json({ error: "Missing authorization token." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
    const openAiModel = Deno.env.get("OPENAI_REVISION_MODEL") ?? "gpt-5.2";

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: "Missing Supabase environment." }, 500);
    }

    if (!openAiApiKey) {
      return json({ error: "OPENAI_API_KEY is not configured." }, 500);
    }

    const authClient = createClient(supabaseUrl, anonKey);
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(accessToken);

    if (userError || !user) {
      return json({ error: userError?.message ?? "Unauthorized." }, 401);
    }

    const body = (await request.json()) as AnalyzeSelectedRevisionsRequest;
    const documentIds = [...new Set(body.documentIds ?? [])].filter(Boolean);
    const lawVersionIds = [...new Set(body.lawVersionIds ?? [])].filter(Boolean);

    if (documentIds.length === 0 || lawVersionIds.length === 0) {
      return json({ error: "documentIds and lawVersionIds are required." }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const [documents, laws] = await Promise.all([
      fetchSelectedDocuments(supabase, documentIds, user.id),
      fetchSelectedLaws(supabase, lawVersionIds, user.id),
    ]);

    const promptInput = {
      request_purpose:
        "Compare the full set of selected internal policies/guidelines against the selected registered laws and determine whether the company should revise its policies/guidelines overall, with document-specific comments when needed.",
      organizational_scope:
        "The target organization is a general private-sector company, not a government agency, public institution, or regulated public-sector operator unless the supplied law text clearly states that the obligation also applies to ordinary private companies.",
      internal_documents: documents,
      laws,
      rules: [
        "Treat internal policy/guideline sections as the controlled target documents.",
        "Treat law sections as authoritative change drivers.",
        "Filter out obligations that apply only to government agencies, public institutions, administrative bodies, or other public-sector entities unless the supplied law text clearly states that private companies are also covered.",
        "Prioritize obligations that an ordinary private company must actually comply with.",
        "Your primary task is to decide whether the selected company policies/guidelines overall need revision.",
        "Return one overall comment that explains whether revision is needed and why.",
        "If you judge that immediate revision is not necessary, you must still explain in detail why the need is low.",
        "That explanation must specifically describe what the current internal policies/guidelines already cover and why that coverage appears sufficient based on the supplied law text.",
        "You must also describe any remaining watchpoints, ambiguities, or future follow-up items even when immediate revision is not required.",
        "When useful, include document-specific comments that identify the most relevant internal document and nearest target section path.",
        "Do not invent unseen clauses.",
        "Cite only supplied section paths.",
        "The output may include both an overall company-level judgment and document-specific comments.",
        "If uncertain, lower confidence and add a low confidence note.",
      ],
    };

    const aiResult = await analyzeWithOpenAi({
      apiKey: openAiApiKey,
      model: openAiModel,
      input: promptInput,
    });

    const { error: auditError } = await supabase.from("policy_audit_logs").insert({
      actor_user_id: user.id,
      action: "SELECTED_REVISIONS_ANALYZED",
      result: "SUCCESS",
      metadata: {
        documentIds,
        lawVersionIds,
        modelName: openAiModel,
      },
    });

    if (auditError) {
      throw auditError;
    }

    return json({
      status: "success",
      data: {
        ...aiResult,
        model: openAiModel,
        api_call_count: 1,
      },
      warnings: [],
      confidence: 1,
      traceability: {
        documentIds,
        lawVersionIds,
        aiUsed: true,
        model: openAiModel,
      },
    });
  } catch (error) {
    return json(
      {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      400,
    );
  }
});

async function fetchSelectedDocuments(
  supabase: ReturnType<typeof createClient>,
  documentIds: string[],
  userId: string,
) {
  const { data, error } = await supabase
    .from("policy_documents")
    .select("id, title, document_type, policy_document_versions!inner(id, version_number)")
    .in("id", documentIds)
    .eq("owner_user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  const documents = [];

  for (const document of data ?? []) {
    const latestVersion = [...(document.policy_document_versions ?? [])].sort(
      (left, right) => right.version_number - left.version_number,
    )[0];

    if (!latestVersion) {
      continue;
    }

    const { data: sections, error: sectionError } = await supabase
      .from("policy_document_sections")
      .select("hierarchy_type, path_display, original_text")
      .eq("document_version_id", latestVersion.id)
      .order("hierarchy_order", { ascending: true })
      .limit(160);

    if (sectionError) {
      throw new Error(sectionError.message);
    }

    documents.push({
      id: document.id,
      title: document.title,
      document_type: document.document_type,
      version_number: latestVersion.version_number,
      section_count: sections?.length ?? 0,
      sections: summarizeSections(sections ?? []),
    });
  }

  return documents;
}

async function fetchSelectedLaws(
  supabase: ReturnType<typeof createClient>,
  lawVersionIds: string[],
  userId: string,
) {
  const { data, error } = await supabase
    .from("policy_law_versions")
    .select("id, version_label, effective_date, policy_law_sources!inner(owner_user_id, source_title)")
    .in("id", lawVersionIds)
    .eq("policy_law_sources.owner_user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  const laws = [];

  for (const lawVersion of data ?? []) {
    const lawSource = Array.isArray(lawVersion.policy_law_sources)
      ? lawVersion.policy_law_sources[0]
      : lawVersion.policy_law_sources;

    const { data: sections, error: sectionError } = await supabase
      .from("policy_law_sections")
      .select("hierarchy_type, path_display, original_text")
      .eq("law_version_id", lawVersion.id)
      .order("hierarchy_order", { ascending: true })
      .limit(160);

    if (sectionError) {
      throw new Error(sectionError.message);
    }

    laws.push({
      id: lawVersion.id,
      title: lawSource?.source_title ?? "법령 문서",
      version_label: lawVersion.version_label,
      effective_date: lawVersion.effective_date,
      section_count: sections?.length ?? 0,
      sections: summarizeSections(sections ?? []),
    });
  }

  return laws;
}

async function analyzeWithOpenAi(input: {
  apiKey: string;
  model: string;
  input: unknown;
}): Promise<SelectedRevisionGuidanceResponse> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`,
    },
    signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    body: JSON.stringify({
      model: input.model,
      instructions: [
        "You analyze selected internal policies/guidelines against selected laws.",
        "The target organization is an ordinary private company.",
        "Ignore public-sector-only obligations unless the supplied law text clearly extends them to ordinary private companies.",
        "Return only structured JSON.",
        "Decide whether the selected company policies/guidelines as a whole need revision based on the supplied laws.",
        "You must always fill every required field in the schema with substantive content.",
        "summary must be a concise overview of the comparison outcome.",
        "overall_comment must be a detailed narrative explaining whether revision is needed and why.",
        "If revision_needed is false, why_revision_not_immediately_needed must contain a concrete, multi-sentence explanation. It must not be empty, generic, or a restatement of the boolean.",
        "If revision_needed is false, existing_policy_coverage must list the concrete topics or obligations that are already covered by current policies/guidelines.",
        "If revision_needed is false, remaining_watchpoints must still list any monitoring points, ambiguities, or future follow-up needs.",
        "If revision_needed is true, why_revision_not_immediately_needed should explain why immediate full revision cannot be deferred.",
        "general_recommendations must contain actionable reviewer guidance, not placeholders.",
        "When useful, affected_documents must name the affected internal document and nearest target section path.",
        "Use only supplied section paths.",
        "Do not make unsupported legal claims.",
        "If evidence is weak, reduce confidence and add a low confidence note.",
      ].join(" "),
      input: JSON.stringify(input.input),
      text: {
        format: {
          type: "json_schema",
          name: "selected_revision_guidance",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              summary: { type: "string" },
              revision_needed: { type: "boolean" },
              overall_comment: { type: "string" },
              why_revision_not_immediately_needed: { type: "string" },
              existing_policy_coverage: {
                type: "array",
                items: { type: "string" },
              },
              remaining_watchpoints: {
                type: "array",
                items: { type: "string" },
              },
              affected_documents: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    document_id: { type: "string" },
                    document_title: { type: "string" },
                    target_section_path: { type: "string" },
                    law_title: { type: "string" },
                    policy_evidence_paths: { type: "array", items: { type: "string" } },
                    law_evidence_paths: { type: "array", items: { type: "string" } },
                    rationale: { type: "string" },
                    confidence: { type: "number", minimum: 0, maximum: 1 },
                    suggested_action: { type: "string" },
                  },
                  required: [
                    "document_id",
                    "document_title",
                    "target_section_path",
                    "law_title",
                    "policy_evidence_paths",
                    "law_evidence_paths",
                    "rationale",
                    "confidence",
                    "suggested_action",
                  ],
                },
              },
              general_recommendations: {
                type: "array",
                items: { type: "string" },
              },
              low_confidence_notes: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: [
              "summary",
              "revision_needed",
              "overall_comment",
              "why_revision_not_immediately_needed",
              "existing_policy_coverage",
              "remaining_watchpoints",
              "affected_documents",
              "general_recommendations",
              "low_confidence_notes",
            ],
          },
        },
      },
    }),
  }).catch((error) => {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error("AI analysis timed out while calling OpenAI.");
    }

    throw error;
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API request failed: ${response.status} ${clipText(errorText, 1200)}`);
  }

  const payload = (await response.json()) as OpenAIResponsesApiResponse;
  if (payload.output_parsed && typeof payload.output_parsed === "object") {
    return validateSelectedRevisionGuidanceResponse(payload.output_parsed);
  }

  if (payload.output_text?.trim()) {
    return validateSelectedRevisionGuidanceResponse(JSON.parse(payload.output_text));
  }

  throw new Error("OpenAI API returned no structured analysis payload.");
}

function validateSelectedRevisionGuidanceResponse(
  value: unknown,
): SelectedRevisionGuidanceResponse {
  if (!value || typeof value !== "object") {
    throw new Error("AI analysis response was not a JSON object.");
  }

  const candidate = value as Record<string, unknown>;
  const requireString = (field: string) => {
    const fieldValue = candidate[field];
    if (typeof fieldValue !== "string" || fieldValue.trim().length === 0) {
      throw new Error(`AI analysis response field '${field}' was empty.`);
    }
    return fieldValue.trim();
  };
  const requireStringArray = (field: string, minimumLength = 0) => {
    const fieldValue = candidate[field];
    if (!Array.isArray(fieldValue)) {
      throw new Error(`AI analysis response field '${field}' was invalid.`);
    }
    const normalized = fieldValue.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
    if (normalized.length < minimumLength) {
      throw new Error(`AI analysis response field '${field}' did not contain enough detail.`);
    }
    return normalized;
  };

  if (typeof candidate.revision_needed !== "boolean") {
    throw new Error("AI analysis response field 'revision_needed' was invalid.");
  }

  const affectedDocumentsRaw = candidate.affected_documents;
  if (!Array.isArray(affectedDocumentsRaw)) {
    throw new Error("AI analysis response field 'affected_documents' was invalid.");
  }

  const affected_documents = affectedDocumentsRaw.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new Error("AI analysis response contained an invalid affected document.");
    }
    const item = entry as Record<string, unknown>;
    return {
      document_id: typeof item.document_id === "string" ? item.document_id : "",
      document_title: typeof item.document_title === "string" ? item.document_title : "",
      target_section_path: typeof item.target_section_path === "string" ? item.target_section_path : "",
      law_title: typeof item.law_title === "string" ? item.law_title : "",
      policy_evidence_paths: Array.isArray(item.policy_evidence_paths)
        ? item.policy_evidence_paths.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [],
      law_evidence_paths: Array.isArray(item.law_evidence_paths)
        ? item.law_evidence_paths.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [],
      rationale: typeof item.rationale === "string" ? item.rationale.trim() : "",
      confidence: typeof item.confidence === "number" ? item.confidence : 0,
      suggested_action: typeof item.suggested_action === "string" ? item.suggested_action.trim() : "",
    };
  });

  return {
    summary: requireString("summary"),
    revision_needed: candidate.revision_needed,
    overall_comment: requireString("overall_comment"),
    why_revision_not_immediately_needed: requireString("why_revision_not_immediately_needed"),
    existing_policy_coverage: requireStringArray("existing_policy_coverage", 1),
    remaining_watchpoints: requireStringArray("remaining_watchpoints", 1),
    affected_documents,
    general_recommendations: requireStringArray("general_recommendations", 1),
    low_confidence_notes: requireStringArray("low_confidence_notes", 0),
  };
}

function summarizeSections(
  sections: Array<{
    hierarchy_type: string;
    path_display: string;
    original_text: string;
  }>,
) {
  return sections
    .filter((section) => section.hierarchy_type !== "document")
    .slice(0, MAX_SECTIONS_PER_DOCUMENT)
    .map((section) => ({
      path: section.path_display,
      text: clipText(section.original_text, MAX_SECTION_TEXT_LENGTH),
    }));
}

function extractBearerToken(value: string | null) {
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function clipText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
