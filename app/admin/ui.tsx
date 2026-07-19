"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast, confirmDialog, promptDialog } from "@/lib/ui-store";

type User = { id: number; matricule: string; codename: string; clearance: number; role: string; status: string; division: string; discord_linked: boolean; moodle_synced: boolean; created_at: string; oath_state?: string | null };
type TimelineEvent = { at: string; kind: string; label: string };
type AgentHistory = { agent: { matricule: string; codename: string; status: string }; state: string; statusLabel: string; summary: { notifs: number; logins: number }; events: TimelineEvent[] };

// Badge de serment pour la ligne agent, dérivé de "reqStatus:myStatus".
function oathBadge(state?: string | null): { label: string; cls: string; title: string } | null {
  if (!state) return null;
  const [req, my] = state.split(":");
  if (req === "pending" && my === "pending") return { label: "SERMENT ✗", cls: "high", title: "Serment à signer — accès au système bloqué" };
  if (req === "complete") return { label: "SCELLÉ", cls: "low", title: "Dossier scellé (contresigné)" };
  if (my === "signed") return { label: "SIGNÉ", cls: "low", title: "Serment signé" };
  return null;
}

const HIST_CLS: Record<string, string> = { to_sign: "high", signed: "mid", sealed: "low", none: "mid" };
const fmtWhen = (at: string) => new Date(at).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
type Folder = { id: number; name: string };
type LogRow = { id: number; matricule: string; action: string; target: string; created_at: string };
type Template = { id: number; name: string; filetype: string; created_at: string; editable: boolean; variables: string[] };

