import type { AiRevisionPromptOverrides } from "../types";

interface PromptSettingsPanelProps {
  promptOverrides: AiRevisionPromptOverrides;
  onPromptChange: (stage: keyof AiRevisionPromptOverrides, value: string) => void;
  onPromptReset: (stage: keyof AiRevisionPromptOverrides) => void;
}

export function PromptSettingsPanel(input: PromptSettingsPanelProps) {
  return (
    <section className="comparison-result-columns">
      {([
        ["left", "1단계", "비교 대상 정리", "비교 대상 문서 정리 프롬프트를 설정합니다."],
        ["right", "2단계", "기준 정리", "기준 문서와 법령 정리 프롬프트를 설정합니다."],
        ["final", "3단계", "최종 비교 리포트", "최종 비교 리포트 생성 프롬프트를 설정합니다."],
      ] as const).map(([stage, stepLabel, title, description]) => (
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
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => input.onPromptReset(stage)}
                >
                  기본값 복원
                </button>
              </div>
            </div>
            <textarea
              value={input.promptOverrides[stage]}
              onChange={(event) => input.onPromptChange(stage, event.target.value)}
              rows={16}
            />
          </div>
        </section>
      ))}
    </section>
  );
}
