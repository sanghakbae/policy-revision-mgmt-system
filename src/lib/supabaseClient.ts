import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

let supabaseClient: SupabaseClient | null = null;
const AUTH_STORAGE_KEY = "policy-revision-mgmt-auth-token";

export function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase environment. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
    );
  }

  supabaseClient = createClient(url, anonKey, {
    auth: {
      storageKey: AUTH_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return supabaseClient;
}

export function clearSupabaseAuthStorage() {
  if (typeof window === "undefined") {
    supabaseClient = null;
    return;
  }

  clearStorage(window.localStorage);
  clearStorage(window.sessionStorage);
  clearAuthLocationArtifacts();
  supabaseClient = null;
}

function clearStorage(storage: Storage) {
  const keysToRemove: string[] = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && (key.startsWith("sb-") || key === AUTH_STORAGE_KEY)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => storage.removeItem(key));
}

export function hasSupabaseEnv() {
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
  );
}

export function normalizeSupabaseAuthError(message?: string) {
  if (message?.toLowerCase().includes("jwt")) {
    return "세션이 유효하지 않습니다. 다시 로그인하세요.";
  }

  return message ?? "인증 상태를 확인할 수 없습니다. 다시 로그인하세요.";
}

export function clearAuthLocationArtifacts() {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(
    url.hash.startsWith("#") ? url.hash.slice(1) : url.hash,
  );
  const hasAuthHash =
    hashParams.has("access_token") ||
    hashParams.has("refresh_token") ||
    hashParams.has("error") ||
    hashParams.has("error_description");
  const hasAuthSearch =
    url.searchParams.has("code") ||
    url.searchParams.has("error") ||
    url.searchParams.has("error_description");

  if (!hasAuthHash && !hasAuthSearch) {
    return;
  }

  window.history.replaceState({}, document.title, `${url.origin}${url.pathname}`);
}

export async function exchangeAuthCodeForSessionIfPresent() {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if (!code) {
    return;
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    throw error;
  }

  clearAuthLocationArtifacts();
}
