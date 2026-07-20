"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@/lib/session";
import { toast, confirmDialog, promptDialog } from "@/lib/ui-store";
import NotifToggle from "../notif-toggle";

type Doc = { id: number; title: string; filetype: string; classification: number; folder_id: number | null; updated_at: string; owner: string; mine: boolean; sealed?: boolean; locked?: boolean; lock_reason?: string | null; request_status?: string | null };
type Folder = { id: number; name: string; parent_id: number | null; created_by: number | null; restricted: boolean; member: boolean; mine: boolean };
type Agent = { matricule: string; codename: string; clearance: number };

const TYPES: Record<string, { label: string; tag: string; cls: string }> = {
  docx: { label: "Rapport", tag: "DOC", cls: "t-docx" },
  xlsx: { label: "Registre", tag: "XLS", cls: "t-xlsx" },
  pptx: { label: "Briefing", tag: "PPT", cls: "t-pptx" },
};

function classifBadge(level: number) {
  const cls = level >= 7 ? "high" : level >= 4 ? "mid" : "low";
  const label = level >= 7 ? "TOP SECRET" : level >= 4 ? "CLASSIFIÉ" : "RESTREINT";
  return <span className={`classif ${cls}`}>LVL.{level} — {label}</span>;
}

export default function Dashboard({ session, academyUrl }: { session: Session; academyUrl?: string }) {
  const router = useRouter();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [cwd, setCwd] = useState<number | null>(null); // current folder, null = root
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [createType, setCreateType] = useState<string | null>(null);
  const [shareDoc, setShareDoc] = useState<Doc | null>(null);
  const [publicDoc, setPublicDoc] = useState<Doc | null>(null);
  const [signDoc, setSignDoc] = useState<Doc | null>(null);
  const [manageFolder, setManageFolder] = useState<Folder | null>(null);
  const [dragOver, setDragOver] = useState<number | "root" | null>(null);
  const [loading, setLoading] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch("/api/documents");
    if (res.status === 401) return router.push("/");
    setDocs(await res.json());
    const f = await fetch("/api/folders");
    if (f.ok) setFolders(await f.json());
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    form.append("classification", "1");
    if (cwd) form.append("folder_id", String(cwd));
    const res = await fetch("/api/documents/upload", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) return toast(data.error, "error");
    router.push(`/doc/${data.id}`);
  }

  async function createFolder() {
    const name = await promptDialog({ title: "Nouveau dossier", placeholder: "Nom du dossier" });
    if (!name?.trim()) return;
    const res = await fetch("/api/folders", { method: "POST", body: JSON.stringify({ name, parent_id: cwd }) });
    if (!res.ok) return toast((await res.json()).error, "error");
    toast("Dossier créé.", "success");
    load();
  }

  async function moveDoc(docId: number, folderId: number | null) {
    const res = await fetch(`/api/documents/${docId}`, { method: "PATCH", body: JSON.stringify({ folder_id: folderId }) });
    if (!res.ok) return toast((await res.json()).error, "error");
    toast("Document déplacé.", "success");
    load();
  }

  function onDropTo(folderId: number | null) {
    return (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(null);
      const docId = parseInt(e.dataTransfer.getData("text/doc-id"), 10);
      if (docId) moveDoc(docId, folderId);
    };
  }

  async function deleteFolder(f: Folder) {
    const ok = await confirmDialog({ title: `Supprimer le dossier « ${f.name} » ?`, message: "Le dossier doit être vide. Action irréversible.", confirmLabel: "Supprimer", danger: true });
    if (!ok) return;
    const res = await fetch(`/api/folders/${f.id}`, { method: "DELETE" });
    if (!res.ok) return toast((await res.json()).error, "error");
    if (cwd === f.id) setCwd(f.parent_id ?? null);
    toast("Dossier supprimé.", "success");
    load();
  }

  async function destroy(doc: Doc) {
    const ok = await confirmDialog({ title: `Détruire « ${doc.title} » ?`, message: "Protocole de destruction 4-Delta — c'est définitif.", confirmLabel: "Détruire", danger: true });
    if (!ok) return;
    const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
    if (!res.ok) return toast((await res.json()).error, "error");
    toast("Document détruit.", "success");
    load();
  }

  async function renameDoc(doc: Doc) {
    const name = await promptDialog({ title: "Renommer le document", message: `Nom actuel : « ${doc.title} ».`, placeholder: "Nouveau nom", defaultValue: doc.title });
    if (!name || name.trim() === doc.title) return;
    const res = await fetch(`/api/documents/${doc.id}`, { method: "PATCH", body: JSON.stringify({ title: name }) });
    if (!res.ok) return toast((await res.json()).error, "error");
    toast("Document renommé.", "success");
    load();
  }

  async function renameFolder(f: Folder) {
    const name = await promptDialog({ title: "Renommer le dossier", message: `Nom actuel : « ${f.name} ».`, placeholder: "Nouveau nom", defaultValue: f.name });
    if (!name || name.trim() === f.name) return;
    const res = await fetch(`/api/folders/${f.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
    if (!res.ok) return toast((await res.json()).error, "error");
    toast("Dossier renommé.", "success");
    load();
  }

  async function unseal(doc: Doc) {
    const ok = await confirmDialog({
      title: `Desceller « ${doc.title} » ?`,
      message: "Toutes les signatures de ce document sont annulées et les signataires sont prévenus. Le document redevient modifiable.",
      confirmLabel: "Desceller et annuler les signatures", danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/documents/${doc.id}`, { method: "PATCH", body: JSON.stringify({ unlock: true }) });
    const d = await res.json();
    if (!res.ok) return toast(d.error, "error");
    toast(`Descellé — ${d.voided} demande(s) de signature annulée(s).`, "success");
    load();
  }

  async function reclassify(doc: Doc, level: number) {
    const res = await fetch(`/api/documents/${doc.id}`, {
      method: "PATCH",
      body: JSON.stringify({ classification: level }),
    });
    if (!res.ok) { toast((await res.json()).error, "error"); return load(); }
    toast(`« ${doc.title} » est désormais niveau ${level}.`, "success");
    load();
  }

  // Conversion runs on the Document Server and takes a moment on big files, so tell the
  // agent it started rather than leaving the button dead.
  async function exportPdf(doc: Doc) {
    toast(`Génération du PDF — « ${doc.title} »…`);
    const res = await fetch(`/api/documents/${doc.id}/pdf`);
    if (!res.ok) return toast((await res.json()).error || "Échec de la conversion.", "error");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.title}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    toast("PDF prêt.", "success");
  }

  async function changePassword() {
    const current = await promptDialog({ title: "Changer le mot de passe", message: "Saisissez votre mot de passe actuel.", placeholder: "Mot de passe actuel", password: true });
    if (!current) return;
    const next = await promptDialog({ title: "Changer le mot de passe", message: "Saisissez un nouveau mot de passe (min. 6 caractères).", placeholder: "Nouveau mot de passe", password: true });
    if (!next) return;
    const res = await fetch("/api/auth/password", { method: "POST", body: JSON.stringify({ current, next }) });
    const data = await res.json();
    toast(res.ok ? "Mot de passe mis à jour." : data.error, res.ok ? "success" : "error");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  // Filtered / flat mode when searching, filtering by type, or "mine": ignore folder tree.
  const q = search.trim().toLowerCase();
  const flatMode = !!q || typeFilter !== "all" || mineOnly;

  const foldersById = new Map(folders.map((f) => [f.id, f]));
  function breadcrumb(id: number | null): Folder[] {
    const path: Folder[] = [];
    let cur = id ? foldersById.get(id) : undefined;
    while (cur) { path.unshift(cur); cur = cur.parent_id ? foldersById.get(cur.parent_id) : undefined; }
    return path;
  }

  const childFolders = folders.filter((f) => (f.parent_id ?? null) === cwd);
  const flatDocs = docs.filter((d) =>
    (typeFilter === "all" || d.filetype === typeFilter) &&
    (!mineOnly || d.mine) &&
    (!q || d.title.toLowerCase().includes(q) || (d.owner || "").toLowerCase().includes(q))
  );
  const docsHere = docs.filter((d) => (d.folder_id ?? null) === cwd);
  const shownDocs = flatMode ? flatDocs : docsHere;

  const railApps = [
    { key: "all", label: "Accueil" },
    { key: "docx", label: "Rapports" },
    { key: "xlsx", label: "Registres" },
    { key: "pptx", label: "Briefings" },
  ];

  return (
    <div className="layout">
      <nav className="rail">
        <img src="/logo.png" alt="" className="logo-img rail-logo" onError={(e) => (e.currentTarget.style.display = "none")} />
        {railApps.map((a) => (
          <button
            key={a.key}
            className={`rail-btn ${typeFilter === a.key && !mineOnly ? "active" : ""}`}
            onClick={() => { setTypeFilter(a.key); setMineOnly(false); if (a.key === "all") setCwd(cwd); }}
          >
            <span className="rail-label">{a.label}</span>
          </button>
        ))}
        <button className={`rail-btn ${mineOnly ? "active" : ""}`} onClick={() => setMineOnly(!mineOnly)}>
          <span className="rail-label">Miens</span>
        </button>
        <a href="/inbox"><button className="rail-btn"><span className="rail-label">Transmissions</span></button></a>
        <a href="/missions"><button className="rail-btn"><span className="rail-label">Missions</span></button></a>
        <a href="/roster"><button className="rail-btn"><span className="rail-label">Effectifs</span></button></a>
        {academyUrl && (
          // Separate system on its own domain — open it in a new tab rather than losing the Drive.
          <a href={academyUrl} target="_blank" rel="noopener noreferrer" title="S.H.I.E.L.D. Academy — training">
            <button className="rail-btn"><span className="rail-label">Académie</span></button>
          </a>
        )}
        {session.role === "admin" && (
          <a href="/admin"><button className="rail-btn"><span className="rail-label">Commandement</span></button></a>
        )}
      </nav>

      <div className="main">
        <div className="topbar">
          <input className="searchbar" placeholder="Rechercher dans les archives…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span className="badge">{session.matricule} · {session.codename} · LVL.{session.clearance}</span>
            <NotifToggle />
            <a href="/api/auth/discord"><button className="ghost small" title="Lier Discord">Lier Discord</button></a>
            <button className="ghost small" onClick={changePassword}>Mot de passe</button>
            <button className="ghost small" onClick={logout}>Déconnexion</button>
          </div>
        </div>

        <div className="content">
          <div className="tiles">
            {Object.entries(TYPES).map(([ext, t]) => (
              <button key={ext} className={`tile ${t.cls}`} onClick={() => setCreateType(ext)}>
                <span className={`tag ${t.cls}`}>{t.tag}</span><span>Nouveau {t.label}</span>
              </button>
            ))}
            <button className="tile t-import" onClick={() => fileInput.current?.click()}>
              <span className="tag t-import">FICH</span><span>Importer un fichier</span>
            </button>
            <button className="tile t-folder" onClick={createFolder}>
              <span className="tag t-folder">DIR</span><span>Nouveau dossier</span>
            </button>
            <input ref={fileInput} type="file" accept=".docx,.xlsx,.pptx" style={{ display: "none" }} onChange={upload} />
          </div>

          {flatMode ? (
            <h2 style={{ marginTop: 26 }}>
              {mineOnly ? "Mes documents" : q ? "Résultats de recherche" : `${TYPES[typeFilter].label}s`}
              <span className="muted" style={{ marginLeft: 8, textTransform: "none" }}>({shownDocs.length})</span>
            </h2>
          ) : (
            <div className="crumbs" style={{ marginTop: 26 }}>
              <button
                className={`crumb ${dragOver === "root" ? "drop-hot" : ""}`}
                onClick={() => setCwd(null)}
                onDragOver={(e) => { e.preventDefault(); setDragOver("root"); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={onDropTo(null)}
              >Drive</button>
              {breadcrumb(cwd).map((f) => (
                <span key={f.id}>
                  <span className="crumb-sep">/</span>
                  <button
                    className={`crumb ${dragOver === f.id ? "drop-hot" : ""}`}
                    onClick={() => setCwd(f.id)}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(f.id); }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={onDropTo(f.id)}
                  >{f.restricted ? "🔒 " : ""}{f.name}</button>
                </span>
              ))}
            </div>
          )}

          {/* Folders (only in Drive mode) */}
          {!flatMode && childFolders.length > 0 && (
            <div className="cards" style={{ marginBottom: 18 }}>
              {childFolders.map((f) => (
                <div
                  key={f.id}
                  className={`card card-folder ${dragOver === f.id ? "drop-hot" : ""}`}
                  onClick={() => setCwd(f.id)}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(f.id); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={onDropTo(f.id)}
                >
                  <div className="card-top">
                    <span className="tag t-folder">DIR</span>
                    {(f.mine || session.role === "admin") && (
                      <span className="card-actions" onClick={(e) => e.stopPropagation()}>
                        <button className="ghost small" title="Renommer le dossier" onClick={() => renameFolder(f)}>Renommer</button>
                        <button className="ghost small" title="Membres / invitations" onClick={() => setManageFolder(f)}>Inviter</button>
                        <button className="ghost small" title="Supprimer le dossier" onClick={() => deleteFolder(f)}>✕</button>
                      </span>
                    )}
                  </div>
                  <div className="card-title">{f.restricted ? "🔒 " : ""}{f.name}</div>
                  <div className="card-meta muted">{f.restricted ? "Restreint" : "Ouvert"}</div>
                </div>
              ))}
            </div>
          )}

          {/* Documents */}
          <div className="cards">
            {loading && Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton skeleton-card" />)}
            {!loading && shownDocs.map((d) => (
              <div
                key={d.id}
                className={`card ${TYPES[d.filetype].cls} ${d.locked ? "card-locked" : ""}`}
                onClick={() => router.push(`/doc/${d.id}`)}
                draggable={!d.locked && (d.mine || session.role === "admin")}
                onDragStart={(e) => { e.dataTransfer.setData("text/doc-id", String(d.id)); e.dataTransfer.effectAllowed = "move"; }}
                title={d.locked ? "Restreint — cliquez pour demander l'accès" : (d.mine || session.role === "admin") ? "Glissez sur un dossier pour déplacer" : undefined}
              >
                <div className="card-top">
                  <span className={`tag ${TYPES[d.filetype].cls}`}>{TYPES[d.filetype].tag}</span>
                  {!d.locked && (
                    <span className="card-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="ghost small" title="Exporter en PDF" onClick={() => exportPdf(d)}>PDF</button>
                      {(d.mine || session.role === "admin") && (
                        <>
                          {!d.sealed && <button className="ghost small" title="Demander des signatures" onClick={() => setSignDoc(d)}>Signer</button>}
                          {d.sealed && session.role === "admin" && (
                            <button className="ghost small danger" title="Desceller — annule toutes les signatures" onClick={() => unseal(d)}>Desceller</button>
                          )}
                          {!d.sealed && <button className="ghost small" title="Renommer" onClick={() => renameDoc(d)}>Renommer</button>}
                          <button className="ghost small" title="Partager" onClick={() => setShareDoc(d)}>Partager</button>
                          <button className="ghost small" title="Lien public" onClick={() => setPublicDoc(d)}>Lien</button>
                          <button className="ghost small" title="Destroy" onClick={() => destroy(d)}>✕</button>
                        </>
                      )}
                    </span>
                  )}
                  {d.locked && <span className="tag t-locked">VERROUILLÉ</span>}
                  {!d.locked && d.sealed && <span className="tag t-sealed" title="Signé et scellé — lecture seule">SCELLÉ</span>}
                </div>
                <div className="card-title">{d.title}</div>
                <div className="card-meta" onClick={(e) => e.stopPropagation()}>
                  {!d.locked && (d.mine || session.role === "admin") ? (
                    // Personnel files land at level 10 by default; reclassify them in place.
                    // Capped at your own clearance — you cannot hide a file from yourself.
                    <select
                      className={`classif-select ${d.classification >= 7 ? "high" : d.classification >= 4 ? "mid" : "low"}`}
                      value={d.classification}
                      onChange={(e) => reclassify(d, +e.target.value)}
                      title="Niveau de classification"
                    >
                      {/* All ten levels are listed so a file already above your clearance
                          (personnel files start at 10) still shows its real level; the ones
                          you may not assign are disabled, and the API refuses them anyway. */}
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n} disabled={n > session.clearance}>
                          LVL.{n} — {n >= 7 ? "TOP SECRET" : n >= 4 ? "CLASSIFIÉ" : "RESTREINT"}
                        </option>
                      ))}
                    </select>
                  ) : classifBadge(d.classification)}
                </div>
                {d.locked ? (
                  <div className="card-meta muted">
                    {d.request_status === "pending"
                      ? "Accès demandé — en attente d'approbation"
                      : d.lock_reason === "folder"
                        ? "Dossier restreint — demander l'accès"
                        : "Au-dessus de votre habilitation — demander l'accès"}
                  </div>
                ) : (
                  <div className="card-meta muted">
                    {d.owner} · {new Date(d.updated_at).toLocaleDateString("fr-FR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                )}
              </div>
            ))}
            {!loading && shownDocs.length === 0 && (!flatMode ? childFolders.length === 0 : true) && (
              <div className="empty">
                <div className="empty-mark">[ ▚ ]</div>
                <div className="empty-title">{q ? "Aucun résultat" : mineOnly ? "Aucun document pour l'instant" : "Protocole vide"}</div>
                <div>{q ? "Aucune archive ne correspond à votre recherche à ce niveau d'habilitation." : "Aucun document ici à votre niveau d'habilitation. Créez-en un ci-dessus."}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {createType && (
        <CreateModal filetype={createType} folders={folders} maxLevel={session.clearance} defaultFolder={cwd ? String(cwd) : ""} onClose={() => setCreateType(null)} />
      )}
      {signDoc && <SignRequestModal doc={signDoc} onClose={() => setSignDoc(null)} onDone={load} />}
      {shareDoc && (
        <AccessModal title={`Partager « ${shareDoc.title} »`} url={`/api/documents/${shareDoc.id}/share`} verb="Partagé avec" onClose={() => setShareDoc(null)} />
      )}
      {manageFolder && (
        <AccessModal
          title={`Invitations au dossier — « ${manageFolder.name} »`}
          url={`/api/folders/${manageFolder.id}/members`}
          verb="Invité"
          note="Un dossier sans membre est ouvert à tous les agents. Dès qu'il a des membres, seuls eux (et les officiers) le voient, ainsi que tout son contenu."
          onClose={() => { setManageFolder(null); load(); }}
        />
      )}
      {publicDoc && <PublicLinkModal doc={publicDoc} onClose={() => setPublicDoc(null)} />}
    </div>
  );
}

function PublicLinkModal({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = token ? `${location.origin}/public/${token}` : "";

  useEffect(() => {
    fetch(`/api/documents/${doc.id}/public`).then((r) => r.json()).then((d) => { setToken(d.token); setLoaded(true); });
  }, []);

  async function enable() {
    const r = await fetch(`/api/documents/${doc.id}/public`, { method: "POST" });
    const d = await r.json();
    if (r.ok) setToken(d.token);
  }
  async function revoke() {
    await fetch(`/api/documents/${doc.id}/public`, { method: "DELETE" });
    setToken(null);
  }
  function copy() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal panel" onClick={(e) => e.stopPropagation()}>
        <h2>Lien public — « {doc.title} »</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          Toute personne disposant du lien peut consulter ce document en lecture seule, sans compte.
          Classified sections marked <span className="mono">{"[[CLR:n]]"}</span> restent masquées.
        </p>
        {!loaded ? <p className="muted">…</p> : token ? (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input readOnly value={url} style={{ marginBottom: 0, flex: 1 }} onFocus={(e) => e.target.select()} />
              <button onClick={copy}>{copied ? "Copié" : "Copier"}</button>
            </div>
            <button className="ghost" style={{ width: "100%" }} onClick={revoke}>Désactiver le lien public</button>
          </>
        ) : (
          <button style={{ width: "100%" }} onClick={enable}>Créer un lien public</button>
        )}
        <button className="ghost" style={{ marginTop: 10, width: "100%" }} onClick={onClose}>Fermer</button>
      </div>
    </div>
  );
}

function CreateModal({ filetype, folders, maxLevel, defaultFolder, onClose }: {
  filetype: string; folders: Folder[]; maxLevel: number; defaultFolder: string; onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [classification, setClassification] = useState(1);
  const [folderId, setFolderId] = useState(defaultFolder);
  const [error, setError] = useState("");
  const t = TYPES[filetype];

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/documents", {
      method: "POST",
      body: JSON.stringify({ title, filetype, classification, folder_id: folderId ? +folderId : null }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    router.push(`/doc/${data.id}`);
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal panel" onClick={(e) => e.stopPropagation()}>
        <h2>Nouveau {t.label}</h2>
        {error && <p className="error">⚠ {error}</p>}
        <form onSubmit={create}>
          <input autoFocus placeholder="TITRE DU DOCUMENT" value={title} onChange={(e) => setTitle(e.target.value)} />
          <select value={classification} onChange={(e) => setClassification(+e.target.value)}>
            {Array.from({ length: maxLevel }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Niveau de classification {n}</option>)}
          </select>
          <select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            <option value="">— Racine du Drive —</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <button style={{ width: "100%" }}>Créer</button>
        </form>
        <button className="ghost" style={{ marginTop: 10, width: "100%" }} onClick={onClose}>Annuler</button>
      </div>
    </div>
  );
}

type Share = Agent & { role?: string };
const ROLE_OPTS: { v: string; label: string }[] = [
  { v: "viewer", label: "Lecteur" },
  { v: "editor", label: "Éditeur" },
  { v: "manager", label: "Gestionnaire" },
];

function AccessModal({ title, url, verb, note, onClose }: { title: string; url: string; verb: string; note?: string; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Agent[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [role, setRole] = useState("viewer"); // rôle appliqué au prochain ajout
  const [msg, setMsg] = useState("");

  async function loadShares() {
    const res = await fetch(url);
    if (res.ok) setShares(await res.json());
  }
  useEffect(() => { loadShares(); }, []);

  useEffect(() => {
    if (!q.trim()) return setResults([]);
    const t = setTimeout(async () => {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
      if (res.ok) setResults(await res.json());
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  async function add(a: Agent) {
    setMsg("");
    const res = await fetch(url, { method: "POST", body: JSON.stringify({ matricule: a.matricule, role }) });
    const data = await res.json();
    setMsg(res.ok ? `✓ ${verb} ${data.codename}` : `⚠ ${data.error}`);
    setQ(""); setResults([]); loadShares();
  }

  async function changeRole(a: Share, newRole: string) {
    await fetch(url, { method: "POST", body: JSON.stringify({ matricule: a.matricule, role: newRole }) });
    loadShares();
  }

  async function remove(a: Agent) {
    await fetch(url, { method: "DELETE", body: JSON.stringify({ matricule: a.matricule }) });
    loadShares();
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal panel" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {note && <p className="muted" style={{ marginBottom: 10 }}>{note}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <input autoFocus placeholder="Tapez un nom de code ou un matricule…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
          <select value={role} onChange={(e) => setRole(e.target.value)} style={{ marginBottom: 12, width: 130 }} title="Rôle accordé">
            {ROLE_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
        </div>
        {results.length > 0 && (
          <div className="results">
            {results.map((a) => (
              <div key={a.matricule} className="result-item" onClick={() => add(a)}>
                <span className="mono">{a.matricule}</span> · {a.codename} <span className="muted">lvl.{a.clearance}</span>
              </div>
            ))}
          </div>
        )}
        {msg && <p className={msg.startsWith("✓") ? "success" : "error"}>{msg}</p>}
        {shares.length > 0 && (
          <>
            <h2 style={{ marginTop: 14 }}>Accès actuels</h2>
            {shares.map((a) => (
              <div key={a.matricule} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "4px 0" }}>
                <span><span className="mono">{a.matricule}</span> · {a.codename}</span>
                <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <select value={a.role || "viewer"} onChange={(e) => changeRole(a, e.target.value)} style={{ marginBottom: 0, width: 130 }}>
                    {ROLE_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                  </select>
                  <button className="ghost small" onClick={() => remove(a)}>Retirer</button>
                </span>
              </div>
            ))}
          </>
        )}
        <button className="ghost" style={{ marginTop: 16, width: "100%" }} onClick={onClose}>Fermer</button>
      </div>
    </div>
  );
}

// Ask for signatures on a document. Requesting seals the document straight away —
// a signature on content that can still change is worthless, so say it plainly here.
function SignRequestModal({ doc, onClose, onDone }: { doc: Doc; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Agent[]>([]);
  const [chosen, setChosen] = useState<Agent[]>([]);
  const [sequential, setSequential] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [slots, setSlots] = useState<{ slots: number; agents: Agent[]; unresolved: string[] } | null>(null);

  // The document declares its own signers through [[SIGN:BADGE]] slots — read them so the
  // officer does not retype badges that are already written into the text.
  useEffect(() => {
    fetch(`/api/documents/${doc.id}/signers`).then((r) => r.ok && r.json()).then((d) => {
      if (!d) return;
      setSlots(d);
      if (d.agents?.length) setChosen(d.agents);
    });
  }, [doc.id]);

  useEffect(() => {
    if (!q.trim()) return setResults([]);
    const t = setTimeout(async () => {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
      if (res.ok) setResults(await res.json());
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  function add(a: Agent) {
    if (!chosen.some((c) => c.matricule === a.matricule)) setChosen([...chosen, a]);
    setQ(""); setResults([]);
  }

  async function submit() {
    if (!chosen.length) return toast("Ajoutez au moins un signataire.", "error");
    setBusy(true);
    const res = await fetch("/api/signatures", {
      method: "POST",
      body: JSON.stringify({ doc_id: doc.id, signers: chosen.map((c) => c.matricule), sequential, note }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) return toast(d.error, "error");
    toast("Demande de signature envoyée. Le document est désormais scellé.", "success");
    onClose();
    onDone();
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal panel" onClick={(e) => e.stopPropagation()}>
        <h2>Demander des signatures — « {doc.title} »</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          Le document est scellé dès l'envoi de la demande : personne ne peut le modifier pendant la collecte des
          signatures. Annulez la demande pour le libérer.
        </p>
        {slots !== null && slots.slots > 0 && (
          <p className="success" style={{ marginBottom: 10 }}>
            ✓ {slots.slots} emplacement(s) de signature trouvé(s) dans le document — les signatures y seront placées.
            {slots.unresolved.length > 0 && ` Non trouvés : ${slots.unresolved.join(", ")}.`}
          </p>
        )}
        {slots !== null && slots.slots === 0 && (
          <p className="muted" style={{ marginBottom: 10 }}>
            Aucun emplacement <span className="mono">[[SIGN:BADGE]]</span> dans ce document — le bloc de signature
            sera ajouté à la fin.
          </p>
        )}
        <input placeholder="Rechercher un agent par matricule ou nom de code" value={q} onChange={(e) => setQ(e.target.value)} />
        {results.length > 0 && (
          <div className="search-results">
            {results.map((a) => (
              <div key={a.matricule} className="search-item" onClick={() => add(a)}>
                <span className="mono">{a.matricule}</span> — {a.codename}
              </div>
            ))}
          </div>
        )}
        {chosen.length > 0 && (
          <div className="signer-list" style={{ marginBottom: 12 }}>
            {chosen.map((c, i) => (
              <span key={c.matricule} className="sync-dot on" onClick={() => setChosen(chosen.filter((x) => x.matricule !== c.matricule))} style={{ cursor: "pointer" }} title="Retirer">
                {sequential ? `${i + 1}. ` : ""}{c.codename} ✕
              </span>
            ))}
          </div>
        )}
        <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", marginBottom: 10 }}>
          <input type="checkbox" style={{ width: "auto", marginBottom: 0 }} checked={sequential} onChange={(e) => setSequential(e.target.checked)} />
          <span>Chaîne de commandement — chacun signe à son tour, prévenu quand vient le sien</span>
        </label>
        <input placeholder="NOTE POUR LES SIGNATAIRES (facultatif)" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="sheet-footer">
          <button className="ghost" onClick={onClose}>Annuler</button>
          <button disabled={busy || !chosen.length} onClick={submit}>{busy ? "Envoi…" : "Demander les signatures"}</button>
        </div>
      </div>
    </div>
  );
}
