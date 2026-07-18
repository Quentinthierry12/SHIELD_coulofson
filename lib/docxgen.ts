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

function runXml(text: string, { b = false, i = false, sz = 22, color = "", font = "" } = {}) {
  const rPr = [
    b ? "<w:b/>" : "",
    i ? "<w:i/>" : "",
    font ? `<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/>` : "",
    `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>`,
    color ? `<w:color w:val="${color}"/>` : "",
  ].join("");
  return `<w:r><w:rPr>${rPr}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

function paraXml(inner: string, { heading = false } = {}) {
  const pPr = heading
    ? `<w:pPr><w:spacing w:before="240" w:after="80"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="1C3A5E"/></w:pBdr></w:pPr>`
    : `<w:pPr><w:spacing w:after="120"/></w:pPr>`;
  return `<w:p>${pPr}${inner}</w:p>`;
}

// Wrap a body (paragraphs/tables XML) into a valid .docx buffer.
async function packDocx(bodyInner: string): Promise<Buffer> {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
${bodyInner}
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

// Render a plain-text body into a .docx. Lines beginning with "# " become headings.
export async function buildDocx(body: string): Promise<Buffer> {
  const paras = body.split(/\r?\n/).map((line) => {
    if (line.startsWith("# ")) return paraXml(runXml(line.slice(2), { b: true, sz: 26, color: "1C3A5E" }), { heading: true });
    if (line.trim() === "") return paraXml(runXml(""));
    return paraXml(runXml(line));
  });
  return packDocx(paras.join("\n"));
}

// ---------- Rich auto-generated Agent Personnel File (Document Builder, Voie 1) ----------
function centerPara(inner: string, { shade = "", after = 120, before = 0 } = {}) {
  const shadeXml = shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${shade}"/>` : "";
  return `<w:p><w:pPr><w:jc w:val="center"/>${shadeXml}<w:spacing w:before="${before}" w:after="${after}"/></w:pPr>${inner}</w:p>`;
}

