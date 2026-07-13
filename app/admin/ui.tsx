"use client";
import { useEffect, useState } from "react";

type User = { id: number; matricule: string; codename: string; clearance: number; role: string; status: string; discord_linked: boolean; created_at: string };

export default function AdminUI() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [codename, setCodename] = useState("");
  const [password, setPassword] = useState("");
  const [badge, setBadge] = useState("");
  const [clearance, setClearance] = useState(1);
  const [created, setCreated] = useState("");

  async function load() {
    const res = await fetch("/api/admin/users");
    if (res.ok) setUsers(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function update(u: User, patch: Partial<User> & { new_password?: string }) {
    setError("");
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      body: JSON.stringify({ ...u, ...patch }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    load();
  }

  function resetPassword(u: User) {
    const pwd = window.prompt(`New temporary password for ${u.matricule} (${u.codename}):`);
    if (pwd) update(u, { new_password: pwd });
  }

  async function createAgent(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreated("");
    const res = await fetch("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ codename, password, clearance, matricule: badge }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setCreated(`Account created: badge ${data.matricule} — hand it to the agent with their password. Their administrative personnel file has been generated.`);
    setCodename("");
    setPassword("");
    setBadge("");
    load();
  }

  const pending = users.filter((u) => u.status === "pending");
  const others = users.filter((u) => u.status !== "pending");

  return (
    <>
      <div className="topbar">
        <div className="logo">
          <a href="/dashboard"><button className="ghost small">← Archives</button></a>
          <h1>🦅 Command</h1>
          <span className="badge">AGENT MANAGEMENT</span>
        </div>
      </div>
      <div className="container">
        {error && <p className="error">⚠ {error}</p>}
        <div className="panel">
          <h2>Create an agent account</h2>
          {created && <p className="success">✓ {created}</p>}
          <form onSubmit={createAgent} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input placeholder="CODENAME" value={codename} onChange={(e) => setCodename(e.target.value)} style={{ marginBottom: 0, flex: 2, minWidth: 140 }} />
            <input placeholder="BADGE (optional — auto)" value={badge} onChange={(e) => setBadge(e.target.value)} style={{ marginBottom: 0, flex: 1, minWidth: 120 }} />
            <input placeholder="TEMPORARY PASSWORD" value={password} onChange={(e) => setPassword(e.target.value)} style={{ marginBottom: 0, flex: 2, minWidth: 140 }} />
            <select value={clearance} onChange={(e) => setClearance(+e.target.value)} style={{ marginBottom: 0, flex: 1 }}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Clearance {n}</option>)}
            </select>
            <button>Create account</button>
          </form>
        </div>
        {pending.length > 0 && (
          <div className="panel" style={{ borderColor: "#665520" }}>
            <h2>⏳ Recruits awaiting validation ({pending.length})</h2>
            <UserTable users={pending} onUpdate={update} onResetPassword={resetPassword} />
          </div>
        )}
        <div className="panel">
          <h2>Registered agents</h2>
          <UserTable users={others} onUpdate={update} onResetPassword={resetPassword} />
        </div>
      </div>
    </>
  );
}

function UserTable({ users, onUpdate, onResetPassword }: { users: User[]; onUpdate: (u: User, p: Partial<User>) => void; onResetPassword: (u: User) => void }) {
  return (
    <table>
      <thead>
        <tr><th>Badge</th><th>Codename</th><th>Clearance</th><th>Role</th><th>Status</th><th>Discord</th><th>Actions</th></tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <tr key={u.id}>
            <td className="mono">{u.matricule}</td>
            <td>{u.codename}</td>
            <td>
              <select value={u.clearance} onChange={(e) => onUpdate(u, { clearance: +e.target.value })} style={{ marginBottom: 0, width: 90 }}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Lvl. {n}</option>)}
              </select>
            </td>
            <td>
              <select value={u.role} onChange={(e) => onUpdate(u, { role: e.target.value })} style={{ marginBottom: 0, width: 110 }}>
                <option value="agent">Agent</option>
                <option value="admin">Officer</option>
              </select>
            </td>
            <td>
              <span className={`classif ${u.status === "active" ? "low" : u.status === "pending" ? "mid" : "high"}`}>
                {u.status === "active" ? "ACTIVE" : u.status === "pending" ? "PENDING" : "REVOKED"}
              </span>
            </td>
            <td className="muted">{u.discord_linked ? "🔗 linked" : "—"}</td>
            <td style={{ display: "flex", gap: 6 }}>
              {u.status !== "active" && <button className="small" onClick={() => onUpdate(u, { status: "active" })}>Validate</button>}
              {u.status === "active" && <button className="ghost small" onClick={() => onUpdate(u, { status: "revoked" })}>Revoke</button>}
              <button className="ghost small" onClick={() => onResetPassword(u)}>Reset pwd</button>
            </td>
          </tr>
        ))}
        {users.length === 0 && <tr><td colSpan={7} className="muted">Nobody.</td></tr>}
      </tbody>
    </table>
  );
}
