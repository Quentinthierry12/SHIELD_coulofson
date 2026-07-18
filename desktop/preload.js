// Deliberately minimal: the portal is a normal web app and needs nothing from Node.
// Exposing anything more here would widen the attack surface of a window that loads
// remote content, for no gain.
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("shieldDesktop", {
  version: process.versions.electron,
  isDesktop: true,
});
