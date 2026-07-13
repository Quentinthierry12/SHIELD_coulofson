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
    if (next !== confirm) return setError("The two new passwords do not match.");
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
        <h1 style={{ textAlign: "center", marginBottom: 4 }}>Security Protocol</h1>
        <p className="muted" style={{ textAlign: "center", marginBottom: 20 }}>
          {matricule} · {codename} — you must set a new password before proceeding
        </p>
        <div className="panel">
          {error && <p className="error">⚠ {error}</p>}
          <form onSubmit={submit}>
            <input type="password" placeholder="TEMPORARY PASSWORD" value={current} onChange={(e) => setCurrent(e.target.value)} />
            <input type="password" placeholder="NEW PASSWORD (min. 6 characters)" value={next} onChange={(e) => setNext(e.target.value)} />
            <input type="password" placeholder="CONFIRM NEW PASSWORD" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <button style={{ width: "100%" }}>Set new password</button>
          </form>
        </div>
      </div>
    </div>
  );
}
