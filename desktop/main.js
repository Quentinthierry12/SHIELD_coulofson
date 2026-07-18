const { app, BrowserWindow, Tray, Menu, Notification, shell, nativeImage, dialog } = require("electron");
const path = require("path");
const { createDesktopShortcut, routeFromProtocol, targetFromArgv } = require("./shortcuts");
const { buildMenu } = require("./menu");

const PORTAL = process.env.SHIELD_PORTAL || "https://shield.quentinthierry.fr";
const OFFICE = "https://shield-office.quentinthierry.fr";
const ICON = path.join(__dirname, "assets", "icon.png");
const ICO = path.join(__dirname, "assets", "icon.ico");

let win = null;
let tray = null;
let quitting = false;
// Remembered so a notification only fires when the count goes UP: re-notifying on every
// poll for the same pending signature would train the agent to ignore notifications.
let lastPending = null;
// Route to open once the window is ready — set when the app is launched from a shortcut
// or a shield:// link before the window exists.
let pendingRoute = null;

const currentDocId = () => {
  const m = /\/doc\/(\d+)/.exec(win?.webContents?.getURL() || "");
  return m ? m[1] : null;
};

function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    title: "S.H.I.E.L.D. — Central Document System",
    icon: ICON,
    backgroundColor: "#070b12", // matches the portal, so no white flash on open
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(PORTAL + (pendingRoute || ""));
  pendingRoute = null;

  // External links (Academy, Discord) open in the real browser — trapping them inside the
  // app would strand the agent with no address bar and no way back.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(PORTAL) && !url.startsWith(OFFICE)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(PORTAL) && !url.startsWith(OFFICE)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // "Save as PDF" only makes sense on a document, so the menu is rebuilt on navigation
  // rather than showing an item that fails when clicked.
  win.webContents.on("did-navigate-in-page", refreshMenu);
  win.webContents.on("did-navigate", refreshMenu);

  // Closing hides to the tray: an agent expects to stay reachable for signature requests.
  win.on("close", (e) => {
    if (!quitting) { e.preventDefault(); win.hide(); }
  });
  win.on("closed", () => { win = null; });
}

function show(route) {
  if (!win) { pendingRoute = route || null; createWindow(); return; }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (route) win.loadURL(PORTAL + route);
}

// ---- Desktop shortcut to the document currently open -----------------------
async function shortcutToCurrentDoc() {
  const id = currentDocId();
  if (!id) {
    dialog.showMessageBox(win, {
      type: "info", title: "Raccourci",
      message: "Ouvre d'abord un document.",
      detail: "Le raccourci pointe vers le document affiché.",
      buttons: ["Fermer"],
    });
    return;
  }
  // The page title carries the document name; fall back to the id if it is not there yet.
  const title = (await win.webContents.executeJavaScript(
    "document.querySelector('h1, .doc-title')?.textContent || document.title", true
  ).catch(() => null)) || `Document ${id}`;

  const suggested = String(title).replace(/\s*[—-]\s*Central Document System.*/i, "").trim();
  const { response, checkboxChecked } = await dialog.showMessageBox(win, {
    type: "question", title: "Créer un raccourci",
    message: `Créer un raccourci vers « ${suggested} » sur le Bureau ?`,
    detail: "Le raccourci ouvre ce document directement dans l'application. " +
            "Il pointe vers le document du serveur : aucune copie n'est faite sur le disque.",
    buttons: ["Créer", "Annuler"], defaultId: 0, cancelId: 1,
    checkboxLabel: "Ouvrir le Bureau après création", checkboxChecked: false,
  });
  if (response !== 0) return;

  try {
    const file = createDesktopShortcut({
      name: suggested,
      target: `--doc=${id}`,
      exePath: process.execPath,
      iconPath: ICO,
    });
    if (checkboxChecked) shell.showItemInFolder(file);
    else new Notification({ title: "S.H.I.E.L.D.", body: "Raccourci créé sur le Bureau.", icon: ICON }).show();
  } catch (e) {
    dialog.showErrorBox("Raccourci", `Création impossible : ${e.message}`);
  }
}

function refreshMenu() {
  if (!win) return;
  Menu.setApplicationMenu(buildMenu({
    portal: PORTAL, win, currentDocId,
    onShortcut: shortcutToCurrentDoc,
  }));
}

function createTray() {
  const img = nativeImage.createFromPath(ICON);
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 }));
  tray.setToolTip("S.H.I.E.L.D.");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Archives", click: () => show("/dashboard") },
    { label: "Dispatch — signatures", click: () => show("/inbox") },
    { label: "Missions", click: () => show("/missions") },
    { type: "separator" },
    { label: "Quitter", click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on("double-click", () => show());
}

// Poll the portal for work waiting on this agent, reusing the window's session — no second
// sign-in, and no credentials on disk.
async function pollDispatch() {
  if (!win) return;
  try {
    const pending = await win.webContents.executeJavaScript(
      `fetch('${PORTAL}/api/signatures').then(r => r.ok ? r.json() : null).then(d => d ? d.to_sign.length : null)`, true
    );
    if (typeof pending !== "number") return; // signed out — say nothing
    if (lastPending !== null && pending > lastPending && Notification.isSupported()) {
      const n = pending - lastPending;
      new Notification({
        title: "S.H.I.E.L.D. — signature requise",
        body: n === 1 ? "Un document attend ta signature." : `${n} documents attendent ta signature.`,
        icon: ICON,
      }).on("click", () => show("/inbox")).show();
    }
    lastPending = pending;
    if (tray) tray.setToolTip(pending > 0 ? `S.H.I.E.L.D. — ${pending} à signer` : "S.H.I.E.L.D.");
  } catch {
    // The window may be mid-navigation; the next tick will do.
  }
}

// ---- Single instance, protocol and launch arguments ------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // A shortcut clicked while the app is already running arrives here, not through a new
  // process — without this the click would silently do nothing.
  app.on("second-instance", (_e, argv) => show(targetFromArgv(argv)));

  // macOS delivers shield:// this way; harmless on Windows.
  app.on("open-url", (e, url) => { e.preventDefault(); show(routeFromProtocol(url)); });

  app.whenReady().then(() => {
    // Register shield:// so a link pasted in Discord opens the app on the right document.
    if (process.defaultApp) {
      if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient("shield", process.execPath, [path.resolve(process.argv[1])]);
      }
    } else {
      app.setAsDefaultProtocolClient("shield");
    }

    pendingRoute = targetFromArgv(process.argv);
    createWindow();
    refreshMenu();
    createTray();
    setInterval(pollDispatch, 60_000);
    setTimeout(pollDispatch, 8_000); // once the session has had time to load
  });

  app.on("window-all-closed", () => {
    // Stay in the tray on Windows; only an explicit quit ends it.
    if (process.platform === "darwin") app.quit();
  });
  app.on("before-quit", () => { quitting = true; });
}
