// Bridge for the tab strip only. Kept separate from the portal's preload: the strip is our
// own trusted UI, the portal is remote content and gets nothing.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("shieldTabs", {
  ready: () => ipcRenderer.send("tabs:ready"),
  select: (id) => ipcRenderer.send("tabs:select", id),
  close: (id) => ipcRenderer.send("tabs:close", id),
  newTab: () => ipcRenderer.send("tabs:new"),
  win: (action) => ipcRenderer.send("tabs:win", action),
  onUpdate: (fn) => ipcRenderer.on("tabs:update", (_e, tabs, activeId) => fn(tabs, activeId)),
});
