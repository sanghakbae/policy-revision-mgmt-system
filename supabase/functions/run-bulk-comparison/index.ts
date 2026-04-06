import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { compareStructuredSections } from "../_shared/comparisonEngine.ts";
import { corsHeaders } from "../_shared/cors.ts";

interface RunBulkComparisonRequest {
  lawVersionId: string;
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

    const body = (await request.json()) as RunBulkComparisonRequest;
    if (!body.lawVersionId?.trim()) {
      throw new Error("lawVersionId is required.");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    await ensureLawAccess(supabase, body.lawVersionId, user.id);
    const targetSections = await fetchLawSections(supabase, body.lawVersionId);
    const sourceVersions = await fetchLatestDocumentVersions(supabase, user.id);

    if (sourceVersions.length === 0) {
      throw new Error("비교할 정책 또는 지침 문서가 없습니다.");
    }

    const createdRuns: Array<{
      comparisonRunId: string;
      documentVersionId: string;
      documentTitle: string;
      resultCount: number;
    }> = [];

    for (const sourceVersion of sourceVersions) {
      const sourceSections = await fetchDocumentSections(supabase, sourceVersion.versionId);
      const comparison = compareStructuredSections({
        sourceSections,
        targetSections,
      });

      const { data: comparisonRun, error: comparisonRunError } = await supabase
        .from("policy_comparison_runs")
        .insert({
          actor_user_id: user.id,
          source_document_version_id: sourceVersion.versionId,
          target_law_version_id: body.lawVersionId,
          warning_messages: comparison.warnings,
        })
        .select("id")
        .single();

      if (comparisonRunError || !comparisonRun) {
        throw comparisonRunError ?? new Error("Failed to create comparison run.");
      }

      if (comparison.results.length > 0) {
        const { error: resultError } = await supabase
          .from("policy_comparison_results")
          .insert(
            comparison.results.map((result) => ({
              comparison_run_id: comparisonRun.id,
              source_section_id: result.sourceSectionId,
              target_section_id: result.targetSectionId,
              affected_path: result.affectedPath,
              hierarchy_type: result.affectedHierarchyType,
              match_type: result.matchType,
              diff_type: result.diffType,
              confidence: result.confidence,
              before_text: result.beforeText,
              after_text: result.afterText,
              explanation: result.explanation,
              reasoning_trace: result.reasoningTrace,
              ai_used: false,
            })),
          );

        if (resultError) {
          throw resultError;
        }
      }

      const { error: auditError } = await supabase.from("policy_audit_logs").insert({
        actor_user_id: user.id,
        action: "COMPARISON_RUN_CREATED",
        result: "SUCCESS",
        metadata: {
          comparisonRunId: comparisonRun.id,
          documentVersionId: sourceVersion.versionId,
          lawVersionId: body.lawVersionId,
          resultCount: comparison.results.length,
          mode: "bulk_latest_documents",
        },
      });

      if (auditError) {
        throw auditError;
      }

      createdRuns.push({
        comparisonRunId: comparisonRun.id,
        documentVersionId: sourceVersion.versionId,
        documentTitle: sourceVersion.documentTitle,
        resultCount: comparison.results.length,
      });
    }

    return json({
      status: "success",
      data: {
        comparisonRunCount: createdRuns.length,
        comparisonRuns: createdRuns,
      },
      warnings: [],
      confidence: 1,
      traceability: {
        targetLawVersionId: body.lawVersionId,
        comparedDocumentVersionIds: createdRuns.map((item) => item.documentVersionId),
        mode: "bulk_latest_document_structural_diff",
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

function extractBearerToken(value: string | null) {
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

async function ensureLawAccess(
  supabase: ReturnType<typeof createClient>,
  lawVersionId: string,
  userId: string,
) {
  const accessCheck = await supabase
    .from("policy_law_versions")
    .select("id, law_source:policy_law_sources!inner(owner_user_id)")
    .eq("id", lawVersionId)
    .eq("law_source.owner_user_id", userId)
    .single();

  if (accessCheck.error || !accessCheck.data) {
    throw new Error("Law version not found or access denied.");
  }
}

async function fetchLatestDocumentVersions(
  supabase: ReturnType<typeof createClient>,
  userId: string,
) {
  const { data, error } = await supabase
    .from("policy_documents")
    .select("id, title, policy_document_versions(id, version_number)")
    .eq("owner_user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? [])
    .map((document) => {
      const latestVersion = [...(document.policy_document_versions ?? [])].sort(
        (left, right) => right.version_number - left.version_number,
      )[0];

      return latestVersion
        ? {
            versionId: latestVersion.id,
            documentTitle: document.title,
          }
        : null;
    })
    .filter((value): value is { versionId: string; documentTitle: string } => Boolean(value));
}

async function fetchDocumentSections(
  supabase: ReturnType<typeof createClient>,
  documentVersionId: string,
) {
  const { data, error } = await supabase
    .from("policy_document_sections")
    .select(
      "id, parent_section_id, hierarchy_type, hierarchy_label, hierarchy_order, normalized_text, original_text, path_display",
    )
    .eq("document_version_id", documentVersionId)
    .order("hierarchy_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data.map((section) => ({
    id: section.id,
    parentSectionId: section.parent_section_id,
    hierarchyType: section.hierarchy_type,
    hierarchyLabel: section.hierarchy_label,
    hierarchyOrder: section.hierarchy_order,
    normalizedText: section.normalized_text,
    originalText: section.original_text,
    pathDisplay: section.path_display,
  }));
}

async function fetchLawSections(
  supabase: ReturnType<typeof createClient>,
  lawVersionId: string,
) {
  const { data, error } = await supabase
    .from("policy_law_sections")
    .select(
      "id, parent_section_id, hierarchy_type, hierarchy_label, hierarchy_order, normalized_text, original_text, path_display",
    )
    .eq("law_version_id", lawVersionId)
    .order("hierarchy_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data.map((section) => ({
    id: section.id,
    parentSectionId: section.parent_section_id,
    hierarchyType: section.hierarchy_type,
    hierarchyLabel: section.hierarchy_label,
    hierarchyOrder: section.hierarchy_order,
    normalizedText: section.normalized_text,
    originalText: section.original_text,
    pathDisplay: section.path_display,
  }));
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
