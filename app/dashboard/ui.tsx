"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@/lib/session";

type Doc = { id: number; title: string; filetype: string; classification: number; folder_id: number | null; updated_at: string; owner: string; mine: boolean };
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

export default function Dashboard({ session }: { session: Session }) {
  const router = useRouter();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [cwd, setCwd] = useState<number | null>(null); // current folder, null = root
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [createType, setCreateType] = useState<string | null>(null);
  const [shareDoc, setShareDoc] = useState<Doc | null>(null);
  const [manageFolder, setManageFolder] = useState<Folder | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch("/api/documents");
    if (res.status === 401) return router.push("/");
    setDocs(await res.json());
    const f = await fetch("/api/folders");
    if (f.ok) setFolders(await f.json());
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
    if (!res.ok) return alert(`⚠ ${data.error}`);
    router.push(`/doc/${data.id}`);
  }

  async function createFolder() {
    const name = window.prompt("New folder name:");
    if (!name) return;
    const res = await fetch("/api/folders", { method: "POST", body: JSON.stringify({ name, parent_id: cwd }) });
    if (!res.ok) return alert(`⚠ ${(await res.json()).error}`);
    load();
  }

  async function destroy(doc: Doc) {
    if (!window.confirm(`Permanently destroy “${doc.title}”? (Destruction Protocol 4-Delta)`)) return;
    const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
    if (!res.ok) alert(`⚠ ${(await res.json()).error}`);
    load();
  }

  async function changePassword() {
    const current = window.prompt("Current password:");
    if (!current) return;
    const next = window.prompt("New password (min. 6 characters):");
    if (!next) return;
    const res = await fetch("/api/auth/password", { method: "POST", body: JSON.stringify({ current, next }) });
    const data = await res.json();
    alert(res.ok ? "Password updated." : `⚠ ${data.error}`);
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
              <button className="crumb" onClick={() => setCwd(null)}>Drive</button>
              {breadcrumb(cwd).map((f) => (
                <span key={f.id}>
                  <span className="crumb-sep">/</span>
                  <button className="crumb" onClick={() => setCwd(f.id)}>{f.restricted ? "🔒 " : ""}{f.name}</button>
                </span>
              ))}
            </div>
          )}

          {/* Folders (only in Drive mode) */}
          {!flatMode && childFolders.length > 0 && (
            <div className="cards" style={{ marginBottom: 18 }}>
              {childFolders.map((f) => (
                <div key={f.id} className="card card-folder" onDoubleClick={() => setCwd(f.id)} onClick={() => setCwd(f.id)}>
                  <div className="card-top">
                    <span className="tag t-folder">DIR</span>
                    {(f.mine || session.role === "admin") && (
                      <span className="card-actions" onClick={(e) => e.stopPropagation()}>
                        <button className="ghost small" title="Members / invitations" onClick={() => setManageFolder(f)}>Invite</button>
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
            {shownDocs.map((d) => (
              <div key={d.id} className={`card ${TYPES[d.filetype].cls}`} onClick={() => router.push(`/doc/${d.id}`)}>
                <div className="card-top">
                  <span className={`tag ${TYPES[d.filetype].cls}`}>{TYPES[d.filetype].tag}</span>
                  {(d.mine || session.role === "admin") && (
                    <span className="card-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="ghost small" title="Share" onClick={() => setShareDoc(d)}>Share</button>
                      <button className="ghost small" title="Destroy" onClick={() => destroy(d)}>✕</button>
                    </span>
                  )}
                </div>
                <div className="card-title">{d.title}</div>
                <div className="card-meta">{classifBadge(d.classification)}</div>
                <div className="card-meta muted">
                  {d.owner} · {new Date(d.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            ))}
            {shownDocs.length === 0 && (!flatMode ? childFolders.length === 0 : true) && (
              <p className="muted">This folder is empty at your clearance level.</p>
            )}
          </div>
        </div>
      </div>

      {createType && (
        <CreateModal filetype={createType} folders={folders} maxLevel={session.clearance} defaultFolder={cwd ? String(cwd) : ""} onClose={() => setCreateType(null)} />
      )}
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
