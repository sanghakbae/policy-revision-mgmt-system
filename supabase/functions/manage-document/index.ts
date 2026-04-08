import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";
import { parsePolicyText } from "../_shared/policyParser.ts";
import { buildSectionHierarchyColumns } from "../_shared/sectionHierarchyColumns.ts";

type ManageDocumentRequest = {
  action: "delete" | "reparse";
  documentId: string;
};

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

    const body = (await request.json()) as ManageDocumentRequest;
    if (!body.documentId?.trim()) {
      throw new Error("documentId is required.");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: document, error: documentError } = await supabase
      .from("policy_documents")
      .select("id, owner_user_id, source_storage_path")
      .eq("id", body.documentId)
      .single();

    if (documentError || !document) {
      throw documentError ?? new Error("Document not found.");
    }

    if (document.owner_user_id !== user.id) {
      return json({ error: "Forbidden." }, 403);
    }

    if (body.action === "reparse") {
      const { data: latestVersion, error: latestVersionError } = await supabase
        .from("policy_document_versions")
        .select("id, raw_text")
        .eq("document_id", body.documentId)
        .order("version_number", { ascending: false })
        .limit(1)
        .single();

      if (latestVersionError || !latestVersion) {
        throw latestVersionError ?? new Error("Latest document version not found.");
      }

      const parseResult = parsePolicyText(latestVersion.raw_text ?? "");
      const hierarchyColumnsById = buildSectionHierarchyColumns(parseResult.sections);
      const sections = await Promise.all(parseResult.sections.map(async (section) => ({
        id: section.tempId,
        document_version_id: latestVersion.id,
        parent_section_id: section.parentTempId,
        hierarchy_type: section.hierarchyType,
        hierarchy_label: section.hierarchyLabel,
        hierarchy_order: section.hierarchyOrder,
        normalized_text: section.normalizedText,
        original_text: section.originalText,
        text_hash: await sha256(section.normalizedText),
        path_display: section.path.join(" > "),
        ...hierarchyColumnsById.get(section.tempId),
      })));

      const { error: deleteSectionsError } = await supabase
        .from("policy_document_sections")
        .delete()
        .eq("document_version_id", latestVersion.id);

      if (deleteSectionsError) {
        throw deleteSectionsError;
      }

      if (sections.length > 0) {
        const { error: insertSectionsError } = await supabase
          .from("policy_document_sections")
          .insert(sections);

        if (insertSectionsError) {
          throw insertSectionsError;
        }
      }

      const { error: updateVersionError } = await supabase
        .from("policy_document_versions")
        .update({
          parse_warnings: parseResult.warnings,
        })
        .eq("id", latestVersion.id);

      if (updateVersionError) {
        throw updateVersionError;
      }

      const { error: auditError } = await supabase.from("policy_audit_logs").insert({
        actor_user_id: user.id,
        action: "DOCUMENT_REPARSED",
        target_document_id: body.documentId,
        result: "SUCCESS",
        metadata: {
          documentId: body.documentId,
          versionId: latestVersion.id,
          sectionCount: sections.length,
        },
      });

      if (auditError) {
        throw auditError;
      }

      return json({
        status: "success",
        data: {
          documentId: body.documentId,
          versionId: latestVersion.id,
          sectionCount: sections.length,
          warnings: parseResult.warnings,
        },
      });
    }

    if (document.source_storage_path) {
      const { error: storageError } = await supabase.storage
        .from("source-documents")
        .remove([document.source_storage_path]);

      if (storageError) {
        throw storageError;
      }
    }

    const { error: deleteError } = await supabase
      .from("policy_documents")
      .delete()
      .eq("id", body.documentId);

    if (deleteError) {
      throw deleteError;
    }

    const { error: auditError } = await supabase.from("policy_audit_logs").insert({
      actor_user_id: user.id,
      action: "DOCUMENT_DELETED",
      target_document_id: body.documentId,
      result: "SUCCESS",
      metadata: {
        documentId: body.documentId,
      },
    });

    if (auditError) {
      throw auditError;
    }

    return json({
      status: "success",
      data: {
        documentId: body.documentId,
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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}
