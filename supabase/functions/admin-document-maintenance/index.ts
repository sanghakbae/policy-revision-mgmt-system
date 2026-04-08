import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";
import { parsePolicyText } from "../_shared/policyParser.ts";
import { buildSectionHierarchyColumns } from "../_shared/sectionHierarchyColumns.ts";

type RequestBody =
  | {
      action: "reparse_by_text";
      ownerUserId?: string;
      rawTextNeedle: string;
    }
  | {
      action: "delete_by_document_id";
      documentId: string;
    };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "Missing Supabase environment." }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const body = (await request.json()) as RequestBody;

    if (body.action === "reparse_by_text") {
      if (!body.rawTextNeedle?.trim()) {
        throw new Error("rawTextNeedle is required.");
      }

      const { data: documents, error: documentError } = await supabase
        .from("policy_documents")
        .select("id, title, owner_user_id, policy_document_versions(id, version_number, raw_text)")
        .eq(body.ownerUserId ? "owner_user_id" : "id", body.ownerUserId ? body.ownerUserId : undefined as never);

      if (documentError) {
        throw documentError;
      }

      const matchingVersions = (documents ?? [])
        .flatMap((document) => {
          const versions = Array.isArray(document.policy_document_versions)
            ? document.policy_document_versions
            : [];
          const latestVersion = [...versions].sort((left, right) => right.version_number - left.version_number)[0];
          if (!latestVersion?.raw_text?.includes(body.rawTextNeedle)) {
            return [];
          }

          return [{
            documentId: document.id,
            title: document.title,
            versionId: latestVersion.id,
            rawText: latestVersion.raw_text,
          }];
        });

      const results = [];

      for (const item of matchingVersions) {
        const parseResult = parsePolicyText(item.rawText ?? "");
        const hierarchyColumnsById = buildSectionHierarchyColumns(parseResult.sections);
        const sections = await Promise.all(parseResult.sections.map(async (section) => ({
          id: section.tempId,
          document_version_id: item.versionId,
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
          .eq("document_version_id", item.versionId);

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
          .eq("id", item.versionId);

        if (updateVersionError) {
          throw updateVersionError;
        }

        results.push({
          documentId: item.documentId,
          title: item.title,
          versionId: item.versionId,
          sectionCount: sections.length,
          warningCount: parseResult.warnings.length,
          hierarchyTypes: sections.map((section) => section.hierarchy_type),
        });
      }

      return json({
        status: "success",
        matchedCount: results.length,
        results,
      });
    }

    if (body.action === "delete_by_document_id") {
      if (!body.documentId?.trim()) {
        throw new Error("documentId is required.");
      }

      const { error: deleteError } = await supabase
        .from("policy_documents")
        .delete()
        .eq("id", body.documentId);

      if (deleteError) {
        throw deleteError;
      }

      return json({
        status: "success",
        deletedDocumentId: body.documentId,
      });
    }

    throw new Error("Unsupported action.");
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
