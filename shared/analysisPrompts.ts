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
  "최종 비교 리포트는 비교 대상 문서에서 신설해야 할 부분, 수정해야 할 부분, 삭제해야 할 부분을 명확히 구분해야 한다.",
  "모든 개정 권고는 반드시 비교 대상 문서 기준의 장, 조, 항, 호, 목 위치를 특정해서 작성하라.",
  "target_section_path에는 비교 대상 문서의 문서명과 함께 장/조/항/호/목 전체 경로를 누락 없이 적어라. 예: 개인정보 보호법 시행령 > 제2장 > 제15조 > ② > 3. > 나.",
  "신설이 필요한 경우에도 삽입될 비교 대상 문서의 가장 구체적인 위치를 지정하고, 기존 조문 사이에 넣어야 하면 그 기준 위치를 분명히 적어라.",
  "삭제가 필요한 경우에는 삭제 대상인 비교 대상 문서의 기존 장/조/항/호/목 위치를 정확히 적어라.",
  "각 gap에는 priority, target_section_reason, revision_instruction, revision_example을 반드시 채워라.",
  "gap_type과 document_actions.action에는 반드시 신설, 수정, 삭제 중 하나를 사용하라.",
  "priority는 상, 중, 하 중 하나로 작성하라.",
  "target_section_reason에는 왜 그 문서/섹션을 수정 대상으로 잡았는지 한 문장으로 적어라.",
  "revision_instruction에는 무엇을 추가, 수정, 삭제해야 하는지와 그 대상 장/조/항/호/목을 실행 지시 형태로 적어라.",
  "revision_example에는 실제 문서에 붙여 넣을 수 있을 정도의 예시 문안을 1~3문장으로 적어라.",
  "document_actions는 문서별 후속 조치를 정리하라.",
  "각 action에는 priority, target_section_path, current_issue, action, required_change, instruction, draft_revision_text, rationale를 반드시 채워라.",
  "document_actions의 각 action도 비교 대상 문서 기준 장/조/항/호/목 위치를 target_section_path에 정확히 적어라.",
  "draft_revision_text에는 바로 초안으로 검토할 수 있는 문구를 넣고, 적합한 문구가 없으면 빈 문자열이 아니라 이유를 포함한 대체 설명을 적어라.",
  "문서별 조치와 gap의 권고 내용은 서로 모순되지 않게 정렬하라.",
  "well_covered_items에는 이미 충분히 커버된 항목만 넣어라.",
  "반드시 JSON만 반환하라.",
].join(" ");

export const COMPARISON_REPORT_EXAMPLE = JSON.stringify(
  {
    summary:
      "기준 문서와 법령을 비교한 결과, 비교 대상 문서에는 처리방침 공개, 처리위탁 관리, 사고 대응 절차에서 개정이 필요합니다.",
    revision_needed: true,
    overall_comment:
      "비교 대상 문서는 기본 통제는 존재하지만, 기준 대비 공개 절차, 점검 주기, 삭제 기준이 부족합니다. 모든 권고는 비교 대상 문서 기준 장·조·항·호·목 위치로 특정해야 합니다.",
    gaps: [
      {
        topic: "처리방침 공개 방법",
        gap_type: "신설",
        priority: "상",
        right_requirement:
          "처리방침은 정보주체가 쉽게 확인할 수 있는 위치에 공개되어야 하고 공개 방법을 명시해야 한다.",
        left_current_state: "비교 대상 문서에는 공개 위치와 공개 방법에 대한 명시 조항이 없다.",
        risk: "정보주체 안내 미흡으로 공개의무 미충족 위험이 있다.",
        target_document_id: "doc-policy-001",
        target_document_title: "개인정보보호 내부 관리 정책",
        target_section_path:
          "개인정보보호 내부 관리 정책 > 제3장 > 제12조 > ①",
        target_section_reason:
          "처리방침 공개의무를 규정하는 조항 바로 아래에 세부 공개 기준을 넣는 것이 가장 자연스럽다.",
        recommended_revision:
          "제12조 제1항 아래에 처리방침 공개 위치와 방법에 관한 세부 문구를 신설한다.",
        revision_instruction:
          "비교 대상 문서의 제3장 > 제12조 > ① 위치에 처리방침 공개 위치, 공개 방식, 접근성 기준을 명시하는 문구를 신설하라.",
        revision_example:
          "개인정보처리자는 개인정보 처리방침을 홈페이지 첫 화면 또는 정보주체가 쉽게 확인할 수 있는 위치에 공개하여야 한다.",
        policy_evidence_paths: [
          "개인정보보호 내부 관리 정책 > 제3장 > 제12조 > ①",
        ],
        comparison_source_title: "개인정보 보호법",
        comparison_evidence_paths: ["개인정보 보호법 > 제3장 > 제31조 > ①"],
        confidence: 0.95,
      },
    ],
    well_covered_items: [
      {
        topic: "수집 목적 명시",
        reason: "비교 대상 문서가 수집 목적과 최소수집 원칙을 이미 규정하고 있다.",
        policy_evidence_paths: [
          "개인정보보호 내부 관리 정책 > 제2장 > 제5조 > ①",
        ],
        comparison_evidence_paths: ["개인정보 보호법 > 제15조 > ①"],
      },
    ],
    document_actions: [
      {
        document_id: "doc-policy-001",
        document_title: "개인정보보호 내부 관리 정책",
        actions: [
          {
            priority: "상",
            target_section_path:
              "개인정보보호 내부 관리 정책 > 제3장 > 제12조 > ①",
            current_issue:
              "처리방침 공개 의무는 있으나 공개 위치와 방법이 불명확하다.",
            action: "신설",
            required_change:
              "공개 위치, 공개 방식, 접근성 기준을 명시하는 문구 추가",
            instruction:
              "제12조 제1항 아래에 정보주체가 쉽게 확인 가능한 공개 위치 및 방법 기준을 추가한다.",
            draft_revision_text:
              "개인정보처리자는 개인정보 처리방침을 홈페이지 첫 화면 또는 정보주체가 쉽게 확인할 수 있는 위치에 공개하여야 한다.",
            rationale:
              "공개의무의 실효성을 확보하려면 위치와 방법을 구체화해야 한다.",
          },
        ],
      },
    ],
    low_confidence_notes: [
      "일부 기준 문서는 공공기관 중심으로 서술되어 있어 일반 기업 적용 시 해석 보정이 필요할 수 있다.",
    ],
    remaining_watchpoints: [
      "개정 후에도 시행령 및 안전성 확보조치 기준과의 정합성을 추가 점검할 필요가 있다.",
    ],
  },
  null,
  2,
);
