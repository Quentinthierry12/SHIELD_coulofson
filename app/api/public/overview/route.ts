import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Données PUBLIQUES pour la page d'accueil (aucune authentification, aucun détail classifié).
// Uniquement des agrégats : noms de divisions, effectifs, nombre d'opérations en cours.
export async function GET() {
  try {
    const pool = await db();
    const { rows: divisions } = await pool.query(
      `SELECT d.name, COUNT(u.id)::int AS members
         FROM divisions d
         LEFT JOIN users u ON u.division_id = d.id AND u.status = 'active'
        GROUP BY d.id, d.name
        ORDER BY members DESC, d.name`
    );
    const { rows: a } = await pool.query("SELECT COUNT(*)::int AS n FROM users WHERE status = 'active'");
    const { rows: m } = await pool.query("SELECT COUNT(*)::int AS n FROM missions WHERE status = 'active'");
    return NextResponse.json({
      divisions,
      stats: { agents: a[0]?.n ?? 0, missions: m[0]?.n ?? 0, divisions: divisions.length },
    });
  } catch {
    // La page d'accueil doit s'afficher même si la base n'est pas joignable.
    return NextResponse.json({ divisions: [], stats: { agents: 0, missions: 0, divisions: 0 } });
  }
}
