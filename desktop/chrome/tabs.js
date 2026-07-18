// The tab strip. It owns no state of its own: the main process holds the tabs and pushes
// the list here on every change. Keeping one source of truth avoids the classic bug where
// the strip shows a tab the window no longer has.

const strip = document.getElementById("strip");

function render(tabs, activeId) {
  strip.innerHTML = "";
  for (const t of tabs) {
    const el = document.createElement("div");
    el.className = "tab" + (t.id === activeId ? " active" : "") + (t.home ? " home" : "");
    el.title = t.title;

    if (t.kind) {
      const k = document.createElement("span");
      k.className = "kind";
      k.textContent = t.kind;
      el.appendChild(k);
    }

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = t.title;
    el.appendChild(name);

    if (!t.home) {
      const x = document.createElement("span");
      x.className = "x";
      x.textContent = "×";
      x.onclick = (e) => { e.stopPropagation(); window.shieldTabs.close(t.id); };
      el.appendChild(x);
    }

    el.onclick = () => window.shieldTabs.select(t.id);
    // Middle-click closes, as everywhere else — muscle memory beats discoverability here.
    el.onauxclick = (e) => { if (e.button === 1 && !t.home) window.shieldTabs.close(t.id); };
    strip.appendChild(el);
  }
}

document.getElementById("new").onclick = () => window.shieldTabs.newTab();
document.getElementById("min").onclick = () => window.shieldTabs.win("min");
document.getElementById("max").onclick = () => window.shieldTabs.win("max");
document.getElementById("close").onclick = () => window.shieldTabs.win("hide");

window.shieldTabs.onUpdate(render);
window.shieldTabs.ready();
