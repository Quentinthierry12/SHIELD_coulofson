import JSZip from "jszip";

// Classification convention (Brique B v1, text markers):
//   [[CLR:7]] ... anywhere in a paragraph ... marks that PARAGRAPH as level 7.
// Redaction is done per-paragraph: a paragraph whose required level exceeds the
// viewer's clearance is replaced by a REDACTED block; the raw secret bytes never
// reach that viewer. Paragraph-level (not word-level) keeps it robust even when
// Word splits the marker across runs — detection works on the joined text.

const MARKER = /\[\[CLR:(\d+)\]\]/g;
const STRIP = /\[\[\/?CLR:\d+\]\]/g;
const PARA = /<w:p\b([^>]*)>([\s\S]*?)<\/w:p>/g;
const WT = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;

function paraText(pInner: string): string {
  let t = "";
  let m: RegExpExecArray | null;
  WT.lastIndex = 0;
  while ((m = WT.exec(pInner))) t += m[1];
  return t;
}

function paraLevel(pInner: string): number {
  const text = paraText(pInner);
  let max = 0;
  let m: RegExpExecArray | null;
  MARKER.lastIndex = 0;
  while ((m = MARKER.exec(text))) max = Math.max(max, parseInt(m[1], 10));
  return max;
}

async function documentXml(buf: Buffer): Promise<{ zip: JSZip; xml: string } | null> {
  try {
    const zip = await JSZip.loadAsync(buf);
    const f = zip.file("word/document.xml");
    if (!f) return null;
    return { zip, xml: await f.async("string") };
  } catch {
    return null;
  }
}

// Distinct classification levels present in the document.
export async function extractLevels(buf: Buffer): Promise<number[]> {
  const d = await documentXml(buf);
  if (!d) return [];
  const levels = new Set<number>();
  let p: RegExpExecArray | null;
  PARA.lastIndex = 0;
  while ((p = PARA.exec(d.xml))) {
    const lvl = paraLevel(p[2]);
    if (lvl > 0) levels.add(lvl);
  }
  return [...levels];
}

// Returns a copy of the docx with every paragraph above `clearance` blocked out,
// and classification markers stripped from the rest. Falls back to the original
// buffer if anything goes wrong (fail-closed is handled by the caller's read-only mode).
export async function redactDocx(buf: Buffer, clearance: number): Promise<Buffer> {
  const d = await documentXml(buf);
  if (!d) return buf;
  const newXml = d.xml.replace(PARA, (full, attrs, inner) => {
    const lvl = paraLevel(inner);
    if (lvl > clearance) {
      const pPr = (inner.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [""])[0];
      return `<w:p${attrs}>${pPr}<w:r><w:rPr><w:b/><w:color w:val="7A1010"/></w:rPr>` +
        `<w:t xml:space="preserve">█████ REDACTED — CLEARANCE LVL ${lvl} REQUIRED █████</w:t></w:r></w:p>`;
    }
    // authorized paragraph: remove the marker text so it isn't shown
    return `<w:p${attrs}>${inner.replace(STRIP, "")}</w:p>`;
  });
  d.zip.file("word/document.xml", newXml);
  return d.zip.generateAsync({ type: "nodebuffer" });
}
