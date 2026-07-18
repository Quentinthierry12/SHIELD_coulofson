// Desktop shortcuts to individual documents, and the shield:// protocol.
//
// The first design here imported local files into the Drive. That was solving a problem
// that does not exist: the documents already live on the portal. A shortcut that opens the
// right document is both simpler and honest — there is never a second copy, and no doubt
// about which one is being edited.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

// Windows forbids these in a filename; a document titled "CLR - 4 -> 6" would otherwise
// fail to create its shortcut with an error nobody can act on.
const safeName = (s) =>
  s.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").replace(/\s+/g, " ").trim().slice(0, 90) || "Document";

/**
 * Create a .lnk on the desktop that launches the app straight into `target`.
 * Uses WScript.Shell through PowerShell — the supported way to write a real Windows
 * shortcut. A .url file would be simpler but carries the browser icon, not ours.
 */
function createDesktopShortcut({ name, target, exePath, iconPath }) {
  const desktop = path.join(os.homedir(), "Desktop");
  const file = path.join(desktop, `${safeName(name)}.lnk`);
  const ps = [
    "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:LNK)",
    "$s.TargetPath = $env:TGT",
    "$s.Arguments = $env:ARGS",
    "$s.IconLocation = $env:ICO",
    "$s.Description = $env:DESC",
    "$s.WorkingDirectory = Split-Path $env:TGT",
    "$s.Save()",
  ].join("; ");

  execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], {
    env: {
      ...process.env,
      LNK: file,
      TGT: exePath,
      ARGS: target,
      ICO: iconPath,
      DESC: `S.H.I.E.L.D. — ${name}`,
    },
    stdio: "ignore",
  });
  return file;
}

/**
 * Turn a shield:// URL into a portal path.
 *   shield://doc/44      -> /doc/44
 *   shield://inbox       -> /inbox
 *   shield://mission/3   -> /missions
 * Anything unrecognised returns null rather than a guess: following a malformed link to
 * the wrong document would be worse than doing nothing.
 */
function routeFromProtocol(url) {
  const m = /^shield:\/\/([a-z]+)(?:\/(\d+))?/i.exec(String(url || "").trim());
  if (!m) return null;
  const [, kind, id] = m;
  switch (kind.toLowerCase()) {
    case "doc": return id ? `/doc/${id}` : null;
    case "inbox": case "dispatch": return "/inbox";
    case "missions": case "mission": return "/missions";
    case "roster": return "/roster";
    case "command": case "admin": return "/admin";
    case "home": case "dashboard": return "/dashboard";
    default: return null;
  }
}

/** Extract a shield:// URL or --doc=<id> from a launch argv. */
function targetFromArgv(argv) {
  for (const a of argv) {
    if (typeof a !== "string") continue;
    if (a.startsWith("shield://")) return routeFromProtocol(a);
    const m = /^--doc=(\d+)$/.exec(a);
    if (m) return `/doc/${m[1]}`;
  }
  return null;
}

module.exports = { createDesktopShortcut, routeFromProtocol, targetFromArgv, safeName };
