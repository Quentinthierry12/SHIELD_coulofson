import { redirect } from "next/navigation";
import { getAccessibleDoc, audit, db, accessibleFolderIds } from "@/lib/db";
import RequestAccess from "./request-access";
import { getSession, signFileToken } from "@/lib/session";
import { needsOnboarding } from "@/lib/onboarding";
import { DOC_TYPES, DS_URL, PORTAL_URL, signOOConfig, SHIELD_CUSTOMIZATION } from "@/lib/onlyoffice";
import { extractLevels } from "@/lib/redact";
import Editor from "./editor";

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.mustChangePassword) redirect("/change-password");
  if (await needsOnboarding(session)) redirect("/onboarding");
  const id = parseInt((await params).id, 10);
  const doc = await getAccessibleDoc(id, session.clearance, session.id, session.role);
  if (!doc) {
    // Visible but not openable → offer to request access instead of a dead end.
    const pool = await db();
    const { rows } = await pool.query("SELECT id, title, classification, folder_id FROM documents WHERE id = $1", [id]);
    if (!rows[0]) redirect("/dashboard");
    const blocked = rows[0];
    const folderIds = await accessibleFolderIds(session.id, session.role);
    const folderOk = !blocked.folder_id || folderIds.includes(blocked.folder_id);
    const { rows: ar } = await pool.query(
      "SELECT status FROM access_requests WHERE doc_id = $1 AND user_id = $2",
      [id, session.id]
    );
    audit(session, "doc_blocked", `#${id} ${blocked.title}`);
    return (
      <RequestAccess
        id={blocked.id}
        title={blocked.title}
        classification={blocked.classification}
        reason={folderOk ? "clearance" : "folder"}
        alreadyRequested={ar[0]?.status === "pending"}
      />
    );
  }

  // Redaction (Brique B): officers see everything (effective clearance 10).
  const effectiveClr = session.role === "admin" ? 10 : session.clearance;
  const levels = doc.filetype === "docx" ? await extractLevels(doc.content) : [];
  const redacted = levels.some((l) => l > effectiveClr);
  // A sealed document is read-only for everyone: its signatures are bound to these bytes.
  const readOnly = redacted || doc.locked;
  audit(session, redacted ? "doc_open_redacted" : "doc_open", `#${doc.id} ${doc.title}`);

  // Redacted viewers get a read-only, server-filtered copy with a distinct key so
  // they never co-edit or save the placeholder back over the real content.
  const t = await signFileToken(doc.id, effectiveClr, redacted);
  const config: any = {
    document: {
      fileType: doc.filetype,
      key: redacted ? `shield-${doc.id}-v${doc.version}-r${effectiveClr}` : `shield-${doc.id}-v${doc.version}${doc.locked ? "-sealed" : ""}`,
      title: `${doc.title}.${doc.filetype}`,
      url: `${PORTAL_URL()}/api/files/${doc.id}?t=${t}`,
      permissions: { edit: !readOnly, download: !redacted, print: !redacted },
    },
    documentType: DOC_TYPES[doc.filetype].documentType,
    editorConfig: {
      mode: readOnly ? "view" : "edit",
      callbackUrl: readOnly ? undefined : `${PORTAL_URL()}/api/onlyoffice/callback?id=${doc.id}&t=${t}`,
      lang: "fr",
      user: { id: String(session.id), name: `${session.matricule} · ${session.codename}` },
      customization: SHIELD_CUSTOMIZATION,
      // Plugins are loaded from the PORTAL, not baked into the Document Server image.
      // Baking them in is what took the editor down twice: rolling back meant rebuilding
      // the image. From here, removing this line and redeploying takes three minutes.
      plugins: {
        pluginsData: [`${PORTAL_URL()}/plugins/shield-classify/config.json`],
      },
    },
  };
  config.token = await signOOConfig(config);

  return <Editor dsUrl={DS_URL()} config={config} title={doc.title} redacted={redacted} />;
}
