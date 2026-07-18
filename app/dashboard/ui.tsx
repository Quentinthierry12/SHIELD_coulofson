"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@/lib/session";
import { toast, confirmDialog, promptDialog } from "@/lib/ui-store";

type Doc = { id: number; title: string; filetype: string; classification: number; folder_id: number | null; updated_at: string; owner: string; mine: boolean; sealed?: boolean; locked?: boolean; lock_reason?: string | null; request_status?: string | null };
type Folder = { id: number; name: string; parent_id: number | null; created_by: number | null; restricted: boolean; member: boolean; mine: boolean };
type Agent = { matricule: string; codename: string; clearance: number };

const TYPES: Record<string, { label: string; tag: string; cls: string }> = {
  docx: { label: "Report", tag: "DOC", cls: "t-docx" },
  xlsx: { label: "Ledger", tag: "XLS", cls: "t-xlsx" },
  pptx: { label: "Briefing", tag: "PPT", cls: "t-pptx" },
};

function classifBadge(level: number) {
  const cls = level >= 7 ? "high" : level >= 4 ? "mid" : "low";
  const label = level >= 7 ? "TOP SECRET" : level >= 4 ? "CLASSIFIED" : "RESTRICTED";
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
    const name = await promptDialog({ title: "New folder", placeholder: "Folder name" });
    if (!name?.trim()) return;
    const res = await fetch("/api/folders", { method: "POST", body: JSON.stringify({ name, parent_id: cwd }) });
    if (!res.ok) return toast((await res.json()).error, "error");
    toast("Folder created.", "success");
    load();
  }

  async function moveDoc(docId: number, folderId: number | null) {
    const res = await fetch(`/api/documents/${docId}`, { method: "PATCH", body: JSON.stringify({ folder_id: folderId }) });
    if (!res.ok) return toast((await res.json()).error, "error");
    toast("Document moved.", "success");
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
    const ok = await confirmDialog({ title: `Delete folder “${f.name}”?`, message: "The folder must be empty. This cannot be undone.", confirmLabel: "Delete", danger: true });
    if (!ok) return;
    const res = await fetch(`/api/folders/${f.id}`, { method: "DELETE" });
    if (!res.ok) return toast((await res.json()).error, "error");
    if (cwd === f.id) setCwd(f.parent_id ?? null);
    toast("Folder deleted.", "success");
    load();
  }

  async function destroy(doc: Doc) {
    const ok = await confirmDialog({ title: `Destroy “${doc.title}”?`, message: "Destruction Protocol 4-Delta — this is permanent.", confirmLabel: "Destroy", danger: true });
    if (!ok) return;
    const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
    if (!res.ok) return toast((await res.json()).error, "error");
    toast("Document destroyed.", "success");
    load();
  }

  async function renameDoc(doc: Doc) {
    const name = await promptDialog({ title: "Rename document", message: `Current name: “${doc.title}”.`, placeholder: "New name", defaultValue: doc.title });
    if (!name || name.trim() === doc.title) return;
    const res = await fetch(`/api/documents/${doc.id}`, { method: "PATCH", body: JSON.stringify({ title: name }) });
    if (!res.ok) return toast((await res.json()).error, "error");
    toast("Document renamed.", "success");
    load();
  }

  async function renameFolder(f: Folder) {
    const name = await promptDialog({ title: "Rename folder", message: `Current name: “${f.name}”.`, placeholder: "New name", defaultValue: f.name });
    if (!name || name.trim() === f.name) return;
    const res = await fetch(`/api/folders/${f.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
    if (!res.ok) return toast((await res.json()).error, "error");
    toast("Folder renamed.", "success");
    load();
  }

  async function unseal(doc: Doc) {
    const ok = await confirmDialog({
      title: `Unseal “${doc.title}”?`,
      message: "Every signature on this document is voided and the signers are notified. The document becomes editable again.",
      confirmLabel: "Unseal and void signatures", danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/documents/${doc.id}`, { method: "PATCH", body: JSON.stringify({ unlock: true }) });
    const d = await res.json();
    if (!res.ok) return toast(d.error, "error");
    toast(`Unsealed — ${d.voided} signature request(s) voided.`, "success");
    load();
  }

  async function reclassify(doc: Doc, level: number) {
    const res = await fetch(`/api/documents/${doc.id}`, {
      method: "PATCH",
      body: JSON.stringify({ classification: level }),
    });
    if (!res.ok) { toast((await res.json()).error, "error"); return load(); }
    toast(`“${doc.title}” is now level ${level}.`, "success");
    load();
  }

  // Conversion runs on the Document Server and takes a moment on big files, so tell the
  // agent it started rather than leaving the button dead.
  async function exportPdf(doc: Doc) {
    toast(`Generating PDF — “${doc.title}”…`);
    const res = await fetch(`/api/documents/${doc.id}/pdf`);
    if (!res.ok) return toast((await res.json()).error || "Conversion failed.", "error");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.title}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    toast("PDF ready.", "success");
  }

  async function changePassword() {
    const current = await promptDialog({ title: "Change password", message: "Enter your current password.", placeholder: "Current password", password: true });
    if (!current) return;
    const next = await promptDialog({ title: "Change password", message: "Enter a new password (min. 6 characters).", placeholder: "New password", password: true });
    if (!next) return;
    const res = await fetch("/api/auth/password", { method: "POST", body: JSON.stringify({ current, next }) });
    const data = await res.json();
    toast(res.ok ? "Password updated." : data.error, res.ok ? "success" : "error");
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
    { key: "all", label: "Home" },
    { key: "docx", label: "Reports" },
    { key: "xlsx", label: "Ledgers" },
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
          <span className="rail-label">Mine</span>
        </button>
        <a href="/inbox"><button className="rail-btn"><span className="rail-label">Dispatch</span></button></a>
        <a href="/missions"><button className="rail-btn"><span className="rail-label">Missions</span></button></a>
        <a href="/roster"><button className="rail-btn"><span className="rail-label">Roster</span></button></a>
        {academyUrl && (
          // Separate system on its own domain — open it in a new tab rather than losing the Drive.
          <a href={academyUrl} target="_blank" rel="noopener noreferrer" title="S.H.I.E.L.D. Academy — training">
            <button className="rail-btn"><span className="rail-label">Academy</span></button>
          </a>
        )}
        {session.role === "admin" && (
          <a href="/admin"><button className="rail-btn"><span className="rail-label">Command</span></button></a>
        )}
      </nav>

      <div className="main">
        <div className="topbar">
          <input className="searchbar" placeholder="Search the archives…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span className="badge">{session.matricule} · {session.codename} · LVL.{session.clearance}</span>
            <a href="/api/auth/discord"><button className="ghost small" title="Link Discord">Link Discord</button></a>
            <button className="ghost small" onClick={changePassword}>Password</button>
            <button className="ghost small" onClick={logout}>Sign out</button>
          </div>
        </div>

        <div className="content">
          <div className="tiles">
            {Object.entries(TYPES).map(([ext, t]) => (
              <button key={ext} className={`tile ${t.cls}`} onClick={() => setCreateType(ext)}>
                <span className={`tag ${t.cls}`}>{t.tag}</span><span>New {t.label}</span>
              </button>
            ))}
            <button className="tile t-import" onClick={() => fileInput.current?.click()}>
              <span className="tag t-import">FILE</span><span>Import file</span>
            </button>
            <button className="tile t-folder" onClick={createFolder}>
              <span className="tag t-folder">DIR</span><span>New folder</span>
            </button>
            <input ref={fileInput} type="file" accept=".docx,.xlsx,.pptx" style={{ display: "none" }} onChange={upload} />
          </div>

          {flatMode ? (
            <h2 style={{ marginTop: 26 }}>
              {mineOnly ? "My documents" : q ? "Search results" : `${TYPES[typeFilter].label}s`}
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
                        <button className="ghost small" title="Rename folder" onClick={() => renameFolder(f)}>Rename</button>
                        <button className="ghost small" title="Members / invitations" onClick={() => setManageFolder(f)}>Invite</button>
                        <button className="ghost small" title="Delete folder" onClick={() => deleteFolder(f)}>✕</button>
                      </span>
                    )}
                  </div>
                  <div className="card-title">{f.restricted ? "🔒 " : ""}{f.name}</div>
                  <div className="card-meta muted">{f.restricted ? "Restricted" : "Open"}</div>
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
                title={d.locked ? "Restricted — click to request access" : (d.mine || session.role === "admin") ? "Drag onto a folder to move" : undefined}
              >
                <div className="card-top">
                  <span className={`tag ${TYPES[d.filetype].cls}`}>{TYPES[d.filetype].tag}</span>
                  {!d.locked && (
                    <span className="card-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="ghost small" title="Export as PDF" onClick={() => exportPdf(d)}>PDF</button>
                      {(d.mine || session.role === "admin") && (
                        <>
                          {!d.sealed && <button className="ghost small" title="Request signatures" onClick={() => setSignDoc(d)}>Sign</button>}
                          {d.sealed && session.role === "admin" && (
                            <button className="ghost small danger" title="Unseal — voids every signature" onClick={() => unseal(d)}>Unseal</button>
                          )}
                          {!d.sealed && <button className="ghost small" title="Rename" onClick={() => renameDoc(d)}>Rename</button>}
                          <button className="ghost small" title="Share" onClick={() => setShareDoc(d)}>Share</button>
                          <button className="ghost small" title="Public link" onClick={() => setPublicDoc(d)}>Link</button>
                          <button className="ghost small" title="Destroy" onClick={() => destroy(d)}>✕</button>
                        </>
                      )}
                    </span>
                  )}
                  {d.locked && <span className="tag t-locked">LOCKED</span>}
                  {!d.locked && d.sealed && <span className="tag t-sealed" title="Signed and sealed — read-only">SEALED</span>}
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
                      title="Classification level"
                    >
                      {/* All ten levels are listed so a file already above your clearance
                          (personnel files start at 10) still shows its real level; the ones
                          you may not assign are disabled, and the API refuses them anyway. */}
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n} disabled={n > session.clearance}>
                          LVL.{n} — {n >= 7 ? "TOP SECRET" : n >= 4 ? "CLASSIFIED" : "RESTRICTED"}
                        </option>
                      ))}
                    </select>
                  ) : classifBadge(d.classification)}
                </div>
                {d.locked ? (
                  <div className="card-meta muted">
                    {d.request_status === "pending"
                      ? "Access requested — awaiting approval"
                      : d.lock_reason === "folder"
                        ? "Restricted folder — request access"
                        : "Above your clearance — request access"}
                  </div>
                ) : (
                  <div className="card-meta muted">
                    {d.owner} · {new Date(d.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                )}
              </div>
            ))}
            {!loading && shownDocs.length === 0 && (!flatMode ? childFolders.length === 0 : true) && (
              <div className="empty">
                <div className="empty-mark">[ ▚ ]</div>
                <div className="empty-title">{q ? "No results" : mineOnly ? "No documents yet" : "Empty protocol"}</div>
                <div>{q ? "No archive matches your search at this clearance level." : "No documents here at your clearance level. Create one above."}</div>
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
        <AccessModal title={`Share “${shareDoc.title}”`} url={`/api/documents/${shareDoc.id}/share`} verb="Shared with" onClose={() => setShareDoc(null)} />
      )}
      {manageFolder && (
        <AccessModal
          title={`Folder invitations — “${manageFolder.name}”`}
          url={`/api/folders/${manageFolder.id}/members`}
          verb="Invited"
          note="A folder with no members is open to every agent. As soon as it has members, only they (and officers) can see it and everything inside it."
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
        <h2>Public link — “{doc.title}”</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          Anyone with the link can view this document read-only, without an account.
          Classified sections marked <span className="mono">{"[[CLR:n]]"}</span> stay hidden.
        </p>
        {!loaded ? <p className="muted">…</p> : token ? (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input readOnly value={url} style={{ marginBottom: 0, flex: 1 }} onFocus={(e) => e.target.select()} />
              <button onClick={copy}>{copied ? "Copied" : "Copy"}</button>
            </div>
            <button className="ghost" style={{ width: "100%" }} onClick={revoke}>Disable public link</button>
          </>
        ) : (
          <button style={{ width: "100%" }} onClick={enable}>Create public link</button>
        )}
        <button className="ghost" style={{ marginTop: 10, width: "100%" }} onClick={onClose}>Close</button>
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
        <h2>New {t.label}</h2>
        {error && <p className="error">⚠ {error}</p>}
        <form onSubmit={create}>
          <input autoFocus placeholder="DOCUMENT TITLE" value={title} onChange={(e) => setTitle(e.target.value)} />
          <select value={classification} onChange={(e) => setClassification(+e.target.value)}>
            {Array.from({ length: maxLevel }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Classification level {n}</option>)}
          </select>
          <select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            <option value="">— Drive root —</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <button style={{ width: "100%" }}>Create</button>
        </form>
        <button className="ghost" style={{ marginTop: 10, width: "100%" }} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

function AccessModal({ title, url, verb, note, onClose }: { title: string; url: string; verb: string; note?: string; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Agent[]>([]);
  const [shares, setShares] = useState<Agent[]>([]);
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
    const res = await fetch(url, { method: "POST", body: JSON.stringify({ matricule: a.matricule }) });
    const data = await res.json();
    setMsg(res.ok ? `✓ ${verb} ${data.codename}` : `⚠ ${data.error}`);
    setQ(""); setResults([]); loadShares();
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
        <input autoFocus placeholder="Type a codename or badge number…" value={q} onChange={(e) => setQ(e.target.value)} />
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
            <h2 style={{ marginTop: 14 }}>Current access</h2>
            {shares.map((a) => (
              <div key={a.matricule} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span><span className="mono">{a.matricule}</span> · {a.codename}</span>
                <button className="ghost small" onClick={() => remove(a)}>Remove</button>
              </div>
            ))}
          </>
        )}
        <button className="ghost" style={{ marginTop: 16, width: "100%" }} onClick={onClose}>Close</button>
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
    if (!chosen.length) return toast("Add at least one signer.", "error");
    setBusy(true);
    const res = await fetch("/api/signatures", {
      method: "POST",
      body: JSON.stringify({ doc_id: doc.id, signers: chosen.map((c) => c.matricule), sequential, note }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) return toast(d.error, "error");
    toast("Signature request sent. The document is now sealed.", "success");
    onClose();
    onDone();
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal panel" onClick={(e) => e.stopPropagation()}>
        <h2>Request signatures — “{doc.title}”</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          The document is sealed as soon as the request goes out: nobody can edit it while signatures are
          being collected. Cancel the request to release it.
        </p>
        {slots !== null && slots.slots > 0 && (
          <p className="success" style={{ marginBottom: 10 }}>
            ✓ {slots.slots} signature slot(s) found in the document — signatures will be placed there.
            {slots.unresolved.length > 0 && ` Unmatched: ${slots.unresolved.join(", ")}.`}
          </p>
        )}
        {slots !== null && slots.slots === 0 && (
          <p className="muted" style={{ marginBottom: 10 }}>
            No <span className="mono">[[SIGN:BADGE]]</span> slot in this document — the signature block
            will be added at the end.
          </p>
        )}
        <input placeholder="Search an agent by badge or codename" value={q} onChange={(e) => setQ(e.target.value)} />
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
              <span key={c.matricule} className="sync-dot on" onClick={() => setChosen(chosen.filter((x) => x.matricule !== c.matricule))} style={{ cursor: "pointer" }} title="Remove">
                {sequential ? `${i + 1}. ` : ""}{c.codename} ✕
              </span>
            ))}
          </div>
        )}
        <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", marginBottom: 10 }}>
          <input type="checkbox" style={{ width: "auto", marginBottom: 0 }} checked={sequential} onChange={(e) => setSequential(e.target.checked)} />
          <span>Chain of command — each signs in turn, notified when their turn comes</span>
        </label>
        <input placeholder="NOTE FOR THE SIGNERS (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="sheet-footer">
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button disabled={busy || !chosen.length} onClick={submit}>{busy ? "Sending…" : "Request signatures"}</button>
        </div>
      </div>
    </div>
  );
}
