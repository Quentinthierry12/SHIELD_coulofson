// Native Windows menu. Deliberately short: a menu that mirrors every page of the portal
// would go stale the moment the portal changes. This one only holds what the browser
// cannot do — desktop shortcuts, window control — plus the places an agent lives.

const { Menu, dialog, shell, app } = require("electron");

function buildMenu({ portal, win, onShortcut, currentDocId }) {
  const go = (p) => () => { win.show(); win.loadURL(`${portal}${p}`); };

  return Menu.buildFromTemplate([
    {
      label: "Fichier",
      submenu: [
        {
          label: "Créer un raccourci Bureau vers ce document…",
          accelerator: "CmdOrCtrl+D",
          click: onShortcut,
          // Only meaningful on a document; greyed out elsewhere rather than failing
          // with an error after the click.
          enabled: !!currentDocId(),
        },
        { type: "separator" },
        { label: "Archives", accelerator: "CmdOrCtrl+1", click: go("/dashboard") },
        { label: "Dispatch — signatures", accelerator: "CmdOrCtrl+2", click: go("/inbox") },
        { label: "Missions", accelerator: "CmdOrCtrl+3", click: go("/missions") },
        { label: "Effectifs", accelerator: "CmdOrCtrl+4", click: go("/roster") },
        { type: "separator" },
        { label: "Réduire dans la barre des tâches", accelerator: "CmdOrCtrl+W", click: () => win.hide() },
        { label: "Quitter", accelerator: "CmdOrCtrl+Q", click: () => { app.quit(); } },
      ],
    },
    {
      label: "Édition",
      submenu: [
        { role: "undo", label: "Annuler" },
        { role: "redo", label: "Rétablir" },
        { type: "separator" },
        { role: "cut", label: "Couper" },
        { role: "copy", label: "Copier" },
        { role: "paste", label: "Coller" },
        { role: "selectAll", label: "Tout sélectionner" },
      ],
    },
    {
      label: "Affichage",
      submenu: [
        { role: "reload", label: "Actualiser" },
        { role: "forceReload", label: "Actualiser sans le cache" },
        { type: "separator" },
        { role: "resetZoom", label: "Taille normale" },
        { role: "zoomIn", label: "Agrandir" },
        { role: "zoomOut", label: "Réduire" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Plein écran" },
        { role: "toggleDevTools", label: "Outils de développement" },
      ],
    },
    {
      label: "Aide",
      submenu: [
        { label: "S.H.I.E.L.D. Academy", click: () => shell.openExternal("https://academy.quentinthierry.fr") },
        { type: "separator" },
        {
          label: "À propos",
          click: () => {
            dialog.showMessageBox(win, {
              type: "info",
              title: "À propos",
              message: "S.H.I.E.L.D. — Central Document System",
              detail:
                `Client Windows ${app.getVersion()}\n` +
                `Electron ${process.versions.electron}\n\n` +
                `Portail : ${portal}\n\n` +
                "Les documents sont édités sur le serveur : une connexion est nécessaire.",
              buttons: ["Fermer"],
            });
          },
        },
      ],
    },
  ]);
}

module.exports = { buildMenu };
