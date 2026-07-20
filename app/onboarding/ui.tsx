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
    if (!res.ok) return toast((await res.json()).error || "Upload failed.", "error");
    setHasImage(true);
    toast("Handwritten signature saved.", "success");
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
        toast(d.error || "Couldn't sign — refreshing…", "error");
        router.refresh();
        return;
      }
      toast("Oath signed. Access granted, agent.", "success");
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
        <h1 style={{ textAlign: "center", marginBottom: 4 }}>Oath of Service</h1>
        <p className="muted" style={{ textAlign: "center", marginBottom: 20 }}>
          Agent {session.matricule} · {session.codename} — LVL.{session.clearance}
        </p>

        <div className="panel">
          <p style={{ marginBottom: 12 }}>
            Welcome, agent. Before accessing the system, you must <strong>read and sign</strong> your
            personnel file. Access to archives, missions and transmissions stays locked until your
            oath is signed.
          </p>
          <p className="muted" style={{ marginBottom: 16 }}>
            File: <strong>{title}</strong>
          </p>

          <a href={`/api/documents/${docId}/pdf`} target="_blank" rel="noopener noreferrer">
            <button type="button" className="ghost" style={{ width: "100%", marginBottom: 16 }}>
              📄 Read my file
            </button>
          </a>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button type="button" disabled={busy} onClick={() => sign("typed")}>
              ✍️ Sign with my codename
            </button>

            {hasImage ? (
              <button type="button" className="ghost" disabled={busy} onClick={() => sign("image")}>
                🖊️ Sign with my handwritten signature
              </button>
            ) : (
              <button type="button" className="ghost" disabled={busy} onClick={() => fileInput.current?.click()}>
                ⬆️ Upload a handwritten signature
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
            <span className="muted" style={{ fontSize: "0.8rem" }}>Get notified of future signatures:</span>
            <NotifToggle />
          </div>

          <p className="muted" style={{ marginTop: 12, fontSize: "0.8rem" }}>
            An officer will countersign your file afterward — you don't need to wait for that
            validation to access the system.
          </p>
        </div>

        <button type="button" className="ghost small" style={{ marginTop: 14 }} onClick={logout}>
          Sign out
        </button>
      </div>
    </div>
  );
}
