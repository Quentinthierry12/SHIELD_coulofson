import { NextResponse } from "next/server";
import { getAccessibleDoc, audit } from "@/lib/db";
import { getSession, signFileToken } from "@/lib/session";
import { DS_URL, PORTAL_URL, signOOConfig } from "@/lib/onlyoffice";
import { extractLevels } from "@/lib/redact";

// PDF export via the Document Server's own conversion service — same engine as the
// editor, so the PDF matches what the agent sees on screen. No extra renderer to host.
// Redaction is inherited: the DS pulls the file through /api/files with the viewer's
// token, so an over-clearance paragraph is already blacked out before it reaches the PDF.

async function convert(body: Record<string, unknown>) {
  const payload = { ...body, token: await signOOConfig(body) };
  const res = await fetch(`${DS_URL()}/ConvertService.ashx`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const id = parseInt((await params).id, 10);
  const doc = await getAccessibleDoc(id, s.clearance, s.id, s.role);
  if (!doc) return NextResponse.json({ error: "Access denied." }, { status: 403 });

  // Mirrors the editor: officers read at full clearance, everyone else gets their own.
  const effectiveClr = s.role === "admin" ? 10 : s.clearance;
  const levels = doc.filetype === "docx" ? await extractLevels(doc.content) : [];
  const redacted = levels.some((l: number) => l > effectiveClr);

  const t = await signFileToken(doc.id, effectiveClr, redacted);
  const r = await convert({
    async: false,
    filetype: doc.filetype,
    outputtype: "pdf",
    // Distinct key per version *and* per clearance, or the DS would serve a cached PDF
    // built for a higher clearance to a lower one.
    key: `pdf-${doc.id}-v${doc.version}-c${redacted ? effectiveClr : "full"}`,
    title: `${doc.title}.${doc.filetype}`,
    url: `${PORTAL_URL()}/api/files/${doc.id}?t=${t}`,
  });

  if (!r?.fileUrl) {
    console.error("[pdf] convert failed:", JSON.stringify(r));
    return NextResponse.json({ error: "Conversion failed. Try again in a moment." }, { status: 502 });
  }

  const pdf = await fetch(r.fileUrl);
  if (!pdf.ok) return NextResponse.json({ error: "Conversion failed." }, { status: 502 });
  audit(s, redacted ? "doc_pdf_redacted" : "doc_pdf", `#${doc.id} ${doc.title}`);

  const name = doc.title.replace(/[^\w .-]/g, "_");
  return new NextResponse(pdf.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}.pdf"`,
    },
  });
}
