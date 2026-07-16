import { redirect } from "next/navigation";
import { getAccessibleDoc, userCanEditDoc, audit } from "@/lib/db";
import { getSession, signFileToken } from "@/lib/session";
import { DOC_TYPES, DS_URL, PORTAL_URL, signOOConfig } from "@/lib/onlyoffice";
import { extractLevels } from "@/lib/redact";
import Editor from "./editor";

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.mustChangePassword) redirect("/change-password");
  const id = parseInt((await params).id, 10);
  const doc = await getAccessibleDoc(id, session.clearance, session.id, session.role);
  if (!doc) redirect("/dashboard");

  // Redaction (Brique B): officers see everything (effective clearance 10).
  const effectiveClr = session.role === "admin" ? 10 : session.clearance;
  const levels = doc.filetype === "docx" ? await extractLevels(doc.content) : [];
  const redacted = levels.some((l) => l > effectiveClr);

  // Editing is gated on ownership / invitation (or officer) — NOT on clearance.
  // A redacted copy is always view-only regardless of edit rights.
  const canEdit = await userCanEditDoc(doc.id, doc.owner_id, session.id, session.role);
  const editable = canEdit && !redacted;
  audit(session, redacted ? "doc_open_redacted" : "doc_open", `#${doc.id} ${doc.title}`);

  // Redacted viewers get a read-only, server-filtered copy with a distinct key so
  // they never co-edit or save the placeholder back over the real content.
  const t = await signFileToken(doc.id, effectiveClr, redacted, editable);
  const config: any = {
    document: {
      fileType: doc.filetype,
      key: redacted ? `shield-${doc.id}-v${doc.version}-r${effectiveClr}` : `shield-${doc.id}-v${doc.version}`,
      title: `${doc.title}.${doc.filetype}`,
      url: `${PORTAL_URL()}/api/files/${doc.id}?t=${t}`,
      permissions: { edit: editable, download: !redacted, print: !redacted },
    },
    documentType: DOC_TYPES[doc.filetype].documentType,
    editorConfig: {
      mode: editable ? "edit" : "view",
      callbackUrl: editable ? `${PORTAL_URL()}/api/onlyoffice/callback?id=${doc.id}&t=${t}` : undefined,
      lang: "en",
      user: { id: String(session.id), name: `${session.matricule} · ${session.codename}` },
      customization: {
        uiTheme: "theme-dark",
        compactHeader: true,
        hideRightMenu: true,
      },
    },
  };
  config.token = await signOOConfig(config);

  return <Editor dsUrl={DS_URL()} config={config} title={doc.title} redacted={redacted} />;
}
