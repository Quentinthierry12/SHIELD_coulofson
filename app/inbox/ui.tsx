"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast, promptDialog, confirmDialog } from "@/lib/ui-store";
import type { Session } from "@/lib/session";
import NotifToggle from "../notif-toggle";

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
    toast("Signature manuscrite enregistrée.", "success");
    load();
  }

  async function sign(r: Request, kind: "typed" | "image") {
    const res = await fetch(`/api/signatures/${r.id}`, { method: "POST", body: JSON.stringify({ kind }) });
    const d = await res.json();
    if (!res.ok) return toast(d.error, "error");
    setSigning(null);
    toast(d.remaining ? `Signé. ${d.remaining} signature(s) encore requise(s).` : "Signé — le document est désormais scellé.", "success");
    load();
  }

  async function decline(r: Request) {
    const reason = await promptDialog({
      title: `Refuser de signer « ${r.title} » ?`,
      message: "Le demandeur sera prévenu avec votre motif, et le document est libéré pour correction.",
      placeholder: "Motif du refus",
    });
    if (reason === null) return;
    const res = await fetch(`/api/signatures/${r.id}`, { method: "POST", body: JSON.stringify({ decline: true, reason }) });
    if (!res.ok) return toast((await res.json()).error, "error");
    setSigning(null);
    toast("Refus enregistré.", "success");
    load();
  }

  async function cancel(r: Request) {
    const ok = await confirmDialog({
      title: `Annuler la demande sur « ${r.title} » ?`,
      message: "Les signatures déjà données sont rejetées et le document est descellé.",
      confirmLabel: "Annuler la demande", danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/signatures/${r.id}`, { method: "DELETE" });
    if (!res.ok) return toast((await res.json()).error, "error");
    toast("Demande annulée.", "success");
    load();
  }

  const progress = (r: Request) => `${r.signers.filter((x) => x.status === "signed").length}/${r.signers.length}`;

  return (
    <>
      <div className="topbar">
        <div className="logo">
          <a href="/dashboard"><button className="ghost small">← Archives</button></a>
          <h1>Transmissions</h1>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <NotifToggle />
          <span className="badge">{session.matricule} · LVL. {session.clearance}</span>
        </div>
      </div>

      <div className="container">
        {loading && <div className="panel"><div className="skeleton" style={{ height: 70 }} /></div>}

        {!loading && (
          <div className="panel" style={data.to_sign.length ? { borderColor: "#665520" } : undefined}>
            <h2>En attente de votre signature ({data.to_sign.length})</h2>
            {data.to_sign.length === 0 && <p className="muted">Rien à signer.</p>}
            {data.to_sign.map((r) => (
              <div key={r.id} className="mission-row">
                <div className="mission-head">
                  <b>{r.title}</b>
                  <span className="chip lv mono">LVL. {r.classification}</span>
                  {r.sequential && <span className="chip">CHAÎNE</span>}
                  <span className="chip">{progress(r)} signé(s)</span>
                  <span className="agent-spacer" />
                  <button className="ghost small" onClick={() => router.push(`/doc/${r.doc_id}`)}>Lire</button>
                  <button className="small" onClick={() => setSigning(r)}>Signer</button>
                  <button className="ghost small danger" onClick={() => decline(r)}>Refuser</button>
                </div>
                <div className="mission-meta muted">
                  Demandé par {r.requested_by_codename || "—"}
                  {r.note ? ` · ${r.note}` : ""}
                </div>
                <SignerList signers={r.signers} />
              </div>
            ))}
          </div>
        )}

        {!loading && data.waiting.length > 0 && (
          <div className="panel">
            <h2>En attente des autres ({data.waiting.length})</h2>
            {data.waiting.map((r) => (
              <div key={r.id} className="mission-row">
                <div className="mission-head">
                  <b>{r.title}</b>
                  <span className="chip">{progress(r)} signé(s)</span>
                  <span className="agent-spacer" />
                  <button className="ghost small" onClick={() => router.push(`/doc/${r.doc_id}`)}>Lire</button>
                  <button className="ghost small danger" onClick={() => cancel(r)}>Annuler</button>
                </div>
                <SignerList signers={r.signers} />
              </div>
            ))}
          </div>
        )}

        {!loading && data.done.length > 0 && (
          <div className="panel">
            <h2>Réglées</h2>
            {data.done.map((r) => (
              <div key={r.id} className="mission-row">
                <div className="mission-head">
                  <b>{r.title}</b>
                  <span className={`classif ${r.status === "complete" ? "low" : "high"}`}>
                    {r.status === "complete" ? "SCELLÉ" : r.status.toUpperCase()}
                  </span>
                  <span className="agent-spacer" />
                  <button className="ghost small" onClick={() => router.push(`/doc/${r.doc_id}`)}>Lire</button>
                </div>
                <SignerList signers={r.signers} />
              </div>
            ))}
          </div>
        )}

        <div className="panel">
          <h2>Ma signature</h2>
          <p className="muted" style={{ marginBottom: 12 }}>
            Signez avec votre nom de code, rendu dans une écriture manuscrite, ou avec un scan de votre propre
            signature. Les deux sont enregistrés sous votre matricule.
          </p>
          <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div className="muted sheet-label">Dactylographiée</div>
              <div className="sig-preview">{session.codename}</div>
            </div>
            <div>
              <div className="muted sheet-label">Manuscrite</div>
              {hasImage ? (
                <img src="/api/me/signature" alt="" className="sig-image" />
              ) : (
                <span className="muted" style={{ fontSize: ".8rem" }}>Aucune enregistrée</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden
                onChange={(e) => e.target.files?.[0] && uploadSignature(e.target.files[0])}
              />
              <button className="ghost small" onClick={() => fileInput.current?.click()}>
                {hasImage ? "Remplacer" : "Importer une signature"}
              </button>
              {hasImage && (
                <button className="ghost small danger" onClick={async () => {
                  await fetch("/api/me/signature", { method: "DELETE" });
                  toast("Signature supprimée.", "success");
                  load();
                }}>Retirer</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {signing && (
        <div className="overlay" onClick={() => setSigning(null)}>
          <div className="modal panel" onClick={(e) => e.stopPropagation()}>
            <h2>Signer « {signing.title} »</h2>
            <p className="muted" style={{ marginBottom: 14 }}>
              Signer appose votre nom sur cette version exacte du document. Une fois que tous ont signé,
              il ne peut plus être modifié.
            </p>
            <div className="sig-choice" onClick={() => sign(signing, "typed")}>
              <div className="sig-preview">{session.codename}</div>
              <div className="muted" style={{ fontSize: ".75rem" }}>Signer avec mon nom de code</div>
            </div>
            {hasImage && (
              <div className="sig-choice" onClick={() => sign(signing, "image")}>
                <img src="/api/me/signature" alt="" className="sig-image" />
                <div className="muted" style={{ fontSize: ".75rem" }}>Signer avec ma signature manuscrite</div>
              </div>
            )}
            <div className="sheet-footer">
              <button className="ghost" onClick={() => setSigning(null)}>Annuler</button>
              <button className="ghost danger" onClick={() => decline(signing)}>Refuser</button>
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
              title={s.status === "signed" ? `Signé ${new Date(s.signed_at!).toLocaleString("fr-FR")}` : s.reason || s.status}>
          {s.codename}
        </span>
      ))}
    </div>
  );
}
