"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ChangePassword({ codename, matricule }: { codename: string; matricule: string }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (next !== confirm) return setError("Les deux nouveaux mots de passe ne correspondent pas.");
    const res = await fetch("/api/auth/password", {
      method: "POST",
      body: JSON.stringify({ current, next }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    router.push("/dashboard");
  }

  return (
    <div className="login-wrap">
      <div className="login-box">
        <h1 style={{ textAlign: "center", marginBottom: 4 }}>Protocole de sécurité</h1>
        <p className="muted" style={{ textAlign: "center", marginBottom: 20 }}>
          {matricule} · {codename} — vous devez définir un nouveau mot de passe avant de continuer
        </p>
        <div className="panel">
          {error && <p className="error">⚠ {error}</p>}
          <form onSubmit={submit}>
            <input type="password" placeholder="MOT DE PASSE TEMPORAIRE" value={current} onChange={(e) => setCurrent(e.target.value)} />
            <input type="password" placeholder="NOUVEAU MOT DE PASSE (min. 6 caractères)" value={next} onChange={(e) => setNext(e.target.value)} />
            <input type="password" placeholder="CONFIRMER LE NOUVEAU MOT DE PASSE" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <button style={{ width: "100%" }}>Définir le nouveau mot de passe</button>
          </form>
        </div>
      </div>
    </div>
  );
}
