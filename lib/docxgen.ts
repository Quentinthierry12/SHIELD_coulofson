import JSZip from "jszip";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const VAR_RE = /\{\{\s*([\w -]+?)\s*\}\}/g;

// System variables are filled automatically at creation time — never prompted.
export const SYSTEM_VARS = ["date", "officer", "officer badge"] as const;

// Suggested custom fields the author can insert (prompted when creating a document).
export const SUGGESTED_VARS = [
  "agent", "codename", "badge", "clearance", "division", "duty station",
  "mission code", "objective", "location", "target", "status", "priority",
] as const;

// Distinct variable names used in a template body, in order of appearance.
export function extractVariables(body: string): string[] {
  const seen: string[] = [];
  let m: RegExpExecArray | null;
  VAR_RE.lastIndex = 0;
  while ((m = VAR_RE.exec(body))) if (!seen.includes(m[1])) seen.push(m[1]);
  return seen;
}

// Variables the user must fill in (everything except the auto-filled system ones).
export function promptableVariables(body: string): string[] {
  return extractVariables(body).filter((v) => !SYSTEM_VARS.includes(v as any));
}

export function systemValues(officer: { codename: string; matricule: string }): Record<string, string> {
  return {
    date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    officer: officer.codename,
    "officer badge": officer.matricule,
  };
}

export function fillVariables(body: string, vars: Record<string, string>): string {
  return body.replace(VAR_RE, (_, name) => vars[name] ?? `{{${name}}}`);
}

function runXml(text: string, { b = false, sz = 22, color = "" } = {}) {
  const rPr = [b ? "<w:b/>" : "", `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>`, color ? `<w:color w:val="${color}"/>` : ""].join("");
  return `<w:r><w:rPr>${rPr}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

function paraXml(inner: string, { heading = false } = {}) {
  const pPr = heading
    ? `<w:pPr><w:spacing w:before="240" w:after="80"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="1C3A5E"/></w:pBdr></w:pPr>`
    : `<w:pPr><w:spacing w:after="120"/></w:pPr>`;
  return `<w:p>${pPr}${inner}</w:p>`;
}

// Render a plain-text body into a .docx. Lines beginning with "# " become headings.
export async function buildDocx(body: string): Promise<Buffer> {
  const paras = body.split(/\r?\n/).map((line) => {
    if (line.startsWith("# ")) return paraXml(runXml(line.slice(2), { b: true, sz: 26, color: "1C3A5E" }), { heading: true });
    if (line.trim() === "") return paraXml(runXml(""));
    return paraXml(runXml(line));
  });

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
${paras.join("\n")}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
</w:body></w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

  const zip = new JSZip();
  zip.file("[Content_Types].xml", contentTypes);
  zip.folder("_rels")!.file(".rels", rels);
  zip.folder("word")!.file("document.xml", documentXml);
  return zip.generateAsync({ type: "nodebuffer" });
}
