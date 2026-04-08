import { describe, expect, it } from "vitest";
import { parsePolicyText } from "../../../shared/policyParser";

describe("parsePolicyText", () => {
  it("extracts hierarchical legal units deterministically with parent links", () => {
    const raw = `
      제1장 총칙
      제1조(목적)
      본 정책은 회사의 기준을 정한다.
      ① 회사 정책의 목적을 정의한다.
      1) 적용 범위를 명시한다.
      가. 본사
      세부 설명
      제2조(정의)
    `;

    const result = parsePolicyText(raw);

    expect(result.warnings).toHaveLength(0);
    expect(result.sections).toHaveLength(6);
    expect(result.sections[0]).toMatchObject({
      hierarchyType: "chapter",
      hierarchyLabel: "제1장",
    });
    expect(result.sections[1]).toMatchObject({
      hierarchyType: "article",
      hierarchyLabel: "제1조",
      path: ["제1장", "제1조"],
    });
    expect(result.sections[1].originalText).toContain("본 정책은 회사의 기준을 정한다.");
    expect(result.sections[4]).toMatchObject({
      hierarchyType: "sub_item",
      path: ["제1장", "제1조", "①", "1)", "가."],
    });
    expect(result.sections[4].originalText).toContain("세부 설명");
    expect(result.sections[4].parentTempId).toBe(result.sections[3].tempId);
  });

  it("normalizes spaces around chapter and article numbers", () => {
    const raw = `
      제 1 장 총칙
      제 1 조(목적)
      본 정책은 회사의 기준을 정한다.
    `;

    const result = parsePolicyText(raw);

    expect(result.sections[0]).toMatchObject({
      hierarchyType: "chapter",
      hierarchyLabel: "제1장",
      originalText: "제1장 총칙",
    });
    expect(result.sections[1]).toMatchObject({
      hierarchyType: "article",
      hierarchyLabel: "제1조",
    });
    expect(result.sections[1].originalText).toContain("제1조(목적)");
  });

  it("parses circled paragraphs and decimal items from korean policy documents", () => {
    const raw = `
      제1조(정의)
      ① 정보보호의 정의를 설명한다.
      1. 정보보호 관련 법규 제·개정
      2. 비즈니스 환경의 변화
      ② 정보시스템의 정의를 설명한다.
    `;

    const result = parsePolicyText(raw);

    expect(result.warnings).toHaveLength(0);
    expect(result.sections.map((section) => section.hierarchyType)).toEqual([
      "article",
      "paragraph",
      "item",
      "item",
      "paragraph",
    ]);
    expect(result.sections[1]).toMatchObject({
      hierarchyLabel: "①",
      path: ["제1조", "①"],
    });
    expect(result.sections[2]).toMatchObject({
      hierarchyLabel: "1.",
      path: ["제1조", "①", "1."],
    });
    expect(result.sections[4]).toMatchObject({
      hierarchyLabel: "②",
      path: ["제1조", "②"],
    });
  });

  it("splits items under a paragraph even when the decimal marker has no trailing space", () => {
    const raw = `
      제4조(개인정보의 보호)
      ② 개인정보 및 중요 정보 전송 및 저장 시 아래 각호에 따라 암호화해야 한다.
      1.인터넷망을 통한 송수신 시 웹서버에 SSL 인증서를 설치해야 한다.
      2.개인정보처리시스템에 저장 시 데이터베이스 서버 암호화를 해야 한다.
      3.파일에 저장 시 문서도구 자체 암호화 설정을 해야 한다.
      4.보조저장매체에 저장 시 보안USB를 사용해야 한다.
    `;

    const result = parsePolicyText(raw);

    expect(result.warnings).toHaveLength(0);
    expect(result.sections.map((section) => section.hierarchyType)).toEqual([
      "article",
      "paragraph",
      "item",
      "item",
      "item",
      "item",
    ]);
    expect(result.sections[2]).toMatchObject({
      hierarchyLabel: "1.",
      path: ["제4조", "②", "1."],
    });
    expect(result.sections[5]).toMatchObject({
      hierarchyLabel: "4.",
      path: ["제4조", "②", "4."],
    });
  });

  it("splits decimal items into 호 under a circled paragraph for 개인정보 수집 사유 목록", () => {
    const raw = `
      제7조(개인정보의 수집)
      ① 다음 각 호의 해당하는 경우 개인정보를 수집할 수 있으며, 그 수집 목적의 범위 내에서 이용해야 한다.
      1.정보주체로부터 사전에 동의를 받은 경우
      2.법률에서 개인정보를 수집 및 이용할 수 있음을 구체적으로 명시하거나 허용하고 있는 경우
      3.개인정보를 수집 및 이용하지 않고 법령에서 부과하는 구체적인 의무를 이행하는 것이 불가능한 경우
      4.개인정보를 수집 및 이용하지 않고 정보주체와 계약 체결 또는 체결된 계약의 내용에 따른 의무를 이행하는 것이 불가능한 경우
      5.정보주체 또는 그 법정대리인이 의사표시를 할 수 없는 상태에 있거나 주소불명 등으로 사전 동의를 받을 수 없는 경우로써 명백히 정보주체 또는 제3자의 급박한 생명, 신체, 재산의 이익을 위해 필요하다고 인정되는 경우
    `;

    const result = parsePolicyText(raw);

    expect(result.warnings).toHaveLength(0);
    expect(result.sections.map((section) => section.hierarchyType)).toEqual([
      "article",
      "paragraph",
      "item",
      "item",
      "item",
      "item",
      "item",
    ]);
    expect(result.sections[2]).toMatchObject({
      hierarchyLabel: "1.",
      path: ["제7조", "①", "1."],
    });
    expect(result.sections[6]).toMatchObject({
      hierarchyLabel: "5.",
      path: ["제7조", "①", "5."],
    });
  });

  it("splits legal inline paragraph, item, and sub-item markers for laws like 정보통신망법", () => {
    const raw = `
      제1장 총칙
      제1조(목적) ① 이 법은 정보통신망의 이용을 촉진한다. 1. 정보보호 기준을 정한다. 2. 이용자 권익을 보호한다. 가. 보호조치 기준을 포함한다. 나. 사고 대응 절차를 포함한다.
    `;

    const result = parsePolicyText(raw);

    expect(result.warnings).toHaveLength(0);
    expect(result.sections.map((section) => section.hierarchyType)).toEqual([
      "chapter",
      "article",
      "paragraph",
      "item",
      "item",
      "sub_item",
      "sub_item",
    ]);
    expect(result.sections[2]).toMatchObject({
      hierarchyLabel: "①",
      path: ["제1장", "제1조", "①"],
    });
    expect(result.sections[3]).toMatchObject({
      hierarchyLabel: "1.",
      path: ["제1장", "제1조", "①", "1."],
    });
    expect(result.sections[5]).toMatchObject({
      hierarchyLabel: "가.",
      path: ["제1장", "제1조", "①", "2.", "가."],
    });
  });

  it("splits inline article, paragraph, item, and sub-item markers even without stable spacing", () => {
    const raw = `
      제1장 총칙 제1조(목적)① 이 지침은 조직 운영 기준을 정한다.1.위원회의 역할을 정한다.2.예산을 수립한다.가.세부 기준을 포함한다.
    `;

    const result = parsePolicyText(raw);

    expect(result.sections.map((section) => section.hierarchyType)).toEqual([
      "chapter",
      "article",
      "paragraph",
      "item",
      "item",
      "sub_item",
    ]);
    expect(result.sections.map((section) => section.hierarchyLabel)).toEqual([
      "제1장",
      "제1조",
      "①",
      "1.",
      "2.",
      "가.",
    ]);
  });

  it("parses article lines even when the article body starts on the same line", () => {
    const raw = `
      제1장 총칙
      제1조(목적) 이 법은 정보통신망의 이용을 촉진한다. <개정 2020. 2. 4.>
      [전문개정 2008. 6. 13.]
      제2조(정의) ① 이 법에서 사용하는 용어의 뜻은 다음과 같다.
    `;

    const result = parsePolicyText(raw);

    expect(result.sections[0]).toMatchObject({
      hierarchyType: "chapter",
      hierarchyLabel: "제1장",
    });
    expect(result.sections[1]).toMatchObject({
      hierarchyType: "article",
      hierarchyLabel: "제1조",
      path: ["제1장", "제1조"],
    });
    expect(result.sections[1].originalText).toContain("이 법은 정보통신망의 이용을 촉진한다.");
    expect(result.sections[2]).toMatchObject({
      hierarchyType: "article",
      hierarchyLabel: "제2조",
      path: ["제1장", "제2조"],
    });
    expect(result.sections[3]).toMatchObject({
      hierarchyType: "paragraph",
      hierarchyLabel: "①",
      path: ["제1장", "제2조", "①"],
    });
  });

  it("drops deleted legal provisions from laws like 정보통신망법", () => {
    const raw = `
      제1조(목적)
      ① 삭제 <2024. 1. 1.>
      1. 삭제 <2024. 1. 1.>
      가. 삭제 <2024. 1. 1.>
      ② 이용자 보호 기준을 정한다.
    `;

    const result = parsePolicyText(raw);

    expect(result.sections.map((section) => section.hierarchyLabel)).toEqual([
      "제1조",
      "②",
    ]);
    expect(result.sections).toHaveLength(2);
  });

  it("preserves unmatched top-level text and emits explicit warnings", () => {
    const raw = `
      정책 안내문
      시행일: 2026-04-06
      제1조(목적)
    `;

    const result = parsePolicyText(raw);

    expect(result.sections[0]).toMatchObject({
      hierarchyType: "document",
      originalText: "정책 안내문\n시행일: 2026-04-06",
    });
    expect(result.warnings[0]).toContain("Unmatched top-level text preserved");
  });

  it("falls back to the nearest valid parent when structure is partial", () => {
    const raw = `
      제1조(목적)
      1) 항 없이 바로 호가 등장한다.
    `;

    const result = parsePolicyText(raw);

    expect(result.sections[1]).toMatchObject({
      hierarchyType: "item",
      path: ["제1조", "1)"],
    });
    expect(result.warnings[0]).toContain("missing its expected paragraph parent");
  });
});
