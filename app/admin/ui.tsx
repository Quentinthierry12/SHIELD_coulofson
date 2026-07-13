"use client";
import { useEffect, useState } from "react";

type User = { id: number; matricule: string; codename: string; clearance: number; role: string; status: string; created_at: string };

export default function AdminUI() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/admin/users");
    if (res.ok) setUsers(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function update(u: User, patch: Partial<User>) {
    setError("");
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      body: JSON.stringify({ ...u, ...patch }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    load();
  }

  const pending = users.filter((u) => u.status === "pending");
  const others = users.filter((u) => u.status !== "pending");

  return (
    <>
      <div className="topbar">
        <div className="logo">
          <a href="/dashboard"><button className="ghost small">← Archives</button></a>
          <img src="/logo.png" alt="" className="logo-img" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          <h1>Commandement</h1>
          <span className="badge">GESTION DES AGENTS</span>
        </div>
      </div>
      <div className="container">
        {error && <p className="error">⚠ {error}</p>}
        {pending.length > 0 && (
          <div className="panel" style={{ borderColor: "#665520" }}>
            <h2>⏳ Recrues en attente de validation ({pending.length})</h2>
            <UserTable users={pending} onUpdate={update} />
          </div>
        )}
        <div className="panel">
          <h2>Agents enregistrés</h2>
          <UserTable users={others} onUpdate={update} />
        </div>
      </div>
    </>
  );
}

function UserTable({ users, onUpdate }: { users: User[]; onUpdate: (u: User, p: Partial<User>) => void }) {
  return (
    <table>
      <thead>
        <tr><th>Matricule</th><th>Nom de code</th><th>Habilitation</th><th>Rôle</th><th>Statut</th><th>Actions</th></tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <tr key={u.id}>
            <td className="mono">{u.matricule}</td>
            <td>{u.codename}</td>
            <td>
              <select value={u.clearance} onChange={(e) => onUpdate(u, { clearance: +e.target.value })} style={{ marginBottom: 0, width: 90 }}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Niv. {n}</option>)}
              </select>
            </td>
            <td>
              <select value={u.role} onChange={(e) => onUpdate(u, { role: e.target.value })} style={{ marginBottom: 0, width: 110 }}>
                <option value="agent">Agent</option>
                <option value="admin">Officier</option>
              </select>
            </td>
            <td>
              <span className={`classif ${u.status === "active" ? "low" : u.status === "pending" ? "mid" : "high"}`}>
                {u.status === "active" ? "ACTIF" : u.status === "pending" ? "EN ATTENTE" : "RÉVOQUÉ"}
              </span>
            </td>
            <td style={{ display: "flex", gap: 6 }}>
              {u.status !== "active" && <button className="small" onClick={() => onUpdate(u, { status: "active" })}>Valider</button>}
              {u.status === "active" && <button className="ghost small" onClick={() => onUpdate(u, { status: "revoked" })}>Révoquer</button>}
            </td>
          </tr>
        ))}
        {users.length === 0 && <tr><td colSpan={6} className="muted">Personne.</td></tr>}
      </tbody>
    </table>
  );
}
