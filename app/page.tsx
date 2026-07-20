import { db } from "@/lib/db";

// Page d'accueil PUBLIQUE. Composant serveur : lit des agrégats non classifiés directement
// en base (jamais de détail sensible). Doit s'afficher même si la base est injoignable.
async function overview() {
  try {
    const pool = await db();
    const { rows: divisions } = await pool.query(
      `SELECT d.name, COUNT(u.id)::int AS members
         FROM divisions d
         LEFT JOIN users u ON u.division_id = d.id AND u.status = 'active'
        GROUP BY d.id, d.name ORDER BY members DESC, d.name`
    );
    const { rows: a } = await pool.query("SELECT COUNT(*)::int AS n FROM users WHERE status = 'active'");
    const { rows: m } = await pool.query("SELECT COUNT(*)::int AS n FROM missions WHERE status = 'active'");
    return { divisions, agents: a[0]?.n ?? 0, missions: m[0]?.n ?? 0 };
  } catch {
    return { divisions: [] as { name: string; members: number }[], agents: 0, missions: 0 };
  }
}

export default async function Landing() {
  const { divisions, agents, missions } = await overview();

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-brand">
          <img src="/logo.png" alt="" className="logo-img" style={{ height: 34 }} />
          <span>S.H.I.E.L.D.</span>
        </div>
        <a href="/login"><button className="small">Accéder au portail</button></a>
      </header>

      {/* Les visuels sont des fonds d'image : pour les changer, dépose des fichiers dans
          public/landing/ (hero.jpg, about.jpg). Absents, un dégradé sombre s'affiche. */}
      <section className="lp-hero">
        <div className="lp-hero-inner">
          <h1>S.H.I.E.L.D.</h1>
          <p className="muted" style={{ fontFamily: "Consolas, monospace", letterSpacing: "0.1em", margin: "6px 0 0" }}>
            Système Documentaire Central
          </p>
          <p className="lp-tagline">
            Portail documentaire classifié — rapports, registres, ordres de mission et circuits
            de signature de la division.
          </p>
          <div className="lp-cta">
            <a href="/login"><button>Se connecter</button></a>
            <a href="/login?mode=register"><button className="ghost">S'enrôler</button></a>
          </div>
        </div>
      </section>

      <section className="lp-stats">
        <div className="lp-stat"><span className="lp-num">{agents}</span><span className="lp-lbl">Agents actifs</span></div>
        <div className="lp-stat"><span className="lp-num">{missions}</span><span className="lp-lbl">Opérations en cours</span></div>
        <div className="lp-stat"><span className="lp-num">{divisions.length}</span><span className="lp-lbl">Divisions</span></div>
      </section>

      <section className="lp-section">
        <h2>La division</h2>
        <div className="lp-about">
          <div className="lp-about-photo" />
          <div className="lp-about-text">
            <p>
              Le S.H.I.E.L.D. centralise toute la documentation opérationnelle : chaque rapport,
              registre et briefing porte un niveau de classification, et n'est visible que des
              agents disposant de l'habilitation requise.
            </p>
            <p>
              Les ordres de mission sont suivis de bout en bout — de l'affectation au rapport
              d'après-action — et les documents officiels passent par un circuit de signature
              gravé dans le fichier.
            </p>
          </div>
        </div>
      </section>

      <section className="lp-section">
        <h2>Divisions présentes</h2>
        {divisions.length === 0 ? (
          <p className="muted">Aucune division déclarée pour le moment.</p>
        ) : (
          <div className="lp-divisions">
            {divisions.map((d) => (
              <div key={d.name} className="lp-div-card">
                <div className="lp-div-photo" />
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
        <h2>Opérations</h2>
        <p className="muted" style={{ maxWidth: 640 }}>
          {missions > 0
            ? `${missions} opération${missions > 1 ? "s" : ""} en cours. Le détail des missions est classifié — connecte-toi pour accéder à celles qui te sont assignées.`
            : "Aucune opération publique. Le détail des missions est classifié — connecte-toi pour accéder à celles qui te sont assignées."}
        </p>
        <div className="lp-cta" style={{ marginTop: 16 }}>
          <a href="/login"><button>Accéder au portail</button></a>
        </div>
      </section>

      <footer className="lp-footer">
        <span>S.H.I.E.L.D. — Système Documentaire Central</span>
        <span className="muted">Tout accès non autorisé fera l'objet de poursuites — Protocole 7-Alpha</span>
      </footer>
    </div>
  );
}
