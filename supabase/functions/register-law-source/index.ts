import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import WordExtractor from "npm:word-extractor";
import { Buffer } from "node:buffer";
import { corsHeaders } from "../_shared/cors.ts";
import { parsePolicyText } from "../_shared/policyParser.ts";
import { buildSectionHierarchyColumns } from "../_shared/sectionHierarchyColumns.ts";

interface RegisterLawSourceRequest {
  sourceType?: "url" | "file";
  sourceLink?: string;
  sourceTitle?: string;
  versionLabel?: string;
  effectiveDate?: string | null;
  originalFileName?: string;
  fileContentBase64?: string;
  contentType?: string;
  rawText?: string;
}

const ALLOWED_HOSTS = new Set([
  "law.go.kr",
  "www.law.go.kr",
  "elaw.klri.re.kr",
]);
const STORAGE_BUCKET = "source-documents";

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

    const body = (await request.json()) as RegisterLawSourceRequest;
    validateInput(body);
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const sourceType = body.sourceType === "file" ? "file" : "url";
    const extracted = sourceType === "file"
      ? await extractLawTextFromUpload(supabase, user.id, body)
      : await extractLawTextFromUrl(body);
    const parseResult = parsePolicyText(extracted.rawText);

    const { data: lawSource, error: lawSourceError } = await supabase
      .from("policy_law_sources")
      .insert({
        owner_user_id: user.id,
        source_link: extracted.sourceLink,
        source_title: body.sourceTitle?.trim() || extracted.title || null,
        retrieval_timestamp: new Date().toISOString(),
        version_effective_date: body.effectiveDate || null,
      })
      .select("id")
      .single();

    if (lawSourceError || !lawSource) {
      throw lawSourceError ?? new Error("Failed to create law source.");
    }

    const { data: lawVersion, error: lawVersionError } = await supabase
      .from("policy_law_versions")
      .insert({
        law_source_id: lawSource.id,
        version_label: body.versionLabel?.trim() || null,
        effective_date: body.effectiveDate || null,
        raw_text: extracted.rawText,
        parse_warnings: parseResult.warnings,
      })
      .select("id")
      .single();

    if (lawVersionError || !lawVersion) {
      throw lawVersionError ?? new Error("Failed to create law version.");
    }

    const hierarchyColumnsById = buildSectionHierarchyColumns(parseResult.sections);
    const sections = await Promise.all(
      parseResult.sections.map(async (section) => ({
        id: section.tempId,
        law_version_id: lawVersion.id,
        parent_section_id: section.parentTempId,
        hierarchy_type: section.hierarchyType,
        hierarchy_label: section.hierarchyLabel,
        hierarchy_order: section.hierarchyOrder,
        normalized_text: section.normalizedText,
        original_text: section.originalText,
        text_hash: await sha256(section.normalizedText),
        path_display: section.path.join(" > "),
        ...hierarchyColumnsById.get(section.tempId),
      })),
    );

    if (sections.length > 0) {
      const { error: sectionError } = await supabase
        .from("policy_law_sections")
        .insert(sections);

      if (sectionError) {
        throw sectionError;
      }
    }

    const { error: auditError } = await supabase.from("policy_audit_logs").insert({
      actor_user_id: user.id,
      action: "LAW_SOURCE_REGISTERED",
      result: "SUCCESS",
      metadata: {
        lawSourceId: lawSource.id,
        lawVersionId: lawVersion.id,
        sourceLink: extracted.sourceLink,
        sourceType,
        sectionCount: sections.length,
      },
    });

    if (auditError) {
      throw auditError;
    }

    return json({
      status: "success",
      data: {
        lawSourceId: lawSource.id,
        lawVersionId: lawVersion.id,
        sourceTitle: body.sourceTitle?.trim() || extracted.title || null,
        sectionCount: sections.length,
      },
      warnings: parseResult.warnings,
      confidence: 1,
      traceability: {
        sourceLink: extracted.sourceLink,
        sourceType,
        retrievalTimestamp: new Date().toISOString(),
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

function validateInput(body: RegisterLawSourceRequest) {
  const sourceType = body.sourceType === "file" ? "file" : "url";

  if (sourceType === "file") {
    if (!body.originalFileName?.trim()) {
      throw new Error("originalFileName is required.");
    }

    const allowedExtension = /\.(txt|md|doc|docx)$/iu.test(body.originalFileName);
    if (!allowedExtension) {
      throw new Error("Only .txt, .md, .doc, and .docx uploads are allowed.");
    }

    if (!body.fileContentBase64?.trim()) {
      throw new Error("fileContentBase64 is required.");
    }

    const requiresRawText = !/\.(doc)$/iu.test(body.originalFileName);
    if (requiresRawText && !body.rawText?.trim()) {
      throw new Error("rawText is required.");
    }

    return;
  }

  if (!body.sourceLink?.trim()) {
    throw new Error("sourceLink is required.");
  }
}

async function extractLawTextFromUrl(body: RegisterLawSourceRequest) {
  const sourceUrl = validateAllowedSourceUrl(body.sourceLink ?? "");
  const fetchResponse = await fetch(sourceUrl.toString(), {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent": "policy-revision-mgmt-system/0.1",
      Accept: "text/html,text/plain,application/xhtml+xml",
    },
  });

  if (!fetchResponse.ok) {
    throw new Error(`법령 URL을 가져오지 못했습니다. HTTP ${fetchResponse.status}`);
  }

  const contentType = fetchResponse.headers.get("content-type") ?? "";
  const rawBody = await fetchResponse.text();
  const extracted = extractLawText(rawBody, contentType);

  if (!extracted.rawText.trim()) {
    throw new Error("법령 본문 텍스트를 추출하지 못했습니다.");
  }

  return {
    title: extracted.title,
    rawText: extracted.rawText,
    sourceLink: sourceUrl.toString(),
  };
}

async function extractLawTextFromUpload(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  body: RegisterLawSourceRequest,
) {
  const originalFileName = body.originalFileName ?? "law-source.txt";
  const fileBytes = decodeBase64(body.fileContentBase64 ?? "");
  const storagePath = buildStoragePath(userId, originalFileName);
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, fileBytes, {
      upsert: false,
      contentType: body.contentType || "application/octet-stream",
    });

  if (uploadError) {
    throw uploadError;
  }

  const rawText = body.rawText?.trim() || await extractUploadedLawRawText(originalFileName, fileBytes);
  if (!rawText.trim()) {
    throw new Error("법령 첨부파일에서 본문 텍스트를 추출하지 못했습니다.");
  }

  return {
    title: body.sourceTitle?.trim() || originalFileName,
    rawText,
    sourceLink: `storage://${STORAGE_BUCKET}/${storagePath}`,
  };
}

async function extractUploadedLawRawText(
  originalFileName: string,
  fileBytes: Uint8Array,
) {
  if (/\.(doc)$/iu.test(originalFileName)) {
    const extractor = new WordExtractor();
    const document = await extractor.extract(Buffer.from(fileBytes));
    return document.getBody().trim();
  }

  return "";
}

function validateAllowedSourceUrl(value: string) {
  const url = new URL(value);

  if (url.protocol !== "https:") {
    throw new Error("법령 URL은 HTTPS만 허용합니다.");
  }

  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error("허용되지 않은 법령 도메인입니다.");
  }

  return url;
}

