// Inline signature markers: the fiddly part is that the editor splits text across runs
// at arbitrary points, so a marker can straddle two of them. Run with:
//   node --experimental-strip-types test-sigmarkers.mts
import assert from "assert";
import JSZip from "jszip";
import { extractSignMarkers, fillSignMarkers, type SignatureFill } from "./lib/sigmarkers.ts";

// Build a .docx whose paragraph is split into the runs given — mimicking what the editor does.
async function docWithRuns(runs: string[]): Promise<Buffer> {
  const rs = runs.map((t) => `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${t}</w:t></w:r>`).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>${rs}</w:p>
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`;
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.folder("word")!.file("document.xml", xml);
  return zip.generateAsync({ type: "nodebuffer" });
}

async function textOf(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  return [...xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join("");
}

const fill = (codename: string, matricule: string, role?: string): SignatureFill => ({
  codename, matricule, role, at: new Date("2026-07-18T16:16:00Z"),
});

// 1. The real-world line: marker inline, surrounded by text that must survive.
{
  const doc = await docWithRuns(["Agent signature:  [[SIGN:RDD-90124Q1]]  Date:  ____________"]);
  const markers = await extractSignMarkers(doc);
  assert.deepStrictEqual(markers.map((m) => m.token), ["RDD-90124Q1"], "marker not detected");

  const { buffer, replaced } = await fillSignMarkers(
    doc, new Map([["RDD-90124Q1", fill("quentinthierry", "RDD-90124Q1", "Officer")]]), [], new Date()
  );
  const out = await textOf(buffer);
  assert.strictEqual(replaced, 1, "should have replaced one marker");
  assert.ok(!out.includes("[[SIGN"), "the marker must be gone");
  assert.ok(out.includes("quentinthierry"), "the codename must appear");
  assert.ok(out.includes("Agent signature:"), "text before the marker must survive");
  assert.ok(out.includes("Date:  ____________"), "text after the marker must survive");
  console.log("  ok  inline marker, surrounding text preserved");
}

// 2. The editor split the marker across runs — the case that breaks naive replacement.
{
  const doc = await docWithRuns(["Agent signature: [[SI", "GN:RDD-90", "124Q1]] Date: ___"]);
  const markers = await extractSignMarkers(doc);
  assert.deepStrictEqual(markers.map((m) => m.token), ["RDD-90124Q1"], "split marker not detected");

  const { buffer } = await fillSignMarkers(
    doc, new Map([["RDD-90124Q1", fill("quentinthierry", "RDD-90124Q1")]]), [], new Date()
  );
  const out = await textOf(buffer);
  assert.ok(!out.includes("[[SI") && !out.includes("124Q1]]"), "no marker fragment may remain");
  assert.ok(out.includes("quentinthierry"), "the codename must appear");
  assert.ok(out.includes("Agent signature:"), "leading text must survive");
  assert.ok(out.includes("Date: ___"), "trailing text must survive");
  console.log("  ok  marker split across runs");
}

// 3. An unmatched slot stays visible rather than vanishing silently.
{
  const doc = await docWithRuns(["Authorizing officer: [[SIGN:officer]] Date: ___"]);
  const { buffer, replaced } = await fillSignMarkers(doc, new Map(), [], new Date());
  const out = await textOf(buffer);
  assert.strictEqual(replaced, 0, "nothing should be counted as replaced");
  assert.ok(out.includes("awaiting signature"), "an unsigned slot must stay visible");
  assert.ok(!out.includes("[[SIGN"), "the raw marker must not be shown to readers");
  console.log("  ok  unmatched slot stays visible");
}

// 4. Two slots on one line, plus the sealing date.
{
  const doc = await docWithRuns(["A: [[SIGN:AG-1]] B: [[SIGN:AG-2]] Sealed [[DATE]]"]);
  const { buffer, replaced } = await fillSignMarkers(
    doc,
    new Map([["AG-1", fill("Alpha", "AG-1")], ["AG-2", fill("Bravo", "AG-2")]]),
    [], new Date("2026-07-18T00:00:00Z")
  );
  const out = await textOf(buffer);
  assert.strictEqual(replaced, 3, "two signatures and one date");
  assert.ok(out.includes("Alpha") && out.includes("Bravo"), "both signatures present");
  assert.ok(out.includes("2026-07-18"), "the sealing date must be stamped");
  assert.ok(out.includes("A: ") && out.includes("B: "), "labels must survive");
  console.log("  ok  several slots and the date on one line");
}

// 5. Unnamed slots are consumed in order.
{
  const doc = await docWithRuns(["First [[SIGN]] then [[SIGN]]"]);
  const { buffer } = await fillSignMarkers(
    doc, new Map(), [fill("Alpha", "AG-1"), fill("Bravo", "AG-2")], new Date()
  );
  const out = await textOf(buffer);
  const iA = out.indexOf("Alpha"), iB = out.indexOf("Bravo");
  assert.ok(iA >= 0 && iB > iA, "unnamed slots must be filled left to right");
  console.log("  ok  unnamed slots filled in order");
}

console.log("\nall signature-marker checks passed");
