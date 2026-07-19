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
| `VAPID_PUBLIC_KEY` | clé publique Web Push (voir ci-dessous) — *optionnel* |
| `VAPID_PRIVATE_KEY` | clé privée Web Push — *optionnel* |
| `VAPID_SUBJECT` | `mailto:ops@shield.example.com` — *optionnel* |

## Notifications (PWA + Discord)

Le portail est installable (PWA) et prévient les agents sur **deux canaux** :

- **Discord** — DM via le bot (déjà en place, lié au compte de l'agent).
- **Web Push natif** — bannière sur l'appareil, sans service tiers. Chaque agent
  active les notifications depuis le bouton **🔔 Notifs** (Archives / Dispatch).

Les deux partent aux mêmes moments : demande de signature, tour de signature dans un
circuit séquentiel, relance, document scellé/descellé, partage, ordre de mission, accès accordé.
Le message poussé ne contient **jamais** de contenu classifié — juste un titre, une phrase
et un lien ; le détail se charge à l'ouverture du portail (authentifié).

Pour activer le Web Push, générer une paire de clés VAPID **une fois** et la mettre en
environnement :

```bash
node -e "console.log(require('web-push').generateVAPIDKeys())"
```

Sans `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`, le bouton 🔔 reste masqué et seul Discord
est utilisé — rien ne casse.

> **iOS** : le Web Push n'y fonctionne que si l'agent **installe** la PWA sur l'écran
> d'accueil (Safari ≥ 16.4). En onglet Safari classique, il n'y a pas de push — Discord prend le relais.
