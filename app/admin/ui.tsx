"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast, confirmDialog, promptDialog } from "@/lib/ui-store";

type User = { id: number; matricule: string; codename: string; clearance: number; role: string; status: string; division: string; discord_linked: boolean; moodle_synced: boolean; created_at: string };
type Folder = { id: number; name: string };
type LogRow = { id: number; matricule: string; action: string; target: string; created_at: string };
type Template = { id: number; name: string; filetype: string; created_at: string; editable: boolean; variables: string[] };

export default function AdminUI({ myClearance, myId }: { myClearance: number; myId: number }) {
  const [tab, setTab] = useState<"agents" | "divisions" | "requests" | "missions" | "templates" | "settings" | "audit">("agents");
  return (
    <>
      <div className="topbar">
        <div className="logo">
          <a href="/dashboard"><button className="ghost small">← Archives</button></a>
          <h1>Command</h1>
        </div>
        <div className="tabs" style={{ marginBottom: 0, width: 840 }}>
          <button className={tab === "agents" ? "" : "inactive"} onClick={() => setTab("agents")}>Agents</button>
          <button className={tab === "divisions" ? "" : "inactive"} onClick={() => setTab("divisions")}>Divisions</button>
          <button className={tab === "requests" ? "" : "inactive"} onClick={() => setTab("requests")}>Requests</button>
          <button className={tab === "missions" ? "" : "inactive"} onClick={() => setTab("missions")}>Missions</button>
          <button className={tab === "templates" ? "" : "inactive"} onClick={() => setTab("templates")}>Templates</button>
          <button className={tab === "settings" ? "" : "inactive"} onClick={() => setTab("settings")}>Settings</button>
          <button className={tab === "audit" ? "" : "inactive"} onClick={() => setTab("audit")}>Audit log</button>
        </div>
      </div>
      <div className="container">
        {tab === "agents" && <AgentsTab myClearance={myClearance} myId={myId} />}
        {tab === "divisions" && <DivisionsTab />}
        {tab === "requests" && <RequestsTab />}
        {tab === "missions" && <MissionsTab myClearance={myClearance} />}
        {tab === "templates" && <TemplatesTab myClearance={myClearance} />}
        {tab === "settings" && <SettingsTab />}
        {tab === "audit" && <AuditTab />}
      </div>
    </>
  );
}