export default function AdminUI({ myClearance, myId }: { myClearance: number; myId: number }) {
  const [tab, setTab] = useState<"agents" | "divisions" | "documents" | "requests" | "missions" | "templates" | "settings" | "audit">("agents");
  return (
    <>
      <div className="topbar">
        <div className="logo">
          <a href="/dashboard"><button className="ghost small">← Archives</button></a>
          <h1>Commandement</h1>
        </div>
        <div className="tabs" style={{ marginBottom: 0, width: 940 }}>
          <button className={tab === "agents" ? "" : "inactive"} onClick={() => setTab("agents")}>Agents</button>
          <button className={tab === "divisions" ? "" : "inactive"} onClick={() => setTab("divisions")}>Divisions</button>
          <button className={tab === "documents" ? "" : "inactive"} onClick={() => setTab("documents")}>Documents</button>
          <button className={tab === "requests" ? "" : "inactive"} onClick={() => setTab("requests")}>Demandes</button>
          <button className={tab === "missions" ? "" : "inactive"} onClick={() => setTab("missions")}>Missions</button>
          <button className={tab === "templates" ? "" : "inactive"} onClick={() => setTab("templates")}>Modèles</button>
          <button className={tab === "settings" ? "" : "inactive"} onClick={() => setTab("settings")}>Réglages</button>
          <button className={tab === "audit" ? "" : "inactive"} onClick={() => setTab("audit")}>Journal d'audit</button>
        </div>
      </div>
      <div className="container">
        {tab === "agents" && <AgentsTab myClearance={myClearance} myId={myId} />}
        {tab === "divisions" && <DivisionsTab />}
        {tab === "documents" && <DocumentsTab />}
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
    const pwd = await promptDialog({ title: `Réinitialiser le mot de passe — ${u.matricule}`, message: `${u.codename} devra le changer à la prochaine connexion.`, placeholder: "Nouveau mot de passe temporaire", password: true });
    if (pwd) { update(u, { new_password: pwd }); toast("Mot de passe temporaire défini.", "success"); }
  }

  async function deleteAgent(u: User) {
    const ok = await confirmDialog({ title: `Supprimer l'agent ${u.matricule} ?`, message: `${u.codename} sera définitivement supprimé. Ses documents sont conservés mais sans propriétaire. Action irréversible.`, confirmLabel: "Supprimer l'agent", danger: true });
    if (!ok) return;
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    if (!res.ok) return setError((await res.json()).error);
    toast("Agent supprimé.", "success");
    load();
  }

  // Régénère le dossier ET relance le serment : l'agent est notifié et son accès au
  // système reste bloqué tant qu'il n'a pas signé (les officiers ne sont jamais bloqués).
  async function genFile(u: User) {
    const ok = await confirmDialog({
      title: `Exiger la signature du dossier — ${u.matricule} ?`,
      message: `${u.codename} recevra une notification « Dossier d'agent » et devra signer son serment. Tant que ce n'est pas signé, son accès au système est bloqué (archives, missions, transmissions).`,
      confirmLabel: "Exiger la signature",
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "POST" });
    toast(res.ok ? "Signature exigée — l'agent est notifié et bloqué jusqu'à signature." : "Échec.", res.ok ? "success" : "error");
  }

  // Override de secours : donner l'accès SANS signature (annule la demande de serment).
  async function overrideAccess(u: User) {
    const ok = await confirmDialog({
      title: `Débloquer l'accès (override) — ${u.matricule} ?`,
      message: `${u.codename} pourra accéder au système SANS signer son dossier. À utiliser en secours (signature qui coince, cas particulier). La demande de serment en attente est annulée.`,
      confirmLabel: "Débloquer sans signature",
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ override: true }),
    });
    toast(res.ok ? "Accès débloqué (override) — l'agent n'a plus besoin de signer." : "Échec.", res.ok ? "success" : "error");
  }

  // Renaming rewrites the agent's identity everywhere: personnel file, Academy username.
  // Confirm the badge change explicitly — it is what the agent signs in with.
  async function rename(u: User, patch: { matricule?: string; codename?: string }) {
    if (patch.matricule) {
      const ok = await confirmDialog({
        title: `Changer le matricule ${u.matricule} → ${patch.matricule.trim().toUpperCase()} ?`,
        message: `Le matricule est le nom de connexion de ${u.codename}, sur le portail et à l'Académie. Il sera prévenu sur Discord. Son mot de passe est inchangé.`,
        confirmLabel: "Changer le matricule",
      });
      if (!ok) return load(); // reload to snap the input back
    }
    const res = await fetch("/api/admin/users", { method: "PATCH", body: JSON.stringify({ ...u, ...patch }) });
    const data = await res.json();
    if (!res.ok) { setError(data.error); return load(); }
    toast("Agent mis à jour.", "success");
    load();
  }

  // We only ever hold a bcrypt hash, so a manual sync cannot carry the agent's real
  // password across — be explicit about it rather than implying the accounts match.
  async function academySync(u: User) {
    const ok = await confirmDialog({
      title: `Créer un compte Académie — ${u.matricule} ?`,
      message:
        `Un compte Académie sera créé pour ${u.codename}. Son mot de passe du portail ne peut pas être copié ` +
        `(le portail ne stocke qu'un hash chiffré), donc le mot de passe Académie différera jusqu'à ce que ${u.codename} ` +
        `change son mot de passe du portail — ou que vous le réinitialisiez.`,
      confirmLabel: "Créer le compte",
    });
    if (!ok) return;
    const res = await fetch("/api/admin/academy-sync", { method: "POST", body: JSON.stringify({ id: u.id }) });
    const d = await res.json();
    if (!res.ok) return toast(d.error || "Échec de la synchro Académie.", "error");
    toast(d.created ? "Compte Académie créé. Mot de passe pas encore synchronisé." : "Compte Académie mis à jour.", "success");
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
    setCreated(`Compte créé : matricule ${data.matricule}. Ce mot de passe temporaire devra être changé à la première connexion. Dossier généré.`);
    setCodename(""); setPassword(""); setBadge(""); setDivision("");
    load();
  }

  const pending = users.filter((u) => u.status === "pending");
  const others = users.filter((u) => u.status !== "pending");

  return (
    <>
      {error && <p className="error">⚠ {error}</p>}
      <div className="panel">
        <h2>Créer un compte agent</h2>
        {created && <p className="success">✓ {created}</p>}
        <form onSubmit={createAgent} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input placeholder="NOM DE CODE" value={codename} onChange={(e) => setCodename(e.target.value)} style={{ marginBottom: 0, flex: 2, minWidth: 140 }} />
          <input placeholder="MATRICULE (facultatif — auto)" value={badge} onChange={(e) => setBadge(e.target.value)} style={{ marginBottom: 0, flex: 1, minWidth: 120 }} />
          <input placeholder="DIVISION (facultatif)" value={division} onChange={(e) => setDivision(e.target.value)} style={{ marginBottom: 0, flex: 1, minWidth: 120 }} />
          <input placeholder="MOT DE PASSE TEMPORAIRE" value={password} onChange={(e) => setPassword(e.target.value)} style={{ marginBottom: 0, flex: 2, minWidth: 140 }} />
          <select value={Math.min(clearance, maxLevel)} onChange={(e) => setClearance(+e.target.value)} style={{ marginBottom: 0, flex: 1 }}>
            {Array.from({ length: maxLevel }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Habilitation {n}</option>)}
          </select>
          <button>Créer le compte</button>
        </form>
        <p className="muted" style={{ marginTop: 8 }}>Vous pouvez attribuer des habilitations jusqu'au niveau {maxLevel} (sous la vôtre).</p>
      </div>
      {pending.length > 0 && (
        <div className="panel" style={{ borderColor: "#665520" }}>
          <h2>Recrues en attente de validation ({pending.length})</h2>
          <UserTable users={pending} onUpdate={update} onRename={rename} onResetPassword={resetPassword} onDelete={deleteAgent} onGenFile={genFile} onOverride={overrideAccess} onAcademySync={academySync} maxLevel={maxLevel} myId={myId} />
        </div>
      )}
      <div className="panel">
        <h2>Agents enregistrés</h2>
        <UserTable users={others} onUpdate={update} onRename={rename} onResetPassword={resetPassword} onDelete={deleteAgent} onGenFile={genFile} onOverride={overrideAccess} onAcademySync={academySync} maxLevel={maxLevel} myId={myId} />
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
      <span className="chip">{u.role === "admin" ? "Officier" : "Agent"}</span>
      <span className={`classif ${statusCls}`}>
        {u.status === "active" ? "ACTIF" : u.status === "pending" ? "EN ATTENTE" : "RÉVOQUÉ"}
      </span>
      {(() => { const b = oathBadge(u.oath_state); return b ? <span className={`classif ${b.cls}`} title={b.title}>{b.label}</span> : null; })()}
      <span className="sync-cell">
        <SyncDot on={u.discord_linked} label="DISCORD"
          title={u.discord_linked ? "Compte Discord lié" : "Aucun compte Discord lié — l'agent se connecte avec son seul matricule"} />
        <SyncDot on={u.moodle_synced} label="ACADEMY"
          title={u.moodle_synced ? "Compte Académie (Moodle) provisionné" : "Aucun compte Académie — créé au prochain changement de mot de passe ou mise à jour"} />
      </span>
      <span className="agent-spacer" />
      {locked ? (
        <span className="muted" style={{ fontSize: ".75rem" }}>Au-dessus de votre habilitation</span>
      ) : (
        <button className="ghost small" onClick={onOpen} title="Gérer cet agent">···</button>
      )}
    </div>
  );
}

