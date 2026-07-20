"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast, promptDialog, confirmDialog } from "@/lib/ui-store";
import type { Session } from "@/lib/session";

type Mission = {
  id: number; code: string; objective: string; location: string | null; priority: string | null;
  classification: number; status: string; doc_id: number | null; report: string | null;
  division: string; agents: { id: number; matricule: string; codename: string }[];
};

// An agent's own operations. The API already filters to missions they are assigned to
// (officers see everything), so this page just renders what comes back.
export default function Missions({ session }: { session: Session }) {
  const router = useRouter();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch("/api/missions");
    if (res.ok) setMissions(await res.json());
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function fileReport(m: Mission) {
    const report = await promptDialog({
      title: `After-action report — ${m.code}`,
      message: "Tell us what happened. Officers will read it.",
      placeholder: "Outcome, items recovered, casualties…",
      defaultValue: m.report || "",
    });
    if (report === null) return;
    const res = await fetch(`/api/missions/${m.id}`, { method: "PATCH", body: JSON.stringify({ report }) });
    if (!res.ok) return toast((await res.json()).error, "error");
    toast("Report saved.", "success");
    load();
  }

  async function complete(m: Mission) {
    const ok = await confirmDialog({
      title: `Mark ${m.code} as completed?`,
      message: "Your officers will be notified. File your after-action report first if you haven't.",
      confirmLabel: "Mark completed",
    });
    if (!ok) return;
    const res = await fetch(`/api/missions/${m.id}`, { method: "PATCH", body: JSON.stringify({ status: "completed" }) });
    if (!res.ok) return toast((await res.json()).error, "error");
    toast(`${m.code} — completed.`, "success");
    load();
  }

  const active = missions.filter((m) => m.status === "active");
  const closed = missions.filter((m) => m.status !== "active");

  return (
    <>
      <div className="topbar">
        <div className="logo">
          <a href="/dashboard"><button className="ghost small">← Archives</button></a>
          <h1>Missions</h1>
        </div>
        <span className="badge">{session.matricule} · LVL. {session.clearance}</span>
      </div>
      <div className="container">
        {loading && <div className="panel"><div className="skeleton" style={{ height: 60 }} /></div>}

        {!loading && (
          <div className="panel">
            <h2>Active operations ({active.length})</h2>
            {active.length === 0 && <p className="muted">No active operation is assigned to you.</p>}
            {active.map((m) => (
              <div key={m.id} className="mission-row">
                <div className="mission-head">
                  <b className="mono">{m.code}</b>
                  <span className="classif mid">ACTIVE</span>
                  <span className="chip lv mono">LVL. {m.classification}</span>
                  {m.priority && <span className="chip">{m.priority}</span>}
                  {m.division && <span className="chip">{m.division}</span>}
                  <span className="agent-spacer" />
                  {m.doc_id && <button className="ghost small" onClick={() => router.push(`/doc/${m.doc_id}`)}>Read the order</button>}
                  <button className="ghost small" onClick={() => fileReport(m)}>{m.report ? "Report ✓" : "File report"}</button>
                  <button className="ghost small" onClick={() => complete(m)}>Complete</button>
                </div>
                <div className="mission-obj">{m.objective}</div>
                <div className="mission-meta muted">
                  {m.location ? `${m.location} · ` : ""}
                  {m.agents.map((a) => `${a.matricule} (${a.codename})`).join(", ") || "No agent assigned"}
                </div>
                {m.report && <div className="mission-report">{m.report}</div>}
              </div>
            ))}
          </div>
        )}

        {closed.length > 0 && (
          <div className="panel">
            <h2>Archive ({closed.length})</h2>
            {closed.map((m) => (
              <div key={m.id} className="mission-row">
                <div className="mission-head">
                  <b className="mono">{m.code}</b>
                  <span className={`classif ${m.status === "completed" ? "low" : "high"}`}>{m.status.toUpperCase()}</span>
                  <span className="agent-spacer" />
                  {m.doc_id && <button className="ghost small" onClick={() => router.push(`/doc/${m.doc_id}`)}>Read the order</button>}
                </div>
                <div className="mission-obj">{m.objective}</div>
                {m.report && <div className="mission-report">{m.report}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
