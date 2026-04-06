import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";

type ManageLawSourceRequest =
  | {
      action: "update";
      lawVersionId: string;
      sourceLink?: string;
      sourceTitle?: string;
      versionLabel?: string;
      effectiveDate?: string | null;
    }
  | {
      action: "delete";
      lawVersionId: string;
    };

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

    const body = (await request.json()) as ManageLawSourceRequest;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: lawVersion, error: lawVersionError } = await supabase
      .from("policy_law_versions")
      .select("id, law_source_id, policy_law_sources!inner(id, owner_user_id)")
      .eq("id", body.lawVersionId)
      .single();

    if (lawVersionError || !lawVersion) {
      throw lawVersionError ?? new Error("Law version not found.");
    }

    const lawSource = Array.isArray(lawVersion.policy_law_sources)
      ? lawVersion.policy_law_sources[0]
      : lawVersion.policy_law_sources;

    if (!lawSource || lawSource.owner_user_id !== user.id) {
      return json({ error: "Forbidden." }, 403);
    }

    if (body.action === "update") {
      const nextSourceLink = body.sourceLink?.startsWith("storage://")
        ? body.sourceLink
        : body.sourceLink?.trim()
          ? validateAllowedSourceUrl(body.sourceLink).toString()
          : lawSource.source_link;

      const { error: sourceUpdateError } = await supabase
        .from("policy_law_sources")
        .update({
          source_link: nextSourceLink,
          source_title: body.sourceTitle?.trim() || null,
        })
        .eq("id", lawVersion.law_source_id);

      if (sourceUpdateError) {
        throw sourceUpdateError;
      }

      const { error: versionUpdateError } = await supabase
        .from("policy_law_versions")
        .update({
          version_label: body.versionLabel?.trim() || null,
          effective_date: body.effectiveDate || null,
        })
        .eq("id", body.lawVersionId);

      if (versionUpdateError) {
        throw versionUpdateError;
      }

      await supabase.from("policy_audit_logs").insert({
        actor_user_id: user.id,
        action: "LAW_SOURCE_UPDATED",
        result: "SUCCESS",
        metadata: {
          lawVersionId: body.lawVersionId,
          lawSourceId: lawVersion.law_source_id,
        },
      });

      return json({
        status: "success",
        data: {
          lawVersionId: body.lawVersionId,
        },
      });
    }

    const { error: deleteVersionError } = await supabase
      .from("policy_law_versions")
      .delete()
      .eq("id", body.lawVersionId);

    if (deleteVersionError) {
      throw deleteVersionError;
    }

    const { count, error: remainingError } = await supabase
      .from("policy_law_versions")
      .select("id", { count: "exact", head: true })
      .eq("law_source_id", lawVersion.law_source_id);

    if (remainingError) {
      throw remainingError;
    }

    if ((count ?? 0) === 0) {
      const { error: deleteSourceError } = await supabase
        .from("policy_law_sources")
        .delete()
        .eq("id", lawVersion.law_source_id);

      if (deleteSourceError) {
        throw deleteSourceError;
      }
    }

    await supabase.from("policy_audit_logs").insert({
      actor_user_id: user.id,
      action: "LAW_SOURCE_DELETED",
      result: "SUCCESS",
      metadata: {
        lawVersionId: body.lawVersionId,
        lawSourceId: lawVersion.law_source_id,
      },
    });

    return json({
      status: "success",
      data: {
        lawVersionId: body.lawVersionId,
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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
