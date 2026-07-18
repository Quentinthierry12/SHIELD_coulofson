const {
  app, BaseWindow, WebContentsView, Tray, Menu, Notification,
  shell, nativeImage, dialog, ipcMain,
} = require("electron");
const path = require("path");
const { createDesktopShortcut, routeFromProtocol, targetFromArgv } = require("./shortcuts");
const { buildMenu } = require("./menu");

const PORTAL = process.env.SHIELD_PORTAL || "https://shield.quentinthierry.fr";
const OFFICE = "https://shield-office.quentinthierry.fr";
const ICON = path.join(__dirname, "assets", "icon.png");
const ICO = path.join(__dirname, "assets", "icon.ico");
const STRIP_H = 40; // height of the tab strip

let win = null;      // BaseWindow
let chrome = null;   // the tab strip view
let tray = null;
let quitting = false;
let lastPending = null;   // only notify when the count RISES
let pendingRoute = null;  // route requested before the window existed

/** @type {{id:number, view:import('electron').WebContentsView, title:string, home:boolean}[]} */
const tabs = [];
let activeId = null;
let nextId = 1;

const activeTab = () => tabs.find((t) => t.id === activeId) || null;
const homeTab = () => tabs.find((t) => t.home) || null;

function currentDocId() {
  const t = activeTab();
  const m = /\/doc\/(\d+)/.exec(t?.view.webContents.getURL() || "");
  return m ? m[1] : null;
}

// ---- layout ---------------------------------------------------------------
function layout() {
  if (!win) return;
  const { width, height } = win.getContentBounds();
  chrome.setBounds({ x: 0, y: 0, width, height: STRIP_H });
  for (const t of tabs) {
    // Only the active tab is given the area; the others are parked at zero size so their
    // page keeps living (and its session) without being painted.
    t.setBoundsVisible = t.id === activeId;
    t.view.setBounds(
      t.id === activeId
        ? { x: 0, y: STRIP_H, width, height: Math.max(0, height - STRIP_H) }
        : { x: 0, y: STRIP_H, width: 0, height: 0 }
    );
  }
}

function pushTabs() {
  if (!chrome) return;
  chrome.webContents.send(
    "tabs:update",
    tabs.map((t) => ({ id: t.id, title: t.title, home: t.home })),
    activeId
  );
}

// ---- tabs -----------------------------------------------------------------
function openTab(route, { home = false, activate = true } = {}) {
  // One tab per document: re-opening an already-open document focuses it instead of
  // stacking duplicates that then fight over the same editing session.
  const url = PORTAL + (route || "/dashboard");
  const existing = tabs.find((t) => t.view.webContents.getURL().startsWith(url) && /\/doc\/\d+/.test(url));
  if (existing) { select(existing.id); return existing; }

  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const tab = { id: nextId++, view, title: home ? "Archives" : "Chargement…", home };
  tabs.push(tab);
  win.contentView.addChildView(view);
  view.setBackgroundColor("#070b12"); // no white flash before the page paints
  view.webContents.loadURL(url);

  view.webContents.on("page-title-updated", (_e, title) => {
    tab.title = String(title).replace(/\s*[—-]\s*Central Document System\s*$/i, "").trim() || "Document";
    pushTabs();
  });

  // A document opened from the archives becomes its own tab — that is the whole point of
  // the tabbed shell. Everything else navigates inside the current tab.
  view.webContents.on("will-navigate", (e, target) => {
    if (target.startsWith(PORTAL) && /\/doc\/\d+/.test(target) && !/\/doc\/\d+/.test(view.webContents.getURL())) {
      e.preventDefault();
      openTab(target.slice(PORTAL.length));
      return;
    }
    if (!target.startsWith(PORTAL) && !target.startsWith(OFFICE)) {
      e.preventDefault();
      shell.openExternal(target);
    }
  });
  view.webContents.setWindowOpenHandler(({ url: u }) => {
    if (u.startsWith(PORTAL)) { openTab(u.slice(PORTAL.length)); return { action: "deny" }; }
    shell.openExternal(u);
    return { action: "deny" };
  });
  view.webContents.on("did-navigate-in-page", refreshMenu);
  view.webContents.on("did-navigate", refreshMenu);

  if (activate) activeId = tab.id;
  layout(); pushTabs(); refreshMenu();
  return tab;
}

function select(id) {
  if (!tabs.some((t) => t.id === id)) return;
  activeId = id;
  layout(); pushTabs(); refreshMenu();
}