// ---------------- Agents ----------------
function AgentsTab({ myClearance, myId }: { myClearance: number; myId: number }) {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [codename, setCodename] = useState("");
  const [password, setPassword] = useState("");
  const [badge, setBadge] = useState("");
  const [division, setDivision] = useState("");
  const [clearance, setClearance] = useState(1);
  const [created, setCreated] = useState("");
  const maxLevel = Math.max(1, myClearance - 1); // can only assign below own clearance

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

  async function resetPassword(u: User) {
    const pwd = await promptDialog({ title: `Reset password — ${u.matricule}`, message: `${u.codename} will be forced to change it at next sign-in.`, placeholder: "New temporary password", password: true });
    if (pwd) { update(u, { new_password: pwd }); toast("Temporary password set.", "success"); }
  }

  async function deleteAgent(u: User) {
    const ok = await confirmDialog({ title: `Delete agent ${u.matricule}?`, message: `${u.codename} will be permanently removed. Their documents are kept but unassigned. This cannot be undone.`, confirmLabel: "Delete agent", danger: true });
    if (!ok) return;
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    if (!res.ok) return setError((await res.json()).error);
    toast("Agent deleted.", "success");
    load();
  }

  async function genFile(u: User) {
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "POST" });
    toast(res.ok ? "Personnel file regenerated." : "Failed.", res.ok ? "success" : "error");
  }

  // Renaming rewrites the agent's identity everywhere: personnel file, Academy username.
  // Confirm the badge change explicitly — it is what the agent signs in with.
  async function rename(u: User, patch: { matricule?: string; codename?: string }) {
    if (patch.matricule) {
      const ok = await confirmDialog({
        title: `Change badge ${u.matricule} → ${patch.matricule.trim().toUpperCase()}?`,
        message: `The badge is ${u.codename}'s sign-in name, on the portal and at the Academy. They will be notified on Discord. Their password is unchanged.`,
        confirmLabel: "Change badge",
      });
      if (!ok) return load(); // reload to snap the input back
    }
    const res = await fetch("/api/admin/users", { method: "PATCH", body: JSON.stringify({ ...u, ...patch }) });
    const data = await res.json();
    if (!res.ok) { setError(data.error); return load(); }
    toast("Agent updated.", "success");
    load();
  }

  // We only ever hold a bcrypt hash, so a manual sync cannot carry the agent's real
  // password across — be explicit about it rather than implying the accounts match.
  async function academySync(u: User) {
    const ok = await confirmDialog({
      title: `Create Academy account — ${u.matricule}?`,
      message:
        `An Academy account will be created for ${u.codename}. Their portal password cannot be copied over ` +
        `(the portal only stores an encrypted hash), so the Academy password will differ until ${u.codename} ` +
        `changes their portal password — or you reset it for them.`,
      confirmLabel: "Create account",
    });
    if (!ok) return;
    const res = await fetch("/api/admin/academy-sync", { method: "POST", body: JSON.stringify({ id: u.id }) });
    const d = await res.json();
    if (!res.ok) return toast(d.error || "Academy sync failed.", "error");
    toast(d.created ? "Academy account created. Password not synced yet." : "Academy account updated.", "success");
    load();
  }

  async function createAgent(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreated("");
    const res = await fetch("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ codename, password, clearance, matricule: badge, division }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setCreated(`Account created: badge ${data.matricule}. They must change this temporary password at first sign-in. Personnel file generated.`);
    setCodename(""); setPassword(""); setBadge(""); setDivision("");
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
          <input placeholder="DIVISION (optional)" value={division} onChange={(e) => setDivision(e.target.value)} style={{ marginBottom: 0, flex: 1, minWidth: 120 }} />
          <input placeholder="TEMPORARY PASSWORD" value={password} onChange={(e) => setPassword(e.target.value)} style={{ marginBottom: 0, flex: 2, minWidth: 140 }} />
          <select value={Math.min(clearance, maxLevel)} onChange={(e) => setClearance(+e.target.value)} style={{ marginBottom: 0, flex: 1 }}>
            {Array.from({ length: maxLevel }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Clearance {n}</option>)}
          </select>
          <button>Create account</button>
        </form>
        <p className="muted" style={{ marginTop: 8 }}>You can assign clearances up to level {maxLevel} (below your own).</p>
      </div>
      {pending.length > 0 && (
        <div className="panel" style={{ borderColor: "#665520" }}>
          <h2>Recruits awaiting validation ({pending.length})</h2>
          <UserTable users={pending} onUpdate={update} onRename={rename} onResetPassword={resetPassword} onDelete={deleteAgent} onGenFile={genFile} onAcademySync={academySync} maxLevel={maxLevel} myId={myId} />
        </div>
      )}
      <div className="panel">
        <h2>Registered agents</h2>
        <UserTable users={others} onUpdate={update} onRename={rename} onResetPassword={resetPassword} onDelete={deleteAgent} onGenFile={genFile} onAcademySync={academySync} maxLevel={maxLevel} myId={myId} />
      </div>
    </>
  );
}

// A synced integration reads as a lit badge; an unsynced one stays dim rather than
// disappearing, so an officer can tell "not linked" from "column missing".
function SyncDot({ on, label, title }: { on: boolean; label: string; title: string }) {
  return <span className={`sync-dot ${on ? "on" : "off"}`} title={title}>{label}</span>;
}

// One readable line per agent. The 8-column table it replaced overflowed the panel
// (Delete was cut off) and turned every field into an always-live input, which read as
// a form rather than a roster. Editing now happens in AgentSheet, behind the ··· button,
// so destructive actions cannot be hit while scanning the list.
function AgentRow({ u, locked, onOpen }: { u: User; locked: boolean; onOpen: () => void }) {
  const statusCls = u.status === "active" ? "low" : u.status === "pending" ? "mid" : "high";
  return (
    <div className={`agent-row ${locked ? "locked" : ""}`}>
      <div className="agent-who">
        <b className="mono">{u.matricule}</b>
        <span>{u.codename}{u.division ? ` · ${u.division}` : ""}</span>
      </div>
      <span className="chip lv mono">LVL. {u.clearance}</span>
      <span className="chip">{u.role === "admin" ? "Officer" : "Agent"}</span>
      <span className={`classif ${statusCls}`}>
        {u.status === "active" ? "ACTIVE" : u.status === "pending" ? "PENDING" : "REVOKED"}
      </span>
      <span className="sync-cell">
        <SyncDot on={u.discord_linked} label="DISCORD"
          title={u.discord_linked ? "Discord account linked" : "No Discord account linked — the agent signs in with their badge only"} />
        <SyncDot on={u.moodle_synced} label="ACADEMY"
          title={u.moodle_synced ? "Academy (Moodle) account provisioned" : "No Academy account — created on next password change or account update"} />
      </span>
      <span className="agent-spacer" />
      {locked ? (
        <span className="muted" style={{ fontSize: ".75rem" }}>Above your clearance</span>
      ) : (
        <button className="ghost small" onClick={onOpen} title="Manage this agent">···</button>
      )}
    </div>
  );
}

