"use strict";
// Coolify Ops — a tiny, dependency-free dashboard to list, deploy and control the apps on a
// Coolify instance through its v4 API. Runs as its own Coolify application.
//
// Env:
//   COOLIFY_URL    e.g. https://coolify.quentinthierry.fr
//   COOLIFY_TOKEN  a Coolify API token (kept server-side, never sent to the browser)
//   OPS_PASSWORD   password to open the dashboard
//   OPS_SECRET     (optional) secret to sign the session cookie; derived from OPS_PASSWORD if unset
//   PORT           provided by Coolify

const http = require("http");
const https = require("https");
const { URL } = require("url");
const crypto = require("crypto");

const COOLIFY_URL = (process.env.COOLIFY_URL || "").replace(/\/+$/, "");
const COOLIFY_TOKEN = process.env.COOLIFY_TOKEN || "";
const OPS_PASSWORD = process.env.OPS_PASSWORD || "";
const OPS_SECRET = process.env.OPS_SECRET || (OPS_PASSWORD ? "s:" + OPS_PASSWORD : "insecure-dev-secret");
const PORT = parseInt(process.env.PORT || "3000", 10);

// ---- session cookie (HMAC, no storage) ----
function sign(v) {
  return crypto.createHmac("sha256", OPS_SECRET).update(v).digest("hex");
}
const SESSION_VALUE = "ops-v1";
function makeCookie() {
  const token = SESSION_VALUE + "." + sign(SESSION_VALUE);
  return `ops=${token}; HttpOnly; Path=/; SameSite=Lax; Secure; Max-Age=604800`;
}
function isAuthed(req) {
  const cookie = req.headers.cookie || "";
  const m = cookie.match(/(?:^|;\s*)ops=([^;]+)/);
  if (!m) return false;
  const [val, mac] = decodeURIComponent(m[1]).split(".");
  return val === SESSION_VALUE && mac === sign(SESSION_VALUE);
}

// ---- Coolify API ----
function coolify(path, method = "GET", body) {
  return new Promise((resolve) => {
    if (!COOLIFY_URL || !COOLIFY_TOKEN) return resolve({ ok: false, status: 0, error: "COOLIFY_URL / COOLIFY_TOKEN not set" });
    let u;
    try { u = new URL(COOLIFY_URL + "/api/v1" + path); } catch { return resolve({ ok: false, status: 0, error: "bad COOLIFY_URL" }); }
    const payload = body ? JSON.stringify(body) : null;
    const lib = u.protocol === "http:" ? http : https;
    const req = lib.request(
      u,
      {
        method,
        headers: {
          Authorization: "Bearer " + COOLIFY_TOKEN,
          Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        },
        timeout: 15000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let json = null;
          try { json = data ? JSON.parse(data) : null; } catch { json = data; }
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json });
        });
      }
    );
    req.on("error", (e) => resolve({ ok: false, status: 0, error: String(e.message || e) }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, status: 0, error: "timeout" }); });
    if (payload) req.write(payload);
    req.end();
  });
}

// ---- helpers ----
function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", ...headers });
  res.end(body);
}
function json(res, status, obj, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
  });
}

// ---- pages ----
const LOGIN_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/><title>Coolify Ops — Sign in</title>
<style>${css()}</style></head><body class="center">
<form class="card" method="post" action="/login">
  <h1>Coolify Ops</h1>
  <p class="muted">Restricted — operations console.</p>
  {ERR}
  <input type="password" name="password" placeholder="PASSWORD" autofocus />
  <button>Sign in</button>
</form></body></html>`;

function dashboardPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/><title>Coolify Ops</title>
<style>${css()}</style></head><body>
<header class="bar">
  <span class="brand">◆ Coolify Ops</span>
  <span class="muted mono" id="target"></span>
  <span class="spacer"></span>
  <button class="ghost" onclick="load()">↻ Refresh</button>
  <form method="post" action="/logout" style="display:inline"><button class="ghost">Sign out</button></form>
</header>
<main>
  <div id="msg"></div>
  <h2>Applications</h2>
  <div id="apps" class="grid"><p class="muted">Loading…</p></div>
  <h2 style="margin-top:28px">Servers</h2>
  <div id="servers" class="grid"><p class="muted">Loading…</p></div>
</main>
<script>${clientJs()}</script>
</body></html>`;
}

