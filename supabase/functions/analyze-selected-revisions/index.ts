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
        "Compare selected internal policies/guidelines against selected registered laws and produce policy-specific revision guidance that tells reviewers exactly which internal document should add content and which internal document may remove content.",
      organizational_scope:
        "The target organization is a general private-sector company, not a government agency, public institution, or regulated public-sector operator unless the supplied law text clearly states that the obligation also applies to ordinary private companies.",
      internal_documents: documents,
      laws,
      rules: [
        "Treat internal policy/guideline sections as the controlled target documents.",
        "Treat law sections as authoritative change drivers.",
        "Filter out obligations that apply only to government agencies, public institutions, administrative bodies, or other public-sector entities unless the supplied law text clearly states that private companies are also covered.",
        "Prioritize obligations that an ordinary private company must actually comply with.",
        "Recommend additions when the law introduces or makes explicit a requirement that is not adequately reflected in current internal policy/guideline sections.",
        "For every addition, identify the single most relevant internal policy/guideline document and the nearest target section path where the new content should be inserted or revised.",
        "Recommend removals only when current internal policy/guideline content appears redundant, outdated, or unsupported compared with the supplied laws.",
        "For every removal, identify the single most relevant internal policy/guideline document and the exact internal section path that should be reviewed for deletion or reduction.",
        "Do not invent unseen clauses.",
        "Cite only supplied section paths.",
        "The output must be document-specific. Do not produce generic organization-wide advice without naming the affected internal document.",
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
      .select("path_display, original_text")
      .eq("document_version_id", latestVersion.id)
      .order("hierarchy_order", { ascending: true })
      .limit(120);

    if (sectionError) {
      throw new Error(sectionError.message);
    }

    documents.push({
      id: document.id,
      title: document.title,
      document_type: document.document_type,
      version_number: latestVersion.version_number,
      sections: (sections ?? []).map((section) => ({
        path: section.path_display,
        text: clipText(section.original_text, 500),
      })),
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
      .select("path_display, original_text")
      .eq("law_version_id", lawVersion.id)
      .order("hierarchy_order", { ascending: true })
      .limit(120);

    if (sectionError) {
      throw new Error(sectionError.message);
    }

    laws.push({
      id: lawVersion.id,
      title: lawSource?.source_title ?? "법령 문서",
      version_label: lawVersion.version_label,
      effective_date: lawVersion.effective_date,
      sections: (sections ?? []).map((section) => ({
        path: section.path_display,
        text: clipText(section.original_text, 500),
      })),
    });
  }

  return laws;
}

async function analyzeWithOpenAi(input: {
  apiKey: string;
  model: string;
  input: unknown;
}) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      instructions: [
        "You analyze selected internal policies/guidelines against selected laws.",
        "The target organization is an ordinary private company.",
        "Ignore public-sector-only obligations unless the supplied law text clearly extends them to ordinary private companies.",
        "Return only structured JSON.",
        "Focus on two outputs: what should be added to current internal policies/guidelines and what appears unnecessary in current internal policies/guidelines.",
        "Every item must name the affected internal document and the target internal section path.",
        "Use target_section_path to say where the reviewer should add, revise, or remove content. If no exact child section exists, use the nearest valid parent path from the supplied internal sections.",
        "Separate policy evidence paths from law evidence paths.",
        "Even when additions is empty, you must explain in detail why no additional internal policy content is currently required.",
        "Even when removals is empty, you must explain in detail why no existing internal policy content appears unnecessary.",
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
              additions: {
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
              additions_empty_reason: { type: "string" },
              removals: {
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
              removals_empty_reason: { type: "string" },
              low_confidence_notes: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: [
              "summary",
              "additions",
              "additions_empty_reason",
              "removals",
              "removals_empty_reason",
              "low_confidence_notes",
            ],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API request failed: ${response.status} ${errorText}`);
  }

  const payload = (await response.json()) as OpenAIResponsesApiResponse;
  return (payload.output_parsed ?? JSON.parse(payload.output_text ?? "{}")) as Record<string, unknown>;
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
