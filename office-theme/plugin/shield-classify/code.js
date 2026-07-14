(function (window) {
    // Build the level buttons once the plugin panel is ready.
    window.Asc.plugin.init = function () {
        var grid = document.getElementById("levels");
        for (var n = 1; n <= 10; n++) {
            (function (level) {
                var b = document.createElement("button");
                b.textContent = "Level " + level;
                b.className = level >= 7 ? "lvl-hi" : level >= 4 ? "lvl-mid" : "lvl-low";
                b.onclick = function () { classify(level); };
                grid.appendChild(b);
            })(n);
        }
    };

    // Paragraph-level convention: a [[CLR:n]] anywhere in the paragraph classifies it.
    function classify(level) {
        window.Asc.plugin.executeMethod("PasteText", ["[[CLR:" + level + "]] "]);
    }

    window.Asc.plugin.button = function () {
        this.executeCommand("close", "");
    };
})(window);
