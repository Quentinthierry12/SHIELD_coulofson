"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@/lib/session";

type Doc = { id: number; title: string; filetype: string; classification: number; folder_id: number | null; updated_at: string; owner: string; mine: boolean };
type Folder = { id: number; name: string; restricted: boolean };
type Agent = { matricule: string; codename: string; clearance: number };

const TYPES: Record<string, { label: string; icon: string; cls: string }> = {
  docx: { label: "Report", icon: "📄", cls: "t-docx" },
  xlsx: { label: "Ledger", icon: "📊", cls: "t-xlsx" },
  pptx: { label: "Briefing", icon: "📽", cls: "t-pptx" },
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
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [folderFilter, setFolderFilter] = useState<number | "all">("all");
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
    if (folderFilter !== "all") form.append("folder_id", String(folderFilter));
    const res = await fetch("/api/documents/upload", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) return alert(`⚠ ${data.error}`);
    router.push(`/doc/${data.id}`);
  }

  async function createFolder() {
    const name = window.prompt("New room name (e.g. Operations, Intelligence, R&D):");
    if (!name) return;
    const res = await fetch("/api/folders", { method: "POST", body: JSON.stringify({ name }) });
    if (!res.ok) alert(`⚠ ${(await res.json()).error}`);
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

  const q = search.trim().toLowerCase();
  const visible = docs.filter((d) =>
    (typeFilter === "all" || d.filetype === typeFilter) &&
    (folderFilter === "all" || d.folder_id === folderFilter) &&
    (!mineOnly || d.mine) &&
    (!q || d.title.toLowerCase().includes(q) || (d.owner || "").toLowerCase().includes(q))
  );

  const railApps = [
    { key: "all", icon: "🏠", label: "Home" },
    { key: "docx", icon: "📄", label: "Reports" },
    { key: "xlsx", icon: "📊", label: "Ledgers" },
    { key: "pptx", icon: "📽", label: "Briefings" },
  ];

  return (
    <div className="layout">
      <nav className="rail">
        <img src="/logo.png" alt="" className="logo-img rail-logo" onError={(e) => (e.currentTarget.style.display = "none")} />
        {railApps.map((a) => (
          <button
            key={a.key}
            className={`rail-btn ${typeFilter === a.key && !mineOnly ? "active" : ""}`}
            title={a.label}
            onClick={() => { setTypeFilter(a.key); setMineOnly(false); }}
          >
            <span className="rail-icon">{a.icon}</span>
            <span className="rail-label">{a.label}</span>
          </button>
        ))}
        <button className={`rail-btn ${mineOnly ? "active" : ""}`} title="My documents" onClick={() => setMineOnly(!mineOnly)}>
          <span className="rail-icon">👤</span>
          <span className="rail-label">Mine</span>
        </button>
        {session.role === "admin" && (
          <a href="/admin">
            <button className="rail-btn" title="Command">
              <span className="rail-icon">🦅</span>
              <span className="rail-label">Command</span>
            </button>
          </a>
        )}
        <div className="rail-sep" />
        <div className="rail-rooms">
          <button className={`rail-btn ${folderFilter === "all" ? "active" : ""}`} title="All rooms" onClick={() => setFolderFilter("all")}>
            <span className="rail-icon">🗂</span>
            <span className="rail-label">All rooms</span>
          </button>
          {folders.map((f) => (
            <button
              key={f.id}
              className={`rail-btn ${folderFilter === f.id ? "active" : ""}`}
              title={f.name}
              onClick={() => setFolderFilter(folderFilter === f.id ? "all" : f.id)}
              onContextMenu={(e) => { if (session.role === "admin") { e.preventDefault(); setManageFolder(f); } }}
            >
              <span className="rail-icon">{f.restricted ? "🔒" : "▪"}</span>
              <span className="rail-label">{f.name}</span>
            </button>
          ))}
          {session.role === "admin" && (
            <button className="rail-btn" title="New room" onClick={createFolder}>
              <span className="rail-icon">＋</span>
              <span className="rail-label">Room</span>
            </button>
          )}
        </div>
      </nav>

      <div className="main">
        <div className="topbar">
          <input
            className="searchbar"
            placeholder="🔍  Search the archives…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span className="badge">{session.matricule} · {session.codename} · LVL.{session.clearance}</span>
            <a href="/api/auth/discord"><button className="ghost small" title="Link Discord to sign in with it and receive transmissions">Link Discord</button></a>
            <button className="ghost small" onClick={changePassword}>Password</button>
            <button className="ghost small" onClick={logout}>Sign out</button>
          </div>
        </div>

        <div className="content">
          <h2>Create</h2>
          <div className="tiles">
            {Object.entries(TYPES).map(([ext, t]) => (
              <button key={ext} className={`tile ${t.cls}`} onClick={() => setCreateType(ext)}>
                <span className="tile-icon">{t.icon}</span>
                <span>New {t.label}</span>
              </button>
            ))}
            <button className="tile t-import" onClick={() => fileInput.current?.click()}>
              <span className="tile-icon">⬆</span>
              <span>Import file</span>
            </button>
            <input ref={fileInput} type="file" accept=".docx,.xlsx,.pptx" style={{ display: "none" }} onChange={upload} />
          </div>

          <h2 style={{ marginTop: 26 }}>
            {mineOnly ? "My documents" : typeFilter === "all" ? "Recent" : `${TYPES[typeFilter].label}s`}
            {folderFilter !== "all" && ` — ${folders.find((f) => f.id === folderFilter)?.name}`}
            <span className="muted" style={{ marginLeft: 8, textTransform: "none" }}>({visible.length})</span>
          </h2>
          <div className="cards">
            {visible.map((d) => (
              <div key={d.id} className={`card ${TYPES[d.filetype].cls}`} onClick={() => router.push(`/doc/${d.id}`)}>
                <div className="card-top">
                  <span className="card-icon">{TYPES[d.filetype].icon}</span>
                  {(d.mine || session.role === "admin") && (
                    <span className="card-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="ghost small" title="Share" onClick={() => setShareDoc(d)}>⤴</button>
                      <button className="ghost small" title="Destroy" onClick={() => destroy(d)}>✕</button>
                    </span>
                  )}
                </div>
                <div className="card-title">{d.title}</div>
                <div className="card-meta">
                  {classifBadge(d.classification)}
                  <span className="muted">{folders.find((f) => f.id === d.folder_id)?.name || ""}</span>
                </div>
                <div className="card-meta muted">
                  {d.owner} · {new Date(d.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            ))}
            {visible.length === 0 && <p className="muted">No documents here at your clearance level.</p>}
          </div>
        </div>
      </div>

      {createType && (
        <CreateModal
          filetype={createType}
          folders={folders}
          maxLevel={session.clearance}
          defaultFolder={folderFilter === "all" ? "" : String(folderFilter)}
          onClose={() => setCreateType(null)}
        />
      )}
      {shareDoc && (
        <AccessModal
          title={`Share “${shareDoc.title}”`}
          url={`/api/documents/${shareDoc.id}/share`}
          verb="Shared with"
          onClose={() => setShareDoc(null)}
        />
      )}
      {manageFolder && (
        <AccessModal
          title={`Room access — “${manageFolder.name}”`}
          url={`/api/folders/${manageFolder.id}/members`}
          verb="Access granted to"
          note="A room with no members is open to every agent. As soon as it has members, only they (and officers) can see it."
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
        <h2>{t.icon} New {t.label}</h2>
        {error && <p className="error">⚠ {error}</p>}
        <form onSubmit={create}>
          <input autoFocus placeholder="DOCUMENT TITLE" value={title} onChange={(e) => setTitle(e.target.value)} />
          <select value={classification} onChange={(e) => setClassification(+e.target.value)}>
            {Array.from({ length: maxLevel }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>Classification level {n}</option>
            ))}
          </select>
          <select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            <option value="">— No room —</option>
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
    setQ("");
    setResults([]);
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
