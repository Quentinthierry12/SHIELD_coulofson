import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "S.H.I.E.L.D. — Privacy & Data",
  description: "What personal data this portal stores, why, and your rights (GDPR).",
};

// PUBLIC page — no authentication. A plain, honest disclosure of the data the portal holds,
// reflecting the actual data model.
export default function PrivacyPage() {
  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-brand">
          <img src="/logo.png" alt="" className="logo-img" style={{ height: 34 }} />
          <span>S.H.I.E.L.D.</span>
        </div>
        <a href="/"><button className="small ghost">← Home</button></a>
      </header>

      <div className="legal">
        <h1>Privacy &amp; Data</h1>
        <p className="muted">
          This portal is an internal tool for the S.H.I.E.L.D. roleplay community. This page explains what
          personal data it stores, why, who it is shared with, and the rights you have over it (GDPR).
        </p>

        <h2>Data we store</h2>
        <ul>
          <li><strong>Account</strong> — your badge number, code name (your Roblox username), an encrypted
            (hashed) password, clearance level, role, division, account status and creation date.</li>
          <li><strong>Linked Discord</strong> (optional) — your Discord user ID, if you link your Discord
            account, so we can notify you and let you sign in with Discord.</li>
          <li><strong>Academy account</strong> (optional) — a training-platform (Moodle) account identifier,
            if one is provisioned for you.</li>
          <li><strong>Documents &amp; signatures</strong> — documents you create or upload (stored in the
            database) and a record of the documents you sign, with timestamps and an integrity hash. If you
            upload a handwritten-signature image, it is stored on your account.</li>
          <li><strong>Notifications</strong> — if you enable push notifications, a per-device push
            subscription (an endpoint URL and cryptographic keys). No message content is kept on that record.</li>
          <li><strong>Activity log</strong> — an audit log of actions (sign-ins, document actions, admin
            actions) with your badge number and timestamps, for security and accountability.</li>
          <li><strong>Leave of absence</strong> — the dates and an optional reason, if you declare one.</li>
          <li><strong>Session cookie</strong> — a single signed cookie that keeps you signed in.</li>
        </ul>

        <h2>Why we store it</h2>
        <p>
          To operate the portal: authentication, access control by clearance, document management and the
          signature workflow, notifications, and security/audit. We do not sell your data or use it for
          advertising.
        </p>

        <h2>Who it is shared with</h2>
        <ul>
          <li><strong>Discord</strong> — if you link your account, we read your Discord ID/username and send
            you direct messages. See Discord's own privacy policy.</li>
          <li><strong>Document Server (OnlyOffice)</strong> — renders and edits documents; document content is
            processed by the Document Server the community operates.</li>
          <li><strong>Academy (Moodle)</strong> — if enabled, an account is provisioned there for training.</li>
          <li><strong>Web Push services</strong> — your browser's push service (Apple, Google, Mozilla…)
            delivers notifications. We send only short notices — never classified content.</li>
        </ul>

        <h2>How long we keep it</h2>
        <p>
          Data is kept while your account is active. When an account is deleted, the account record and its
          access grants and push subscriptions are removed; documents you authored may be retained (with
          ownership cleared) for operational continuity, and audit-log entries are kept for security.
        </p>

        <h2>Your rights</h2>
        <p>
          You can request access to, correction of, or deletion of your personal data. To exercise these,
          contact a senior officer (for example via the Discord <strong>#commands</strong> channel). An
          officer can update your details or delete your account from Command.
        </p>

        <h2>Cookies</h2>
        <p>
          The portal uses a single essential session cookie to keep you signed in. There are no analytics or
          advertising cookies.
        </p>

        <h2>Contact</h2>
        <p>For any data request, reach a senior officer on Discord.</p>
      </div>

      <footer className="lp-footer">
        <span>S.H.I.E.L.D. — Central Document System</span>
        <span className="muted"><a href="/">Home</a> · <a href="/login">Sign in</a></span>
      </footer>
    </div>
  );
}