function css() {
  return `:root{--bg:#070b12;--panel:#0d1420;--border:#1c2a3f;--accent:#4da6ff;--text:#c9d6e5;--muted:#5f7590;--ok:#4dd08a;--warn:#d4933a;--bad:#ff5c5c}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:"Segoe UI",system-ui,sans-serif}
.mono{font-family:ui-monospace,Consolas,monospace}.muted{color:var(--muted)}.spacer{flex:1}
.center{min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:26px;width:340px;display:flex;flex-direction:column;gap:12px}
.card h1{margin:0;font-family:ui-monospace,Consolas,monospace;letter-spacing:.08em;color:var(--accent);font-size:1.3rem}
input{background:#0a101a;border:1px solid var(--border);border-radius:6px;color:var(--text);padding:10px 12px;font:inherit;width:100%}
button{background:#1a4a7a;border:1px solid var(--accent);color:#dceaff;border-radius:6px;padding:9px 14px;font:inherit;cursor:pointer}
button:hover{background:var(--accent);color:#041020}button.ghost{background:transparent;color:var(--muted);border-color:var(--border)}
button.ghost:hover{background:transparent;border-color:var(--accent);color:var(--text)}
button.small{padding:5px 10px;font-size:.82rem}
.bar{display:flex;align-items:center;gap:12px;padding:12px 20px;border-bottom:1px solid var(--border);background:var(--panel);position:sticky;top:0}
.brand{font-family:ui-monospace,Consolas,monospace;letter-spacing:.1em;color:var(--accent);font-weight:700}
main{max-width:1000px;margin:0 auto;padding:22px 20px 60px}
h2{font-size:1.05rem;border-bottom:1px solid var(--border);padding-bottom:8px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.app{background:var(--panel);border:1px solid var(--border);border-radius:9px;padding:14px 15px;display:flex;flex-direction:column;gap:8px}
.app-top{display:flex;align-items:center;gap:8px}
.name{font-weight:600}.dot{width:9px;height:9px;border-radius:50%;flex:none}
.dot.ok{background:var(--ok)}.dot.warn{background:var(--warn)}.dot.bad{background:var(--bad)}.dot.idle{background:var(--muted)}
.status{font-family:ui-monospace,Consolas,monospace;font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.app-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:2px}
.error{color:var(--bad)}.success{color:var(--ok)}
.meta{font-size:.76rem;color:var(--muted)}`;
}

function clientJs() {
  return `
function statusClass(s){s=(s||'').toLowerCase();if(s.includes('running')||s.includes('healthy'))return'ok';if(s.includes('exited')||s.includes('error')||s.includes('unhealthy'))return'bad';if(s.includes('restart')||s.includes('starting')||s.includes('degraded'))return'warn';return'idle'}
function msg(t,cls){document.getElementById('msg').innerHTML=t?('<p class="'+(cls||'')+'">'+t+'</p>'):''}
async function load(){
  msg('');
  const r=await fetch('/api/apps');const d=await r.json();
  document.getElementById('target').textContent=d.target||'';
  const box=document.getElementById('apps');
  if(!r.ok){box.innerHTML='<p class="error">'+(d.error||'Failed to load')+'</p>';return}
  const apps=d.apps||[];
  if(!apps.length){box.innerHTML='<p class="muted">No applications returned by the API.</p>';return}
  box.innerHTML=apps.map(function(a){
    var sc=statusClass(a.status);
    return '<div class="app"><div class="app-top"><span class="dot '+sc+'"></span><span class="name">'+esc(a.name)+'</span></div>'+
      '<div class="status">'+esc(a.status||'unknown')+'</div>'+
      (a.fqdn?'<div class="meta">'+esc(a.fqdn)+'</div>':'')+
      '<div class="app-actions">'+
        '<button class="small" onclick="act(\\''+a.uuid+'\\',\\'deploy\\',this)">Deploy</button>'+
        '<button class="small ghost" onclick="act(\\''+a.uuid+'\\',\\'restart\\',this)">Restart</button>'+
        '<button class="small ghost" onclick="act(\\''+a.uuid+'\\',\\'stop\\',this)">Stop</button>'+
        '<button class="small ghost" onclick="act(\\''+a.uuid+'\\',\\'start\\',this)">Start</button>'+
      '</div></div>';
  }).join('');
  loadServers();
}
async function loadServers(){
  const r=await fetch('/api/servers');const d=await r.json();const box=document.getElementById('servers');
  if(!r.ok){box.innerHTML='<p class="muted">'+(d.error||'Servers unavailable')+'</p>';return}
  const s=d.servers||[];
  if(!s.length){box.innerHTML='<p class="muted">No server data.</p>';return}
  box.innerHTML=s.map(function(x){
    return '<div class="app"><div class="app-top"><span class="dot '+statusClass(x.status)+'"></span><span class="name">'+esc(x.name)+'</span></div>'+
      '<div class="status">'+esc(x.status||'')+'</div>'+
      (x.ip?'<div class="meta">'+esc(x.ip)+'</div>':'')+
      (x.resources?'<div class="meta">'+esc(x.resources)+'</div>':'')+'</div>';
  }).join('');
}
async function act(uuid,action,btn){
  btn.disabled=true;msg('');
  const r=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uuid:uuid,action:action})});
  const d=await r.json();btn.disabled=false;
  msg(r.ok?('✓ '+action+' sent'):('⚠ '+(d.error||'Failed')),r.ok?'success':'error');
  if(r.ok)setTimeout(load,1500);
}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
load();`;
}

