"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [matricule, setMatricule] = useState("");
  const [codename, setCodename] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (mode === "login") {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ matricule, password }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error);
      router.push("/dashboard");
    } else {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ codename, password }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error);
      setSuccess(
        `Demande enregistrée. Votre matricule : ${data.matricule} — notez-le. ` +
          `Un officier doit valider votre habilitation avant votre première connexion.`
      );
      setMode("login");
      setMatricule(data.matricule);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-box">
        <div className="eagle">
          <img src="/logo.png" alt="S.H.I.E.L.D." className="logo-img" style={{ height: 110 }}
               onError={(e) => { e.currentTarget.outerHTML = "🦅"; }} />
        </div>
        <h1 style={{ textAlign: "center", marginBottom: 4 }}>S.H.I.E.L.D.</h1>
        <p className="muted" style={{ textAlign: "center", marginBottom: 20 }}>
          Système Documentaire Central — Accès restreint
        </p>
        <div className="panel">
          <div className="tabs">
            <button className={mode === "login" ? "" : "inactive"} onClick={() => setMode("login")} type="button">
              Connexion
            </button>
            <button className={mode === "register" ? "" : "inactive"} onClick={() => setMode("register")} type="button">
              Recrutement
            </button>
          </div>
          {error && <p className="error">⚠ {error}</p>}
          {success && <p className="success">✓ {success}</p>}
          <form onSubmit={submit}>
            {mode === "login" ? (
              <input placeholder="MATRICULE (ex: AG-4782)" value={matricule} onChange={(e) => setMatricule(e.target.value)} />
            ) : (
              <input placeholder="NOM DE CODE" value={codename} onChange={(e) => setCodename(e.target.value)} />
            )}
            <input type="password" placeholder="MOT DE PASSE" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button style={{ width: "100%" }}>{mode === "login" ? "S'identifier" : "Demander l'accès"}</button>
          </form>
        </div>
        <p className="muted" style={{ textAlign: "center", fontSize: "0.7rem" }}>
          Toute intrusion sera poursuivie — Protocole 7-Alpha
        </p>
      </div>
    </div>
  );
}
