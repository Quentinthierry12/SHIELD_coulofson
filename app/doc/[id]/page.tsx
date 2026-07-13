import { redirect } from "next/navigation";
import { getAccessibleDoc } from "@/lib/db";
import { getSession, signFileToken } from "@/lib/session";
import { DOC_TYPES, DS_URL, PORTAL_URL, signOOConfig } from "@/lib/onlyoffice";
import Editor from "./editor";

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/");
  const id = parseInt((await params).id, 10);
  const doc = await getAccessibleDoc(id, session.clearance, session.id, session.role);
  if (!doc) redirect("/dashboard");

  const t = await signFileToken(doc.id);
  const config: any = {
    document: {
      fileType: doc.filetype,
      key: `shield-${doc.id}-v${doc.version}`,
      title: `${doc.title}.${doc.filetype}`,
      url: `${PORTAL_URL()}/api/files/${doc.id}?t=${t}`,
      permissions: { edit: true, download: true, print: true },
    },
    documentType: DOC_TYPES[doc.filetype].documentType,
    editorConfig: {
      callbackUrl: `${PORTAL_URL()}/api/onlyoffice/callback?id=${doc.id}&t=${t}`,
      lang: "fr",
      user: { id: String(session.id), name: `${session.matricule} · ${session.codename}` },
      customization: {
        uiTheme: "theme-dark",
        compactHeader: true,
        hideRightMenu: true,
        logo: { image: `${PORTAL_URL()}/logo.png`, url: `${PORTAL_URL()}/dashboard` },
      },
    },
  };
  config.token = await signOOConfig(config);

  return <Editor dsUrl={DS_URL()} config={config} title={doc.title} />;
}
