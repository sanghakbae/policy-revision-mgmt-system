import { useState } from "react";
import {
  clearSupabaseAuthStorage,
  clearAuthLocationArtifacts,
  getSupabaseClient,
  normalizeSupabaseAuthError,
} from "../lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";

interface AuthPanelProps {
  session: Session | null;
}

export function AuthPanel({ session }: AuthPanelProps) {
  const [message, setMessage] = useState("Google OAuth 로그인을 사용합니다.");
  const accountEmail = session?.user.email ?? "Google OAuth";
  const accountHint = session
    ? "현재 로그인된 계정입니다."
    : "로그인 시 사용될 외부 인증 계정입니다.";

  async function handleGoogleSignIn() {
    clearAuthLocationArtifacts();
    const supabase = getSupabaseClient();
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });
    setMessage(error ? normalizeSupabaseAuthError(error.message) : "Google 로그인으로 이동합니다.");
  }

  async function handleSignOut() {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signOut();
    if (!error) {
      clearSupabaseAuthStorage();
    }
    setMessage(error ? normalizeSupabaseAuthError(error.message) : "로그아웃되었습니다.");
  }

  return (
    <section className="auth-panel">
      <div className="auth-panel-brand">
        <span className="auth-panel-brand-mark">PR</span>
        <span className="auth-panel-brand-text">policy managed</span>
      </div>

      <div className="section-header auth-panel-header">
        <h2>준거성 검토 시스템</h2>
        <p>Google 계정으로 로그인합니다.</p>
      </div>

      <div className="stack auth-panel-stack">
        <div className="info-card auth-method-card">
          <span className="muted-label">로그인 방식</span>
          <strong>{accountEmail}</strong>
          <p className="helper-text">{accountHint}</p>
        </div>

        {session ? (
          <div className="auth-action-group">
            <button className="button secondary auth-primary-button" onClick={handleSignOut}>
              로그아웃
            </button>
          </div>
        ) : (
          <div className="auth-action-group">
            <button className="button auth-google-button" onClick={handleGoogleSignIn}>
              <span className="auth-google-button-copy">
                <span className="auth-google-button-label">선택 계정 사용</span>
                <span className="auth-google-button-email">Google OAuth</span>
              </span>
              <span className="auth-google-button-icon" aria-hidden="true">
                G
              </span>
            </button>
          </div>
        )}
      </div>

      <p className="helper-text auth-panel-message">{message}</p>
    </section>
  );
}