// Full edit sheet. Fields are applied on Save, not on every keystroke, so a half-typed
// badge is never sent — the badge is the sign-in name.
function AgentSheet({ u, maxLevel, onClose, onUpdate, onRename, onResetPassword, onDelete, onGenFile, onAcademySync }: {
  u: User; maxLevel: number; onClose: () => void;
  onUpdate: (u: User, p: Partial<User>) => void;
  onRename: (u: User, p: { matricule?: string; codename?: string }) => void;
  onResetPassword: (u: User) => void; onDelete: (u: User) => void;
  onGenFile: (u: User) => void; onAcademySync: (u: User) => void;
}) {
  const [matricule, setMatricule] = useState(u.matricule);
  const [codename, setCodename] = useState(u.codename);
  const [division, setDivision] = useState(u.division);
  const [clearance, setClearance] = useState(u.clearance);
  const [role, setRole] = useState(u.role);

  const dirty = matricule.trim().toUpperCase() !== u.matricule || codename.trim() !== u.codename
    || division !== u.division || clearance !== u.clearance || role !== u.role;

  function save() {
    const patch: any = { division, clearance, role };
    if (matricule.trim().toUpperCase() !== u.matricule) patch.matricule = matricule;
    if (codename.trim() !== u.codename) patch.codename = codename;
    // onRename carries the badge confirmation; onUpdate is enough when identity is untouched.
    (patch.matricule || patch.codename ? onRename : onUpdate)(u, patch);
    onClose();
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal panel" onClick={(e) => e.stopPropagation()}>
        <h2>Agent {u.matricule}</h2>
        <label className="muted sheet-label">Badge number — this is the sign-in name, here and at the Academy</label>
        <input className="mono" value={matricule} onChange={(e) => setMatricule(e.target.value)} />
        <label className="muted sheet-label">Codename</label>
        <input value={codename} onChange={(e) => setCodename(e.target.value)} />
        <label className="muted sheet-label">Division</label>
        <input value={division} placeholder="—" onChange={(e) => setDivision(e.target.value)} />
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label className="muted sheet-label">Clearance</label>
            <select value={clearance} onChange={(e) => setClearance(+e.target.value)}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n} disabled={n > maxLevel && n !== u.clearance}>Lvl. {n}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className="muted sheet-label">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="agent">Agent</option>
              <option value="admin">Officer</option>
            </select>
          </div>
        </div>

        <div className="sheet-actions">
          {u.status !== "active" && <button className="small" onClick={() => { onUpdate(u, { status: "active" }); onClose(); }}>Validate</button>}
          {u.status === "active" && <button className="ghost small" onClick={() => { onUpdate(u, { status: "revoked" }); onClose(); }}>Revoke</button>}
          <button className="ghost small" onClick={() => onGenFile(u)} title="Regenerate personnel file with current data">Gen. file</button>
          {!u.moodle_synced && <button className="ghost small" onClick={() => { onAcademySync(u); onClose(); }}>Sync Academy</button>}
          <button className="ghost small" onClick={() => { onResetPassword(u); onClose(); }}>Reset pwd</button>
          <button className="ghost small danger" onClick={() => { onDelete(u); onClose(); }}>Delete agent</button>
        </div>

        <div className="sheet-footer">
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button disabled={!dirty} onClick={save}>Save changes</button>
        </div>
      </div>
    </div>
  );
}

function UserTable({ users, onUpdate, onRename, onResetPassword, onDelete, onGenFile, onAcademySync, maxLevel, myId }: { users: User[]; onUpdate: (u: User, p: Partial<User>) => void; onRename: (u: User, p: { matricule?: string; codename?: string }) => void; onResetPassword: (u: User) => void; onDelete: (u: User) => void; onGenFile: (u: User) => void; onAcademySync: (u: User) => void; maxLevel: number; myId: number }) {
  const [open, setOpen] = useState<User | null>(null);
  if (!users.length) return <p className="muted">Nobody.</p>;
  return (
    <>
      {users.map((u) => {
        // maxLevel = own clearance - 1. An agent at/above the officer's clearance is off-limits (except self).
        const locked = u.id !== myId && u.clearance > maxLevel;
        return <AgentRow key={u.id} u={u} locked={locked} onOpen={() => setOpen(u)} />;
      })}
      {open && (
        <AgentSheet
          u={open} maxLevel={maxLevel} onClose={() => setOpen(null)}
          onUpdate={onUpdate} onRename={onRename} onResetPassword={onResetPassword}
          onDelete={onDelete} onGenFile={onGenFile} onAcademySync={onAcademySync}
        />
      )}
    </>
  );
}

// ---------------- Access requests ----------------
type AccessReq = { id: number; doc_id: number; reason: string; created_at: string; title: string; classification: number; matricule: string; codename: string; clearance: number };