// Full edit sheet. Fields are applied on Save, not on every keystroke, so a half-typed
// badge is never sent — the badge is the sign-in name.
function AgentSheet({ u, maxLevel, onClose, onUpdate, onRename, onResetPassword, onDelete, onGenFile, onOverride, onAcademySync }: {
  u: User; maxLevel: number; onClose: () => void;
  onUpdate: (u: User, p: Partial<User>) => void;
  onRename: (u: User, p: { matricule?: string; codename?: string }) => void;
  onResetPassword: (u: User) => void; onDelete: (u: User) => void;
  onGenFile: (u: User) => void; onOverride: (u: User) => void; onAcademySync: (u: User) => void;
}) {
  const [matricule, setMatricule] = useState(u.matricule);
  const [codename, setCodename] = useState(u.codename);
  const [division, setDivision] = useState(u.division);
  const [clearance, setClearance] = useState(u.clearance);
  const [role, setRole] = useState(u.role);
  const [hist, setHist] = useState<AgentHistory | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/admin/users/${u.id}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (live) setHist(d); }).catch(() => {});
    return () => { live = false; };
  }, [u.id]);

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
        <label className="muted sheet-label">Matricule — c'est le nom de connexion, ici et à l'Académie</label>
        <input className="mono" value={matricule} onChange={(e) => setMatricule(e.target.value)} />
        <label className="muted sheet-label">Nom de code</label>
        <input value={codename} onChange={(e) => setCodename(e.target.value)} />
        <label className="muted sheet-label">Division</label>
        <input value={division} placeholder="—" onChange={(e) => setDivision(e.target.value)} />
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label className="muted sheet-label">Habilitation</label>
            <select value={clearance} onChange={(e) => setClearance(+e.target.value)}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n} disabled={n > maxLevel && n !== u.clearance}>Niv. {n}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className="muted sheet-label">Rôle</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="agent">Agent</option>
              <option value="admin">Officier</option>
            </select>
          </div>
        </div>

        <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <label className="muted sheet-label">Statut &amp; historique</label>
          {!hist ? (
            <p className="muted" style={{ fontSize: ".8rem" }}>Chargement…</p>
          ) : (
            <>
              <p style={{ marginBottom: 8 }}>
                <span className={`classif ${HIST_CLS[hist.state] || "mid"}`}>{hist.statusLabel}</span>
              </p>
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 4, fontSize: ".82rem", margin: 0, padding: 0 }}>
                {hist.events.map((e, i) => (
                  <li key={i} style={{ display: "flex", gap: 8 }}>
                    <span className="mono muted" style={{ whiteSpace: "nowrap", minWidth: 132 }}>{fmtWhen(e.at)}</span>
                    <span>{e.label}</span>
                  </li>
                ))}
              </ul>
              <p className="muted" style={{ fontSize: ".75rem", marginTop: 8 }}>
                {hist.summary.notifs} notification(s) de serment envoyée(s) · {hist.summary.logins} connexion(s)
              </p>
            </>
          )}
        </div>

        <div className="sheet-actions">
          {u.status !== "active" && <button className="small" onClick={() => { onUpdate(u, { status: "active" }); onClose(); }}>Valider</button>}
          {u.status === "active" && <button className="ghost small" onClick={() => { onUpdate(u, { status: "revoked" }); onClose(); }}>Révoquer</button>}
          <button className="ghost small" onClick={() => { onGenFile(u); onClose(); }} title="Régénère le dossier et exige la signature — bloque l'accès de l'agent jusqu'à ce qu'il signe">Exiger signature</button>
          {u.oath_state && u.oath_state.startsWith("pending:") && (
            <button className="ghost small" onClick={() => { onOverride(u); onClose(); }} title="Débloque l'accès sans signature (secours) — annule la demande de serment en attente">Débloquer (override)</button>
          )}
          {!u.moodle_synced && <button className="ghost small" onClick={() => { onAcademySync(u); onClose(); }}>Sync Académie</button>}
          <button className="ghost small" onClick={() => { onResetPassword(u); onClose(); }}>Réinit. mdp</button>
          <button className="ghost small danger" onClick={() => { onDelete(u); onClose(); }}>Supprimer l'agent</button>
        </div>

        <div className="sheet-footer">
          <button className="ghost" onClick={onClose}>Annuler</button>
          <button disabled={!dirty} onClick={save}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

function UserTable({ users, onUpdate, onRename, onResetPassword, onDelete, onGenFile, onOverride, onAcademySync, maxLevel, myId }: { users: User[]; onUpdate: (u: User, p: Partial<User>) => void; onRename: (u: User, p: { matricule?: string; codename?: string }) => void; onResetPassword: (u: User) => void; onDelete: (u: User) => void; onGenFile: (u: User) => void; onOverride: (u: User) => void; onAcademySync: (u: User) => void; maxLevel: number; myId: number }) {
  const [open, setOpen] = useState<User | null>(null);
  if (!users.length) return <p className="muted">Personne.</p>;
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
          onDelete={onDelete} onGenFile={onGenFile} onOverride={onOverride} onAcademySync={onAcademySync}
        />
      )}
    </>
  );
}

// ---------------- Documents (officer view) ----------------
type DocSigner = { matricule: string; codename: string; status: string; signed_at: string | null; reason: string | null; position: number };
type AdminDoc = {
  id: number; title: string; filetype: string; classification: number; sealed: boolean;
  is_personnel: boolean; updated_at: string; owner: string | null; owner_badge: string | null;
  request_id: number | null; request_status: string | null; sequential: boolean | null;
  requested_at: string | null; completed_at: string | null; requested_by: string | null;
  signers: DocSigner[];
};

