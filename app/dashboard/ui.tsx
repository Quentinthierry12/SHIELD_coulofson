"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@/lib/session";

type Doc = { id: number; title: string; filetype: string; classification: number; folder_id: number | null; updated_at: string; owner: string; mine: boolean };
type Folder = { id: number; name: string; restricted: boolean };
type Agent = { matricule: string; codename: string; clearance: number };

const TYPE_LABEL: Record<string, string> = { docx: "📄 Rapport", xlsx: "📊 Registre", pptx: "📽 Briefing" };

function classifBadge(level: number) {
  const cls = level >= 7 ? "high" : level >= 4 ? "mid" : "low";
  const label = level >= 7 ? "TOP SECRET" : level >= 4 ? "CLASSIFIÉ" : "RESTREINT";
  return <span className={`classif ${cls}`}>NIV.{level} — {label}</span>;
}

export default function Dashboard({ session }: { session: Session }) {
  const router = useRouter();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderFilter, setFolderFilter] = useState<number | "all">("all");
  const [title, setTitle] = useState("");
  const [filetype, setFiletype] = useState("docx");
  const [classification, setClassification] = useState(1);
  const [folderId, setFolderId] = useState<string>("");
  const [error, setError] = useState("");
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

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    const form = new FormData();
    form.append("file", file);
    form.append("classification", String(classification));
    if (folderId) form.append("folder_id", folderId);
    const res = await fetch("/api/documents/upload", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    router.push(`/doc/${data.id}`);
  }

  async function createFolder() {
    const name = window.prompt("Nom du nouveau salon (ex: Opérations, Renseignement, R&D) :");
    if (!name) return;
    const res = await fetch("/api/folders", { method: "POST", body: JSON.stringify({ name }) });
    if (!res.ok) alert(`⚠ ${(await res.json()).error}`);
    load();
  }

  async function destroy(doc: Doc) {
    if (!window.confirm(`Détruire définitivement « ${doc.title} » ? (Protocole de destruction 4-Delta)`)) return;
    const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
    if (!res.ok) alert(`⚠ ${(await res.json()).error}`);
    load();
  }

  async function changePassword() {
    const current = window.prompt("Mot de passe actuel :");
    if (!current) return;
    const next = window.prompt("Nouveau mot de passe (6 caractères min.) :");
    if (!next) return;
    const res = await fetch("/api/auth/password", { method: "POST", body: JSON.stringify({ current, next }) });
    const data = await res.json();
    alert(res.ok ? "Mot de passe mis à jour." : `⚠ ${data.error}`);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  const visible = docs.filter((d) => folderFilter === "all" || d.folder_id === folderFilter);

  return (
    <>
      <div className="topbar">
        <div className="logo">
          <img src="/logo.png" alt="" className="logo-img" onError={(e) => (e.currentTarget.style.display = "none")} />
          <h1>S.H.I.E.L.D.</h1>
          <span className="badge">DOCUMENTS CLASSIFIÉS</span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className="badge">{session.matricule} · {session.codename} · HAB. NIV.{session.clearance}</span>
          {session.role === "admin" && <a href="/admin"><button className="small">Commandement</button></a>}
          <button className="ghost small" onClick={changePassword}>Mot de passe</button>
          <button className="ghost small" onClick={logout}>Déconnexion</button>
        </div>
      </div>
      <div className="container">
        <div className="panel">
          <h2>Nouveau document</h2>
          {error && <p className="error">⚠ {error}</p>}
          <form onSubmit={create} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input placeholder="TITRE DU DOCUMENT" value={title} onChange={(e) => setTitle(e.target.value)} style={{ marginBottom: 0, flex: 2, minWidth: 200 }} />
            <select value={filetype} onChange={(e) => setFiletype(e.target.value)} style={{ marginBottom: 0, flex: 1 }}>
              <option value="docx">📄 Rapport (Word)</option>
              <option value="xlsx">📊 Registre (Excel)</option>
              <option value="pptx">📽 Briefing (PowerPoint)</option>
            </select>
            <select value={classification} onChange={(e) => setClassification(+e.target.value)} style={{ marginBottom: 0, flex: 1 }}>
              {Array.from({ length: session.clearance }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>Niveau {n}</option>
              ))}
            </select>
            <select value={folderId} onChange={(e) => setFolderId(e.target.value)} style={{ marginBottom: 0, flex: 1 }}>
              <option value="">— Sans salon —</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <button>Créer</button>
            <button type="button" className="ghost" onClick={() => fileInput.current?.click()}>Importer</button>
          </form>
          <input ref={fileInput} type="file" accept=".docx,.xlsx,.pptx" style={{ display: "none" }} onChange={upload} />
          <p className="muted" style={{ marginTop: 8 }}>Importer : verse un fichier .docx / .xlsx / .pptx de votre machine aux archives, au niveau et salon sélectionnés.</p>
        </div>
        <div className="panel">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            <button className={folderFilter === "all" ? "small" : "ghost small"} onClick={() => setFolderFilter("all")}>Tous</button>
            {folders.map((f) => (
              <span key={f.id} style={{ display: "inline-flex", gap: 2 }}>
                <button className={folderFilter === f.id ? "small" : "ghost small"} onClick={() => setFolderFilter(f.id)}>
                  {f.restricted ? "🔒" : "🗂"} {f.name}
                </button>
                {session.role === "admin" && (
                  <button className="ghost small" title="Gérer les accès" onClick={() => setManageFolder(f)}>⚙</button>
                )}
              </span>
            ))}
            {session.role === "admin" && <button className="ghost small" onClick={createFolder}>+ Salon</button>}
          </div>
          <h2>Archives accessibles — habilitation niveau {session.clearance}</h2>
          <table>
            <thead>
              <tr><th>Type</th><th>Titre</th><th>Classification</th><th>Salon</th><th>Agent</th><th>Dernière modif.</th><th></th></tr>
            </thead>
            <tbody>
              {visible.map((d) => (
                <tr key={d.id}>
                  <td>{TYPE_LABEL[d.filetype]}</td>
                  <td><a href={`/doc/${d.id}`}>{d.title}</a></td>
                  <td>{classifBadge(d.classification)}</td>
                  <td className="muted">{folders.find((f) => f.id === d.folder_id)?.name || "—"}</td>
                  <td className="muted">{d.owner}</td>
                  <td className="muted">{new Date(d.updated_at).toLocaleString("fr-FR")}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {(d.mine || session.role === "admin") && (
                      <>
                        <button className="ghost small" onClick={() => setShareDoc(d)}>Partager</button>{" "}
                        <button className="ghost small" onClick={() => destroy(d)} title="Détruire">✕</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={7} className="muted">Aucun document ici à votre niveau d'habilitation.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {shareDoc && (
        <AccessModal
          title={`Partager « ${shareDoc.title} »`}
          url={`/api/documents/${shareDoc.id}/share`}
          verb="Partagé avec"
          onClose={() => setShareDoc(null)}
        />
      )}
      {manageFolder && (
        <AccessModal
          title={`Accès au salon « ${manageFolder.name} »`}
          url={`/api/folders/${manageFolder.id}/members`}
          verb="Accès accordé à"
          note="Un salon sans aucun membre est ouvert à tous les agents. Dès qu'il a des membres, seuls eux (et les officiers) le voient."
          onClose={() => { setManageFolder(null); load(); }}
        />
      )}
    </>
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
        <input
          autoFocus
          placeholder="Tapez un nom de code ou un matricule…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {results.length > 0 && (
          <div className="results">
            {results.map((a) => (
              <div key={a.matricule} className="result-item" onClick={() => add(a)}>
                <span className="mono">{a.matricule}</span> · {a.codename} <span className="muted">niv.{a.clearance}</span>
              </div>
            ))}
          </div>
        )}
        {msg && <p className={msg.startsWith("✓") ? "success" : "error"}>{msg}</p>}
        {shares.length > 0 && (
          <>
            <h2 style={{ marginTop: 14 }}>Accès accordés</h2>
            {shares.map((a) => (
              <div key={a.matricule} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span><span className="mono">{a.matricule}</span> · {a.codename}</span>
                <button className="ghost small" onClick={() => remove(a)}>Retirer</button>
              </div>
            ))}
          </>
        )}
        <button className="ghost" style={{ marginTop: 16, width: "100%" }} onClick={onClose}>Fermer</button>
      </div>
    </div>
  );
}
