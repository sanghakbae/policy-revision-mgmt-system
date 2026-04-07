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

  function handleResetSession() {
    clearSupabaseAuthStorage();
    window.location.reload();
  }

  return (
    <div className="stack">
      <div className="section-header">
        <h2>인증</h2>
        <p>비공개 작업은 모두 인증된 Supabase 사용자만 수행할 수 있습니다.</p>
      </div>

      {session ? (
        <div className="stack">
          <div className="info-card auth-account-card">
            <span className="muted-label">로그인 계정</span>
            <strong>{session.user.email}</strong>
          </div>
          <button className="button secondary" onClick={handleSignOut}>
            로그아웃
          </button>
          <button className="button ghost" onClick={handleResetSession} type="button">
            세션 강제 초기화
          </button>
        </div>
      ) : (
        <div className="stack">
          <div className="info-card auth-method-card">
            <span className="muted-label">로그인 방식</span>
            <strong>Google OAuth</strong>
            <p className="helper-text">
              Supabase Authentication에서 Google 제공자와 리디렉션 URL을
              먼저 설정해야 합니다.
            </p>
          </div>
          <button className="button" onClick={handleGoogleSignIn}>
            Google로 로그인
          </button>
          <button className="button ghost" onClick={handleResetSession} type="button">
            세션 강제 초기화
          </button>
        </div>
      )}

      <p className="helper-text">{message}</p>
    </div>
  );
}
