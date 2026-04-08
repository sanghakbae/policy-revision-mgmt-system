import { useState } from "react";

interface DocumentUploadFormProps {
  disabled: boolean;
  onUpload: (file: File, title: string, description: string) => Promise<void>;
  setStatus: (value: string) => void;
  disabledReason?: string | null;
}

export function DocumentUploadForm({
  disabled,
  onUpload,
  setStatus,
  disabledReason = null,
}: DocumentUploadFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!file) {
      setStatus(".txt, .md, .doc 또는 .docx 문서를 선택하세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      await onUpload(file, title || file.name, description);
      setTitle("");
      setDescription("");
      setFile(null);
      const fileInput = form.elements.namedItem("file") as HTMLInputElement | null;
      if (fileInput) {
        fileInput.value = "";
      }
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "문서 업로드 중 예기치 않은 오류가 발생했습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit}>
      <div className="section-header">
        <h2>정책·지침 업로드</h2>
        <p>
          현재 범위에서는 결정론적 파싱과 검토 가능성을 유지하기 위해
          텍스트 문서와 Word(.doc, .docx) 문서를 받습니다.
        </p>
      </div>
      {disabledReason ? (
        <div className="warning-card detail-card">
          <strong>업로드가 잠겨 있습니다.</strong>
          <p className="helper-text detailed-empty-reason">{disabledReason}</p>
        </div>
      ) : (
        <div className="info-card detail-card upload-hint-card">
          <strong>업로드 전에 확인하세요.</strong>
          <ul className="plain-list">
            <li>지원 형식: `txt`, `md`, `docx`</li>
            <li>구형 Word 문서(`doc`)는 서버에서 텍스트를 추출합니다.</li>
            <li>제목을 비워 두면 파일명이 문서 제목으로 사용됩니다.</li>
            <li>파싱 후 문서 목록과 구조 미리보기에 즉시 반영됩니다.</li>
          </ul>
        </div>
      )}
      <label className="field">
        <span>제목</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="예: 정보보호 운영 지침"
          disabled={disabled || isSubmitting}
        />
      </label>
      <label className="field">
        <span>설명</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="검토자를 위한 설명을 입력하세요"
          disabled={disabled || isSubmitting}
          rows={4}
        />
      </label>
      <label className="field">
        <span>원본 파일</span>
        <input
          id="file"
          name="file"
          type="file"
          accept=".txt,.md,.doc,.docx,text/plain,text/markdown,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          disabled={disabled || isSubmitting}
        />
      </label>
      {!file && !disabled ? (
        <p className="helper-text">
          파일을 선택하면 업로드 후 장·조·항·호·목 구조를 자동으로 계산합니다.
        </p>
      ) : null}
      {file ? (
        <div className="info-card detail-card">
          <strong>선택된 파일</strong>
          <p className="helper-text detailed-empty-reason">
            {file.name}
            {file.type ? ` · ${file.type}` : ""}
            {file.size ? ` · ${(file.size / 1024).toFixed(1)} KB` : ""}
          </p>
        </div>
      ) : null}
      <button className="button" type="submit" disabled={disabled || isSubmitting}>
        {isSubmitting ? "업로드 중..." : "업로드 및 파싱"}
      </button>
    </form>
  );
}
