import { describe, expect, it } from "vitest";
import { decodePlainTextBuffer } from "./documentService";

describe("decodePlainTextBuffer", () => {
  it("keeps utf-8 Korean text intact", () => {
    const buffer = new TextEncoder().encode("개인정보 안전성 확보조치 기준").buffer;

    expect(decodePlainTextBuffer(buffer)).toBe("개인정보 안전성 확보조치 기준");
  });

  it("decodes Korean CP949/EUC-KR text files without mojibake", () => {
    const bytes = new Uint8Array([
      0xb0, 0xb3, 0xc0, 0xce, 0xc1, 0xa4, 0xba, 0xb8,
    ]);

    expect(decodePlainTextBuffer(bytes.buffer)).toBe("개인정보");
  });
});
