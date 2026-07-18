const { app, BrowserWindow, Tray, Menu, Notification, shell, nativeImage } = require("electron");
const path = require("path");

const PORTAL = process.env.SHIELD_PORTAL || "https://shield.quentinthierry.fr";
const ICON = path.join(__dirname, "assets", "icon.png");

let win = null;
let tray = null;
let quitting = false;
// Remembered so a notification only fires when the count goes UP: re-notifying on every
// poll for the same pending signature would train the agent to ignore the notifications.
let lastPending = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "S.H.I.E.L.D. — Central Document System",
    icon: ICON,
    backgroundColor: "#070b12", // matches the portal, so no white flash on open
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(PORTAL);

  // External links (Academy, Discord) open in the real browser — trapping them inside the
  // app window would strand the agent with no address bar and no way back.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(PORTAL)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    const sameSite = url.startsWith(PORTAL) || url.startsWith("https://shield-office.quentinthierry.fr");
    if (!sameSite) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // Closing hides to the tray instead of quitting: an agent expects to stay reachable for
  // signature requests. Real quit goes through the tray menu or Ctrl+Q.
  win.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });

  win.on("closed", () => { win = null; });
}

function show() {
  if (!win) createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createTray() {
  const img = nativeImage.createFromPath(ICON);
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 }));
  tray.setToolTip("S.H.I.E.L.D.");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open the Document System", click: show },
    { label: "Dispatch — signatures", click: () => { show(); win.loadURL(`${PORTAL}/inbox`); } },
    { label: "Missions", click: () => { show(); win.loadURL(`${PORTAL}/missions`); } },
    { type: "separator" },
    { label: "Quit", click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on("double-click", show);
}

// Poll the portal for work waiting on this agent. Uses the session cookie already held by
// the window, so no second sign-in and no credentials stored on disk.
async function pollDispatch() {
  if (!win) return;
  try {
    const js = `fetch('${PORTAL}/api/signatures').then(r => r.ok ? r.json() : null).then(d => d ? d.to_sign.length : null)`;
    const pending = await win.webContents.executeJavaScript(js, true);
    if (typeof pending !== "number") return; // signed out — say nothing
    if (lastPending !== null && pending > lastPending && Notification.isSupported()) {
      const n = pending - lastPending;
      new Notification({
        title: "S.H.I.E.L.D. — signature required",
        body: n === 1 ? "A document is waiting for your signature." : `${n} documents are waiting for your signature.`,
        icon: ICON,
      }).on("click", () => { show(); win.loadURL(`${PORTAL}/inbox`); }).show();
    }
    lastPending = pending;
    if (tray) tray.setToolTip(pending > 0 ? `S.H.I.E.L.D. — ${pending} à signer` : "S.H.I.E.L.D.");
  } catch {
    // The window may be mid-navigation; the next tick will do.
  }
}

// A second launch focuses the existing window rather than opening a duplicate.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", show);

  app.whenReady().then(() => {
    createWindow();
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
