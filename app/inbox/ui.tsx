"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast, promptDialog, confirmDialog } from "@/lib/ui-store";
import type { Session } from "@/lib/session";

type Signer = {
  user_id: number; position: number; status: string; kind: string | null;
  signed_at: string | null; reason: string | null; matricule: string; codename: string;
};
type Request = {
  id: number; doc_id: number; circuit: string; sequential: boolean; note: string | null;
  status: string; created_at: string; completed_at: string | null; title: string;
  classification: number; locked: boolean;
  requested_by_codename: string | null; requested_by_matricule: string | null;
  signers: Signer[];
};

// The dispatch board. An agent sees what they must sign; an officer additionally sees
// everything still awaiting signature. One screen, scoped by the API.
export default function Inbox({ session }: { session: Session }) {
  const router = useRouter();
  const [data, setData] = useState<{ to_sign: Request[]; waiting: Request[]; done: Request[] }>({ to_sign: [], waiting: [], done: [] });
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState<Request | null>(null);
  const [hasImage, setHasImage] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch("/api/signatures");
    if (res.ok) setData(await res.json());
    setHasImage((await fetch("/api/me/signature")).ok);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function uploadSignature(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/me/signature", { method: "POST", body: fd });
    if (!res.ok) return toast((await res.json()).error, "error");
    toast("Handwritten signature stored.", "success");
    load();
  }

  async function sign(r: Request, kind: "typed" | "image") {
    const res = await fetch(`/api/signatures/${r.id}`, { method: "POST", body: JSON.stringify({ kind }) });
    const d = await res.json();
    if (!res.ok) return toast(d.error, "error");
    setSigning(null);
    toast(d.remaining ? `Signed. ${d.remaining} signature(s) still required.` : "Signed — the document is now sealed.", "success");
    load();
  }

  async function decline(r: Request) {
    const reason = await promptDialog({
      title: `Decline to sign “${r.title}”?`,
      message: "The requester will be notified with your reason, and the document is released for correction.",
      placeholder: "Reason for refusal",
    });
    if (reason === null) return;
    const res = await fetch(`/api/signatures/${r.id}`, { method: "POST", body: JSON.stringify({ decline: true, reason }) });
    if (!res.ok) return toast((await res.json()).error, "error");
    setSigning(null);
    toast("Refusal recorded.", "success");
    load();
  }

  async function cancel(r: Request) {
    const ok = await confirmDialog({
      title: `Cancel the request on “${r.title}”?`,
      message: "Signatures already given are discarded and the document is unsealed.",
      confirmLabel: "Cancel request", danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/signatures/${r.id}`, { method: "DELETE" });
    if (!res.ok) return toast((await res.json()).error, "error");
    toast("Request cancelled.", "success");
    load();
  }

  const progress = (r: Request) => `${r.signers.filter((x) => x.status === "signed").length}/${r.signers.length}`;

  return (
    <>
      <div className="topbar">
        <div className="logo">
          <a href="/dashboard"><button className="ghost small">← Archives</button></a>
          <h1>Dispatch</h1>
        </div>
        <span className="badge">{session.matricule} · LVL. {session.clearance}</span>
      </div>

      <div className="container">
        {loading && <div className="panel"><div className="skeleton" style={{ height: 70 }} /></div>}

        {!loading && (
          <div className="panel" style={data.to_sign.length ? { borderColor: "#665520" } : undefined}>
            <h2>Awaiting your signature ({data.to_sign.length})</h2>
            {data.to_sign.length === 0 && <p className="muted">Nothing to sign.</p>}
            {data.to_sign.map((r) => (
              <div key={r.id} className="mission-row">
                <div className="mission-head">
                  <b>{r.title}</b>
                  <span className="chip lv mono">LVL. {r.classification}</span>
                  {r.sequential && <span className="chip">CHAIN</span>}
                  <span className="chip">{progress(r)} signed</span>
                  <span className="agent-spacer" />
                  <button className="ghost small" onClick={() => router.push(`/doc/${r.doc_id}`)}>Read</button>
                  <button className="small" onClick={() => setSigning(r)}>Sign</button>
                  <button className="ghost small danger" onClick={() => decline(r)}>Decline</button>
                </div>
                <div className="mission-meta muted">
                  Requested by {r.requested_by_codename || "—"}
                  {r.note ? ` · ${r.note}` : ""}
                </div>
                <SignerList signers={r.signers} />
              </div>
            ))}
          </div>
        )}

        {!loading && data.waiting.length > 0 && (
          <div className="panel">
            <h2>Awaiting others ({data.waiting.length})</h2>
            {data.waiting.map((r) => (
              <div key={r.id} className="mission-row">
                <div className="mission-head">
                  <b>{r.title}</b>
                  <span className="chip">{progress(r)} signed</span>
                  <span className="agent-spacer" />
                  <button className="ghost small" onClick={() => router.push(`/doc/${r.doc_id}`)}>Read</button>
                  <button className="ghost small danger" onClick={() => cancel(r)}>Cancel</button>
                </div>
                <SignerList signers={r.signers} />
              </div>
            ))}
          </div>
        )}

        {!loading && data.done.length > 0 && (
          <div className="panel">
            <h2>Settled</h2>
            {data.done.map((r) => (
              <div key={r.id} className="mission-row">
                <div className="mission-head">
                  <b>{r.title}</b>
                  <span className={`classif ${r.status === "complete" ? "low" : "high"}`}>
                    {r.status === "complete" ? "SEALED" : r.status.toUpperCase()}
                  </span>
                  <span className="agent-spacer" />
                  <button className="ghost small" onClick={() => router.push(`/doc/${r.doc_id}`)}>Read</button>
                </div>
                <SignerList signers={r.signers} />
              </div>
            ))}
          </div>
        )}

        <div className="panel">
          <h2>My signature</h2>
          <p className="muted" style={{ marginBottom: 12 }}>
            Sign either with your codename, rendered in a handwriting face, or with a scan of your own
            signature. Both are recorded against your badge.
          </p>
          <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div className="muted sheet-label">Typed</div>
              <div className="sig-preview">{session.codename}</div>
            </div>
            <div>
              <div className="muted sheet-label">Handwritten</div>
              {hasImage ? (
                <img src="/api/me/signature" alt="" className="sig-image" />
              ) : (
                <span className="muted" style={{ fontSize: ".8rem" }}>None on file</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden
                onChange={(e) => e.target.files?.[0] && uploadSignature(e.target.files[0])}
              />
              <button className="ghost small" onClick={() => fileInput.current?.click()}>
                {hasImage ? "Replace" : "Import a signature"}
              </button>
              {hasImage && (
                <button className="ghost small danger" onClick={async () => {
                  await fetch("/api/me/signature", { method: "DELETE" });
                  toast("Signature removed.", "success");
                  load();
                }}>Remove</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {signing && (
        <div className="overlay" onClick={() => setSigning(null)}>
          <div className="modal panel" onClick={(e) => e.stopPropagation()}>
            <h2>Sign “{signing.title}”</h2>
            <p className="muted" style={{ marginBottom: 14 }}>
              Signing seals your name to this exact version of the document. Once every signer has signed,
              it can no longer be edited.
            </p>
            <div className="sig-choice" onClick={() => sign(signing, "typed")}>
              <div className="sig-preview">{session.codename}</div>
              <div className="muted" style={{ fontSize: ".75rem" }}>Sign with my codename</div>
            </div>
            {hasImage && (
              <div className="sig-choice" onClick={() => sign(signing, "image")}>
                <img src="/api/me/signature" alt="" className="sig-image" />
                <div className="muted" style={{ fontSize: ".75rem" }}>Sign with my handwritten signature</div>
              </div>
            )}
            <div className="sheet-footer">
              <button className="ghost" onClick={() => setSigning(null)}>Cancel</button>
              <button className="ghost danger" onClick={() => decline(signing)}>Decline</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SignerList({ signers }: { signers: Signer[] }) {
  return (
    <div className="signer-list">
      {signers.map((s) => (
        <span key={s.user_id} className={`sync-dot ${s.status === "signed" ? "on" : s.status === "declined" ? "bad" : "off"}`}
              title={s.status === "signed" ? `Signed ${new Date(s.signed_at!).toLocaleString()}` : s.reason || s.status}>
          {s.codename}
        </span>
      ))}
    </div>
  );
}