// ---- routing ----
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  const path = u.pathname;

  // login
  if (path === "/login" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const params = new URLSearchParams(body);
      const pw = params.get("password") || "";
      if (OPS_PASSWORD && pw === OPS_PASSWORD) {
        res.writeHead(302, { "Set-Cookie": makeCookie(), Location: "/" });
        res.end();
      } else {
        send(res, 401, LOGIN_PAGE.replace("{ERR}", '<p class="error">Wrong password.</p>'));
      }
    });
    return;
  }
  if (path === "/logout" && req.method === "POST") {
    res.writeHead(302, { "Set-Cookie": "ops=; HttpOnly; Path=/; Max-Age=0", Location: "/" });
    res.end();
    return;
  }

  // everything below requires auth
  if (!isAuthed(req)) {
    if (path.startsWith("/api/")) return json(res, 401, { error: "Not signed in" });
    return send(res, 200, LOGIN_PAGE.replace("{ERR}", OPS_PASSWORD ? "" : '<p class="error">Set OPS_PASSWORD in the environment.</p>'));
  }

  if (path === "/" ) return send(res, 200, dashboardPage());

  if (path === "/api/apps") {
    const r = await coolify("/applications");
    if (!r.ok) return json(res, 502, { error: r.error || `Coolify API ${r.status}`, target: COOLIFY_URL });
    const list = Array.isArray(r.json) ? r.json : r.json?.data || [];
    const apps = list.map((a) => ({
      uuid: a.uuid || a.id,
      name: a.name || a.fqdn || a.uuid,
      status: a.status || a.state || "unknown",
      fqdn: a.fqdn || a.domains || "",
    }));
    return json(res, 200, { apps, target: COOLIFY_URL });
  }

  if (path === "/api/servers") {
    const r = await coolify("/servers");
    if (!r.ok) return json(res, 502, { error: r.error || `Coolify API ${r.status}` });
    const list = Array.isArray(r.json) ? r.json : r.json?.data || [];
    const servers = list.map((s) => ({
      name: s.name || s.uuid,
      status: (s.settings && s.settings.is_reachable === false ? "unreachable" : "reachable"),
      ip: s.ip || "",
      resources: "", // per-server metrics vary by Coolify version; surfaced when available
    }));
    return json(res, 200, { servers });
  }

  if (path === "/api/action" && req.method === "POST") {
    const body = await readBody(req);
    const uuid = String(body.uuid || "");
    const action = String(body.action || "");
    if (!uuid) return json(res, 400, { error: "missing uuid" });
    let r;
    if (action === "deploy") r = await coolify(`/deploy?uuid=${encodeURIComponent(uuid)}`, "GET");
    else if (action === "restart") r = await coolify(`/applications/${uuid}/restart`, "GET");
    else if (action === "stop") r = await coolify(`/applications/${uuid}/stop`, "GET");
    else if (action === "start") r = await coolify(`/applications/${uuid}/start`, "GET");
    else return json(res, 400, { error: "unknown action" });
    if (!r.ok) return json(res, 502, { error: r.error || `Coolify API ${r.status}` });
    return json(res, 200, { ok: true });
  }

  send(res, 404, "Not found");
});

server.listen(PORT, () => {
  console.log(`Coolify Ops listening on :${PORT} (target: ${COOLIFY_URL || "UNSET"})`);
});
