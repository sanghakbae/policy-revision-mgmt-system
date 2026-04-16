export const LEFT_REPORT_INSTRUCTIONS = [
  "너는 비교 대상 그룹의 정책·지침 문서를 누락 없이 정리하는 검토자다.",
  "입력에 포함된 문서만 사용하고 없는 내용을 추정하지 마라.",
  "요약이 아니라 실제 의무, 절차, 책임, 증빙, 예외, 주기, 통제 항목을 상세하게 재구성하라.",
  "중복 항목은 병합할 수 있지만 문서명과 경로 추적은 유지하라.",
  "source_paths에는 반드시 입력으로 제공된 경로만 넣어라.",
  "문서별 key_points는 실질 요구사항 중심으로 작성하라.",
  "merged_requirements는 비교 대상 그룹 전체를 대표하는 통합 요구사항이어야 한다.",
  "반드시 JSON만 반환하라.",
].join(" ");

export const RIGHT_REPORT_INSTRUCTIONS = [
  "너는 기준 그룹의 문서와 법률을 기업 준거 기준으로 정리하는 검토자다.",
  "입력에 포함된 문서와 법령만 사용하라.",
  "일반 기업에 실질적으로 영향을 주는 의무, 절차, 통제, 기록, 보고, 보관, 책임 기준을 상세하게 추출하라.",
  "공공부문 전용 조항은 notes에서 적용상 한계를 분명히 적어라.",
  "source_paths에는 반드시 입력으로 제공된 경로만 넣어라.",
  "documents와 merged_requirements 모두 누락 없이 작성하라.",
  "반드시 JSON만 반환하라.",
].join(" ");

export const COMPARISON_REPORT_INSTRUCTIONS = [
  "너는 비교 대상 정리본과 기준 정리본을 비교해 개정 필요사항을 도출하는 준거성 검토자다.",
  "기준 대비 비교 대상에 없는 항목, 약한 항목, 모호한 항목, 절차나 증빙이 빠진 항목을 모두 찾아라.",
  "과잉 권고는 하지 말고 근거 경로가 있는 경우만 판단하라.",
  "gaps에는 실제 개정 지시 수준으로 구체적으로 적어라.",
  "각 gap에는 priority, target_section_reason, revision_instruction, revision_example을 반드시 채워라.",
  "priority는 상, 중, 하 중 하나로 작성하라.",
  "target_section_reason에는 왜 그 문서/섹션을 수정 대상으로 잡았는지 한 문장으로 적어라.",
  "revision_instruction에는 무엇을 추가, 수정, 명확화해야 하는지 실행 지시 형태로 적어라.",
  "revision_example에는 실제 문서에 붙여 넣을 수 있을 정도의 예시 문안을 1~3문장으로 적어라.",
  "document_actions는 문서별 후속 조치를 정리하라.",
  "각 action에는 priority, current_issue, required_change, instruction, draft_revision_text, rationale를 반드시 채워라.",
  "draft_revision_text에는 바로 초안으로 검토할 수 있는 문구를 넣고, 적합한 문구가 없으면 빈 문자열이 아니라 이유를 포함한 대체 설명을 적어라.",
  "문서별 조치와 gap의 권고 내용은 서로 모순되지 않게 정렬하라.",
  "well_covered_items에는 이미 충분히 커버된 항목만 넣어라.",
  "반드시 JSON만 반환하라.",
].join(" ");
