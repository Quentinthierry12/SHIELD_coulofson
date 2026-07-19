"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

const DISCORD_ERRORS: Record<string, string> = {
  error: "Échec de la connexion Discord. Veuillez réessayer.",
  unknown: "Aucun compte agent n'est lié à ce compte Discord. Connectez-vous d'abord avec votre matricule, puis liez Discord depuis le tableau de bord.",
  inactive: "Votre compte n'est pas encore actif.",
};

function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [matricule, setMatricule] = useState("");
  const [customBadge, setCustomBadge] = useState("");
  const [codename, setCodename] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(DISCORD_ERRORS[params.get("discord") || ""] || "");
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
        body: JSON.stringify({ codename, password, matricule: customBadge }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error);
      setSuccess(
        `Demande enregistrée. Votre matricule : ${data.matricule} — notez-le. ` +
          `Un officier supérieur doit valider votre habilitation avant votre première connexion.`
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
               onError={(e) => { e.currentTarget.style.display = "none"; }} />
        </div>
        <h1 style={{ textAlign: "center", marginBottom: 4 }}>S.H.I.E.L.D.</h1>
        <p className="muted" style={{ textAlign: "center", marginBottom: 20 }}>
          Central Document System — Restricted access
        </p>
        <div className="panel">
          <div className="tabs">
            <button className={mode === "login" ? "" : "inactive"} onClick={() => setMode("login")} type="button">
              Se connecter
            </button>
            <button className={mode === "register" ? "" : "inactive"} onClick={() => setMode("register")} type="button">
              S'enrôler
            </button>
          </div>
          {error && <p className="error">⚠ {error}</p>}
          {success && <p className="success">✓ {success}</p>}
          <form onSubmit={submit}>
            {mode === "login" ? (
              <input placeholder="MATRICULE (ex. AG-4782)" value={matricule} onChange={(e) => setMatricule(e.target.value)} />
            ) : (
              <>
                <input placeholder="NOM DE CODE" value={codename} onChange={(e) => setCodename(e.target.value)} />
                <input placeholder="MATRICULE PERSONNALISÉ (facultatif — auto si vide)" value={customBadge} onChange={(e) => setCustomBadge(e.target.value)} />
              </>
            )}
            <input type="password" placeholder="MOT DE PASSE" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button style={{ width: "100%" }}>{mode === "login" ? "Se connecter" : "Demander l'accès"}</button>
          </form>
          {mode === "login" && (
            <a href="/api/auth/discord">
              <button type="button" className="ghost" style={{ width: "100%", marginTop: 10 }}>
                Se connecter avec Discord
              </button>
            </a>
          )}
        </div>
        <p className="muted" style={{ textAlign: "center", fontSize: "0.7rem" }}>
          Tout accès non autorisé fera l'objet de poursuites — Protocole 7-Alpha
        </p>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <LoginPage />
    </Suspense>
  );
}
