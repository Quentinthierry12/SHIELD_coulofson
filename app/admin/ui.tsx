"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast, confirmDialog, promptDialog } from "@/lib/ui-store";

type User = { id: number; matricule: string; codename: string; clearance: number; role: string; status: string; division: string; discord_linked: boolean; created_at: string };
type Folder = { id: number; name: string };
type LogRow = { id: number; matricule: string; action: string; target: string; created_at: string };
type Template = { id: number; name: string; filetype: string; created_at: string; editable: boolean; variables: string[] };

export default function AdminUI({ myClearance, myId }: { myClearance: number; myId: number }) {
  const [tab, setTab] = useState<"agents" | "missions" | "templates" | "settings" | "audit">("agents");
  return (
    <>
      <div className="topbar">
        <div className="logo">
          <a href="/dashboard"><button className="ghost small">← Archives</button></a>
          <h1>Command</h1>
        </div>
        <div className="tabs" style={{ marginBottom: 0, width: 640 }}>
          <button className={tab === "agents" ? "" : "inactive"} onClick={() => setTab("agents")}>Agents</button>
          <button className={tab === "missions" ? "" : "inactive"} onClick={() => setTab("missions")}>Missions</button>
          <button className={tab === "templates" ? "" : "inactive"} onClick={() => setTab("templates")}>Templates</button>
          <button className={tab === "settings" ? "" : "inactive"} onClick={() => setTab("settings")}>Settings</button>
          <button className={tab === "audit" ? "" : "inactive"} onClick={() => setTab("audit")}>Audit log</button>
        </div>
      </div>
      <div className="container">
        {tab === "agents" && <AgentsTab myClearance={myClearance} myId={myId} />}
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
          <UserTable users={pending} onUpdate={update} onResetPassword={resetPassword} onDelete={deleteAgent} onGenFile={genFile} maxLevel={maxLevel} myId={myId} />
        </div>
      )}
      <div className="panel">
        <h2>Registered agents</h2>
        <UserTable users={others} onUpdate={update} onResetPassword={resetPassword} onDelete={deleteAgent} onGenFile={genFile} maxLevel={maxLevel} myId={myId} />
      </div>
    </>
  );
}

function UserTable({ users, onUpdate, onResetPassword, onDelete, onGenFile, maxLevel, myId }: { users: User[]; onUpdate: (u: User, p: Partial<User>) => void; onResetPassword: (u: User) => void; onDelete: (u: User) => void; onGenFile: (u: User) => void; maxLevel: number; myId: number }) {
  return (
    <table>
      <thead>
        <tr><th>Badge</th><th>Codename</th><th>Division</th><th>Clearance</th><th>Role</th><th>Status</th><th>Discord</th><th>Actions</th></tr>
      </thead>
      <tbody>
        {users.map((u) => {
          // maxLevel = own clearance - 1. An agent at/above the officer's clearance is off-limits (except self).
          const locked = u.id !== myId && u.clearance > maxLevel;
          return (
          <tr key={u.id} style={locked ? { opacity: 0.5 } : undefined}>
            <td className="mono">{u.matricule}</td>
            <td>{u.codename}</td>
            <td>
              {locked ? <span className="muted">{u.division || "—"}</span> : (
                <input defaultValue={u.division} placeholder="—" onBlur={(e) => e.target.value !== u.division && onUpdate(u, { division: e.target.value })} style={{ marginBottom: 0, width: 120 }} />
              )}
            </td>
            <td>
              {locked ? <span className="mono">Lvl. {u.clearance}</span> : (
                <select value={u.clearance} onChange={(e) => onUpdate(u, { clearance: +e.target.value })} style={{ marginBottom: 0, width: 90 }}>
                  {Array.from({ length: maxLevel }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Lvl. {n}</option>)}
                </select>
              )}
            </td>
            <td>
              {locked ? <span className="muted">{u.role === "admin" ? "Officer" : "Agent"}</span> : (
                <select value={u.role} onChange={(e) => onUpdate(u, { role: e.target.value })} style={{ marginBottom: 0, width: 110 }}>
                  <option value="agent">Agent</option>
                  <option value="admin">Officer</option>
                </select>
              )}
            </td>
            <td>
              <span className={`classif ${u.status === "active" ? "low" : u.status === "pending" ? "mid" : "high"}`}>
                {u.status === "active" ? "ACTIVE" : u.status === "pending" ? "PENDING" : "REVOKED"}
              </span>
            </td>
            <td className="muted">{u.discord_linked ? "linked" : "—"}</td>
            <td style={{ display: "flex", gap: 6 }}>
              {locked ? <span className="muted">Above your clearance</span> : <>
                {u.status !== "active" && <button className="small" onClick={() => onUpdate(u, { status: "active" })}>Validate</button>}
                {u.status === "active" && <button className="ghost small" onClick={() => onUpdate(u, { status: "revoked" })}>Revoke</button>}
                <button className="ghost small" onClick={() => onGenFile(u)} title="Regenerate personnel file with current data">Gen. file</button>
                <button className="ghost small" onClick={() => onResetPassword(u)}>Reset pwd</button>
                <button className="ghost small danger" onClick={() => onDelete(u)}>Delete</button>
              </>}
            </td>
          </tr>
        );})}
        {users.length === 0 && <tr><td colSpan={8} className="muted">Nobody.</td></tr>}
      </tbody>
    </table>
  );
}

