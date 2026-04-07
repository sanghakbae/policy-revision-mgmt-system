import { useEffect, useState } from "react";
import { getLawDetail } from "../lib/documentService";
import type { LawDetail } from "../types";

interface LawVersionPreviewProps {
  lawVersionId: string | null;
}

export function LawVersionPreview({ lawVersionId }: LawVersionPreviewProps) {
  const [lawDetail, setLawDetail] = useState<LawDetail | null>(null);
  const [status, setStatus] = useState("법령을 선택하면 파싱된 구조를 미리 보여줍니다.");

  useEffect(() => {
    if (!lawVersionId) {
      setLawDetail(null);
      setStatus("법령을 선택하면 파싱된 구조를 미리 보여줍니다.");
      return;
    }

    getLawDetail(lawVersionId)
      .then((detail) => {
        setLawDetail(detail);
        setStatus("법령 파싱 결과를 불러왔습니다.");
      })
      .catch((error: Error) => {
        setLawDetail(null);
        setStatus(error.message);
      });
  }, [lawVersionId]);

  if (!lawDetail) {
    return (
      <div className="empty-state">
        <strong>법령 파싱 미리보기</strong>
        <p>{status}</p>
      </div>
    );
  }

  const rows = collapseRepeatedHierarchyLabels(
    orderStructuredSections(lawDetail.sections).map((section) => ({
      id: section.id,
      content: section.original_text,
      ...toStructuredRow(section),
    })),
  );
  const visibleColumns = getVisibleStructuredColumns(rows);

  return (
    <div className="stack document-viewer law-preview">
      <div className="section-header">
        <h2>{lawDetail.source_title ?? "법령 파싱 미리보기"}</h2>
        <p>
          비교 실행 전에 선택한 법령의 구조화된 장·조·항·호·목을 먼저 검토합니다.
        </p>
      </div>

      <div className="info-card">
        <span className="muted-label">선택 법령</span>
        <strong>
          {lawDetail.version_label ?? "버전 미지정"}
          {lawDetail.effective_date ? ` · 시행일 ${lawDetail.effective_date}` : ""}
        </strong>
      </div>

      {lawDetail.parse_warnings.length > 0 ? (
        <div className="warning-card">
          <strong>파싱 경고</strong>
          <ul className="plain-list">
            {lawDetail.parse_warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="info-card">
        <span className="muted-label">구조화 섹션</span>
        <div className="structured-section-table-wrap">
          <table className="structured-section-table">
            <thead>
              <tr>
                {visibleColumns.includes("chapter") ? <th className="structured-key-cell">장</th> : null}
                {visibleColumns.includes("article") ? <th className="structured-key-cell">조</th> : null}
                {visibleColumns.includes("paragraph") ? <th className="structured-key-cell">항</th> : null}
                {visibleColumns.includes("item") ? <th className="structured-key-cell">호</th> : null}
                {visibleColumns.includes("subItem") ? <th className="structured-key-cell">목</th> : null}
                <th className="structured-content-cell">내용</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  {visibleColumns.includes("chapter") ? <td className={getStructuredKeyCellClass(row.chapter)}>{row.chapter}</td> : null}
                  {visibleColumns.includes("article") ? <td className={getStructuredKeyCellClass(row.article)}>{row.article}</td> : null}
                  {visibleColumns.includes("paragraph") ? <td className={getStructuredKeyCellClass(row.paragraph)}>{row.paragraph}</td> : null}
                  {visibleColumns.includes("item") ? <td className={getStructuredKeyCellClass(row.item)}>{row.item}</td> : null}
                  {visibleColumns.includes("subItem") ? <td className={getStructuredKeyCellClass(row.subItem)}>{row.subItem}</td> : null}
                  <td className="structured-content-cell">{row.content}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function toStructuredRow(section: LawDetail["sections"][number]) {
  const fallbackLabels = parsePathDisplay(section.path_display);
  return {
    chapter: section.chapter_label ?? fallbackLabels.chapter ?? "",
    article: section.article_label ?? fallbackLabels.article ?? "",
    paragraph: section.paragraph_label ?? fallbackLabels.paragraph ?? "",
    item: section.item_label ?? fallbackLabels.item ?? "",
    subItem: section.sub_item_label ?? fallbackLabels.subItem ?? "",
  };
}

function parsePathDisplay(pathDisplay: string) {
  const parts = pathDisplay
    .split(">")
    .map((value) => value.trim())
    .filter(Boolean);

  const row: {
    chapter?: string;
    article?: string;
    paragraph?: string;
    item?: string;
    subItem?: string;
  } = {};

  for (const part of parts) {
    if (part.includes("장")) {
      row.chapter = part;
      continue;
    }
    if (part.includes("조")) {
      row.article = part;
      continue;
    }
    if (/^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/u.test(part)) {
      row.paragraph = part;
      continue;
    }
    if (/^[0-9]+\.$/u.test(part) || /^[0-9]+\)$/u.test(part)) {
      row.item = part;
      continue;
    }
    if (/^[가-힣A-Za-z]\.$/u.test(part)) {
      row.subItem = part;
    }
  }

  return row;
}

function orderStructuredSections(sections: LawDetail["sections"]) {
  return [...sections]
    .filter((section) => section.hierarchy_type !== "document")
    .sort((left, right) => left.hierarchy_order - right.hierarchy_order);
}

function collapseRepeatedHierarchyLabels(
  rows: Array<{
    id: string;
    chapter: string;
    article: string;
    paragraph: string;
    item: string;
    subItem: string;
    content: string;
  }>,
) {
  const previous = {
    chapter: "",
    article: "",
    paragraph: "",
    item: "",
    subItem: "",
  };

  return rows.map((row) => {
    const collapsed = {
      ...row,
      chapter: row.chapter === previous.chapter ? "" : row.chapter,
      article: row.article === previous.article ? "" : row.article,
      paragraph: row.paragraph === previous.paragraph ? "" : row.paragraph,
      item: row.item === previous.item ? "" : row.item,
      subItem: row.subItem === previous.subItem ? "" : row.subItem,
    };

    previous.chapter = row.chapter || previous.chapter;
    previous.article = row.article || previous.article;
    previous.paragraph = row.paragraph || previous.paragraph;
    previous.item = row.item || previous.item;
    previous.subItem = row.subItem || previous.subItem;

    return collapsed;
  });
}

function getVisibleStructuredColumns(
  rows: Array<{
    chapter: string;
    article: string;
    paragraph: string;
    item: string;
    subItem: string;
  }>,
) {
  return ["chapter", "article", "paragraph", "item", "subItem"].filter((column) =>
    rows.some((row) => Boolean(row[column as keyof typeof row])),
  );
}

function getStructuredKeyCellClass(value: string) {
  return value ? "structured-key-cell" : "structured-key-cell is-empty";
}