function closeTab(id) {
  const i = tabs.findIndex((t) => t.id === id);
  if (i < 0 || tabs[i].home) return; // the archives tab is the app itself
  const [t] = tabs.splice(i, 1);
  win.contentView.removeChildView(t.view);
  t.view.webContents.close();
  if (activeId === id) activeId = (tabs[i] || tabs[i - 1] || homeTab()).id;
  layout(); pushTabs(); refreshMenu();
}

// ---- window ---------------------------------------------------------------
function createWindow() {
  win = new BaseWindow({
    width: 1400, height: 900, minWidth: 980, minHeight: 620,
    title: "S.H.I.E.L.D.", icon: ICON,
    backgroundColor: "#070b12",
    frame: false, // the strip carries the window controls, like their desktop app
  });

  chrome = new WebContentsView({
    webPreferences: { preload: path.join(__dirname, "chrome", "preload.js"), contextIsolation: true },
  });
  chrome.setBackgroundColor("#0a101a");
  win.contentView.addChildView(chrome);
  chrome.webContents.loadFile(path.join(__dirname, "chrome", "tabs.html"));

  openTab("/dashboard", { home: true });
  if (pendingRoute) { openTab(pendingRoute); pendingRoute = null; }

  win.on("resize", layout);
  win.on("close", (e) => {
    // Hiding rather than quitting: an agent expects to stay reachable for signatures.
    if (!quitting) { e.preventDefault(); win.hide(); }
  });
  layout();
}

function show(route) {
  if (!win) { pendingRoute = route || null; createWindow(); win.show(); return; }
  win.show();
  win.focus();
  if (route) openTab(route);
}

// ---- desktop shortcut to the open document --------------------------------
async function shortcutToCurrentDoc() {
  const id = currentDocId();
  if (!id) {
    dialog.showMessageBox(win, {
      type: "info", title: "Raccourci", message: "Ouvre d'abord un document.",
      detail: "Le raccourci pointe vers le document de l'onglet actif.", buttons: ["Fermer"],
    });
    return;
  }
  const name = (activeTab()?.title || `Document ${id}`).trim();
  const { response, checkboxChecked } = await dialog.showMessageBox(win, {
    type: "question", title: "Créer un raccourci",
    message: `Créer un raccourci vers « ${name} » sur le Bureau ?`,
    detail: "Le raccourci ouvre ce document directement dans l'application. Il pointe vers " +
            "le document du serveur : aucune copie n'est faite sur le disque.",
    buttons: ["Créer", "Annuler"], defaultId: 0, cancelId: 1,
    checkboxLabel: "Ouvrir le Bureau après création",
  });
  if (response !== 0) return;
  try {
    const file = createDesktopShortcut({ name, target: `--doc=${id}`, exePath: process.execPath, iconPath: ICO });
    if (checkboxChecked) shell.showItemInFolder(file);
    else new Notification({ title: "S.H.I.E.L.D.", body: "Raccourci créé sur le Bureau.", icon: ICON }).show();
  } catch (e) {
    dialog.showErrorBox("Raccourci", `Création impossible : ${e.message}`);
  }
}

function refreshMenu() {
  if (!win) return;
  Menu.setApplicationMenu(buildMenu({
    portal: PORTAL,
    open: (route) => openTab(route),
    closeTab: () => activeId && closeTab(activeId),
    hide: () => win.hide(),
    currentDocId,
    onShortcut: shortcutToCurrentDoc,
    activeContents: () => activeTab()?.view.webContents || null,
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

// Poll for work waiting on this agent, reusing the portal session held by the home tab.
async function pollDispatch() {
  const home = homeTab();
  if (!home) return;
  try {
    const pending = await home.view.webContents.executeJavaScript(
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
  } catch { /* mid-navigation; the next tick will do */ }
}

// ---- ipc from the tab strip ------------------------------------------------
ipcMain.on("tabs:ready", pushTabs);
ipcMain.on("tabs:select", (_e, id) => select(id));
ipcMain.on("tabs:close", (_e, id) => closeTab(id));
ipcMain.on("tabs:new", () => openTab("/dashboard"));
ipcMain.on("tabs:win", (_e, action) => {
  if (!win) return;
  if (action === "min") win.minimize();
  else if (action === "max") win.isMaximized() ? win.unmaximize() : win.maximize();
  else win.hide();
});

// ---- single instance, protocol, launch arguments ---------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => show(targetFromArgv(argv)));
  app.on("open-url", (e, url) => { e.preventDefault(); show(routeFromProtocol(url)); });

  app.whenReady().then(() => {
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
    setTimeout(pollDispatch, 8_000);
  });

  app.on("window-all-closed", () => { if (process.platform === "darwin") app.quit(); });
  app.on("before-quit", () => { quitting = true; });
}
