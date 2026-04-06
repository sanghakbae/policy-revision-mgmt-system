import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";
import { parsePolicyText } from "../_shared/policyParser.ts";
import { buildSectionHierarchyColumns } from "../_shared/sectionHierarchyColumns.ts";

interface RegisterDocumentRequest {
  title: string;
  description?: string;
  documentType?: "POLICY" | "GUIDELINE";
  originalFileName: string;
  fileContentBase64: string;
  contentType?: string;
  rawText: string;
}

const STORAGE_BUCKET = "source-documents";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing authorization header." }, 401);
    }

    const accessToken = extractBearerToken(authHeader);
    if (!accessToken) {
      return json({ error: "Invalid authorization header format." }, 401);
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
      return json(
        {
          error: userError?.message ?? "Unauthorized.",
          debug: {
            stage: "auth.getUser",
            tokenLength: accessToken.length,
            headerPrefix: authHeader.slice(0, 16),
          },
        },
        401,
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = (await request.json()) as RegisterDocumentRequest;
    validateInput(body);
    const storagePath = buildStoragePath(user.id, body.originalFileName);
    const fileBytes = decodeBase64(body.fileContentBase64);
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, fileBytes, {
        upsert: false,
        contentType: body.contentType || "application/octet-stream",
      });

    if (uploadError) {
      throw uploadError;
    }

    const parseResult = parsePolicyText(body.rawText);

    const inferredDocumentType = inferDocumentType({
      inputTitle: body.title,
      parsedTitle: parseResult.metadata.title,
      rawText: body.rawText,
    });

    const { data: document, error: documentError } = await supabase
      .from("policy_documents")
      .insert({
        owner_user_id: user.id,
        title: body.title,
        description: body.description ?? null,
        document_type: inferredDocumentType,
        source_storage_path: storagePath,
        source_file_name: body.originalFileName,
      })
      .select("id")
      .single();

    if (documentError || !document) {
      throw documentError ?? new Error("Failed to create document.");
    }

    const { data: version, error: versionError } = await supabase
      .from("policy_document_versions")
      .insert({
        document_id: document.id,
        version_number: 1,
        raw_text: body.rawText,
        parse_warnings: parseResult.warnings,
      })
      .select("id")
      .single();

    if (versionError || !version) {
      throw versionError ?? new Error("Failed to create document version.");
    }

    const hierarchyColumnsById = buildSectionHierarchyColumns(parseResult.sections);
    const sections = await Promise.all(parseResult.sections.map(async (section) => ({
      id: section.tempId,
      document_version_id: version.id,
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

    if (sections.length > 0) {
      const { error: sectionError } = await supabase
        .from("policy_document_sections")
        .insert(sections);

      if (sectionError) {
        throw sectionError;
      }
    }

    const { error: auditError } = await supabase.from("policy_audit_logs").insert({
      actor_user_id: user.id,
      action: "DOCUMENT_REGISTERED",
      target_document_id: document.id,
      result: "SUCCESS",
      metadata: {
        versionId: version.id,
        sectionCount: sections.length,
        warningCount: parseResult.warnings.length,
      },
    });

    if (auditError) {
      throw auditError;
    }

    return json({
      status: "success",
      data: {
        documentId: document.id,
        versionId: version.id,
        sectionCount: sections.length,
        warnings: parseResult.warnings,
      },
      warnings: parseResult.warnings,
      confidence: 1,
      traceability: {
        storagePath,
        originalFileName: body.originalFileName,
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

function validateInput(body: RegisterDocumentRequest) {
  if (!body.title?.trim()) {
    throw new Error("Title is required.");
  }

  const allowedExtension = /\.(txt|md|docx)$/iu.test(body.originalFileName);
  if (!allowedExtension) {
    throw new Error("Only .txt, .md, and .docx uploads are allowed.");
  }

  if (!body.fileContentBase64?.trim()) {
    throw new Error("File content is required.");
  }

  if (!body.rawText?.trim()) {
    throw new Error("Raw text is required.");
  }
}

function inferDocumentType(input: {
  inputTitle: string;
  parsedTitle: string | null;
  rawText: string;
}) {
  const candidate = [
    input.inputTitle,
    input.parsedTitle ?? "",
    input.rawText.slice(0, 400),
  ]
    .join(" ")
    .toLowerCase();

  if (candidate.includes("지침") || candidate.includes("guideline")) {
    return "GUIDELINE" as const;
  }

  return "POLICY" as const;
}

function extractBearerToken(value: string) {
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function buildStoragePath(userId: string, originalFileName: string) {
  const extensionMatch = originalFileName.match(/(\.[a-z0-9]+)$/iu);
  const extension = extensionMatch?.[1].toLowerCase() ?? "";
  const baseName = extension
    ? originalFileName.slice(0, -extension.length)
    : originalFileName;
  const normalizedBase = baseName
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const safeBase = normalizedBase || "document";

  return `${userId}/${crypto.randomUUID()}-${safeBase}${extension}`;
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