function extractLawText(rawBody: string, contentType: string) {
  if (!contentType.includes("html")) {
    return {
      title: null,
      rawText: normalizeExtractedLawText(rawBody),
    };
  }

  const titleMatch = rawBody.match(/<title[^>]*>([\s\S]*?)<\/title>/iu);
  const title = titleMatch ? decodeHtml(titleMatch[1]).trim() : null;
  const withoutScripts = rawBody
    .replace(/<script[\s\S]*?<\/script>/giu, " ")
    .replace(/<style[\s\S]*?<\/style>/giu, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/giu, " ")
    .replace(/<svg[\s\S]*?<\/svg>/giu, " ")
    .replace(/<form[\s\S]*?<\/form>/giu, " ");
  const bodyCandidate = extractLawBodyCandidate(withoutScripts);
  const text = bodyCandidate
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<\/p>/giu, "\n")
    .replace(/<\/div>/giu, "\n")
    .replace(/<\/tr>/giu, "\n")
    .replace(/<\/td>/giu, " ")
    .replace(/<\/li>/giu, "\n")
    .replace(/<\/h[1-6]>/giu, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/\r\n/g, "\n");

  return {
    title,
    rawText: normalizeExtractedLawText(decodeHtml(text)),
  };
}

function extractLawBodyCandidate(html: string) {
  const candidates = [
    /<(?:div|section|article)[^>]+id=["']?(?:conTop|conScroll|con|contents|contentBody|content|lawBody|printArea|txt|viewwrap|subContents)["']?[^>]*>([\s\S]*?)<\/(?:div|section|article)>/iu,
    /<(?:div|section|article)[^>]+class=["'][^"']*(?:lawcon|law-content|lawTxt|viewTxt|tblwrap|article-body|contents|content-body)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section|article)>/iu,
    /<body[^>]*>([\s\S]*?)<\/body>/iu,
  ];

  for (const pattern of candidates) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return html;
}

function normalizeExtractedLawText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => isMeaningfulLawLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isMeaningfulLawLine(line: string) {
  if (!line) {
    return false;
  }

  const noisePatterns = [
    /^본문\s*바로가기$/u,
    /^조문체계도버튼$/u,
    /^연혁$/u,
    /^생활법령버튼$/u,
    /^별표\/서식$/u,
    /^법령용어$/u,
    /^자치법규$/u,
    /^행정규칙$/u,
    /^판례$/u,
    /^법령해석례$/u,
    /^입법예고$/u,
    /^행정예고$/u,
    /^자치법규입법예고$/u,
    /^입법예고센터$/u,
    /^국가법령정보센터$/u,
    /^English$/u,
    /^화면\s*인쇄$/u,
    /^조문\s*인쇄$/u,
    /^공유하기$/u,
    /^닫기$/u,
    /^검색$/u,
    /^목차$/u,
    /^조문$/u,
    /^부칙$/u,
  ];

  if (noisePatterns.some((pattern) => pattern.test(line))) {
    return false;
  }

  if (line.length <= 1) {
    return false;
  }

  return true;
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'")
    .replace(/&#x27;/giu, "'");
}

function extractBearerToken(value: string | null) {
  const match = value?.match(/^Bearer\s+(.+)$/i);
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
    .split("")
    .filter((character) => character.charCodeAt(0) <= 0x7f)
    .join("")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const safeBase = normalizedBase || "law-source";

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