// Two-column info table (label | value), SHIELD-bordered.
function infoTable(rows: [string, string][]) {
  const border = `<w:top w:val="single" w:sz="4" w:color="1C2A3F"/><w:left w:val="single" w:sz="4" w:color="1C2A3F"/><w:bottom w:val="single" w:sz="4" w:color="1C2A3F"/><w:right w:val="single" w:sz="4" w:color="1C2A3F"/><w:insideH w:val="single" w:sz="4" w:color="1C2A3F"/><w:insideV w:val="single" w:sz="4" w:color="1C2A3F"/>`;
  const tr = rows
    .map(([label, value]) => {
      const labelCell = `<w:tc><w:tcPr><w:tcW w:w="3200" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="EAF1F8"/></w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${runXml(label, { b: true, sz: 20 })}</w:p></w:tc>`;
      const valueCell = `<w:tc><w:tcPr><w:tcW w:w="6000" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${runXml(value || "—", { sz: 20 })}</w:p></w:tc>`;
      return `<w:tr>${labelCell}${valueCell}</w:tr>`;
    })
    .join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="9200" w:type="dxa"/><w:tblBorders>${border}</w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="3200"/><w:gridCol w:w="6000"/></w:tblGrid>${tr}</w:tbl>`;
}

// ---------- Mission Order generator ----------
export type MissionOrder = {
  code: string;
  objective: string;
  agent?: string;
  location?: string;
  priority?: string;
  classification?: number;
  briefing?: string;
  officer: string;
};

export async function buildMissionOrder(m: MissionOrder): Promise<Buffer> {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const heading = (t: string) => paraXml(runXml(t, { b: true, sz: 26, color: "1C3A5E" }), { heading: true });
  const clsCls = (m.classification || 1) >= 7 ? "TOP SECRET" : (m.classification || 1) >= 4 ? "CLASSIFIED" : "RESTRICTED";
  const briefingParas = (m.briefing || "").split(/\r?\n/).filter(Boolean).map((l) => paraXml(runXml(l, { sz: 22 })));

  const body = [
    centerPara(runXml(`CLASSIFIED — ${clsCls} — LEVEL ${m.classification || 1}`, { b: true, sz: 18, color: "FFFFFF" }), { shade: "7A1010", after: 0 }),
    centerPara(runXml("S.H.I.E.L.D.", { b: true, sz: 44, color: "1C3A5E" }), { before: 200, after: 0 }),
    centerPara(runXml("MISSION ORDER", { b: true, sz: 30 }), { after: 40 }),
    centerPara(runXml(m.code.toUpperCase(), { b: true, sz: 24, color: "4DA6FF" }), { after: 200 }),

    heading("Order Details"),
    infoTable([
      ["Mission Code", m.code.toUpperCase()],
      ["Assigned Agent(s)", m.agent || "—"],
      ["Location", m.location || "—"],
      ["Priority", m.priority || "Routine"],
      ["Classification", `Level ${m.classification || 1} — ${clsCls}`],
      ["Date Issued", today],
      ["Authorizing Officer", m.officer],
    ]),
    paraXml(runXml("")),

    heading("Objective"),
    paraXml(runXml(m.objective, { sz: 22 })),
    paraXml(runXml("")),

    ...(briefingParas.length ? [heading("Briefing"), ...briefingParas, paraXml(runXml(""))] : []),

    heading("Authorization"),
    paraXml([runXml("Authorizing officer:  ", { b: true, sz: 20 }), runXml(m.officer + "        ", { sz: 20 }), runXml("Date:  ", { b: true, sz: 20 }), runXml(today, { sz: 20 })].join("")),
    paraXml([runXml("Agent acknowledgement:  ", { b: true, sz: 20 }), runXml("________________________", { sz: 20 })].join("")),

    centerPara(runXml("This order is the property of S.H.I.E.L.D. Compromise of this document is a Level-1 offense.", { i: true, sz: 16, color: "7A1010" }), { before: 300 }),
  ].join("\n");

  return packDocx(body);
}

export type AgentInfo = { matricule: string; codename: string; division?: string; clearance?: number };

const clearanceLabel = (n = 1) => `Level ${n} — ${n >= 7 ? "Top Secret" : n >= 4 ? "Classified" : "Restricted"}`;

// Generate a fully pre-filled agent personnel file from the account's real data.
export async function buildPersonnelFile(agent: AgentInfo): Promise<Buffer> {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const heading = (t: string) => paraXml(runXml(t, { b: true, sz: 26, color: "1C3A5E" }), { heading: true });

  const body = [
    centerPara(runXml("CLASSIFIED — LEVEL 10 — EYES ONLY", { b: true, sz: 18, color: "FFFFFF" }), { shade: "7A1010", after: 0 }),
    centerPara(runXml("S.H.I.E.L.D.", { b: true, sz: 48, color: "1C3A5E" }), { before: 240, after: 0 }),
    centerPara(runXml("Strategic Homeland Intervention, Enforcement and Logistics Division", { i: true, sz: 18, color: "555555" }), { after: 40 }),
    centerPara(runXml("AGENT PERSONNEL FILE", { b: true, sz: 28 }), { after: 240 }),

    heading("Section 1 — Identity"),
    infoTable([
      ["Codename", agent.codename],
      ["Badge Number", agent.matricule],
      ["Division / Unit", agent.division || ""],
      ["Clearance Level", clearanceLabel(agent.clearance)],
      ["Date of Enlistment", today],
      ["Current Status", "ACTIVE"],
    ]),
    paraXml(runXml("")),

    heading("Section 2 — Assignment"),
    infoTable([
      ["Duty Station", ""],
      ["Supervising Officer", ""],
      ["Specializations", ""],
      ["Commendations", ""],
    ]),
    paraXml(runXml("")),

    heading("Section 3 — Clearance & Access"),
    paraXml([runXml("Note:  ", { b: true, sz: 18 }), runXml("Access to material above this agent's assigned clearance is prohibited under Protocol 7-Alpha.", { i: true, sz: 18, color: "555555" })].join("")),
    paraXml(runXml("")),

    heading("Section 4 — Oath of Service"),
    paraXml(runXml("“I pledge my service to the protection of this world and its people. I will safeguard what I am entrusted with, obey the chain of command, and hold the line when others cannot.”", { i: true, sz: 20 })),
    paraXml(runXml("")),
    paraXml([runXml("Agent signature:  ", { b: true, sz: 20 }), runXml("________________________        ", { sz: 20 }), runXml("Date:  ", { b: true, sz: 20 }), runXml("____________", { sz: 20 })].join("")),
    paraXml([runXml("Authorizing officer:  ", { b: true, sz: 20 }), runXml("________________________        ", { sz: 20 }), runXml("Date:  ", { b: true, sz: 20 }), runXml("____________", { sz: 20 })].join("")),

    centerPara(runXml("Property of S.H.I.E.L.D. — unauthorized possession, reproduction or disclosure is a Level-1 offense.", { i: true, sz: 16, color: "7A1010" }), { before: 300 }),
  ].join("\n");

  return packDocx(body);
}

// ---------- Signature block ----------
// Engraved into the .docx once every signer has signed, so the signed order is visible in
// the editor AND in the PDF export — not just in the portal database.
// A typed signature is rendered in a script font (the same look the portal shows); an
// imported handwritten image stays in the portal for now, the block records that it was
// used. ponytail: embedding the image needs word/media + rels plumbing — add when asked.
export type SignatureLine = { codename: string; matricule: string; at: Date; kind: string; role?: string };

export async function appendSignatureBlock(docx: Buffer, lines: SignatureLine[], hash: string): Promise<Buffer> {
  const zip = await JSZip.loadAsync(docx);
  const file = zip.file("word/document.xml");
  if (!file) return docx; // not a shape we understand — leave the document untouched
  const xml = await file.async("string");

  const paras: string[] = [];
  paras.push(paraXml(runXml("SIGNATURES", { b: true, sz: 24, color: "1C3A5E" }), { heading: true }));
  for (const l of lines) {
    // The signature itself, in a handwriting face.
    paras.push(paraXml(runXml(l.codename, { sz: 34, font: "Segoe Script", color: "1C3A5E" })));
    const stamp = `${l.matricule}${l.role ? " · " + l.role : ""} — signed ${l.at.toISOString().slice(0, 16).replace("T", " ")} UTC` +
      (l.kind === "image" ? " (handwritten signature on file)" : "");
    paras.push(paraXml(runXml(stamp, { sz: 16, color: "5F7590" })));
  }
  paras.push(
    paraXml(runXml(`Document sealed — integrity ${hash.slice(0, 16)}`, { sz: 14, i: true, color: "5F7590" }))
  );

  // Inject before the section properties so page setup is preserved.
  const marker = xml.includes("<w:sectPr") ? "<w:sectPr" : "</w:body>";
  const out = xml.replace(marker, paras.join("") + marker);
  zip.file("word/document.xml", out);
  return zip.generateAsync({ type: "nodebuffer" });
}
