import type {
  AiRevisionPromptOverrides,
  OpenAiSettings,
  PromptSlotIndex,
  SecuritySettings,
} from "../types";
import { COMPARISON_REPORT_EXAMPLE } from "../../shared/analysisPrompts";

interface PromptSettingsPanelProps {
  openAiSettings: OpenAiSettings;
  securitySettings: SecuritySettings;
  onSecuritySettingChange: <Field extends keyof SecuritySettings>(
    field: Field,
    value: SecuritySettings[Field],
  ) => void;
  onOpenAiSettingChange: (field: keyof OpenAiSettings, value: string) => void;
  promptOverrides: AiRevisionPromptOverrides;
  onPromptChange: (
    stage: keyof AiRevisionPromptOverrides,
    index: number,
    value: string,
  ) => void;
  onPromptReset: (stage: keyof AiRevisionPromptOverrides, index?: number) => void;
  activePromptSlotByStage: Record<keyof AiRevisionPromptOverrides, PromptSlotIndex>;
  onPromptSlotChange: (
    stage: keyof AiRevisionPromptOverrides,
    index: PromptSlotIndex,
  ) => void;
}

export function PromptSettingsPanel(input: PromptSettingsPanelProps) {
  return (
    <section className="comparison-result-columns">
      {([
        ["left", "1단계", "비교 대상 정리", "비교 대상 문서 정리 프롬프트를 설정합니다."],
        ["right", "2단계", "기준 정리", "기준 문서와 법령 정리 프롬프트를 설정합니다."],
        ["final", "3단계", "최종 비교 리포트", "최종 비교 리포트 생성 프롬프트를 설정합니다."],
      ] as const).map(([rawStage, stepLabel, title, description]) => {
        const stage = rawStage as keyof AiRevisionPromptOverrides;
        const activeIndex = input.activePromptSlotByStage[stage];
        const activePrompt = input.promptOverrides[stage][activeIndex];

        return (
          <section
            key={stage}
          className={`review-column comparison-source-column comparison-review-stage-frame comparison-report-block comparison-review-stage-frame-step-${
            stage === "left" ? "1" : stage === "right" ? "2" : "3"
          }`}
        >
          <div className="section-header comparison-frame-header comparison-stage-frame-header">
            <div className="comparison-stage-frame-head">
              <h3>{title}</h3>
              <span className="comparison-report-stage-step">{stepLabel}</span>
            </div>
            <p>{description}</p>
          </div>
          <div className="comparison-prompt-editor">
            <div className="comparison-prompt-editor-head">
              <strong>{`${stepLabel} 프롬프트`}</strong>
              <div className="button-row">
                {[0, 1, 2].map((index) => (
                  <button
                    key={`${stage}-slot-${index}`}
                    type="button"
                    className={`button ${activeIndex === index ? "" : "ghost"}`.trim()}
                    onClick={() => input.onPromptSlotChange(stage, index as PromptSlotIndex)}
                  >
                    {index + 1}
                  </button>
                ))}
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => input.onPromptReset(stage)}
                >
                  전체 기본값 복원
                </button>
              </div>
            </div>
            <div className="comparison-prompt-slot">
              <textarea
                value={activePrompt}
                onChange={(event) => input.onPromptChange(stage, activeIndex, event.target.value)}
                rows={activeIndex === 0 ? 12 : 8}
                placeholder={activeIndex === 0 ? "기본 프롬프트를 작성하세요." : "추가 규칙이나 보완 지시를 입력하세요."}
              />
            </div>
            {stage === "final" ? (
              <div className="comparison-prompt-example">
                <div className="comparison-prompt-example-head">
                  <strong>최종 비교 리포트 결과 예시</strong>
                  <span className="muted-label">신설/수정/삭제 + 장·조·항·호·목 위치 포함</span>
                </div>
                <pre>{COMPARISON_REPORT_EXAMPLE}</pre>
              </div>
            ) : null}
          </div>
        </section>
        );
      })}

      <section className="review-column comparison-source-column comparison-review-stage-frame comparison-report-block comparison-openai-settings-block">
        <div className="section-header comparison-frame-header comparison-stage-frame-header">
          <div className="comparison-stage-frame-head">
            <h3>OpenAI 설정</h3>
            <span className="comparison-report-stage-step">기본값</span>
          </div>
          <p>개인 OpenAI API 키와 모델을 저장해 AI 비교와 개정 권고 생성에 사용합니다.</p>
        </div>
        <div className="comparison-prompt-editor">
          <div className="comparison-prompt-editor-head">
            <strong>API 연결 정보</strong>
          </div>
          <label className="stack">
            <span className="muted-label">OpenAI API Key</span>
            <input
              type="password"
              value={input.openAiSettings.apiKey}
              onChange={(event) => input.onOpenAiSettingChange("apiKey", event.target.value)}
              placeholder="sk-..."
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label className="stack">
            <span className="muted-label">Model</span>
            <input
              type="text"
              value={input.openAiSettings.model}
              onChange={(event) => input.onOpenAiSettingChange("model", event.target.value)}
              placeholder="gpt-5.2"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <p className="helper-text">
            입력한 키와 모델은 로그인한 사용자 기준으로 저장되며, 비교 요청 시 Edge Function으로 전달됩니다.
          </p>
        </div>
      </section>

      <section className="review-column comparison-source-column comparison-review-stage-frame comparison-report-block comparison-openai-settings-block">
        <div className="section-header comparison-frame-header comparison-stage-frame-header">
          <div className="comparison-stage-frame-head">
            <h3>인증/세션 정책</h3>
            <span className="comparison-report-stage-step">고정 정책</span>
          </div>
          <p>Google 로그인 허용 범위와 세션 유휴 만료 시간을 관리합니다.</p>
        </div>
        <div className="comparison-auth-policy-grid">
          <div className="info-card comparison-auth-policy-card">
            <label className="comparison-auth-policy-row">
              <span>허용 Google Workspace 도메인:</span>
              <input
                type="text"
                value={input.securitySettings.allowedEmailDomain}
                onChange={(event) => input.onSecuritySettingChange("allowedEmailDomain", event.target.value)}
                placeholder="muhayu.com"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <p className="helper-text">이 도메인이 아닌 Google 계정은 로그인 직후 자동 로그아웃됩니다.</p>
          </div>
          <div className="info-card comparison-auth-policy-card">
            <label className="comparison-auth-policy-row">
              <span>세션 타임아웃:</span>
              <input
                type="number"
                min={1}
                max={1440}
                value={input.securitySettings.sessionIdleTimeoutMinutes}
                onChange={(event) =>
                  input.onSecuritySettingChange(
                    "sessionIdleTimeoutMinutes",
                    Number(event.target.value) || 1,
                  )
                }
              />
              <strong>분</strong>
            </label>
            <p className="helper-text">클릭, 키보드 입력, 스크롤 등 사용 활동이 있으면 만료 시간이 다시 연장됩니다.</p>
          </div>
        </div>
      </section>
    </section>
  );
}
