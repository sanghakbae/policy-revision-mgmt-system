import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";
import {
  buildClassificationInput,
  buildDeterministicNoChangeDecision,
  getRevisionDecisionSchema,
  normalizeRevisionDecision,
  shouldBypassAi,
} from "../_shared/revisionClassifier.ts";

interface ClassifyRevisionRequest {
  comparisonRunId: string;
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

    const authClient = createClient(supabaseUrl, anonKey);

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(accessToken);

    if (userError || !user) {
      return json({ error: userError?.message ?? "Unauthorized." }, 401);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = (await request.json()) as ClassifyRevisionRequest;
    if (!body.comparisonRunId?.trim()) {
      throw new Error("comparisonRunId is required.");
    }

    const comparisonData = await fetchComparisonRunWithResults(
      supabase,
      body.comparisonRunId,
      user.id,
    );

    const diffPayload = {
      diffs: comparisonData.results.map((result) => ({
        id: result.id,
        affectedPath: result.affected_path,
        hierarchyType: result.hierarchy_type,
        matchType: result.match_type,
        diffType: result.diff_type,
        confidence: Number(result.confidence),
        beforeText: result.before_text,
        afterText: result.after_text,
        explanation: result.explanation,
        reasoningTrace: Array.isArray(result.reasoning_trace)
          ? result.reasoning_trace.filter((value): value is string => typeof value === "string")
          : [],
      })),
      warnings: Array.isArray(comparisonData.warning_messages)
        ? comparisonData.warning_messages.filter((value): value is string => typeof value === "string")
        : [],
    };

    const useDeterministicOnly = shouldBypassAi(diffPayload);
    const requestPurpose =
      "Classify revision necessity and generate a concise explanation from deterministic structural diff results.";

    const decision = useDeterministicOnly
      ? buildDeterministicNoChangeDecision()
      : await classifyWithOpenAi({
          apiKey: openAiApiKey,
          model: openAiModel,
          requestPurpose,
          diffPayload,
        });

    const { data: revisionDecision, error: revisionDecisionError } = await supabase
      .from("policy_revision_decisions")
      .insert({
        comparison_run_id: body.comparisonRunId,
        status: decision.status,
        rationale: decision.explanation,
        confidence: decision.confidence,
        ai_used: !useDeterministicOnly,
        human_review_required: decision.humanReviewRequired,
        model_name: useDeterministicOnly ? null : openAiModel,
        request_purpose: requestPurpose,
        output_used_in_recommendation: true,
      })
      .select("id")
      .single();

    if (revisionDecisionError || !revisionDecision) {
      throw revisionDecisionError ?? new Error("Failed to persist revision decision.");
    }

    const { error: auditError } = await supabase.from("policy_audit_logs").insert({
      actor_user_id: user.id,
      action: "REVISION_CLASSIFIED",
      result: "SUCCESS",
      metadata: {
        revisionDecisionId: revisionDecision.id,
        comparisonRunId: body.comparisonRunId,
        aiUsed: !useDeterministicOnly,
        modelName: useDeterministicOnly ? null : openAiModel,
      },
    });

    if (auditError) {
      throw auditError;
    }

    return json({
      status: "success",
      data: {
        revisionDecisionId: revisionDecision.id,
        decision: {
          status: decision.status,
          explanation: decision.explanation,
          confidence: decision.confidence,
          humanReviewRequired: decision.humanReviewRequired,
          aiUsed: !useDeterministicOnly,
          citedDiffIds: decision.citedDiffIds,
        },
      },
      warnings: diffPayload.warnings,
      confidence: decision.confidence,
      traceability: {
        comparisonRunId: body.comparisonRunId,
        aiUsed: !useDeterministicOnly,
        model: useDeterministicOnly ? null : openAiModel,
        requestPurpose,
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

async function fetchComparisonRunWithResults(
  supabase: ReturnType<typeof createClient>,
  comparisonRunId: string,
  userId: string,
) {
  const runResult = await supabase
    .from("policy_comparison_runs")
    .select("id, actor_user_id, warning_messages")
    .eq("id", comparisonRunId)
    .eq("actor_user_id", userId)
    .single();

  if (runResult.error || !runResult.data) {
    throw new Error("Comparison run not found or access denied.");
  }

  const resultRows = await supabase
    .from("policy_comparison_results")
    .select(
      "id, affected_path, hierarchy_type, match_type, diff_type, confidence, before_text, after_text, explanation, reasoning_trace",
    )
    .eq("comparison_run_id", comparisonRunId)
    .order("affected_path", { ascending: true });

  if (resultRows.error) {
    throw new Error(resultRows.error.message);
  }

  return {
    ...runResult.data,
    results: resultRows.data ?? [],
  };
}

async function classifyWithOpenAi(input: {
  apiKey: string | undefined;
  model: string;
  requestPurpose: string;
  diffPayload: {
    diffs: Array<{
      id: string;
      affectedPath: string;
      hierarchyType: string;
      matchType: string;
      diffType: string;
      confidence: number;
      beforeText: string;
      afterText: string;
      explanation: string;
      reasoningTrace: string[];
    }>;
    warnings: string[];
  };
}) {
  if (!input.apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      instructions: [
        "You classify whether an internal policy should be revised based only on deterministic structural diff evidence between the policy and an updated law.",
        "Do not invent unseen clauses or unsupported legal conclusions.",
        "Use LOW_CONFIDENCE_REVIEW if the evidence is ambiguous, low-confidence, or insufficient.",
        "The explanation must reference the cited diff ids and summarize the structural/text changes that support the classification.",
      ].join(" "),
      input: JSON.stringify({
        request_purpose: input.requestPurpose,
        diff_summary: buildClassificationInput(input.diffPayload),
      }),
      text: {
        format: {
          type: "json_schema",
          ...getRevisionDecisionSchema(),
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API request failed: ${response.status} ${errorText}`);
  }

  const payload = (await response.json()) as OpenAIResponsesApiResponse;
  const rawDecision = payload.output_parsed ?? parseOutputText(payload.output_text);
  return normalizeRevisionDecision(rawDecision);
}

function extractBearerToken(value: string | null) {
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function parseOutputText(outputText: string | undefined) {
  if (!outputText) {
    throw new Error("OpenAI response did not include structured output.");
  }

  return JSON.parse(outputText);
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
