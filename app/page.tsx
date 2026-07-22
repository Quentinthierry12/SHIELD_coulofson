import { db } from "@/lib/db";

// Rendered per request so live data (agent counts, uploaded photos) shows without a rebuild.
export const dynamic = "force-dynamic";

type Division = { id: number; name: string; members: number };
type Overview = {
  divisions: Division[];
  agents: number;
  missions: number;
  // Cache-busting version per photo slot (updated_at epoch), or undefined when unset.
  photos: { hero?: number; about?: number; div: Record<number, number> };
};

// PUBLIC landing page. Server component: reads unclassified aggregates straight from the
// database (never any sensitive detail). Must render even if the database is unreachable.
async function overview(): Promise<Overview> {
  try {
    const pool = await db();
    const { rows: divisions } = await pool.query(
      `SELECT d.id, d.name, COUNT(u.id)::int AS members
         FROM divisions d
         LEFT JOIN users u ON u.division_id = d.id AND u.status = 'active'
        GROUP BY d.id, d.name ORDER BY members DESC, d.name`
    );
    const { rows: a } = await pool.query("SELECT COUNT(*)::int AS n FROM users WHERE status = 'active'");
    const { rows: m } = await pool.query("SELECT COUNT(*)::int AS n FROM missions WHERE status = 'active'");
    const { rows: ph } = await pool.query("SELECT key, EXTRACT(EPOCH FROM updated_at)::bigint AS v FROM landing_photos");
    const photos: Overview["photos"] = { div: {} };
    for (const p of ph as { key: string; v: string }[]) {
      if (p.key === "hero") photos.hero = Number(p.v);
      else if (p.key === "about") photos.about = Number(p.v);
      else if (p.key.startsWith("div:")) photos.div[Number(p.key.slice(4))] = Number(p.v);
    }
    return { divisions, agents: a[0]?.n ?? 0, missions: m[0]?.n ?? 0, photos };
  } catch {
    return { divisions: [], agents: 0, missions: 0, photos: { div: {} } };
  }
}

// Layered background: optional dark overlay on top of the photo, so text stays readable.
// Absent a photo we return undefined and let the CSS class supply its gradient fallback.
function photoBg(key: string, v: number | undefined, overlay?: string): React.CSSProperties | undefined {
  if (!v) return undefined;
  const url = `url("/api/landing/photo/${key}?v=${v}")`;
  return {
    backgroundImage: overlay ? `${overlay}, ${url}` : url,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  };
}

const HERO_OVERLAY = "linear-gradient(rgba(7,11,18,0.72), rgba(7,11,18,0.92))";

export default async function Landing() {
  const { divisions, agents, missions, photos } = await overview();

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-brand">
          <img src="/logo.png" alt="" className="logo-img" style={{ height: 34 }} />
          <span>S.H.I.E.L.D.</span>
        </div>
        <a href="/login"><button className="small">Enter the portal</button></a>
      </header>

      {/* Photos are managed in Command → Settings → Landing photos (stored in the database).
          When a slot has no photo, the CSS class supplies a dark gradient fallback. */}
      <section className="lp-hero" style={photoBg("hero", photos.hero, HERO_OVERLAY)}>
        <div className="lp-hero-inner">
          <img src="/logo.png" alt="S.H.I.E.L.D." className="lp-hero-logo" />
          <h1>S.H.I.E.L.D.</h1>
          <p className="muted" style={{ fontFamily: "Consolas, monospace", letterSpacing: "0.1em", margin: "6px 0 0" }}>
            Central Document System
          </p>
          <p className="lp-tagline">
            Classified document portal — reports, registries, mission orders and the division's
            signature workflows.
          </p>
          <div className="lp-cta">
            <a href="/login"><button>Sign in</button></a>
            <a href="/login?mode=register"><button className="ghost">Enlist</button></a>
          </div>
        </div>
      </section>

      <section className="lp-stats">
        <div className="lp-stat"><span className="lp-num">{agents}</span><span className="lp-lbl">Active agents</span></div>
        <div className="lp-stat"><span className="lp-num">{missions}</span><span className="lp-lbl">Ongoing operations</span></div>
        <div className="lp-stat"><span className="lp-num">{divisions.length}</span><span className="lp-lbl">Divisions</span></div>
      </section>

      <section className="lp-section">
        <h2>The division</h2>
        <div className="lp-about">
          <div className="lp-about-photo" style={photoBg("about", photos.about)} />
          <div className="lp-about-text">
            <p>
              S.H.I.E.L.D. centralizes all operational documentation: every report, registry and
              briefing carries a classification level, and is only visible to agents holding the
              required clearance.
            </p>
            <p>
              Mission orders are tracked end to end — from assignment to after-action report — and
              official documents go through a signature workflow engraved into the file itself.
            </p>
          </div>
        </div>
      </section>

      <section className="lp-section">
        <h2>Active divisions</h2>
        {divisions.length === 0 ? (
          <p className="muted">No division declared yet.</p>
        ) : (
          <div className="lp-divisions">
            {divisions.map((d) => (
              <div key={d.id} className="lp-div-card">
                <div className="lp-div-photo" style={photoBg(`div:${d.id}`, photos.div[d.id])} />
                <div className="lp-div-body">
                  <div className="lp-div-name">{d.name}</div>
                  <div className="muted">{d.members} agent{d.members > 1 ? "s" : ""}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="lp-section">
        <h2>Operations</h2>
        <p className="muted" style={{ maxWidth: 640 }}>
          {missions > 0
            ? `${missions} ongoing operation${missions > 1 ? "s" : ""}. Mission details are classified — sign in to access the ones assigned to you.`
            : "No public operations. Mission details are classified — sign in to access the ones assigned to you."}
        </p>
        <div className="lp-cta" style={{ marginTop: 16 }}>
          <a href="/login"><button>Enter the portal</button></a>
        </div>
      </section>

      <footer className="lp-footer">
        <span>S.H.I.E.L.D. — Central Document System</span>
        <span className="muted"><a href="/privacy">Privacy &amp; Data</a> · Unauthorized access will be prosecuted — Protocol 7-Alpha</span>
      </footer>
    </div>
  );
}
