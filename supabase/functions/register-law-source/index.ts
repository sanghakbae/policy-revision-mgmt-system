import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";
import { parsePolicyText } from "../_shared/policyParser.ts";
import { buildSectionHierarchyColumns } from "../_shared/sectionHierarchyColumns.ts";

interface RegisterLawSourceRequest {
  sourceLink: string;
  sourceTitle?: string;
  versionLabel?: string;
  effectiveDate?: string | null;
}

const ALLOWED_HOSTS = new Set([
  "law.go.kr",
  "www.law.go.kr",
  "elaw.klri.re.kr",
]);

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

    const sourceUrl = validateAllowedSourceUrl(body.sourceLink);
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

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const parseResult = parsePolicyText(extracted.rawText);

    const { data: lawSource, error: lawSourceError } = await supabase
      .from("policy_law_sources")
      .insert({
        owner_user_id: user.id,
        source_link: sourceUrl.toString(),
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
        sourceLink: sourceUrl.toString(),
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
        sourceLink: sourceUrl.toString(),
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
  if (!body.sourceLink?.trim()) {
    throw new Error("sourceLink is required.");
  }
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
      rawText: rawBody.replace(/\r\n/g, "\n").trim(),
    };
  }

  const titleMatch = rawBody.match(/<title[^>]*>([\s\S]*?)<\/title>/iu);
  const title = titleMatch ? decodeHtml(titleMatch[1]).trim() : null;
  const withoutScripts = rawBody
    .replace(/<script[\s\S]*?<\/script>/giu, " ")
    .replace(/<style[\s\S]*?<\/style>/giu, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/giu, " ");
  const text = withoutScripts
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<\/p>/giu, "\n")
    .replace(/<\/div>/giu, "\n")
    .replace(/<\/li>/giu, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/\r\n/g, "\n");

  const normalized = decodeHtml(text)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();

  return {
    title,
    rawText: normalized,
  };
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
