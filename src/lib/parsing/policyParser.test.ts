import { describe, expect, it } from "vitest";
import { parsePolicyText } from "../../../shared/policyParser";
import { buildSectionHierarchyColumns } from "../../../shared/sectionHierarchyColumns";

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
    expect(result.sections.map((section) => section.hierarchyOrder)).toEqual([
      1,
      2,
      3,
      4,
      5,
      6,
    ]);
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

  it("does not split statute references inside an article body into separate lines", () => {
    const raw = `제1조(목적) 이 기준은 「개인정보 보호법」(이하 "법"이라 한다) 제23조제2항, 제24조제3항 및 제29조와 같은 법 시행령(이하 "영"이라 한다) 제21조 및 제30조에 따라 개인정보처리자가 개인정보를 처리함에 있어서 개인정보가 분실·도난·유출·위조·변조 또는 훼손되지 아니하도록 안전성 확보에 필요한 기술적·관리적 및 물리적 안전조치에 관한 최소한의 기준을 정하는 것을 목적으로 한다.`;

    const result = parsePolicyText(raw);

    expect(result.warnings).toHaveLength(0);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]).toMatchObject({
      hierarchyType: "article",
      hierarchyLabel: "제1조",
      originalText: raw,
    });
  });

  it("keeps out-of-sequence article-like statute references in the current article body", () => {
    const raw = [
      "제1장 총칙",
      "제1조(목적) 이 기준은 「개인정보 보호법」(이하 \"법\"이라 한다)",
      "제23조제2항,",
      "제24조제3항 및",
      "제29조와 같은 법 시행령(이하 \"영\"이라 한다)",
      "제21조 및 제30조에 따라 개인정보처리자가 안전조치를 한다.",
      "제2조(정의) 이 기준에서 사용하는 용어의 뜻은 다음과 같다.",
      "제30조 및 제30조의2에 따른 기준을 포함한다.",
    ].join("\n");

    const result = parsePolicyText(raw);

    expect(result.warnings).toHaveLength(0);
    expect(result.sections.map((section) => section.hierarchyLabel)).toEqual([
      "제1장",
      "제1조",
      "제2조",
    ]);
    expect(result.sections[1].originalText).toContain("제21조 및 제30조에 따라");
    expect(result.sections[2].originalText).toContain("제30조 및 제30조의2에 따른");
  });

  it("does not jump from an article to a far future article number", () => {
    const raw = [
      "제7조(개인정보 보호위원회)",
      "보호위원회 설치 사항을 정한다.",
      "제15조 및 제15조의2에 따른 위임 사항은 별도로 따른다.",
      "제8조(보호위원회의 기능)",
      "보호위원회의 기능을 정한다.",
    ].join("\n");

    const result = parsePolicyText(raw);

    expect(result.warnings).toHaveLength(0);
    expect(result.sections.map((section) => section.hierarchyLabel)).toEqual([
      "제7조",
      "제8조",
    ]);
    expect(result.sections[0].originalText).toContain("제15조 및 제15조의2에 따른");
  });

  it("splits sequential amended article numbers with 의 suffix", () => {
    const raw = [
      "제7조(개인정보 보호위원회)",
      "위원회의 설치와 운영에 관한 사항을 정한다.",
      "제7조의1(위원의 자격)",
      "위원의 자격 요건을 정한다.",
      "제7조의2(위원회의 회의)",
      "위원회의 회의 운영 기준을 정한다.",
      "제8조(보호위원회의 기능)",
      "보호위원회의 기능을 정한다.",
    ].join("\n");

    const result = parsePolicyText(raw);

    expect(result.warnings).toHaveLength(0);
    expect(result.sections.map((section) => section.hierarchyLabel)).toEqual([
      "제7조",
      "제7조의1",
      "제7조의2",
      "제8조",
    ]);
    expect(
      result.sections.map((section) =>
        buildSectionHierarchyColumns(result.sections).get(section.tempId)?.article_label,
      ),
    ).toEqual([
      "제7조",
      "제7조의1",
      "제7조의2",
      "제8조",
    ]);
  });

  it("allows any next article number to start with an amended 의 suffix", () => {
    const raw = [
      "제6조(처리의 제한)",
      "개인정보 처리 제한 사항을 정한다.",
      "제7조의1(위원의 자격)",
      "위원의 자격 요건을 정한다.",
      "제8조의3(보호위원회의 기능)",
      "보호위원회의 기능을 정한다.",
      "제9조(기본계획)",
      "기본계획 수립 사항을 정한다.",
    ].join("\n");

    const result = parsePolicyText(raw);

    expect(result.warnings).toHaveLength(0);
    expect(result.sections.map((section) => section.hierarchyLabel)).toEqual([
      "제6조",
      "제7조의1",
      "제8조의3",
      "제9조",
    ]);
    expect(
      result.sections.map((section) =>
        buildSectionHierarchyColumns(result.sections).get(section.tempId)?.article_label,
      ),
    ).toEqual([
      "제6조",
      "제7조의1",
      "제8조의3",
      "제9조",
    ]);
  });

  it("keeps 조의숫자 in the article column and 호의숫자 in the item column", () => {
    const raw = [
      "제7조(개인정보 보호위원회)",
      "위원회의 설치와 운영에 관한 사항을 정한다.",
      "제7조의 1(위원의 자격)",
      "위원의 자격 요건을 정한다.",
      "① 위원회는 다음 각 호의 업무를 수행한다.",
      "7의 1 위원회 사무의 특례",
      "7의 2 위원회 사무의 추가 특례",
      "8. 그 밖에 필요한 사항",
    ].join("\n");

    const result = parsePolicyText(raw);
    const hierarchyColumnsById = buildSectionHierarchyColumns(result.sections);

    expect(result.warnings).toHaveLength(0);
    expect(result.sections.map((section) => section.hierarchyLabel)).toEqual([
      "제7조",
      "제7조의1",
      "①",
      "7의1",
      "7의2",
      "8.",
    ]);
    expect(
      result.sections.map((section) =>
        hierarchyColumnsById.get(section.tempId)?.article_label,
      ),
    ).toEqual([
      "제7조",
      "제7조의1",
      "제7조의1",
      "제7조의1",
      "제7조의1",
      "제7조의1",
    ]);
    expect(
      result.sections.map((section) =>
        hierarchyColumnsById.get(section.tempId)?.item_label,
      ),
    ).toEqual([
      null,
      null,
      null,
      "7의1",
      "7의2",
      "8.",
    ]);
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

  it("treats direct decimal numbers below an article as item labels, not paragraph labels", () => {
    const raw = [
      "제2조(정의) 이 기준에서 사용하는 용어의 뜻은 다음과 같다.",
      "1. 개인정보처리시스템이란 개인정보를 처리할 수 있도록 체계적으로 구성한 시스템을 말한다.",
      "2. 이용자란 서비스를 이용하는 자를 말한다.",
    ].join("\n");

    const result = parsePolicyText(raw);
    const hierarchyColumnsById = buildSectionHierarchyColumns(result.sections);

    expect(result.sections.map((section) => section.hierarchyType)).toEqual([
      "article",
      "item",
      "item",
    ]);
    expect(
      result.sections.map((section) =>
        hierarchyColumnsById.get(section.tempId)?.paragraph_label ?? null,
      ),
    ).toEqual([null, null, null]);
    expect(
      result.sections.map((section) =>
        hierarchyColumnsById.get(section.tempId)?.item_label ?? null,
      ),
    ).toEqual([null, "1.", "2."]);
  });

  it("keeps duplicate item numbers under the same parent as body text", () => {
    const raw = [
      "제7조(개인정보 보호위원회)",
      "① 위원회의 운영 기준을 정한다.",
      "7. 위원회 사무에 관한 사항",
      "8. 위원회 회의에 관한 사항",
      "8. 이 법 및 다른 법령에 따라 보호위원회의 사무로 규정된 사항",
      "9. 그 밖에 개인정보 보호를 위하여 필요한 사항",
    ].join("\n");

    const result = parsePolicyText(raw);

    expect(result.warnings).toHaveLength(0);
    expect(result.sections.map((section) => section.hierarchyLabel)).toEqual([
      "제7조",
      "①",
      "7.",
      "8.",
      "9.",
    ]);
    expect(result.sections[3].originalText).toContain(
      "8. 이 법 및 다른 법령에 따라 보호위원회의 사무로 규정된 사항",
    );
  });

  it("splits amended item numbers with 의 suffix into item rows", () => {
    const raw = [
      "제7조(개인정보 보호위원회)",
      "① 위원회의 운영 기준을 정한다.",
      "7. 위원회 사무에 관한 사항",
      "7의1 위원회 사무의 특례",
      "7의2 위원회 사무의 추가 특례",
      "8. 그 밖에 필요한 사항",
    ].join("\n");

    const result = parsePolicyText(raw);

    expect(result.warnings).toHaveLength(0);
    expect(result.sections.map((section) => section.hierarchyLabel)).toEqual([
      "제7조",
      "①",
      "7.",
      "7의1",
      "7의2",
      "8.",
    ]);
    expect(
      result.sections.map((section) =>
        buildSectionHierarchyColumns(result.sections).get(section.tempId)?.item_label,
      ),
    ).toEqual([
      null,
      null,
      "7.",
      "7의1",
      "7의2",
      "8.",
    ]);
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

  it("keeps sequential decimal markers as items directly under an article", () => {
    const raw = [
      "제2조(대통령령으로 정하는 기관)",
      "1. 국가인권위원회법 제3조에 따른 국가인권위원회",
      "2. 고위공직자범죄수사처 설치 및 운영에 관한 법률 제3조제1항에 따른 고위공직자범죄수사처",
      "3. 지방공기업법에 따른 지방공사와 지방공단",
    ].join("\n");

    const result = parsePolicyText(raw);
    const hierarchyColumnsById = buildSectionHierarchyColumns(result.sections);

    expect(result.warnings).toHaveLength(0);
    expect(result.sections.map((section) => section.hierarchyType)).toEqual([
      "article",
      "item",
      "item",
      "item",
    ]);
    expect(
      result.sections.map((section) =>
        hierarchyColumnsById.get(section.tempId)?.paragraph_label,
      ),
    ).toEqual([
      null,
      null,
      null,
      null,
    ]);
    expect(
      result.sections.map((section) =>
        hierarchyColumnsById.get(section.tempId)?.item_label,
      ),
    ).toEqual([
      null,
      "1.",
      "2.",
      "3.",
    ]);
  });

  it("keeps direct decimal markers as items when an article introduces 각 호 without a paragraph number", () => {
    const raw = [
      "제2조(대통령령으로 정하는 기관) 법 제2조제1호나목에서 대통령령으로 정하는 기관이란 다음 각 호의 기관을 말한다.",
      "1. 국가인권위원회법 제3조에 따른 국가인권위원회",
      "2. 고위공직자범죄수사처 설치 및 운영에 관한 법률 제3조제1항에 따른 고위공직자범죄수사처",
      "3. 지방공기업법에 따른 지방공사와 지방공단",
    ].join("\n");

    const result = parsePolicyText(raw);
    const hierarchyColumnsById = buildSectionHierarchyColumns(result.sections);

    expect(result.warnings).toHaveLength(0);
    expect(result.sections.map((section) => section.hierarchyType)).toEqual([
      "article",
      "item",
      "item",
      "item",
    ]);
    expect(
      result.sections.map((section) =>
        hierarchyColumnsById.get(section.tempId)?.paragraph_label,
      ),
    ).toEqual([
      null,
      null,
      null,
      null,
    ]);
    expect(
      result.sections.map((section) =>
        hierarchyColumnsById.get(section.tempId)?.item_label,
      ),
    ).toEqual([
      null,
      "1.",
      "2.",
      "3.",
    ]);
  });

  it("does not treat date-like dotted numbers as hierarchy markers", () => {
    const raw = [
      "제2조(대통령령으로 정하는 기관)",
      "1. 국가인권위원회법 제3조에 따른 국가인권위원회",
      "2025.9.23. 2. 고위공직자범죄수사처 설치 및 운영에 관한 법률에 따른 고위공직자범죄수사처",
    ].join("\n");

    const result = parsePolicyText(raw);

    expect(result.warnings).toHaveLength(0);
    expect(result.sections.map((section) => section.hierarchyLabel)).toEqual([
      "제2조",
      "1.",
    ]);
    expect(result.sections[1].originalText).toContain("2025.9.23. 2.");
  });

  it("splits inline circled paragraph markers while keeping later non-leading markers as body text", () => {
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
    ]);
    expect(result.sections[2].originalText).toContain("① 이 법은 정보통신망의 이용을 촉진한다.");
    expect(result.sections[2].originalText).toContain("1. 정보보호 기준을 정한다.");
    expect(result.sections[2].originalText).toContain("가. 보호조치 기준을 포함한다.");
  });

  it("splits an inline next paragraph after an item so 항 and 호 stay separate", () => {
    const raw = [
      "제26조(개인정보의 처리 업무 위탁에 따른 개인정보의 처리 제한)",
      "① 개인정보처리자가 개인정보의 처리 업무를 위탁하는 경우에는 다음 각 호의 내용을 문서에 포함해야 한다.",
      "1. 위탁업무 수행 목적 외 개인정보의 처리 금지에 관한 사항",
      "2. 개인정보의 기술적ㆍ관리적 보호조치에 관한 사항",
      "3. 그 밖에 개인정보의 안전한 관리를 위하여 대통령령으로 정한 사항 ② 제1항에 따라 개인정보의 처리 업무를 위탁하는 개인정보처리자는 수탁자를 교육해야 한다.",
    ].join("\n");

    const result = parsePolicyText(raw);

    expect(result.warnings).toHaveLength(0);
    expect(result.sections.map((section) => section.hierarchyLabel)).toEqual([
      "제26조",
      "①",
      "1.",
      "2.",
      "3.",
      "②",
    ]);
    expect(result.sections[4]).toMatchObject({
      hierarchyType: "item",
      path: ["제26조", "①", "3."],
    });
    expect(result.sections[4].originalText).not.toContain("② 제1항");
    expect(result.sections[5]).toMatchObject({
      hierarchyType: "paragraph",
      path: ["제26조", "②"],
    });
  });

  it("splits inline next paragraphs after item text", () => {
    const raw = [
      "제25조(고정형 영상정보처리기기의 운영ㆍ관리 방침)",
      "① 고정형 영상정보처리기기 운영ㆍ관리 방침에는 다음 각 호의 사항이 포함되어야 한다.",
      "7. 영상정보의 보관기간 및 파기 방법",
      "8. 그 밖에 고정형 영상정보처리기기의 설치ㆍ운영 및 관리에 필요한 사항 ② 제1항에 따라 마련한 고정형 영상정보처리기기 운영ㆍ관리 방침의 공개는 홈페이지에 게시하는 방법으로 한다.",
    ].join("\n");

    const result = parsePolicyText(raw);

    expect(result.warnings).toHaveLength(0);
    expect(result.sections.map((section) => section.hierarchyLabel)).toEqual([
      "제25조",
      "①",
      "7.",
      "8.",
      "②",
    ]);
    expect(result.sections[3].originalText).not.toContain("② 제1항");
    expect(result.sections[4]).toMatchObject({
      hierarchyType: "paragraph",
      path: ["제25조", "②"],
    });
  });

  it("splits inline amended article titles after item text", () => {
    const raw = [
      "제31조(개인정보 처리방침의 내용 및 공개방법 등)",
      "① 개인정보처리자는 다음 각 호의 사항을 개인정보 처리방침에 포함해야 한다.",
      "1. 처리하는 개인정보의 항목",
      "2. 개인정보의 처리 목적",
      "3. 개인정보의 보유기간",
      "4. 재화나 서비스를 제공하기 위하여 개인정보처리자와 정보주체가 작성한 계약서 등에 실어 정보주체에게 발급하는 방법 제31조의2(개인정보 처리방침의 평가 및 개선권고) 보호위원회는 처리방침을 평가할 수 있다.",
    ].join("\n");

    const result = parsePolicyText(raw);

    expect(result.warnings).toHaveLength(0);
    expect(result.sections.map((section) => section.hierarchyLabel)).toEqual([
      "제31조",
      "①",
      "1.",
      "2.",
      "3.",
      "4.",
      "제31조의2",
    ]);
    expect(result.sections[5].originalText).not.toContain("제31조의2");
    expect(result.sections[6]).toMatchObject({
      hierarchyType: "article",
      path: ["제31조의2"],
    });
  });

  it("splits inline section titles so parent sections do not contain nested child sections", () => {
    const raw = `
      제1장 총칙 제1조(목적)① 이 지침은 조직 운영 기준을 정한다.1.위원회의 역할을 정한다.2.예산을 수립한다.가.세부 기준을 포함한다.
    `;

    const result = parsePolicyText(raw);

    expect(result.sections.map((section) => section.hierarchyType)).toEqual([
      "chapter",
      "article",
      "paragraph",
    ]);
    expect(result.sections.map((section) => section.hierarchyLabel)).toEqual([
      "제1장",
      "제1조",
      "①",
    ]);
    expect(result.sections[0].originalText).toBe("제1장 총칙");
    expect(result.sections[0].originalText).not.toContain("제1조");
    expect(result.sections[1].originalText).toBe("제1조(목적)");
    expect(result.sections[2].originalText).toContain("① 이 지침은 조직 운영 기준을 정한다.");
  });

  it("splits multiple inline article titles without splitting statute references", () => {
    const raw = [
      "제1장 총칙",
      "제1조(목적) 이 기준은 제23조제2항과 제21조 및 제30조에 따른다. 제2조(정의) 이 기준에서 사용하는 용어의 뜻은 다음과 같다.",
    ].join("\n");

    const result = parsePolicyText(raw);

    expect(result.warnings).toHaveLength(0);
    expect(result.sections.map((section) => section.hierarchyLabel)).toEqual([
      "제1장",
      "제1조",
      "제2조",
    ]);
    expect(result.sections[1].originalText).toContain("제23조제2항과 제21조 및 제30조에 따른다.");
    expect(result.sections[1].originalText).not.toContain("제2조(정의)");
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
    expect(result.sections).toHaveLength(4);
    expect(result.sections[3].originalText).toContain("① 이 법에서 사용하는 용어의 뜻은 다음과 같다.");
  });

  it("preserves deleted legal provisions so numbering remains mappable", () => {
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
      "①",
      "1.",
      "가.",
      "②",
    ]);
    expect(result.sections).toHaveLength(5);
  });

  it("keeps amended decimal markers such as 9의2. in the item column", () => {
    const raw = [
      "제22조(동의)",
      "③ 개인정보처리자는 다음 각 호의 사항을 고지하여야 한다.",
      "9의2. 정보주체의 동의에 필요한 세부 사항",
      "10. 그 밖에 필요한 사항",
    ].join("\n");

    const result = parsePolicyText(raw);
    const hierarchyColumnsById = buildSectionHierarchyColumns(result.sections);

    expect(result.sections.map((section) => section.hierarchyLabel)).toEqual([
      "제22조",
      "③",
      "9의2.",
      "10.",
    ]);
    expect(
      result.sections.map((section) =>
        hierarchyColumnsById.get(section.tempId)?.item_label ?? null,
      ),
    ).toEqual([null, null, "9의2.", "10."]);
  });

  it("splits inline amended item markers such as 6의2. and 6의3. into separate item rows", () => {
    const raw = [
      "제44조의7(처리할 수 있는 개인정보) ① 개인정보처리자는 다음 각 호의 정보를 처리할 수 있다.",
      "6. 법령에 따라 금지되는 사항행위에 해당하는 내용의 정보 6의2. 이 법 또는 개인정보 보호에 관한 법령을 위반하여 개인정보를 거래하는 내용의 정보 6의3. 총포ㆍ화약류를 제조할 수 있는 방법이나 설계도 등의 정보",
    ].join("\n");

    const result = parsePolicyText(raw);
    const hierarchyColumnsById = buildSectionHierarchyColumns(result.sections);

    expect(result.sections.map((section) => section.hierarchyLabel)).toEqual([
      "제44조의7",
      "①",
      "6.",
      "6의2.",
      "6의3.",
    ]);
    expect(
      result.sections.map((section) =>
        hierarchyColumnsById.get(section.tempId)?.item_label ?? null,
      ),
    ).toEqual([null, null, "6.", "6의2.", "6의3."]);
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
    expect(result.warnings).toHaveLength(0);
  });
});
