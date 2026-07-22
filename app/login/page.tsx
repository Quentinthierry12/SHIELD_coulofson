"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const COMMANDS_CHANNEL = "https://discord.com/channels/1371057544579252224/1513475225474306069";

const DISCORD_MSG: Record<string, { text: string; ok?: boolean }> = {
  error: { text: "Discord sign-in failed. Please try again." },
  unknown: { text: "No agent account is linked to this Discord account. Sign in with your badge number first, then link Discord." },
  inactive: { text: "Your account is not active yet — an officer must validate your clearance." },
  linked: { text: "Discord linked ✓ You'll receive account updates by direct message.", ok: true },
  taken: { text: "This Discord account is already linked to another agent." },
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
        <p className="muted" style={{ textAlign: "center", marginBottom: 20 }}>Central Document System — Restricted access</p>

        {registered ? (
          <div className="panel">
            <p className="success" style={{ marginBottom: 10 }}>✓ Enlistment request submitted.</p>
            <p style={{ marginBottom: 8 }}>
              Your badge number: <strong className="mono">{registered.matricule}</strong> — write it down.
              A senior officer must validate your clearance before your first sign-in.
            </p>
            {registered.discord && registered.linkToken && (
              <>
                <p className="muted" style={{ marginBottom: 8, fontSize: ".85rem" }}>
                  Link your Discord now to get <strong>notified by direct message</strong> as soon as your
                  account progresses (validation, clearance…).
                </p>
                <a href={`/api/auth/discord?link=${encodeURIComponent(registered.linkToken)}`}>
                  <button type="button" style={{ width: "100%", marginBottom: 8 }}>🔗 Link my Discord</button>
                </a>
              </>
            )}
            <button type="button" className="ghost" style={{ width: "100%" }} onClick={() => { setRegistered(null); setMode("login"); }}>
              Go to sign-in
            </button>
          </div>
        ) : (
          <div className="panel">
            <div className="tabs">
              <button className={mode === "login" ? "" : "inactive"} onClick={() => setMode("login")} type="button">Sign in</button>
              <button className={mode === "register" ? "" : "inactive"} onClick={() => setMode("register")} type="button">Enlist</button>
            </div>

            {dmsg && <p className={dmsg.ok ? "success" : "error"}>{dmsg.ok ? "✓" : "⚠"} {dmsg.text}</p>}
            {error && <p className="error">⚠ {error}</p>}

            {mode === "register" && (
              <div className="enlist-help">
                <p style={{ margin: "0 0 6px", fontWeight: 600 }}>Create your account, step by step:</p>
                <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                  <li>Go to the <strong>#commands</strong> channel on Discord — <a href={COMMANDS_CHANNEL} target="_blank" rel="noopener noreferrer">open</a>.</li>
                  <li>Type the <span className="mono">/profile</span> command.</li>
                  <li>Copy your <strong>AGENT-ID</strong> and paste it into <strong>Badge number</strong> below.</li>
                  <li>Your <strong>code name</strong> = your <strong>Roblox</strong> username.</li>
                </ol>
              </div>
            )}

            <form onSubmit={submit}>
              {mode === "login" ? (
                <input placeholder="BADGE NUMBER (e.g. AG-4782)" value={matricule} onChange={(e) => setMatricule(e.target.value)} />
              ) : (
                <>
                  <input placeholder="CODE NAME (your Roblox username)" value={codename} onChange={(e) => setCodename(e.target.value)} />
                  <input placeholder="BADGE NUMBER — your AGENT-ID (/profile)" value={customBadge} onChange={(e) => setCustomBadge(e.target.value)} />
                </>
              )}
              <input type="password" placeholder="PASSWORD" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button style={{ width: "100%" }}>{mode === "login" ? "Sign in" : "Request access"}</button>
            </form>

            {mode === "login" && (
              <a href="/api/auth/discord">
                <button type="button" className="ghost" style={{ width: "100%", marginTop: 10 }}>Sign in with Discord</button>
              </a>
            )}
          </div>
        )}

        <a href="/"><button type="button" className="ghost small" style={{ marginTop: 14 }}>← Home</button></a>
        <p className="muted" style={{ textAlign: "center", marginTop: 12, fontSize: ".8rem" }}>
          <a href="/privacy" style={{ color: "var(--muted)" }}>Privacy &amp; Data</a>
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
