(function (window) {
    // Levels 1-10 as a dropdown under a single "Classify" button in a custom toolbar tab.
    function levelItems() {
        var arr = [];
        for (var n = 1; n <= 10; n++) {
            var tag = n >= 7 ? " — Top Secret" : n >= 4 ? " — Classified" : " — Restricted";
            arr.push({ id: "shieldClr" + n, text: "Level " + n + tag });
        }
        return arr;
    }

    function addTab() {
        window.Asc.plugin.executeMethod("AddToolbarMenuItem", [[
            {
                guid: window.Asc.plugin.guid,
                tabs: [
                    {
                        id: "shieldClassifyTab",
                        text: "Classify",
                        items: [
                            {
                                id: "shieldClassifyBtn",
                                type: "button",
                                text: "Classify paragraph",
                                hint: "Mark the current paragraph as classified",
                                icons: "resources/img/icon.png",
                                split: false,
                                items: levelItems()
                            }
                        ]
                    }
                ]
            }
        ]]);
    }

    window.Asc.plugin.init = function () { addTab(); };

    // Paragraph-level convention: a [[CLR:n]] anywhere in the paragraph classifies it.
    window.Asc.plugin.attachEvent("onToolbarMenuClick", function (id) {
        if (id && id.indexOf("shieldClr") === 0) {
            var lvl = id.replace("shieldClr", "");
            window.Asc.plugin.executeMethod("PasteText", ["[[CLR:" + lvl + "]] "]);
        }
    });

    window.Asc.plugin.button = function () { this.executeCommand("close", ""); };
})(window);
