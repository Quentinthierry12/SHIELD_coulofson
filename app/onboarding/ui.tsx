"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/ui-store";
import NotifToggle from "../notif-toggle";

type Props = {
  session: { matricule: string; codename: string; clearance: number };
  requestId: number;
  docId: number;
  title: string;
};

// Barrière d'accueil : l'agent doit signer son serment. Réutilise l'API de signature
// du Dispatch (POST /api/signatures/:id) — signature dactylographiée (codename en
// écriture) ou image manuscrite téléversée.
export default function OnboardingUI({ session, requestId, docId, title }: Props) {
  const router = useRouter();
  const [hasImage, setHasImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/me/signature").then((r) => setHasImage(r.ok)).catch(() => {});
  }, []);

  async function uploadSignature(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/me/signature", { method: "POST", body: fd });
    if (!res.ok) return toast((await res.json()).error || "Échec du téléversement.", "error");
    setHasImage(true);
    toast("Signature manuscrite enregistrée.", "success");
  }

  async function sign(kind: "typed" | "image") {
    setBusy(true);
    try {
      const res = await fetch(`/api/signatures/${requestId}`, {
        method: "POST",
        body: JSON.stringify({ kind }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        // La demande a pu être remplacée/réglée entre-temps (relance ou override admin,
        // autre onglet…) : on ré-évalue au lieu de rester coincé sur une page périmée.
        // Si l'agent est en règle, /onboarding redirige de lui-même vers le Dashboard.
        toast(d.error || "Impossible de signer — actualisation…", "error");
        router.refresh();
        return;
      }
      toast("Serment signé. Accès accordé, agent.", "success");
      router.replace("/dashboard");
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    fetch("/api/auth/logout", { method: "POST" }).finally(() => router.replace("/"));
  }

  return (
    <div className="login-wrap">
      <div className="login-box" style={{ width: 440 }}>
        <div className="eagle">
          <img src="/logo.png" alt="" className="logo-img" style={{ height: 84 }}
               onError={(e) => (e.currentTarget.style.display = "none")} />
        </div>
        <h1 style={{ textAlign: "center", marginBottom: 4 }}>Serment de service</h1>
        <p className="muted" style={{ textAlign: "center", marginBottom: 20 }}>
          Agent {session.matricule} · {session.codename} — LVL.{session.clearance}
        </p>

        <div className="panel">
          <p style={{ marginBottom: 12 }}>
            Bienvenue, agent. Avant d'accéder au système, tu dois <strong>lire et signer</strong> ton
            dossier d'agent. L'accès aux archives, missions et transmissions reste bloqué tant que
            ton serment n'est pas signé.
          </p>
          <p className="muted" style={{ marginBottom: 16 }}>
            Dossier : <strong>{title}</strong>
          </p>

          <a href={`/api/documents/${docId}/pdf`} target="_blank" rel="noopener noreferrer">
            <button type="button" className="ghost" style={{ width: "100%", marginBottom: 16 }}>
              📄 Lire mon dossier
            </button>
          </a>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button type="button" disabled={busy} onClick={() => sign("typed")}>
              ✍️ Signer avec mon codename
            </button>

            {hasImage ? (
              <button type="button" className="ghost" disabled={busy} onClick={() => sign("image")}>
                🖊️ Signer avec ma signature manuscrite
              </button>
            ) : (
              <button type="button" className="ghost" disabled={busy} onClick={() => fileInput.current?.click()}>
                ⬆️ Téléverser une signature manuscrite
              </button>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg"
              style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadSignature(f); e.currentTarget.value = ""; }}
            />
          </div>

          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className="muted" style={{ fontSize: "0.8rem" }}>Être prévenu des prochaines signatures :</span>
            <NotifToggle />
          </div>

          <p className="muted" style={{ marginTop: 12, fontSize: "0.8rem" }}>
            Un officier contresignera ensuite ton dossier — tu n'as pas besoin d'attendre cette
            validation pour accéder au système.
          </p>
        </div>

        <button type="button" className="ghost small" style={{ marginTop: 14 }} onClick={logout}>
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
