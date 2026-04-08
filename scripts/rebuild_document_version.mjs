import fs from "node:fs";
import crypto from "node:crypto";

const [, , rawTextPath, outputSqlPath, versionId] = process.argv;

if (!rawTextPath || !outputSqlPath || !versionId) {
  throw new Error("Usage: node scripts/rebuild_document_version.mjs <rawTextPath> <outputSqlPath> <versionId>");
}

const { parsePolicyText } = await import("file:///tmp/policy-parser-build/policyParser.js");
const { buildSectionHierarchyColumns } = await import("file:///tmp/policy-parser-build/sectionHierarchyColumns.js");

const rawText = fs.readFileSync(rawTextPath, "utf8");
const parseResult = parsePolicyText(rawText);
const hierarchyColumnsById = buildSectionHierarchyColumns(parseResult.sections);

const sqlValue = (value) => {
  if (value === null || value === undefined) {
    return "null";
  }

  return `'${String(value).replaceAll("'", "''")}'`;
};

const rows = parseResult.sections.map((section) => {
  const columns = hierarchyColumnsById.get(section.tempId) ?? {};
  return {
    id: section.tempId,
    document_version_id: versionId,
    parent_section_id: section.parentTempId,
    hierarchy_type: section.hierarchyType,
    hierarchy_label: section.hierarchyLabel,
    hierarchy_order: section.hierarchyOrder,
    normalized_text: section.normalizedText,
    original_text: section.originalText,
    text_hash: crypto.createHash("sha256").update(section.normalizedText).digest("hex"),
    path_display: section.path.join(" > "),
    chapter_label: columns.chapter_label ?? null,
    chapter_text: columns.chapter_text ?? null,
    article_label: columns.article_label ?? null,
    article_text: columns.article_text ?? null,
    paragraph_label: columns.paragraph_label ?? null,
    paragraph_text: columns.paragraph_text ?? null,
    item_label: columns.item_label ?? null,
    item_text: columns.item_text ?? null,
    sub_item_label: columns.sub_item_label ?? null,
    sub_item_text: columns.sub_item_text ?? null,
  };
});

const warningsJson = JSON.stringify(parseResult.warnings).replaceAll("'", "''");

const insertValues = rows.map((row) => `(
  ${sqlValue(row.id)},
  ${sqlValue(row.document_version_id)},
  ${sqlValue(row.parent_section_id)},
  ${sqlValue(row.hierarchy_type)}::public.hierarchy_type,
  ${sqlValue(row.hierarchy_label)},
  ${row.hierarchy_order},
  ${sqlValue(row.normalized_text)},
  ${sqlValue(row.original_text)},
  ${sqlValue(row.text_hash)},
  ${sqlValue(row.path_display)},
  ${sqlValue(row.chapter_label)},
  ${sqlValue(row.chapter_text)},
  ${sqlValue(row.article_label)},
  ${sqlValue(row.article_text)},
  ${sqlValue(row.paragraph_label)},
  ${sqlValue(row.paragraph_text)},
  ${sqlValue(row.item_label)},
  ${sqlValue(row.item_text)},
  ${sqlValue(row.sub_item_label)},
  ${sqlValue(row.sub_item_text)}
)`).join(",\n");

const sql = `begin;
delete from public.policy_document_sections
where document_version_id = ${sqlValue(versionId)};

insert into public.policy_document_sections (
  id,
  document_version_id,
  parent_section_id,
  hierarchy_type,
  hierarchy_label,
  hierarchy_order,
  normalized_text,
  original_text,
  text_hash,
  path_display,
  chapter_label,
  chapter_text,
  article_label,
  article_text,
  paragraph_label,
  paragraph_text,
  item_label,
  item_text,
  sub_item_label,
  sub_item_text
) values
${insertValues};

update public.policy_document_versions
set parse_warnings = '${warningsJson}'::jsonb
where id = ${sqlValue(versionId)};

commit;
`;

fs.writeFileSync(outputSqlPath, sql, "utf8");
console.log(JSON.stringify({
  versionId,
  sectionCount: rows.length,
  warningCount: parseResult.warnings.length,
  hierarchyTypes: rows.map((row) => row.hierarchy_type),
}, null, 2));