// ---------------- Missions ----------------
function MissionsTab({ myClearance }: { myClearance: number }) {
  const router = useRouter();
  const [f, setF] = useState({ code: "", objective: "", matricule: "", location: "", priority: "Routine", classification: 1, briefing: "" });
  const [error, setError] = useState("");
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));

  async function issue(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/admin/mission-order", { method: "POST", body: JSON.stringify(f) });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    router.push(`/doc/${data.id}`);
  }

  return (
    <div className="panel">
      <h2>Issue a mission order</h2>
      <p className="muted" style={{ marginBottom: 12 }}>Generates a classified mission order document. If an agent is assigned, it is shared with them and they receive a Discord transmission.</p>
      {error && <p className="error">⚠ {error}</p>}
      <form onSubmit={issue}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input placeholder="MISSION CODE (e.g. OP-INSIGHT)" value={f.code} onChange={(e) => set("code", e.target.value)} style={{ marginBottom: 0, flex: 2, minWidth: 180 }} />
          <input placeholder="ASSIGNED AGENTS — badges, comma-separated (optional)" value={f.matricule} onChange={(e) => set("matricule", e.target.value)} style={{ marginBottom: 0, flex: 1, minWidth: 220 }} />
        </div>
        <input placeholder="OBJECTIVE" value={f.objective} onChange={(e) => set("objective", e.target.value)} style={{ marginTop: 10 }} />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input placeholder="LOCATION" value={f.location} onChange={(e) => set("location", e.target.value)} style={{ marginBottom: 0, flex: 2, minWidth: 160 }} />
          <select value={f.priority} onChange={(e) => set("priority", e.target.value)} style={{ marginBottom: 0, flex: 1 }}>
            <option>Routine</option><option>Priority</option><option>Critical</option>
          </select>
          <select value={f.classification} onChange={(e) => set("classification", +e.target.value)} style={{ marginBottom: 0, flex: 1 }}>
            {Array.from({ length: myClearance }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Classification {n}</option>)}
          </select>
        </div>
        <textarea placeholder="BRIEFING (one line per paragraph)" value={f.briefing} onChange={(e) => set("briefing", e.target.value)} rows={6}
          style={{ width: "100%", padding: "10px 12px", background: "#0a101a", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text)", fontFamily: "Consolas, monospace", margin: "10px 0" }} />
        <button>Issue order</button>
      </form>
    </div>
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
  account_create: "Created account", account_update: "Updated account", account_delete: "Deleted account", password_reset: "Reset password",
  password_change: "Changed password", settings_update: "Updated settings",
  template_upload: "Uploaded template", template_create: "Created template", template_delete: "Deleted template", doc_from_template: "Created from template",
  folder_delete: "Deleted folder", doc_open_redacted: "Opened (redacted)", doc_move: "Moved document",
  doc_public_on: "Enabled public link", doc_public_off: "Disabled public link", mission_order: "Issued mission order",
  personnel_file: "Regenerated personnel file",
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
