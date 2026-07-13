# 🦅 S.H.I.E.L.D. — Système Documentaire Central

Portail documentaire pour jeu de rôle : clone maison de Word / Excel / PowerPoint en ligne,
propulsé par [OnlyOffice Docs](https://github.com/ONLYOFFICE/DocumentServer) (build illimité
[btactic-oo](https://github.com/btactic-oo/unlimited-onlyoffice-package-builder)) et Next.js.

## Fonctionnement

- **Recrutement** : un joueur demande l'accès (nom de code + mot de passe), reçoit un matricule `AG-XXXX`.
- **Validation** : un officier (admin) valide la recrue et fixe son **niveau d'habilitation (1-10)**.
- **Documents** : chaque document (Rapport 📄, Registre 📊, Briefing 📽) a un niveau de classification.
  Un agent ne voit que les documents ≤ son habilitation. Édition collaborative temps réel.
- Compte initial : matricule `DIRECTOR` (mot de passe : env `ADMIN_PASSWORD`).

## Stack

- Next.js (App Router) — portail, auth (cookie signé + bcrypt), stockage des fichiers **dans Postgres** (bytea)
- OnlyOffice Document Server — édition, embarqué en iframe, sécurisé par JWT partagé
- Postgres — utilisateurs + documents

## Variables d'environnement

| Var | Exemple |
|---|---|
| `DATABASE_URL` | `postgres://user:pass@host:5432/shield` |
| `APP_SECRET` | secret aléatoire (sessions + tokens de fichiers) |
| `OO_JWT_SECRET` | même valeur que `JWT_SECRET` du document server |
| `DS_PUBLIC_URL` | `https://shield-office.example.com` |
| `PORTAL_URL` | `https://shield.example.com` |
| `ADMIN_PASSWORD` | mot de passe initial du compte DIRECTOR |
