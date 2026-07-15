"use client";
import { useState } from "react";
import { toast } from "@/lib/ui-store";

export default function RequestAccess({
  id, title, classification, reason, alreadyRequested,
}: { id: number; title: string; classification: number; reason: "clearance" | "folder"; alreadyRequested: boolean }) {
  const [sent, setSent] = useState(alreadyRequested);
  const [why, setWhy] = useState("");

  async function send() {
    const res = await fetch(`/api/documents/${id}/request-access`, { method: "POST", body: JSON.stringify({ reason: why }) });
    const data = await res.json();
    if (!res.ok) return toast(data.error, "error");
    setSent(true);
    toast("Access request transmitted.", "success");
  }

  return (
    <div className="login-wrap">
      <div className="login-box" style={{ width: 460 }}>
        <h1 style={{ textAlign: "center", marginBottom: 4 }}>Access Restricted</h1>
        <p className="muted" style={{ textAlign: "center", marginBottom: 20 }}>Protocol 7-Alpha</p>
        <div className="panel">
          <div className="card-meta" style={{ marginBottom: 12 }}>
            <span className={`classif ${classification >= 7 ? "high" : classification >= 4 ? "mid" : "low"}`}>
              LVL.{classification} — {classification >= 7 ? "TOP SECRET" : classification >= 4 ? "CLASSIFIED" : "RESTRICTED"}
            </span>
          </div>
          <div className="card-title" style={{ marginBottom: 10 }}>{title}</div>
          <p className="muted" style={{ marginBottom: 14 }}>
            {reason === "clearance"
              ? "This document is classified above your clearance level."
              : "This document sits in a restricted folder you are not cleared for."}
          </p>

          {sent ? (
            <p className="success">✓ Request transmitted. A senior officer must approve it — you'll be notified.</p>
          ) : (
            <>
              <input placeholder="REASON FOR REQUEST (optional)" value={why} onChange={(e) => setWhy(e.target.value)} />
              <button style={{ width: "100%" }} onClick={send}>Request access</button>
            </>
          )}
          <a href="/dashboard"><button className="ghost" style={{ width: "100%", marginTop: 10 }}>← Archives</button></a>
        </div>
      </div>
    </div>
  );
}
