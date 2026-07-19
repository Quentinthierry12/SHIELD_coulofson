// S.H.I.E.L.D. editor plugin — inserts the text conventions the portal understands and
// applies visual protection tools:
//   [[CLR:n]]        classifies the paragraph it sits in (lib/redact.ts)
//   [[SIGN:...]]     a signature slot, filled in place when signed (lib/sigmarkers.ts)
//   [[DATE]]         stamped when the document is sealed
//   classification stamp   a coloured visual banner (marking only, not redaction)
//   redaction              a black bar over the current selection
//   watermark              a diagonal "TOP SECRET" watermark on every page
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

  // Visual classification stamps — inserted as styled HTML at the cursor (marking only,
  // no redaction). Colours mirror the portal's classification tiers.
  const STAMPS = {
    low: { label: "RESTREINT",  bg: "#0e3322", fg: "#ffffff" },
    mid: { label: "CLASSIFIÉ",  bg: "#3a2312", fg: "#ffffff" },
    hi:  { label: "TOP SECRET", bg: "#7a1010", fg: "#ffffff" },
  };
  function stamp(kind) {
    const s = STAMPS[kind];
    if (!s) return;
    const html =
      '<span style="background:' + s.bg + ";color:" + s.fg +
      ';font-family:Consolas,monospace;font-weight:bold;padding:1px 8px;letter-spacing:.12em;">' +
      "■ S.H.I.E.L.D. // " + s.label + " ■</span>";
    window.Asc.plugin.executeMethod("PasteHtml", [html], function () {
      say("Tampon " + s.label + " inséré.");
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
        (n >= 7 ? "TOP SECRET" : n >= 4 ? "CLASSIFIÉ" : "RESTREINT");
      b.onclick = () => insert("[[CLR:" + n + "]]", "Niveau " + n);
      grid.appendChild(b);
    }

    window.document.querySelectorAll("[data-ins]").forEach((b) => {
      b.onclick = () => insert(b.getAttribute("data-ins"), b.textContent.trim());
    });

    window.document.querySelectorAll("[data-stamp]").forEach((b) => {
      b.onclick = () => stamp(b.getAttribute("data-stamp"));
    });

    // Caviardage : barre noire (fond + texte noirs) sur la sélection courante.
    window.document.getElementById("redact").onclick = function () {
      window.Asc.plugin.callCommand(function () {
        var oRange = Api.GetDocument().GetRangeBySelect();
        if (oRange) { oRange.SetHighlight("black"); oRange.SetColor(0, 0, 0, false); }
      }, false, false, function () { say("Sélection caviardée."); });
    };
    window.document.getElementById("unredact").onclick = function () {
      window.Asc.plugin.callCommand(function () {
        var oRange = Api.GetDocument().GetRangeBySelect();
        if (oRange) { oRange.SetHighlight("none"); oRange.SetColor(0, 0, 0, true); }
      }, false, false, function () { say("Caviardage retiré."); });
    };

    // Filigrane diagonal « TOP SECRET » sur tout le document.
    window.document.getElementById("watermark").onclick = function () {
      window.Asc.plugin.callCommand(function () {
        Api.GetDocument().InsertWatermark("TOP SECRET", true);
      }, false, false, function () { say("Filigrane appliqué."); });
    };
    window.document.getElementById("watermarkOff").onclick = function () {
      window.Asc.plugin.callCommand(function () {
        Api.GetDocument().InsertWatermark("", true);
      }, false, false, function () { say("Filigrane retiré."); });
    };

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
