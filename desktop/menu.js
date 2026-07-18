// Native Windows menu. Deliberately short: mirroring every page of the portal would go
// stale the moment the portal changes. It holds what a browser cannot do — desktop
// shortcuts, tab and window control — plus the places an agent actually lives.

const { Menu, dialog, shell, app } = require("electron");

function buildMenu({ portal, open, closeTab, hide, currentDocId, onShortcut, activeContents }) {
  // Edit and zoom act on the focused view; with several tabs alive they must be aimed at
  // the active one rather than at whatever Electron would guess.
  const on = (method) => () => { const c = activeContents(); if (c) c[method](); };
  const zoom = (delta) => () => {
    const c = activeContents();
    if (c) c.setZoomLevel(delta === null ? 0 : c.getZoomLevel() + delta);
  };

  return Menu.buildFromTemplate([
    {
      label: "Fichier",
      submenu: [
        { label: "Nouvel onglet", accelerator: "CmdOrCtrl+T", click: () => open("/dashboard") },
        { label: "Fermer l'onglet", accelerator: "CmdOrCtrl+W", click: closeTab },
        { type: "separator" },
        {
          label: "Créer un raccourci Bureau vers ce document…",
          accelerator: "CmdOrCtrl+D",
          click: onShortcut,
          // Only meaningful on a document; greyed out rather than failing after the click.
          enabled: !!currentDocId(),
        },
        { type: "separator" },
        { label: "Archives", accelerator: "CmdOrCtrl+1", click: () => open("/dashboard") },
        { label: "Dispatch — signatures", accelerator: "CmdOrCtrl+2", click: () => open("/inbox") },
        { label: "Missions", accelerator: "CmdOrCtrl+3", click: () => open("/missions") },
        { label: "Effectifs", accelerator: "CmdOrCtrl+4", click: () => open("/roster") },
        { label: "Command", accelerator: "CmdOrCtrl+5", click: () => open("/admin") },
        { type: "separator" },
        { label: "Réduire dans la barre des tâches", accelerator: "CmdOrCtrl+H", click: hide },
        { label: "Quitter", accelerator: "CmdOrCtrl+Q", click: () => app.quit() },
      ],
    },
    {
      label: "Édition",
      submenu: [
        { label: "Annuler", accelerator: "CmdOrCtrl+Z", click: on("undo") },
        { label: "Rétablir", accelerator: "CmdOrCtrl+Y", click: on("redo") },
        { type: "separator" },
        { label: "Couper", accelerator: "CmdOrCtrl+X", click: on("cut") },
        { label: "Copier", accelerator: "CmdOrCtrl+C", click: on("copy") },
        { label: "Coller", accelerator: "CmdOrCtrl+V", click: on("paste") },
        { label: "Tout sélectionner", accelerator: "CmdOrCtrl+A", click: on("selectAll") },
      ],
    },
    {
      label: "Affichage",
      submenu: [
        { label: "Actualiser", accelerator: "F5", click: on("reload") },
        { type: "separator" },
        { label: "Taille normale", accelerator: "CmdOrCtrl+0", click: zoom(null) },
        { label: "Agrandir", accelerator: "CmdOrCtrl+Plus", click: zoom(0.5) },
        { label: "Réduire", accelerator: "CmdOrCtrl+-", click: zoom(-0.5) },
        { type: "separator" },
        { label: "Outils de développement", accelerator: "CmdOrCtrl+Shift+I", click: on("toggleDevTools") },
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
            dialog.showMessageBox({
              type: "info", title: "À propos",
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
