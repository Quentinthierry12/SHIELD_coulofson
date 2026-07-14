import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { DOC_TYPES, DS_URL, PORTAL_URL, signOOConfig, SHIELD_CUSTOMIZATION } from "@/lib/onlyoffice";
import Editor from "@/app/doc/[id]/editor";

// Public read-only view — no account required. Reachable only with the token.
export default async function PublicDocPage({ params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const pool = await db();
  const { rows } = await pool.query(
    "SELECT id, title, filetype, version FROM documents WHERE public_token = $1",
    [token]
  );
  const doc = rows[0];
  if (!doc) notFound();

  const config: any = {
    document: {
      fileType: doc.filetype,
      key: `public-${token}-v${doc.version}`,
      title: `${doc.title}.${doc.filetype}`,
      url: `${PORTAL_URL()}/api/public-files/${token}`,
      permissions: { edit: false, download: false, print: true },
    },
    documentType: DOC_TYPES[doc.filetype].documentType,
    editorConfig: {
      mode: "view",
      lang: "en",
      user: { id: "public", name: "Public viewer" },
      customization: SHIELD_CUSTOMIZATION,
    },
  };
  config.token = await signOOConfig(config);

  return <Editor dsUrl={DS_URL()} config={config} title={`${doc.title} — PUBLIC`} redacted hideNav />;
}
