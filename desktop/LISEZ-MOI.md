# S.H.I.E.L.D. — client Windows

Encapsule le portail dans une vraie application Windows, avec les intégrations que le
navigateur ne peut pas offrir.

## Ce que ça apporte

- **Icône et fenêtre dédiées** — plus d'onglet perdu au milieu de vingt autres.
- **Notifications système** quand un document attend ta signature. Le client interroge
  Dispatch toutes les minutes et ne prévient **que** lorsque le nombre augmente : notifier
  à chaque tour pour la même signature apprendrait à ignorer les notifications.
- **Icône de barre des tâches** avec accès direct à Dispatch et aux Missions. Fermer la
  fenêtre met en veille dans la barre plutôt que de quitter — un agent reste joignable.
- **Liens externes** (Academy, Discord) ouverts dans le vrai navigateur, pas piégés dans
  une fenêtre sans barre d'adresse.

## Lancer en développement

    cd desktop
    npm install
    npm start

Pour pointer vers un autre portail : `SHIELD_PORTAL=https://... npm start`

## Construire l'installateur .exe

    npm run build

L'installateur sort dans `desktop/dist/`. Il permet de choisir le dossier d'installation
et crée le raccourci bureau.

## Ce que ce client ne fait PAS

Il n'y a **pas de mode hors-ligne** : sans réseau, la fenêtre est vide. Un cache local des
documents demanderait de gérer les conflits de synchronisation, ce qui est un autre
chantier — et un cache à moitié fait ferait croire à l'agent qu'il travaille sur la
dernière version alors que non.

Aucun identifiant n'est stocké sur le disque : la session est celle du portail, dans le
cookie de la fenêtre.
