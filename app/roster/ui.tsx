"use client";
import { useEffect, useState } from "react";

type Agent = { matricule: string; codename: string; clearance: number; role: string; division: string };

function rank(level: number) {
  const cls = level >= 7 ? "high" : level >= 4 ? "mid" : "low";
  return <span className={`classif ${cls}`}>LVL.{level}</span>;
}

export default function Roster({ isAdmin }: { isAdmin: boolean }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/roster").then(async (r) => { if (r.ok) setAgents(await r.json()); setLoading(false); });
  }, []);

  // Group by division for the org-chart feel.
  const groups = new Map<string, Agent[]>();
  for (const a of agents) {
    const key = a.division || "No division";
    (groups.get(key) || groups.set(key, []).get(key)!).push(a);
  }

  return (
    <>
      <div className="topbar">
        <div className="logo">
          <a href="/dashboard"><button className="ghost small">← Archives</button></a>
          <h1>Roster</h1>
          <span className="badge">S.H.I.E.L.D. PERSONNEL</span>
        </div>
        <span className="badge">{agents.length} active agents</span>
      </div>
      <div className="container">
        {[...groups.entries()].map(([division, list]) => (
          <div key={division} className="panel">
            <h2>{division} <span className="muted" style={{ textTransform: "none" }}>({list.length})</span></h2>
            <table>
              <thead>
                <tr><th>Badge</th><th>Code name</th><th>Clearance</th><th>Role</th></tr>
              </thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.matricule}>
                    <td className="mono">{a.matricule}</td>
                    <td>{a.codename}</td>
                    <td>{rank(a.clearance)}</td>
                    <td className="muted">{a.role === "admin" ? "Officer" : "Agent"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {loading && <div className="panel"><div className="skeleton" style={{ height: 120 }} /></div>}
        {!loading && agents.length === 0 && (
          <div className="empty">
            <div className="empty-mark">[ ▚ ]</div>
            <div className="empty-title">No active agents</div>
            <div>Validate recruits from Command to fill out the roster.</div>
          </div>
        )}
        {isAdmin && <p className="muted">Tip: set each agent's division from Command → Agents.</p>}
      </div>
    </>
  );
}
