// S.H.I.E.L.D. editor plugin — inserts the text conventions the portal understands:
//   [[CLR:n]]        classifies the paragraph it sits in (lib/redact.ts)
//   [[SIGN:...]]     a signature slot, filled in place when signed (lib/sigmarkers.ts)
//   [[DATE]]         stamped when the document is sealed
//
// Served from the PORTAL, not baked into the Document Server image. That is what makes it
// safe: if this plugin misbehaves, removing one line from the editor config and
// redeploying the portal takes three minutes, with no rebuild of the Document Server.

(function (window) {
  const say = (m) => {
    const el = window.document.getElementById("msg");
    if (el) el.textContent = m;
  };

  // PasteText drops the text at the cursor. Chosen over building paragraphs through the
  // document API because a classification marker belongs *inside* the paragraph the author
  // is already writing — not in a new one.
  function insert(text, label) {
    window.Asc.plugin.executeMethod("PasteText", [text], function () {
      say(label + " inséré.");
    });
  }

  window.Asc.plugin.init = function () {
    const grid = window.document.getElementById("levels");
    for (let n = 1; n <= 10; n++) {
      const b = window.document.createElement("button");
      b.className = "lvl" + (n >= 7 ? " hi" : "");
      b.textContent = n;
      b.title =
        "Niveau " + n + " — " +
        (n >= 7 ? "TOP SECRET" : n >= 4 ? "CLASSIFIED" : "RESTRICTED");
      b.onclick = () => insert("[[CLR:" + n + "]]", "Niveau " + n);
      grid.appendChild(b);
    }

    window.document.querySelectorAll("[data-ins]").forEach((b) => {
      b.onclick = () => insert(b.getAttribute("data-ins"), b.textContent.trim());
    });

    window.document.getElementById("byBadge").onclick = function () {
      const field = window.document.getElementById("badge");
      const badge = (field.value || "").trim().toUpperCase();
      // The portal only resolves a slot whose badge matches an active agent; inserting a
      // malformed one would leave an "awaiting signature" that can never be filled.
      if (!/^[A-Z0-9][A-Z0-9-]{2,19}$/.test(badge)) {
        say("Matricule invalide — 3 à 20 caractères, lettres, chiffres et tirets.");
        return;
      }
      insert("[[SIGN:" + badge + "]]", "Emplacement pour " + badge);
      field.value = "";
    };

    say("");
  };

  window.Asc.plugin.button = function () {
    this.executeCommand("close", "");
  };
})(window, undefined);
