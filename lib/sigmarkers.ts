import JSZip from "jszip";

// Signature placeholders, placed by the author anywhere in the text:
//   [[SIGN:AG-4782]]  reserved for one badge
//   [[SIGN:officer]]  reserved for any officer
//   [[SIGN]]          filled by the signers in order
//   [[DATE]]          stamped when the document is sealed
//
// Unlike redaction, replacement is INLINE: a real document writes
//   "Agent signature: [[SIGN:AG-4782]]  Date: [[DATE]]"
// on a single line, so replacing whole paragraphs would destroy the layout.
// The editor also splits text across runs at arbitrary points, so markers are found on
// the paragraph's joined text and only the runs that actually overlap a marker are
// rebuilt — everything else keeps its own formatting.

const SIGN = /\[\[SIGN(?::([A-Za-z0-9_-]+))?\]\]/g;
const DATE = /\[\[DATE\]\]/g;
const PARA = /<w:p\b([^>]*)>([\s\S]*?)<\/w:p>/g;
const RUN = /<w:r\b[^>]*>[\s\S]*?<\/w:r>/g;
const WT = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type MarkerToken = { token: string | null; raw: string };
export type SignatureFill = { codename: string; matricule: string; at: Date; role?: string };

function runText(run: string): string {
  let t = "";
  let m: RegExpExecArray | null;
  WT.lastIndex = 0;
  while ((m = WT.exec(run))) t += m[1];
  return t;
}

function runProps(run: string): string {
  return (run.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [""])[0];
}

const textRun = (text: string, rPr: string) =>
  `<w:r>${rPr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;

// The signature itself: the codename in a handwriting face, then the stamp.
function signatureRuns(fill: SignatureFill): string {
  const stamp = ` ${fill.matricule}${fill.role ? " · " + fill.role : ""} — ${fill.at.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  return (
    `<w:r><w:rPr><w:rFonts w:ascii="Segoe Script" w:hAnsi="Segoe Script" w:cs="Segoe Script"/>` +
    `<w:sz w:val="30"/><w:szCs w:val="30"/><w:color w:val="1C3A5E"/></w:rPr>` +
    `<w:t xml:space="preserve">${esc(fill.codename)}</w:t></w:r>` +
    `<w:r><w:rPr><w:sz w:val="14"/><w:szCs w:val="14"/><w:color w:val="5F7590"/></w:rPr>` +
    `<w:t xml:space="preserve">${esc(stamp)}</w:t></w:r>`
  );
}

async function documentXml(buf: Buffer) {
  try {
    const zip = await JSZip.loadAsync(buf);
    const f = zip.file("word/document.xml");
    if (!f) return null;
    return { zip, xml: await f.async("string") };
  } catch {
    return null;
  }
}

// Which signature slots does this document declare, in order of appearance?
export async function extractSignMarkers(buf: Buffer): Promise<MarkerToken[]> {
  const d = await documentXml(buf);
  if (!d) return [];
  const out: MarkerToken[] = [];
  let p: RegExpExecArray | null;
  PARA.lastIndex = 0;
  while ((p = PARA.exec(d.xml))) {
    const runs = p[2].match(RUN) || [];
    const joined = runs.map(runText).join("");
    let m: RegExpExecArray | null;
    SIGN.lastIndex = 0;
    while ((m = SIGN.exec(joined))) out.push({ token: m[1] ? m[1].toUpperCase() : null, raw: m[0] });
  }
  return out;
}

// Replace every marker in place. `fills` is keyed by the marker token (a badge or a role,
// uppercased); unnamed [[SIGN]] slots consume `ordered` left to right. Markers with no
// match are left visible as "awaiting signature" rather than silently deleted — a missing
// signature should be obvious on the page.
// `sealedAt` is null while signatures are still being collected: the date slot is the
// date of sealing, so stamping it before everyone has signed would date the document to
// its first signature. Slots with no signature yet stay visible as "awaiting signature".
export async function fillSignMarkers(
  buf: Buffer,
  fills: Map<string, SignatureFill>,
  ordered: SignatureFill[],
  sealedAt: Date | null
): Promise<{ buffer: Buffer; replaced: number }> {
  const d = await documentXml(buf);
  if (!d) return { buffer: buf, replaced: 0 };
  let replaced = 0;
  const queue = [...ordered];

  const newXml = d.xml.replace(PARA, (full, attrs, inner) => {
    const runs = inner.match(RUN) || [];
    if (!runs.length) return full;
    const joined = runs.map(runText).join("");
    if (!SIGN.test(joined) && !DATE.test(joined)) {
      SIGN.lastIndex = 0; DATE.lastIndex = 0;
      return full;
    }
    SIGN.lastIndex = 0; DATE.lastIndex = 0;

    // Collect every marker with its span in the joined text.
    type Hit = { start: number; end: number; xml: string };
    const hits: Hit[] = [];
    let m: RegExpExecArray | null;
    SIGN.lastIndex = 0;
    while ((m = SIGN.exec(joined))) {
      const token = m[1] ? m[1].toUpperCase() : null;
      const fill = token ? fills.get(token) : queue.shift();
      hits.push({
        start: m.index,
        end: m.index + m[0].length,
        xml: fill
          ? signatureRuns(fill)
          : textRun("__________ (awaiting signature)", `<w:rPr><w:color w:val="8A97A8"/></w:rPr>`),
      });
      if (fill) replaced++;
    }
    DATE.lastIndex = 0;
    while ((m = DATE.exec(joined))) {
      // Before sealing, show a blank rule rather than the raw marker — a reader must never
      // see [[DATE]] on the page.
      hits.push({
        start: m.index,
        end: m.index + m[0].length,
        xml: sealedAt
          ? textRun(sealedAt.toISOString().slice(0, 10), "")
          : textRun("____________", `<w:rPr><w:color w:val="8A97A8"/></w:rPr>`),
      });
      if (sealedAt) replaced++;
    }
    hits.sort((a, b) => a.start - b.start);

    // Walk the runs, keeping the text outside markers and dropping the marker text.
    const pPr = (inner.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [""])[0];
    const out: string[] = [pPr];
    let cursor = 0;
    for (const run of runs) {
      const text = runText(run);
      const rStart = cursor;
      const rEnd = cursor + text.length;
      cursor = rEnd;
      if (!text.length) { out.push(run); continue; }

      const rPr = runProps(run);
      let pos = rStart;
      let kept = "";
      for (const h of hits) {
        if (h.end <= rStart || h.start >= rEnd) continue; // no overlap with this run
        const cutAt = Math.max(h.start, rStart);
        kept += text.slice(pos - rStart, cutAt - rStart);
        if (kept) { out.push(textRun(kept, rPr)); kept = ""; }
        // The signature is emitted once, by the run where the marker starts.
        if (h.start >= rStart && h.start < rEnd) out.push(h.xml);
        pos = Math.min(h.end, rEnd);
      }
      kept += text.slice(pos - rStart);
      if (kept) out.push(textRun(kept, rPr));
    }
    return `<w:p${attrs}>${out.join("")}</w:p>`;
  });

  d.zip.file("word/document.xml", newXml);
  return { buffer: await d.zip.generateAsync({ type: "nodebuffer" }), replaced };
}