function DocumentsTab() {
  const router = useRouter();
  const [docs, setDocs] = useState<AdminDoc[]>([]);
  const [filter, setFilter] = useState<"all" | "waiting" | "unsigned" | "sealed">("waiting");
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch("/api/admin/documents");
    if (res.ok) setDocs(await res.json());
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function remind(d: AdminDoc) {
    const late = d.signers.filter((s) => s.status === "pending").map((s) => s.codename).join(", ");
    const ok = await confirmDialog({
      title: `Relancer les signatures en attente sur « ${d.title} » ?`,
      message: `Un rappel Discord est envoyé à : ${late}.`,
      confirmLabel: "Envoyer le rappel",
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/documents/${d.id}/remind`, { method: "POST" });
    const r = await res.json();
    toast(res.ok ? `Rappel envoyé à ${r.sent} agent(s).` : r.error, res.ok ? "success" : "error");
  }

  async function unseal(d: AdminDoc) {
    const ok = await confirmDialog({
      title: `Desceller « ${d.title} » ?`,
      message: "Toutes les signatures de ce document sont annulées et les signataires prévenus.",
      confirmLabel: "Desceller et annuler", danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/documents/${d.id}`, { method: "PATCH", body: JSON.stringify({ unlock: true }) });
    const r = await res.json();
    if (!res.ok) return toast(r.error, "error");
    toast(`Descellé — ${r.voided} demande(s) annulée(s).`, "success");
    load();
  }

  // A document is "waiting" when a request is open, "unsigned" when nobody ever asked.
  const shown = docs.filter((d) => {
    if (filter === "all") return true;
    if (filter === "waiting") return d.request_status === "pending";
    if (filter === "unsigned") return !d.request_id;
    return d.request_status === "complete";
  });
  const counts = {
    waiting: docs.filter((d) => d.request_status === "pending").length,
    unsigned: docs.filter((d) => !d.request_id).length,
    sealed: docs.filter((d) => d.request_status === "complete").length,
  };

  const tab = (k: typeof filter, label: string) => (
    <button className={filter === k ? "" : "inactive"} onClick={() => setFilter(k)}>{label}</button>
  );

  return (
    <div className="panel">
      <h2>Documents et signatures</h2>
      <div className="tabs" style={{ width: 560 }}>
        {tab("waiting", `En attente de signature (${counts.waiting})`)}
        {tab("unsigned", `Jamais envoyé (${counts.unsigned})`)}
        {tab("sealed", `Scellés (${counts.sealed})`)}
        {tab("all", `Tous (${docs.length})`)}
      </div>

      {loading && <div className="skeleton" style={{ height: 60 }} />}
      {!loading && shown.length === 0 && <p className="muted">Rien ici.</p>}

      {shown.map((d) => {
        const pending = d.signers.filter((s) => s.status === "pending");
        const signed = d.signers.filter((s) => s.status === "signed");
        const declined = d.signers.filter((s) => s.status === "declined");
        return (
          <div key={d.id} className="mission-row">
            <div className="mission-head">
              <b>{d.title}</b>
              <span className="chip lv mono">LVL. {d.classification}</span>
              {d.is_personnel && <span className="chip">PERSONNEL</span>}
              {d.request_status === "pending" && (
                <span className="classif mid">{signed.length}/{d.signers.length} SIGNÉ(S)</span>
              )}
              {d.request_status === "complete" && <span className="classif low">SCELLÉ</span>}
              {d.request_status === "declined" && <span className="classif high">REFUSÉ</span>}
              {!d.request_id && <span className="chip">aucune demande</span>}
              {d.sequential && <span className="chip">CHAÎNE</span>}
              <span className="agent-spacer" />
              <button className="ghost small" onClick={() => router.push(`/doc/${d.id}`)}>Ouvrir</button>
              {d.request_status === "pending" && pending.length > 0 && (
                <button className="ghost small" onClick={() => remind(d)}>Relancer</button>
              )}
              {d.sealed && <button className="ghost small danger" onClick={() => unseal(d)}>Desceller</button>}
            </div>

            <div className="mission-meta muted">
              {d.owner ? `${d.owner_badge} · ${d.owner}` : "sans propriétaire"}
              {d.requested_by ? ` · demandé par ${d.requested_by}` : ""}
              {d.requested_at ? ` · ${new Date(d.requested_at).toLocaleDateString()}` : ""}
            </div>

            {d.signers.length > 0 && (
              <div className="signer-list">
                {signed.map((s) => (
                  <span key={s.matricule} className="sync-dot on" title={`Signed ${new Date(s.signed_at!).toLocaleString()}`}>
                    {s.codename} ✓
                  </span>
                ))}
                {/* Who is holding it up — the actual question an officer is asking. */}
                {pending.map((s) => (
                  <span key={s.matricule} className="sync-dot off" title="Pas encore signé">
                    {s.codename} …
                  </span>
                ))}
                {declined.map((s) => (
                  <span key={s.matricule} className="sync-dot bad" title={s.reason || "Refusé"}>
                    {s.codename} ✕
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
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
    toast(approve ? `Accès accordé à ${r.codename}.` : "Demande refusée.", approve ? "success" : "info");
    load();
  }

  return (
    <div className="panel">
      <h2>Demandes d'accès en attente</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        Approuver crée un partage explicite — il prime sur le niveau d'habilitation et sur toute restriction de dossier privé.
      </p>
      {loading ? <div className="skeleton" style={{ height: 80 }} /> : reqs.length === 0 ? (
        <div className="empty">
          <div className="empty-mark">[ ▚ ]</div>
          <div className="empty-title">Aucune demande en attente</div>
        </div>
      ) : (
        <table>
          <thead>
            <tr><th>Agent</th><th>Document</th><th>Classification</th><th>Motif</th><th>Quand</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {reqs.map((r) => (
              <tr key={r.id}>
                <td><span className="mono">{r.matricule}</span> · {r.codename} <span className="muted">lvl.{r.clearance}</span></td>
                <td><a href={`/doc/${r.doc_id}`}>{r.title}</a></td>
                <td><span className={`classif ${r.classification >= 7 ? "high" : r.classification >= 4 ? "mid" : "low"}`}>LVL.{r.classification}</span></td>
                <td className="muted">{r.reason || "—"}</td>
                <td className="muted">{new Date(r.created_at).toLocaleString("fr-FR")}</td>
                <td style={{ display: "flex", gap: 6 }}>
                  <button className="small" onClick={() => decide(r, true)}>Accorder</button>
                  <button className="ghost small danger" onClick={() => decide(r, false)}>Refuser</button>
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
    toast(`Mission ${f.code.toUpperCase()} ouverte.`, "success");
    setF({ code: "", objective: "", matricule: "", location: "", priority: "Routine", classification: 1, briefing: "", division: "" });
    setShowForm(false);
    load();
  }

  async function setStatus(m: Mission, status: string) {
    if (status !== "active") {
      const ok = await confirmDialog({
        title: `Marquer ${m.code} comme ${status} ?`,
        message: `Les agents assignés seront prévenus sur Discord que la mission est ${status}.`,
        confirmLabel: status === "completed" ? "Marquer terminée" : "Annuler la mission",
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
      title: `Rapport d'après-action — ${m.code}`,
      message: "Que s'est-il passé ? Stocké sur la mission, pas dans l'ordre.",
      placeholder: "Issue, éléments récupérés, pertes…",
      defaultValue: m.report || "",
    });
    if (report === null) return;
    const res = await fetch(`/api/missions/${m.id}`, { method: "PATCH", body: JSON.stringify({ report }) });
    if (!res.ok) return toast((await res.json()).error, "error");
    toast("Rapport enregistré.", "success");
    load();
  }

  const active = missions.filter((m) => m.status === "active");
  const closed = missions.filter((m) => m.status !== "active");

  return (
    <>
      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ marginBottom: 0 }}>Missions ({active.length} active(s))</h2>
          <button className="small" onClick={() => setShowForm(!showForm)}>{showForm ? "Annuler" : "Nouvelle mission"}</button>
        </div>
        {error && <p className="error" style={{ marginTop: 12 }}>⚠ {error}</p>}
        {showForm && (
          <form onSubmit={issue} style={{ marginTop: 14 }}>
            <p className="muted" style={{ marginBottom: 10 }}>
              Ouvre une mission suivie et génère son ordre classifié. Les agents assignés reçoivent l'ordre
              en partage et une transmission Discord.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input placeholder="CODE DE MISSION (ex. OP-INSIGHT)" value={f.code} onChange={(e) => set("code", e.target.value)} style={{ marginBottom: 0, flex: 2, minWidth: 180 }} />
              <input placeholder="AGENTS ASSIGNÉS — matricules, séparés par des virgules" value={f.matricule} onChange={(e) => set("matricule", e.target.value)} style={{ marginBottom: 0, flex: 2, minWidth: 220 }} />
            </div>
            <input placeholder="OBJECTIF" value={f.objective} onChange={(e) => set("objective", e.target.value)} style={{ marginTop: 10 }} />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input placeholder="LIEU" value={f.location} onChange={(e) => set("location", e.target.value)} style={{ marginBottom: 0, flex: 2, minWidth: 150 }} />
              <input placeholder="DIVISION (facultatif)" value={f.division} onChange={(e) => set("division", e.target.value)} style={{ marginBottom: 0, flex: 1, minWidth: 140 }} />
              <select value={f.priority} onChange={(e) => set("priority", e.target.value)} style={{ marginBottom: 0, flex: 1 }}>
                <option>Routine</option><option>Prioritaire</option><option>Critique</option>
              </select>
              <select value={f.classification} onChange={(e) => set("classification", +e.target.value)} style={{ marginBottom: 0, flex: 1 }}>
                {Array.from({ length: myClearance }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Classification {n}</option>)}
              </select>
            </div>
            <textarea placeholder="BRIEFING (facultatif)" value={f.briefing} onChange={(e) => set("briefing", e.target.value)} rows={3} style={{ marginTop: 10 }} />
            <button style={{ marginTop: 10 }}>Ouvrir la mission</button>
          </form>
        )}
      </div>

      <div className="panel">
        <h2>Actives</h2>
        {active.length === 0 && <p className="muted">Aucune mission active.</p>}
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
        {m.doc_id && <button className="ghost small" onClick={() => router.push(`/doc/${m.doc_id}`)}>Ordre</button>}
        <button className="ghost small" onClick={() => onReport(m)}>{m.report ? "Rapport ✓" : "Rapport"}</button>
        {m.status === "active" ? (
          <>
            <button className="ghost small" onClick={() => onStatus(m, "completed")}>Terminer</button>
            <button className="ghost small danger" onClick={() => onStatus(m, "aborted")}>Annuler</button>
          </>
        ) : (
          <button className="ghost small" onClick={() => onStatus(m, "active")}>Rouvrir</button>
        )}
      </div>
      <div className="mission-obj">{m.objective}</div>
      <div className="mission-meta muted">
        {m.location ? `${m.location} · ` : ""}
        {m.agents.length ? m.agents.map((a) => `${a.matricule} (${a.codename})`).join(", ") : "Aucun agent assigné"}
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
    toast("Division créée.", "success");
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
        <h2>Créer une division</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          Une division est une vraie équipe : des membres, un chef, et un dossier partagé facultatif. Assignez-y des agents
          depuis l'onglet Agents.
        </p>
        {error && <p className="error">⚠ {error}</p>}
        <form onSubmit={create} style={{ display: "flex", gap: 10 }}>
          <input placeholder="NOM DE DIVISION (ex. Renseignement)" value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 0, flex: 1 }} />
          <button>Créer</button>
        </form>
      </div>

      <div className="panel">
        <h2>Divisions</h2>
        {divs.length === 0 && <p className="muted">Aucune division.</p>}
        {divs.map((d) => {
          const members = users.filter((u) => u.division === d.name && u.status === "active");
          return (
            <div key={d.id} className="agent-row">
              <div className="agent-who">
                <b>{d.name}</b>
                <span>{d.members} agent{d.members > 1 ? "s" : ""}{d.lead_codename ? ` · dirigée par ${d.lead_codename}` : ""}</span>
              </div>
              <select
                value={d.lead_id ?? ""}
                onChange={(e) => patch(d, { lead_id: e.target.value || null }, "Chef de division mis à jour.")}
                style={{ marginBottom: 0, width: 190 }}
                title="Le chef doit être membre de cette division"
              >
                <option value="">— Aucun chef —</option>
                {members.map((u) => <option key={u.id} value={u.id}>{u.codename} ({u.matricule})</option>)}
              </select>
              {d.folder_id ? (
                <span className="chip lv" title={d.folder_name || ""}>DOSSIER PARTAGÉ</span>
              ) : (
                <button className="ghost small" onClick={() => patch(d, { create_folder: true }, "Dossier partagé créé.")}>
                  Créer un dossier partagé
                </button>
              )}
              {d.folder_id && (
                <button className="ghost small" onClick={() => patch(d, { create_folder: true }, "Membres synchronisés au dossier.")} title="Ajouter les membres arrivés depuis">
                  Synchroniser les membres
                </button>
              )}
              <span className="agent-spacer" />
              <button
                className="ghost small"
                onClick={async () => {
                  const n = await promptDialog({ title: "Renommer la division", message: `Nom actuel : « ${d.name} ».`, placeholder: "Nouveau nom", defaultValue: d.name });
                  if (n && n.trim() !== d.name) patch(d, { name: n }, "Division renommée.");
                }}
              >
                Renommer
              </button>
              <button
                className="ghost small danger"
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: `Supprimer la division « ${d.name} » ?`,
                    message: "La division ne doit avoir aucun membre. Son dossier partagé est conservé.",
                    confirmLabel: "Supprimer", danger: true,
                  });
                  if (!ok) return;
                  const res = await fetch(`/api/divisions/${d.id}`, { method: "DELETE" });
                  const data = await res.json();
                  if (!res.ok) return toast(data.error, "error");
                  toast("Division supprimée.", "success");
                  load();
                }}
              >
                Supprimer
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
    setName(""); setBody(""); setSaved("Modèle enregistré.");
    load();
  }

  async function del(t: Template) {
    const ok = await confirmDialog({ title: `Supprimer le modèle « ${t.name} » ?`, confirmLabel: "Supprimer", danger: true });
    if (!ok) return;
    await fetch(`/api/admin/templates/${t.id}`, { method: "DELETE" });
    toast("Modèle supprimé.", "success");
    load();
  }

  const detectedVars = Array.from(new Set((body.match(/\{\{\s*([\w -]+?)\s*\}\}/g) || []).map((v) => v.replace(/[{}]/g, "").trim())));

  return (
    <>
      {error && <p className="error">⚠ {error}</p>}
      <div className="panel">
        <h2>Créer un modèle sur place</h2>
        <p className="muted" style={{ marginBottom: 10 }}>
          Écrivez le contenu du document ci-dessous. Commencez une ligne par <span className="mono">#</span> pour un titre.
          Insérez des champs à remplir avec <span className="mono">{"{{double braces}}"}</span> — e.g. <span className="mono">{"{{agent name}}"}</span>,
          <span className="mono"> {"{{mission code}}"}</span>. Chacun vous sera demandé à la création d'un document.
        </p>
        <div style={{ marginBottom: 10 }}>
          <p className="muted" style={{ marginBottom: 4 }}>Remplis automatiquement à la création (cliquer pour insérer) :</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {SYSTEM_VARS.map((v) => (
              <button type="button" key={v} className="tag t-xlsx" style={{ cursor: "pointer", border: "none" }} onClick={() => insertVar(v)}>{v}</button>
            ))}
          </div>
          <p className="muted" style={{ marginBottom: 4 }}>Champs à remplir (demandés à la création) :</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SUGGESTED_VARS.map((v) => (
              <button type="button" key={v} className="tag t-folder" style={{ cursor: "pointer", border: "none" }} onClick={() => insertVar(v)}>{v}</button>
            ))}
          </div>
        </div>
        <form onSubmit={saveText}>
          <input placeholder="NOM DU MODÈLE" value={name} onChange={(e) => setName(e.target.value)} />
          <textarea
            ref={bodyRef}
            placeholder={"# MISSION ORDER\n\nAgent: {{agent}}\nBadge: {{badge}}\nObjective: {{objective}}\n\nAuthorized by: {{officer}}\nDate: {{date}}"}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            style={{ width: "100%", padding: "10px 12px", background: "#0a101a", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text)", fontFamily: "Consolas, monospace", marginBottom: 10 }}
          />
          {detectedVars.length > 0 && (
            <p className="muted" style={{ marginBottom: 10 }}>Champs détectés : {detectedVars.map((v) => <span key={v} className={`tag ${SYSTEM_VARS.includes(v) ? "t-xlsx" : "t-folder"}`} style={{ marginRight: 6 }}>{v}</span>)}</p>
          )}
          {saved && <p className="success">✓ {saved}</p>}
          <button>Enregistrer le modèle</button>
        </form>
      </div>
      <div className="panel">
        <h2>Ou téléverser un modèle fichier</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input placeholder="NOM DU MODÈLE (facultatif)" value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 0, flex: 2, minWidth: 180 }} />
          <button type="button" onClick={() => fileInput.current?.click()}>Choisir un fichier (.docx/.xlsx/.pptx)</button>
          <input ref={fileInput} type="file" accept=".docx,.xlsx,.pptx" style={{ display: "none" }} onChange={upload} />
        </div>
      </div>
      <div className="panel">
        <h2>Modèles — créer un document à partir d'un modèle</h2>
        <div className="cards">
          {templates.map((t) => (
            <div key={t.id} className={`card t-${t.filetype}`}>
              <div className="card-top">
                <span className={`tag t-${t.filetype}`}>{t.editable ? "TPL" : TPL_TAG[t.filetype]}</span>
                <span className="card-actions" style={{ display: "inline-flex" }}>
                  <button className="ghost small" onClick={() => del(t)} title="Supprimer le modèle">✕</button>
                </span>
              </div>
              <div className="card-title">{t.name}</div>
              {t.variables.length > 0 && <div className="card-meta muted" style={{ fontSize: "0.72rem" }}>{t.variables.length} champ(s)</div>}
              <div className="card-meta"><button className="small" onClick={() => setUseTpl(t)}>Nouveau document</button></div>
            </div>
          ))}
          {templates.length === 0 && <p className="muted">Aucun modèle.</p>}
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
        <h2>Nouveau document — {template.name}</h2>
        {error && <p className="error">⚠ {error}</p>}
        <form onSubmit={create}>
          <input autoFocus placeholder="TITRE DU DOCUMENT" value={title} onChange={(e) => setTitle(e.target.value)} />
          {template.variables.length > 0 && (
            <>
              <p className="muted" style={{ margin: "4px 0 8px" }}>Remplissez les champs du modèle :</p>
              {template.variables.map((v) => (
                <input key={v} placeholder={v.toUpperCase()} value={vars[v] || ""} onChange={(e) => setVars({ ...vars, [v]: e.target.value })} />
              ))}
            </>
          )}
          <select value={classification} onChange={(e) => setClassification(+e.target.value)}>
            {Array.from({ length: maxLevel }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Niveau de classification {n}</option>)}
          </select>
          <select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            <option value="">— Racine du Drive —</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <button style={{ width: "100%" }}>Créer le document</button>
        </form>
        <button className="ghost" style={{ marginTop: 10, width: "100%" }} onClick={onClose}>Annuler</button>
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
      title: `Créer des comptes Académie pour ${missing} agent(s) ?`,
      message:
        "Les agents créés avant l'Académie n'ont pas de compte. Les mots de passe du portail ne peuvent pas être copiés " +
        "(seul un hash chiffré est stocké), donc le mot de passe Académie de chaque agent différera jusqu'à ce qu'il " +
        "change son mot de passe du portail.",
      confirmLabel: "Créer les comptes",
    });
    if (!ok) return;
    setBusy(true);
    const res = await fetch("/api/admin/academy-sync", { method: "POST", body: JSON.stringify({}) });
    const r = await res.json();
    setBusy(false);
    if (!res.ok) return toast(r.error || "Échec de la synchro Académie.", "error");
    toast(`${r.created} compte(s) créé(s)${r.failed ? `, ${r.failed} en échec` : ""}.`, r.failed ? "error" : "success");
    load();
  }

  const row = (name: string, i: Integration, note: string) => {
    const state = !i.configured ? "Non configuré" : i.reachable ? "En ligne" : "Injoignable";
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
      <h2>Intégrations</h2>
      {!d ? <div className="skeleton" style={{ height: 80 }} /> : (
        <table>
          <thead><tr><th>Système</th><th>Statut</th><th>Liés</th><th></th></tr></thead>
          <tbody>
            {row("DISCORD", d.discord, "Connexion OAuth et DM automatiques")}
            {row("ACADEMY", d.academy, "Comptes Moodle, même matricule et mot de passe")}
            {row("OFFICE", d.office, "Serveur de documents : édition et export PDF")}
          </tbody>
        </table>
      )}
      {d && d.academy.configured && d.academy.linked! < d.total && (
        <p className="muted" style={{ marginTop: 12 }}>
          {d.total - d.academy.linked!} agent(s) sans compte Académie — les comptes sont provisionnés automatiquement
          uniquement quand le portail connaît le mot de passe (création, changement de mot de passe).{" "}
          <button className="ghost small" disabled={busy} onClick={syncAll}>
            {busy ? "Création…" : "Les créer maintenant"}
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
    <NotifTestPanel />
    <div className="panel">
      <h2>Documents automatiques</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        À la création d'un compte, un <strong>dossier d'agent</strong> administratif est généré automatiquement.
        Choisissez le dossier de destination.
      </p>
      <label className="muted" style={{ display: "block", marginBottom: 4 }}>Dossier de destination des dossiers d'agent</label>
      <select
        value={settings.personnel_folder_id || ""}
        onChange={(e) => save({ personnel_folder_id: e.target.value })}
        style={{ maxWidth: 360 }}
      >
        <option value="">— Aucun dossier (racine) —</option>
        {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>

      <h2 style={{ marginTop: 24 }}>Accès</h2>
      <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
        <input
          type="checkbox"
          style={{ width: "auto", marginBottom: 0 }}
          checked={settings.public_registration !== "off"}
          onChange={(e) => save({ public_registration: e.target.checked ? "on" : "off" })}
        />
        <span>Autoriser l'enrôlement public (les recrues peuvent s'inscrire et attendre validation)</span>
      </label>

      {saved && <p className="success" style={{ marginTop: 14 }}>✓ Réglages enregistrés.</p>}
    </div>
    </>
  );
}

// A one-click check that the notification pipeline works: sends a test alert to the
// signed-in officer on every channel (Web Push + Discord) and reports what went out.
function NotifTestPanel() {
  const [busy, setBusy] = useState(false);

  async function sendTest() {
    setBusy(true);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast(d.error || "Échec de l'envoi.", "error"); return; }
      const channels: string[] = [];
      if (d.pushServerEnabled && d.pushDevices > 0) channels.push(`Web Push (${d.pushDevices} appareil${d.pushDevices > 1 ? "s" : ""})`);
      if (d.discordLinked) channels.push("Discord");
      if (channels.length) {
        toast(`Test envoyé → ${channels.join(" + ")}. Regarde la bannière / ton DM.`, "success");
      } else if (!d.pushServerEnabled) {
        toast("Aucun canal : Web Push non configuré côté serveur (clés VAPID) et Discord non lié.", "error");
      } else {
        toast("Aucun appareil abonné et Discord non lié. Active 🔔 Notifs, puis réessaie.", "error");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h2>Notifications</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        Envoie une notification de test à <strong>ton propre compte</strong>, sur tous tes canaux
        (bannière PWA Web Push + DM Discord si lié). Utile pour vérifier le paramétrage après un déploiement.
        Pense à activer <strong>🔔 Notifs</strong> sur cet appareil au préalable.
      </p>
      <button onClick={sendTest} disabled={busy}>
        {busy ? "Envoi…" : "🔔 Envoyer une notification de test"}
      </button>
    </div>
  );
}

// ---------------- Audit ----------------
const ACTION_LABELS: Record<string, string> = {
  doc_unseal: "Document descellé", signature_remind: "Signature relancée", signature_engrave: "Signatures gravées", signature_request: "Signatures demandées", signature_sign: "Signé", signature_decline: "Refus de signer",
  signature_complete: "Document scellé", signature_cancel: "Demande annulée",
  signature_broken: "Demande annulée (contenu modifié)", signature_upload: "Image de signature",
  doc_save_blocked: "Enregistrement bloqué (scellé)",
  mission_create: "Mission ouverte", mission_status: "Statut de mission", mission_report: "Rapport d'après-action",
  mission_delete: "Mission supprimée",
  division_create: "Division créée", division_delete: "Division supprimée", division_rename: "Division renommée",
  division_lead: "Chef de division défini", division_folder: "Dossier de division",
  account_rename: "Agent renommé", academy_sync: "Synchro Académie",
  doc_rename: "Document renommé", doc_classify: "Reclassifié", folder_rename: "Dossier renommé",
  doc_pdf: "Export PDF", doc_pdf_redacted: "Export PDF (caviardé)",
  login: "Connexion", login_failed: "Échec de connexion", register: "Enrôlement",
  discord_login: "Connexion (Discord)", discord_link: "Discord lié",
  doc_create: "Document créé", doc_import: "Document importé", doc_open: "Document ouvert",
  doc_save: "Document enregistré", doc_destroy: "Document détruit", doc_share: "Document partagé", doc_unshare: "Partage révoqué",
  folder_create: "Dossier créé", folder_invite: "Invité au dossier", folder_uninvite: "Retiré du dossier",
  account_create: "Compte créé", account_update: "Compte mis à jour", account_delete: "Compte supprimé", password_reset: "Mot de passe réinitialisé",
  password_change: "Mot de passe changé", settings_update: "Réglages mis à jour", push_test: "Notification de test envoyée", onboarding_override: "Override d'onboarding (accès sans signature)",
  template_upload: "Modèle téléversé", template_create: "Modèle créé", template_delete: "Modèle supprimé", doc_from_template: "Créé depuis un modèle",
  folder_delete: "Dossier supprimé", doc_open_redacted: "Ouvert (caviardé)", doc_move: "Document déplacé",
  doc_public_on: "Lien public activé", doc_public_off: "Lien public désactivé", mission_order: "Ordre de mission émis",
  personnel_file: "Dossier régénéré",
  access_request: "Accès demandé", access_granted: "Accès accordé", access_denied: "Accès refusé",
  doc_blocked: "Document restreint atteint",
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
      <h2>Journal d'audit — qui a fait quoi</h2>
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <input placeholder="Filtrer par matricule ou cible…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 0, flex: 2 }} />
        <select value={action} onChange={(e) => setAction(e.target.value)} style={{ marginBottom: 0, flex: 1 }}>
          <option value="">Toutes les actions</option>
          {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <table>
        <thead>
          <tr><th>Heure</th><th>Agent</th><th>Action</th><th>Cible</th></tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <td className="muted mono" style={{ whiteSpace: "nowrap" }}>{new Date(l.created_at).toLocaleString("fr-FR")}</td>
              <td className="mono">{l.matricule}</td>
              <td><span className={l.action === "login_failed" ? "classif high" : ""}>{ACTION_LABELS[l.action] || l.action}</span></td>
              <td className="muted">{l.target}</td>
            </tr>
          ))}
          {logs.length === 0 && <tr><td colSpan={4} className="muted">Aucune entrée.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