function RequestsTab() {
  const [reqs, setReqs] = useState<AccessReq[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch("/api/admin/requests");
    if (res.ok) setReqs(await res.json());
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function decide(r: AccessReq, approve: boolean) {
    const res = await fetch("/api/admin/requests", { method: "PATCH", body: JSON.stringify({ id: r.id, approve }) });
    if (!res.ok) return toast((await res.json()).error, "error");
    toast(approve ? `Access granted to ${r.codename}.` : "Request denied.", approve ? "success" : "info");
    load();
  }

  return (
    <div className="panel">
      <h2>Pending access requests</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        Approving grants an explicit share — it overrides both the clearance level and any private-folder restriction.
      </p>
      {loading ? <div className="skeleton" style={{ height: 80 }} /> : reqs.length === 0 ? (
        <div className="empty">
          <div className="empty-mark">[ ▚ ]</div>
          <div className="empty-title">No pending requests</div>
        </div>
      ) : (
        <table>
          <thead>
            <tr><th>Agent</th><th>Document</th><th>Classification</th><th>Reason</th><th>When</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {reqs.map((r) => (
              <tr key={r.id}>
                <td><span className="mono">{r.matricule}</span> · {r.codename} <span className="muted">lvl.{r.clearance}</span></td>
                <td><a href={`/doc/${r.doc_id}`}>{r.title}</a></td>
                <td><span className={`classif ${r.classification >= 7 ? "high" : r.classification >= 4 ? "mid" : "low"}`}>LVL.{r.classification}</span></td>
                <td className="muted">{r.reason || "—"}</td>
                <td className="muted">{new Date(r.created_at).toLocaleString("en-US")}</td>
                <td style={{ display: "flex", gap: 6 }}>
                  <button className="small" onClick={() => decide(r, true)}>Grant</button>
                  <button className="ghost small danger" onClick={() => decide(r, false)}>Deny</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------- Missions ----------------
type Mission = {
  id: number; code: string; objective: string; location: string | null; priority: string | null;
  classification: number; status: string; doc_id: number | null; created_at: string;
  closed_at: string | null; report: string | null; division: string;
  created_by_codename: string | null;
  agents: { id: number; matricule: string; codename: string }[];
};

function MissionsTab({ myClearance }: { myClearance: number }) {
  const router = useRouter();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [f, setF] = useState({ code: "", objective: "", matricule: "", location: "", priority: "Routine", classification: 1, briefing: "", division: "" });
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));

  async function load() {
    const res = await fetch("/api/missions");
    if (res.ok) setMissions(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function issue(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/missions", { method: "POST", body: JSON.stringify(f) });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    toast(`Mission ${f.code.toUpperCase()} opened.`, "success");
    setF({ code: "", objective: "", matricule: "", location: "", priority: "Routine", classification: 1, briefing: "", division: "" });
    setShowForm(false);
    load();
  }

  async function setStatus(m: Mission, status: string) {
    if (status !== "active") {
      const ok = await confirmDialog({
        title: `Mark ${m.code} as ${status}?`,
        message: `The assigned agents will be notified on Discord that the mission is ${status}.`,
        confirmLabel: status === "completed" ? "Mark completed" : "Abort mission",
        danger: status === "aborted",
      });
      if (!ok) return;
    }
    const res = await fetch(`/api/missions/${m.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    if (!res.ok) return toast((await res.json()).error, "error");
    toast(`${m.code} — ${status}.`, "success");
    load();
  }

  async function fileReport(m: Mission) {
    const report = await promptDialog({
      title: `After-action report — ${m.code}`,
      message: "What happened? This is stored on the mission, not in the order document.",
      placeholder: "Outcome, assets recovered, casualties…",
      defaultValue: m.report || "",
    });
    if (report === null) return;
    const res = await fetch(`/api/missions/${m.id}`, { method: "PATCH", body: JSON.stringify({ report }) });
    if (!res.ok) return toast((await res.json()).error, "error");
    toast("Report filed.", "success");
    load();
  }

  const active = missions.filter((m) => m.status === "active");
  const closed = missions.filter((m) => m.status !== "active");

  return (
    <>
      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ marginBottom: 0 }}>Missions ({active.length} active)</h2>
          <button className="small" onClick={() => setShowForm(!showForm)}>{showForm ? "Cancel" : "New mission"}</button>
        </div>
        {error && <p className="error" style={{ marginTop: 12 }}>⚠ {error}</p>}
        {showForm && (
          <form onSubmit={issue} style={{ marginTop: 14 }}>
            <p className="muted" style={{ marginBottom: 10 }}>
              Opens a tracked mission and generates its classified order document. Assigned agents get the
              order shared with them and a Discord transmission.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input placeholder="MISSION CODE (e.g. OP-INSIGHT)" value={f.code} onChange={(e) => set("code", e.target.value)} style={{ marginBottom: 0, flex: 2, minWidth: 180 }} />
              <input placeholder="ASSIGNED AGENTS — badges, comma-separated" value={f.matricule} onChange={(e) => set("matricule", e.target.value)} style={{ marginBottom: 0, flex: 2, minWidth: 220 }} />
            </div>
            <input placeholder="OBJECTIVE" value={f.objective} onChange={(e) => set("objective", e.target.value)} style={{ marginTop: 10 }} />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input placeholder="LOCATION" value={f.location} onChange={(e) => set("location", e.target.value)} style={{ marginBottom: 0, flex: 2, minWidth: 150 }} />
              <input placeholder="DIVISION (optional)" value={f.division} onChange={(e) => set("division", e.target.value)} style={{ marginBottom: 0, flex: 1, minWidth: 140 }} />
              <select value={f.priority} onChange={(e) => set("priority", e.target.value)} style={{ marginBottom: 0, flex: 1 }}>
                <option>Routine</option><option>Priority</option><option>Critical</option>
              </select>
              <select value={f.classification} onChange={(e) => set("classification", +e.target.value)} style={{ marginBottom: 0, flex: 1 }}>
                {Array.from({ length: myClearance }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Classification {n}</option>)}
              </select>
            </div>
            <textarea placeholder="BRIEFING (optional)" value={f.briefing} onChange={(e) => set("briefing", e.target.value)} rows={3} style={{ marginTop: 10 }} />
            <button style={{ marginTop: 10 }}>Open mission</button>
          </form>
        )}
      </div>

      <div className="panel">
        <h2>Active</h2>
        {active.length === 0 && <p className="muted">No active mission.</p>}
        {active.map((m) => <MissionRow key={m.id} m={m} onStatus={setStatus} onReport={fileReport} router={router} />)}
      </div>

      {closed.length > 0 && (
        <div className="panel">
          <h2>Archive ({closed.length})</h2>
          {closed.map((m) => <MissionRow key={m.id} m={m} onStatus={setStatus} onReport={fileReport} router={router} />)}
        </div>
      )}
    </>
  );
}

function MissionRow({ m, onStatus, onReport, router }: { m: Mission; onStatus: (m: Mission, s: string) => void; onReport: (m: Mission) => void; router: any }) {
  const cls = m.status === "active" ? "mid" : m.status === "completed" ? "low" : "high";
  return (
    <div className="mission-row">
      <div className="mission-head">
        <b className="mono">{m.code}</b>
        <span className={`classif ${cls}`}>{m.status.toUpperCase()}</span>
        <span className="chip lv mono">LVL. {m.classification}</span>
        {m.priority && <span className="chip">{m.priority}</span>}
        {m.division && <span className="chip">{m.division}</span>}
        <span className="agent-spacer" />
        {m.doc_id && <button className="ghost small" onClick={() => router.push(`/doc/${m.doc_id}`)}>Order</button>}
        <button className="ghost small" onClick={() => onReport(m)}>{m.report ? "Report ✓" : "Report"}</button>
        {m.status === "active" ? (
          <>
            <button className="ghost small" onClick={() => onStatus(m, "completed")}>Complete</button>
            <button className="ghost small danger" onClick={() => onStatus(m, "aborted")}>Abort</button>
          </>
        ) : (
          <button className="ghost small" onClick={() => onStatus(m, "active")}>Reopen</button>
        )}
      </div>
      <div className="mission-obj">{m.objective}</div>
      <div className="mission-meta muted">
        {m.location ? `${m.location} · ` : ""}
        {m.agents.length ? m.agents.map((a) => `${a.matricule} (${a.codename})`).join(", ") : "No agent assigned"}
      </div>
      {m.report && <div className="mission-report">{m.report}</div>}
    </div>
  );
}

// ---------------- Divisions ----------------
type Division = {
  id: number; name: string; lead_id: number | null; folder_id: number | null;
  folder_name: string | null; lead_matricule: string | null; lead_codename: string | null; members: number;
};

function DivisionsTab() {
  const [divs, setDivs] = useState<Division[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [d, u] = await Promise.all([fetch("/api/divisions"), fetch("/api/admin/users")]);
    if (d.ok) setDivs(await d.json());
    if (u.ok) setUsers(await u.json());
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/divisions", { method: "POST", body: JSON.stringify({ name }) });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setName("");
    toast("Division created.", "success");
    load();
  }

  async function patch(d: Division, body: any, okMsg: string) {
    const res = await fetch("/api/divisions", { method: "PATCH", body: JSON.stringify({ id: d.id, ...body }) });
    const data = await res.json();
    if (!res.ok) return toast(data.error, "error");
    toast(okMsg, "success");
    load();
  }

  return (
    <>
      <div className="panel">
        <h2>Create a division</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          A division is a real team: members, a lead, and an optional shared folder. Assign agents to it
          from the Agents tab.
        </p>
        {error && <p className="error">⚠ {error}</p>}
        <form onSubmit={create} style={{ display: "flex", gap: 10 }}>
          <input placeholder="DIVISION NAME (e.g. Intelligence)" value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 0, flex: 1 }} />
          <button>Create</button>
        </form>
      </div>

      <div className="panel">
        <h2>Divisions</h2>
        {divs.length === 0 && <p className="muted">No division yet.</p>}
        {divs.map((d) => {
          const members = users.filter((u) => u.division === d.name && u.status === "active");
          return (
            <div key={d.id} className="agent-row">
              <div className="agent-who">
                <b>{d.name}</b>
                <span>{d.members} agent{d.members > 1 ? "s" : ""}{d.lead_codename ? ` · led by ${d.lead_codename}` : ""}</span>
              </div>
              <select
                value={d.lead_id ?? ""}
                onChange={(e) => patch(d, { lead_id: e.target.value || null }, "Division lead updated.")}
                style={{ marginBottom: 0, width: 190 }}
                title="The lead must be a member of this division"
              >
                <option value="">— No lead —</option>
                {members.map((u) => <option key={u.id} value={u.id}>{u.codename} ({u.matricule})</option>)}
              </select>
              {d.folder_id ? (
                <span className="chip lv" title={d.folder_name || ""}>SHARED FOLDER</span>
              ) : (
                <button className="ghost small" onClick={() => patch(d, { create_folder: true }, "Shared folder created.")}>
                  Create shared folder
                </button>
              )}
              {d.folder_id && (
                <button className="ghost small" onClick={() => patch(d, { create_folder: true }, "Members synced to the folder.")} title="Add members who joined since">
                  Sync members
                </button>
              )}
              <span className="agent-spacer" />
              <button
                className="ghost small"
                onClick={async () => {
                  const n = await promptDialog({ title: "Rename division", message: `Current name: “${d.name}”.`, placeholder: "New name", defaultValue: d.name });
                  if (n && n.trim() !== d.name) patch(d, { name: n }, "Division renamed.");
                }}
              >
                Rename
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------------- Templates ----------------
const TPL_TAG: Record<string, string> = { docx: "DOC", xlsx: "XLS", pptx: "PPT" };
// Kept in sync with lib/docxgen.ts (SYSTEM_VARS / SUGGESTED_VARS).
const SYSTEM_VARS = ["date", "officer", "officer badge"];
const SUGGESTED_VARS = ["agent", "codename", "badge", "clearance", "division", "duty station", "mission code", "objective", "location", "target", "status", "priority"];

function TemplatesTab({ myClearance }: { myClearance: number }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [useTpl, setUseTpl] = useState<Template | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  function insertVar(name: string) {
    const ta = bodyRef.current;
    const token = `{{${name}}}`;
    if (!ta) { setBody(body + token); return; }
    const start = ta.selectionStart, end = ta.selectionEnd;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + token.length; });
  }

  async function load() {
    const res = await fetch("/api/admin/templates");
    if (res.ok) setTemplates(await res.json());
    const f = await fetch("/api/folders");
    if (f.ok) setFolders(await f.json());
  }
  useEffect(() => { load(); }, []);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    const form = new FormData();
    form.append("file", file);
    form.append("name", name);
    const res = await fetch("/api/admin/templates", { method: "POST", body: form });
    if (!res.ok) return setError((await res.json()).error);
    setName("");
    load();
  }

  async function saveText(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setSaved("");
    const res = await fetch("/api/admin/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, body }),
    });
    if (!res.ok) return setError((await res.json()).error);
    setName(""); setBody(""); setSaved("Template saved.");
    load();
  }

  async function del(t: Template) {
    const ok = await confirmDialog({ title: `Delete template “${t.name}”?`, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    await fetch(`/api/admin/templates/${t.id}`, { method: "DELETE" });
    toast("Template deleted.", "success");
    load();
  }

  const detectedVars = Array.from(new Set((body.match(/\{\{\s*([\w -]+?)\s*\}\}/g) || []).map((v) => v.replace(/[{}]/g, "").trim())));

  return (
    <>
      {error && <p className="error">⚠ {error}</p>}
      <div className="panel">
        <h2>Create a template on-site</h2>
        <p className="muted" style={{ marginBottom: 10 }}>
          Write the document content below. Start a line with <span className="mono">#</span> for a heading.
          Insert fill-in fields with <span className="mono">{"{{double braces}}"}</span> — e.g. <span className="mono">{"{{agent name}}"}</span>,
          <span className="mono"> {"{{mission code}}"}</span>. You'll be prompted for each when creating a document.
        </p>
        <div style={{ marginBottom: 10 }}>
          <p className="muted" style={{ marginBottom: 4 }}>Auto-filled at creation (click to insert):</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {SYSTEM_VARS.map((v) => (
              <button type="button" key={v} className="tag t-xlsx" style={{ cursor: "pointer", border: "none" }} onClick={() => insertVar(v)}>{v}</button>
            ))}
          </div>
          <p className="muted" style={{ marginBottom: 4 }}>Fill-in fields (prompted at creation):</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SUGGESTED_VARS.map((v) => (
              <button type="button" key={v} className="tag t-folder" style={{ cursor: "pointer", border: "none" }} onClick={() => insertVar(v)}>{v}</button>
            ))}
          </div>
        </div>
        <form onSubmit={saveText}>
          <input placeholder="TEMPLATE NAME" value={name} onChange={(e) => setName(e.target.value)} />
          <textarea
            ref={bodyRef}
            placeholder={"# MISSION ORDER\n\nAgent: {{agent}}\nBadge: {{badge}}\nObjective: {{objective}}\n\nAuthorized by: {{officer}}\nDate: {{date}}"}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            style={{ width: "100%", padding: "10px 12px", background: "#0a101a", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text)", fontFamily: "Consolas, monospace", marginBottom: 10 }}
          />
          {detectedVars.length > 0 && (
            <p className="muted" style={{ marginBottom: 10 }}>Detected fields: {detectedVars.map((v) => <span key={v} className={`tag ${SYSTEM_VARS.includes(v) ? "t-xlsx" : "t-folder"}`} style={{ marginRight: 6 }}>{v}</span>)}</p>
          )}
          {saved && <p className="success">✓ {saved}</p>}
          <button>Save template</button>
        </form>
      </div>
      <div className="panel">
        <h2>Or upload a file template</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input placeholder="TEMPLATE NAME (optional)" value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 0, flex: 2, minWidth: 180 }} />
          <button type="button" onClick={() => fileInput.current?.click()}>Choose file (.docx/.xlsx/.pptx)</button>
          <input ref={fileInput} type="file" accept=".docx,.xlsx,.pptx" style={{ display: "none" }} onChange={upload} />
        </div>
      </div>
      <div className="panel">
        <h2>Templates — create a document from one</h2>
        <div className="cards">
          {templates.map((t) => (
            <div key={t.id} className={`card t-${t.filetype}`}>
              <div className="card-top">
                <span className={`tag t-${t.filetype}`}>{t.editable ? "TPL" : TPL_TAG[t.filetype]}</span>
                <span className="card-actions" style={{ display: "inline-flex" }}>
                  <button className="ghost small" onClick={() => del(t)} title="Delete template">✕</button>
                </span>
              </div>
              <div className="card-title">{t.name}</div>
              {t.variables.length > 0 && <div className="card-meta muted" style={{ fontSize: "0.72rem" }}>{t.variables.length} field(s)</div>}
              <div className="card-meta"><button className="small" onClick={() => setUseTpl(t)}>New document</button></div>
            </div>
          ))}
          {templates.length === 0 && <p className="muted">No templates yet.</p>}
        </div>
      </div>
      {useTpl && <FromTemplateModal template={useTpl} folders={folders} maxLevel={myClearance} onClose={() => setUseTpl(null)} />}
    </>
  );
}

function FromTemplateModal({ template, folders, maxLevel, onClose }: { template: Template; folders: Folder[]; maxLevel: number; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [classification, setClassification] = useState(1);
  const [folderId, setFolderId] = useState("");
  const [vars, setVars] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch(`/api/admin/templates/${template.id}/new`, {
      method: "POST",
      body: JSON.stringify({ title, classification, folder_id: folderId ? +folderId : null, vars }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    router.push(`/doc/${data.id}`);
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal panel" onClick={(e) => e.stopPropagation()}>
        <h2>New document — {template.name}</h2>
        {error && <p className="error">⚠ {error}</p>}
        <form onSubmit={create}>
          <input autoFocus placeholder="DOCUMENT TITLE" value={title} onChange={(e) => setTitle(e.target.value)} />
          {template.variables.length > 0 && (
            <>
              <p className="muted" style={{ margin: "4px 0 8px" }}>Fill in the template fields:</p>
              {template.variables.map((v) => (
                <input key={v} placeholder={v.toUpperCase()} value={vars[v] || ""} onChange={(e) => setVars({ ...vars, [v]: e.target.value })} />
              ))}
            </>
          )}
          <select value={classification} onChange={(e) => setClassification(+e.target.value)}>
            {Array.from({ length: maxLevel }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Classification level {n}</option>)}
          </select>
          <select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            <option value="">— Drive root —</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <button style={{ width: "100%" }}>Create document</button>
        </form>
        <button className="ghost" style={{ marginTop: 10, width: "100%" }} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

// ---------------- Settings ----------------
type Integration = { configured: boolean; reachable: boolean; linked: number | null };
type Integrations = { total: number; discord: Integration; academy: Integration; office: Integration };

function IntegrationsPanel() {
  const [d, setD] = useState<Integrations | null>(null);
  const [busy, setBusy] = useState(false);
  function load() { fetch("/api/admin/integrations").then((r) => r.ok && r.json()).then((x) => x && setD(x)); }
  useEffect(() => { load(); }, []);

  async function syncAll() {
    const missing = d ? d.total - d.academy.linked! : 0;
    const ok = await confirmDialog({
      title: `Create Academy accounts for ${missing} agent(s)?`,
      message:
        "Agents created before the Academy have no account. Portal passwords cannot be copied over " +
        "(only an encrypted hash is stored), so each agent's Academy password will differ until they " +
        "change their portal password.",
      confirmLabel: "Create accounts",
    });
    if (!ok) return;
    setBusy(true);
    const res = await fetch("/api/admin/academy-sync", { method: "POST", body: JSON.stringify({}) });
    const r = await res.json();
    setBusy(false);
    if (!res.ok) return toast(r.error || "Academy sync failed.", "error");
    toast(`${r.created} account(s) created${r.failed ? `, ${r.failed} failed` : ""}.`, r.failed ? "error" : "success");
    load();
  }

  const row = (name: string, i: Integration, note: string) => {
    const state = !i.configured ? "Not configured" : i.reachable ? "Online" : "Unreachable";
    const cls = !i.configured ? "off" : i.reachable ? "on" : "bad";
    return (
      <tr key={name}>
        <td className="mono">{name}</td>
        <td><span className={`sync-dot ${cls}`}>{state.toUpperCase()}</span></td>
        <td className="muted">{i.linked === null ? "—" : `${i.linked} / ${d!.total} agents`}</td>
        <td className="muted">{note}</td>
      </tr>
    );
  };

  return (
    <div className="panel">
      <h2>Integrations</h2>
      {!d ? <div className="skeleton" style={{ height: 80 }} /> : (
        <table>
          <thead><tr><th>System</th><th>Status</th><th>Linked</th><th></th></tr></thead>
          <tbody>
            {row("DISCORD", d.discord, "OAuth sign-in and automatic DMs")}
            {row("ACADEMY", d.academy, "Moodle accounts, same badge and password")}
            {row("OFFICE", d.office, "Document Server: editing and PDF export")}
          </tbody>
        </table>
      )}
      {d && d.academy.configured && d.academy.linked! < d.total && (
        <p className="muted" style={{ marginTop: 12 }}>
          {d.total - d.academy.linked!} agent(s) have no Academy account — accounts are provisioned automatically
          only when the portal knows the password (creation, password change).{" "}
          <button className="ghost small" disabled={busy} onClick={syncAll}>
            {busy ? "Creating…" : "Create them now"}
          </button>
        </p>
      )}
    </div>
  );
}

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
    <>
    <IntegrationsPanel />
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
    </>
  );
}

// ---------------- Audit ----------------
const ACTION_LABELS: Record<string, string> = {
  mission_create: "Mission opened", mission_status: "Mission status", mission_report: "After-action report",
  mission_delete: "Mission deleted",
  division_create: "Division created", division_rename: "Division renamed",
  division_lead: "Division lead set", division_folder: "Division folder",
  account_rename: "Agent renamed", academy_sync: "Academy sync",
  doc_rename: "Document renamed", doc_classify: "Reclassified", folder_rename: "Folder renamed",
  doc_pdf: "PDF export", doc_pdf_redacted: "PDF export (redacted)",
  login: "Signed in", login_failed: "Failed sign-in", register: "Enlisted",
  discord_login: "Signed in (Discord)", discord_link: "Linked Discord",
  doc_create: "Created document", doc_import: "Imported document", doc_open: "Opened document",
  doc_save: "Saved document", doc_destroy: "Destroyed document", doc_share: "Shared document", doc_unshare: "Revoked share",
  folder_create: "Created folder", folder_invite: "Invited to folder", folder_uninvite: "Removed from folder",
  account_create: "Created account", account_update: "Updated account", account_delete: "Deleted account", password_reset: "Reset password",
  password_change: "Changed password", settings_update: "Updated settings",
  template_upload: "Uploaded template", template_create: "Created template", template_delete: "Deleted template", doc_from_template: "Created from template",
  folder_delete: "Deleted folder", doc_open_redacted: "Opened (redacted)", doc_move: "Moved document",
  doc_public_on: "Enabled public link", doc_public_off: "Disabled public link", mission_order: "Issued mission order",
  personnel_file: "Regenerated personnel file",
  access_request: "Requested access", access_granted: "Granted access", access_denied: "Denied access",
  doc_blocked: "Hit a restricted document",
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
