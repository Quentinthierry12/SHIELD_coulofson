"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const COMMANDS_CHANNEL = "https://discord.com/channels/1371057544579252224/1513475225474306069";

const DISCORD_MSG: Record<string, { text: string; ok?: boolean }> = {
  error: { text: "Échec de la connexion Discord. Veuillez réessayer." },
  unknown: { text: "Aucun compte agent n'est lié à ce compte Discord. Connectez-vous d'abord avec votre matricule, puis liez Discord." },
  inactive: { text: "Votre compte n'est pas encore actif — un officier doit valider votre habilitation." },
  linked: { text: "Discord lié ✓ Vous recevrez les mises à jour de votre compte en message privé.", ok: true },
  taken: { text: "Ce compte Discord est déjà lié à un autre agent." },
};

function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">(params.get("mode") === "register" ? "register" : "login");
  const [matricule, setMatricule] = useState("");
  const [customBadge, setCustomBadge] = useState("");
  const [codename, setCodename] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [registered, setRegistered] = useState<{ matricule: string; linkToken: string | null; discord: boolean } | null>(null);

  const dmsg = DISCORD_MSG[params.get("discord") || ""];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "login") {
      const res = await fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ matricule, password }) });
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
      setRegistered({ matricule: data.matricule, linkToken: data.linkToken ?? null, discord: !!data.discord });
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-box" style={{ width: 440 }}>
        <div className="eagle">
          <img src="/logo.png" alt="" className="logo-img" style={{ height: 90 }} onError={(e) => (e.currentTarget.style.display = "none")} />
        </div>
        <h1 style={{ textAlign: "center", marginBottom: 4 }}>S.H.I.E.L.D.</h1>
        <p className="muted" style={{ textAlign: "center", marginBottom: 20 }}>Système Documentaire Central — Accès restreint</p>

        {registered ? (
          <div className="panel">
            <p className="success" style={{ marginBottom: 10 }}>✓ Demande d'enrôlement enregistrée.</p>
            <p style={{ marginBottom: 8 }}>
              Ton matricule : <strong className="mono">{registered.matricule}</strong> — note-le.
              Un officier supérieur doit valider ton habilitation avant ta première connexion.
            </p>
            {registered.discord && registered.linkToken && (
              <>
                <p className="muted" style={{ marginBottom: 8, fontSize: ".85rem" }}>
                  Lie ton Discord maintenant pour être <strong>prévenu par message privé</strong> dès que ton
                  compte avance (validation, habilitation…).
                </p>
                <a href={`/api/auth/discord?link=${encodeURIComponent(registered.linkToken)}`}>
                  <button type="button" style={{ width: "100%", marginBottom: 8 }}>🔗 Lier mon Discord</button>
                </a>
              </>
            )}
            <button type="button" className="ghost" style={{ width: "100%" }} onClick={() => { setRegistered(null); setMode("login"); }}>
              Aller à la connexion
            </button>
          </div>
        ) : (
          <div className="panel">
            <div className="tabs">
              <button className={mode === "login" ? "" : "inactive"} onClick={() => setMode("login")} type="button">Se connecter</button>
              <button className={mode === "register" ? "" : "inactive"} onClick={() => setMode("register")} type="button">S'enrôler</button>
            </div>

            {dmsg && <p className={dmsg.ok ? "success" : "error"}>{dmsg.ok ? "✓" : "⚠"} {dmsg.text}</p>}
            {error && <p className="error">⚠ {error}</p>}

            {mode === "register" && (
              <div className="enlist-help">
                <p style={{ margin: "0 0 6px", fontWeight: 600 }}>Créer ton compte, étape par étape :</p>
                <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                  <li>Va dans le salon <strong>#commands</strong> du Discord — <a href={COMMANDS_CHANNEL} target="_blank" rel="noopener noreferrer">ouvrir</a>.</li>
                  <li>Tape la commande <span className="mono">/profile</span>.</li>
                  <li>Copie ton <strong>AGENT-ID</strong> et colle-le dans <strong>Matricule</strong> ci-dessous.</li>
                  <li>Ton <strong>nom de code</strong> = ton pseudo <strong>Roblox</strong>.</li>
                </ol>
              </div>
            )}

            <form onSubmit={submit}>
              {mode === "login" ? (
                <input placeholder="MATRICULE (ex. AG-4782)" value={matricule} onChange={(e) => setMatricule(e.target.value)} />
              ) : (
                <>
                  <input placeholder="NOM DE CODE (ton pseudo Roblox)" value={codename} onChange={(e) => setCodename(e.target.value)} />
                  <input placeholder="MATRICULE — ton AGENT-ID (/profile)" value={customBadge} onChange={(e) => setCustomBadge(e.target.value)} />
                </>
              )}
              <input type="password" placeholder="MOT DE PASSE" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button style={{ width: "100%" }}>{mode === "login" ? "Se connecter" : "Demander l'accès"}</button>
            </form>

            {mode === "login" && (
              <a href="/api/auth/discord">
                <button type="button" className="ghost" style={{ width: "100%", marginTop: 10 }}>Se connecter avec Discord</button>
              </a>
            )}
          </div>
        )}

        <a href="/"><button type="button" className="ghost small" style={{ marginTop: 14 }}>← Accueil</button></a>
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
