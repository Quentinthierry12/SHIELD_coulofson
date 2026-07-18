// Connectivity probe for the S.H.I.E.L.D. plugin channel.
//
// The point of this plugin is not what it does — it is to answer one question the two
// previous attempts never answered: can a plugin served from the PORTAL talk to the
// editor? The earlier plugin was baked into the Document Server image, and when the
// editor broke there was no way to tell whether the plugin was at fault or the way it
// was installed. Serving it over a URL makes the whole thing reversible in three minutes.

(function (window) {
  const say = (msg) => {
    const el = window.document.getElementById("state");
    if (el) el.textContent = msg;
  };

  window.Asc.plugin.init = function () {
    say("plugin initialisé — canal ouvert");
  };

  window.document.getElementById("probe").onclick = function () {
    // callCommand runs inside the editor's document context: this is the real proof that
    // the bridge works, not just that the panel renders.
    window.Asc.plugin.callCommand(
      function () {
        const doc = Api.GetDocument();
        const p = Api.CreateParagraph();
        p.AddText("[[SHIELD PLUGIN TEST — a supprimer]]");
        doc.Push(p);
      },
      false,
      true,
      function () {
        say("écriture réussie — le plugin peut modifier le document");
      }
    );
  };

  window.Asc.plugin.button = function () {
    this.executeCommand("close", "");
  };
})(window, undefined);
