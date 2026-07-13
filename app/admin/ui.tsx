"use client";
import { useEffect, useState } from "react";

type User = { id: number; matricule: string; codename: string; clearance: number; role: string; status: string; discord_linked: boolean; created_at: string };
type Folder = { id: number; name: string };
type LogRow = { id: number; matricule: string; action: string; target: string; created_at: string };

export default function AdminUI() {
  const [tab, setTab] = useState<"agents" | "settings" | "audit">("agents");
  return (
    <>
      <div className="topbar">
        <div className="logo">
          <a href="/dashboard"><button className="ghost small">← Archives</button></a>
          <h1>Command</h1>
        </div>
        <div className="tabs" style={{ marginBottom: 0, width: 420 }}>
          <button className={tab === "agents" ? "" : "inactive"} onClick={() => setTab("agents")}>Agents</button>
          <button className={tab === "settings" ? "" : "inactive"} onClick={() => setTab("settings")}>Settings</button>
          <button className={tab === "audit" ? "" : "inactive"} onClick={() => setTab("audit")}>Audit log</button>
        </div>
      </div>
      <div className="container">
        {tab === "agents" && <AgentsTab />}
        {tab === "settings" && <SettingsTab />}
        {tab === "audit" && <AuditTab />}
      </div>
    </>
  );
}

// ---------------- Agents ----------------
function AgentsTab() {
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
    const res = await fetch("/api/admin/users", { method: "PATCH", body: JSON.stringify({ ...u, ...patch }) });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    load();
  }

  function resetPassword(u: User) {
    const pwd = window.prompt(`New temporary password for ${u.matricule} (${u.codename}) — they will be forced to change it at next sign-in:`);
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
    setCreated(`Account created: badge ${data.matricule}. They must change this temporary password at first sign-in. Personnel file generated.`);
    setCodename(""); setPassword(""); setBadge("");
    load();
  }

  const pending = users.filter((u) => u.status === "pending");
  const others = users.filter((u) => u.status !== "pending");

  return (
    <>
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
          <h2>Recruits awaiting validation ({pending.length})</h2>
          <UserTable users={pending} onUpdate={update} onResetPassword={resetPassword} />
        </div>
      )}
      <div className="panel">
        <h2>Registered agents</h2>
        <UserTable users={others} onUpdate={update} onResetPassword={resetPassword} />
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
            <td className="muted">{u.discord_linked ? "linked" : "—"}</td>
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

// ---------------- Settings ----------------
function SettingsTab() {
  const [settings, setSettings] = useState<Record<string, string | null>>({});
  const [folders, setFolders] = useState<Folder[]>([]);
  const [saved, setSaved] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/settings");
    if (res.ok) { const d = await res.json(); setSettings(d.settings); setFolders(d.folders); }
  }
  useEffect(() => { load(); }, []);

  async function save(patch: Record<string, string>) {
    setSaved(false);
    await fetch("/api/admin/settings", { method: "POST", body: JSON.stringify(patch) });
    setSaved(true);
    load();
  }

  return (
    <div className="panel">
      <h2>Automatic documents</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        When an account is created, an administrative <strong>personnel file</strong> is generated automatically.
        Choose which folder it lands in.
      </p>
      <label className="muted" style={{ display: "block", marginBottom: 4 }}>Personnel files destination folder</label>
      <select
        value={settings.personnel_folder_id || ""}
        onChange={(e) => save({ personnel_folder_id: e.target.value })}
        style={{ maxWidth: 360 }}
      >
        <option value="">— No folder (root) —</option>
        {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>

      <h2 style={{ marginTop: 24 }}>Access</h2>
      <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
        <input
          type="checkbox"
          style={{ width: "auto", marginBottom: 0 }}
          checked={settings.public_registration !== "off"}
          onChange={(e) => save({ public_registration: e.target.checked ? "on" : "off" })}
        />
        <span>Allow public enlistment (recruits can self-register and await validation)</span>
      </label>

      {saved && <p className="success" style={{ marginTop: 14 }}>✓ Settings saved.</p>}
    </div>
  );
}

// ---------------- Audit ----------------
const ACTION_LABELS: Record<string, string> = {
  login: "Signed in", login_failed: "Failed sign-in", register: "Enlisted",
  discord_login: "Signed in (Discord)", discord_link: "Linked Discord",
  doc_create: "Created document", doc_import: "Imported document", doc_open: "Opened document",
  doc_save: "Saved document", doc_destroy: "Destroyed document", doc_share: "Shared document", doc_unshare: "Revoked share",
  folder_create: "Created folder", folder_invite: "Invited to folder", folder_uninvite: "Removed from folder",
  account_create: "Created account", account_update: "Updated account", password_reset: "Reset password",
  password_change: "Changed password", settings_update: "Updated settings",
};

function AuditTab() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");

  async function load() {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (action) p.set("action", action);
    const res = await fetch(`/api/admin/audit?${p}`);
    if (res.ok) setLogs(await res.json());
  }
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [q, action]);

  return (
    <div className="panel">
      <h2>Audit log — who did what</h2>
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <input placeholder="Filter by badge or target…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 0, flex: 2 }} />
        <select value={action} onChange={(e) => setAction(e.target.value)} style={{ marginBottom: 0, flex: 1 }}>
          <option value="">All actions</option>
          {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <table>
        <thead>
          <tr><th>Time</th><th>Agent</th><th>Action</th><th>Target</th></tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <td className="muted mono" style={{ whiteSpace: "nowrap" }}>{new Date(l.created_at).toLocaleString("en-US")}</td>
              <td className="mono">{l.matricule}</td>
              <td><span className={l.action === "login_failed" ? "classif high" : ""}>{ACTION_LABELS[l.action] || l.action}</span></td>
              <td className="muted">{l.target}</td>
            </tr>
          ))}
          {logs.length === 0 && <tr><td colSpan={4} className="muted">No entries.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
