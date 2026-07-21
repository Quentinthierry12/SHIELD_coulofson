"use client";
import { useEffect, useState } from "react";
import { toast, confirmDialog } from "@/lib/ui-store";

type Loa = { id: number; start_date: string; end_date: string; reason: string | null; state: "current" | "upcoming" | "past" };

export default function LoaUI({ matricule }: { matricule: string }) {
  const [items, setItems] = useState<Loa[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const r = await fetch("/api/loa");
    if (r.ok) setItems(await r.json());
  }
  useEffect(() => { load(); }, []);

  async function declare(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/loa", { method: "POST", body: JSON.stringify({ start_date: start, end_date: end, reason }) });
    const d = await res.json();
    if (!res.ok) return setError(d.error);
    setStart(""); setEnd(""); setReason("");
    toast("Leave of absence declared.", "success");
    load();
  }

  async function cancel(l: Loa) {
    const ok = await confirmDialog({ title: "Cancel this leave?", message: `${l.start_date} → ${l.end_date}`, confirmLabel: "Cancel leave", danger: true });
    if (!ok) return;
    const res = await fetch(`/api/loa/${l.id}`, { method: "DELETE" });
    if (!res.ok) return toast((await res.json()).error, "error");
    toast("Leave cancelled.", "success");
    load();
  }

  const current = items.filter((i) => i.state === "current");
  const upcoming = items.filter((i) => i.state === "upcoming");
  const past = items.filter((i) => i.state === "past");

  const Row = ({ l, canCancel }: { l: Loa; canCancel: boolean }) => (
    <div className="ov-row">
      <span><span className="mono">{l.start_date} → {l.end_date}</span>{l.reason ? <span className="muted"> · {l.reason}</span> : null}</span>
      <span className="agent-spacer" />
      {canCancel && <button className="ghost small danger" onClick={() => cancel(l)}>Cancel</button>}
    </div>
  );

  return (
    <>
      <div className="topbar">
        <div className="logo">
          <a href="/dashboard"><button className="ghost small">← Archives</button></a>
          <h1>Leave of Absence</h1>
        </div>
        <span className="badge">{matricule}</span>
      </div>
      <div className="container">
        <div className="panel">
          <h2>Declare a leave</h2>
          <p className="muted" style={{ marginBottom: 10 }}>
            Your access stays fully open — a leave is a visible status so command knows you're away.
          </p>
          {error && <p className="error">⚠ {error}</p>}
          <form onSubmit={declare} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ fontSize: ".8rem", color: "var(--muted)" }}>From<br />
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} style={{ marginBottom: 0, marginTop: 4 }} />
            </label>
            <label style={{ fontSize: ".8rem", color: "var(--muted)" }}>To<br />
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} style={{ marginBottom: 0, marginTop: 4 }} />
            </label>
            <input placeholder="REASON (optional)" value={reason} onChange={(e) => setReason(e.target.value)} style={{ marginBottom: 0, flex: 1, minWidth: 200 }} />
            <button>Declare</button>
          </form>
        </div>

        {current.length > 0 && (
          <div className="panel" style={{ borderColor: "#665520" }}>
            <h2>On leave now</h2>
            {current.map((l) => <Row key={l.id} l={l} canCancel />)}
          </div>
        )}
        <div className="panel">
          <h2>Upcoming</h2>
          {upcoming.length === 0 ? <p className="muted">No upcoming leave.</p> : upcoming.map((l) => <Row key={l.id} l={l} canCancel />)}
        </div>
        {past.length > 0 && (
          <div className="panel">
            <h2>Past</h2>
            {past.map((l) => <Row key={l.id} l={l} canCancel={false} />)}
          </div>
        )}
      </div>
    </>
  );
}
