#!/usr/bin/env node
// Repairs the Electron install when its own extractor fails.
//
// On this machine the download works (the 110 MB zip lands in the cache intact) but the
// installer's extraction silently produces a single licences file instead of the 73 real
// ones, and never writes path.txt. `electron-builder` also resets node_modules/electron
// during its rebuild step, so the breakage comes back after every build.
//
// This script is idempotent: it does nothing when the install is already sound.
// Run manually with `npm run fix`, or let it run as postinstall.

const fs = require("fs");
const path = require("path");
const os = require("os");

const pkgDir = path.join(__dirname, "node_modules", "electron");
const distDir = path.join(pkgDir, "dist");
const exe = path.join(distDir, "electron.exe");
const pathTxt = path.join(pkgDir, "path.txt");

function ok() {
  if (!fs.existsSync(exe) || !fs.existsSync(pathTxt)) return false;
  // path.txt must hold the bare filename: electron/index.js joins it WITHOUT trimming,
  // so one trailing newline makes it look for a file whose name ends in a line break.
  // The install then reports itself broken while the binary sits there, perfectly fine —
  // which is exactly the wild goose chase this cost us.
  const raw = fs.readFileSync(pathTxt, "utf-8");
  if (raw !== raw.trim()) {
    fs.writeFileSync(pathTxt, raw.trim());
    console.log("electron: retour à la ligne retiré de path.txt");
  }
  return true;
}

if (ok()) {
  console.log("electron: installation saine, rien à faire");
  process.exit(0);
}

const version = require("electron/package.json").version;
const zipName = `electron-v${version}-win32-x64.zip`;
const cacheRoot = path.join(os.homedir(), "AppData", "Local", "electron", "Cache");

let zip = null;
if (fs.existsSync(cacheRoot)) {
  for (const sub of fs.readdirSync(cacheRoot)) {
    const candidate = path.join(cacheRoot, sub, zipName);
    if (fs.existsSync(candidate)) { zip = candidate; break; }
  }
}

if (!zip) {
  console.error(`electron: ${zipName} introuvable dans ${cacheRoot}`);
  console.error("          relance `npm install electron` pour le télécharger, puis `npm run fix`.");
  process.exit(1);
}

// AdmZip is not a dependency; use PowerShell's Expand-Archive, which ships with Windows.
const { execFileSync } = require("child_process");
fs.mkdirSync(distDir, { recursive: true });
console.log(`electron: extraction de ${path.basename(zip)}…`);
execFileSync("powershell", [
  "-NoProfile", "-NonInteractive", "-Command",
  `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${distDir}' -Force`,
], { stdio: "inherit" });

if (!fs.existsSync(exe)) {
  console.error("electron: electron.exe toujours absent après extraction — échec.");
  process.exit(1);
}
fs.writeFileSync(pathTxt, "electron.exe");
console.log("electron: réparé —", exe);
