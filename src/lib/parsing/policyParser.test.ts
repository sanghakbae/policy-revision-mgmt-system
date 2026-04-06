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
