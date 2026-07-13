"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@/lib/session";

type Doc = { id: number; title: string; filetype: string; classification: number; updated_at: string; owner: string; mine: boolean };

const TYPE_LABEL: Record<string, string> = { docx: "📄 Rapport", xlsx: "📊 Registre", pptx: "📽 Briefing" };

function classifBadge(level: number) {
  const cls = level >= 7 ? "high" : level >= 4 ? "mid" : "low";
  const label = level >= 7 ? "TOP SECRET" : level >= 4 ? "CLASSIFIÉ" : "RESTREINT";
  return <span className={`classif ${cls}`}>NIV.{level} — {label}</span>;
}

export default function Dashboard({ session }: { session: Session }) {
  const router = useRouter();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [title, setTitle] = useState("");
  const [filetype, setFiletype] = useState("docx");
  const [classification, setClassification] = useState(1);
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/documents");
    if (res.status === 401) return router.push("/");
    setDocs(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/documents", {
      method: "POST",
      body: JSON.stringify({ title, filetype, classification }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    router.push(`/doc/${data.id}`);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  async function share(doc: Doc) {
    const matricule = window.prompt(`Partager « ${doc.title} » avec quel agent ? (matricule, ex: AG-4782)`);
    if (!matricule) return;
    const res = await fetch(`/api/documents/${doc.id}/share`, { method: "POST", body: JSON.stringify({ matricule }) });
    const data = await res.json();
    alert(res.ok ? `Document partagé avec ${data.codename}.` : `⚠ ${data.error}`);
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

  return (
    <>
      <div className="topbar">
        <div className="logo">
          <img src="/logo.png" alt="" className="logo-img" onError={(e) => { e.currentTarget.style.display = "none"; }} />
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
          <form onSubmit={create} style={{ display: "flex", gap: 10 }}>
            <input placeholder="TITRE DU DOCUMENT" value={title} onChange={(e) => setTitle(e.target.value)} style={{ marginBottom: 0, flex: 2 }} />
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
            <button>Créer</button>
          </form>
        </div>
        <div className="panel">
          <h2>Archives accessibles — habilitation niveau {session.clearance}</h2>
          <table>
            <thead>
              <tr><th>Type</th><th>Titre</th><th>Classification</th><th>Agent</th><th>Dernière modif.</th><th></th></tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>{TYPE_LABEL[d.filetype]}</td>
                  <td><a href={`/doc/${d.id}`}>{d.title}</a></td>
                  <td>{classifBadge(d.classification)}</td>
                  <td className="muted">{d.owner}</td>
                  <td className="muted">{new Date(d.updated_at).toLocaleString("fr-FR")}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {(d.mine || session.role === "admin") && (
                      <>
                        <button className="ghost small" onClick={() => share(d)}>Partager</button>{" "}
                        <button className="ghost small" onClick={() => destroy(d)} title="Détruire">✕</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {docs.length === 0 && (
                <tr><td colSpan={6} className="muted">Aucun document à votre niveau d'habilitation.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
