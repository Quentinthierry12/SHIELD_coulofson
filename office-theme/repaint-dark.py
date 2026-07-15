#!/usr/bin/env python3
"""Repaint OnlyOffice's built-in dark theme with the S.H.I.E.L.D. palette, in place.

Why not a custom theme (theme-shield-dark)? DS 9.3's api.js only appends `&uitheme=<id>`
to the editor URL, never `&uithemetype=`. The bootstrap in index.html therefore cannot know
a custom theme's type before themes.json loads, leaves the body on `theme-type-light`, and
the editor renders light. Built-in themes have their colours precompiled in app.css under
`.theme-dark`, so the body class alone is enough — that path already works. So we repaint it.

Run against the unpacked document server; it edits every editor's app.css.
"""
import re
import sys
from pathlib import Path

# Header and tab bar carry the blue: that is what makes it read as S.H.I.E.L.D. at a glance.
# The document canvas stays neutral so pages remain legible.
SHIELD = {
    "toolbar-header-document": "#12325a",
    "toolbar-header-spreadsheet": "#12325a",
    "toolbar-header-presentation": "#12325a",
    "toolbar-header-pdf": "#12325a",
    "toolbar-header-visio": "#12325a",
    "background-toolbar": "#0f2647",
    "background-toolbar-additional": "#16355e",
    "background-normal": "#0d1a2e",
    "background-contrast-popover": "#0d1a2e",
    "background-accent-button": "#1a4a7a",
    "background-primary-dialog-button": "#1a4a7a",
    "highlight-button-hover": "#1b4478",
    "highlight-button-pressed": "#1a4a7a",
    "highlight-button-pressed-hover": "#215d99",
    "highlight-primary-dialog-button-hover": "#4da6ff",
    "border-toolbar": "#25507f",
    "border-divider": "#25507f",
    "border-regular-control": "#25507f",
    "border-control-focus": "#4da6ff",
    "border-toolbar-active-panel-top": "#4da6ff",
    "text-normal": "#dce9f7",
    "text-secondary": "#9dc2e8",
    "text-toolbar-header": "#e8f1fb",
    "icon-normal": "#dce9f7",
    "icon-toolbar-header": "#7cc4ff",
    "text-link": "#4da6ff",
    "text-link-hover": "#7dc0ff",
    "text-link-active": "#7dc0ff",
    "canvas-background": "#101d33",
    "canvas-ruler-background": "#101d33",
    "canvas-ruler-margins-background": "#16263f",
}

# The precompiled rule holding the built-in dark palette.
RULE = re.compile(r"(\.theme-dark\s*,\s*:root\s+\.theme-type-dark\s*\{)([^}]*)(\})")


def repaint(css: str) -> tuple[str, int]:
    """Rewrite only the variables inside the dark-theme rule; leave the rest of the file alone."""
    changed = 0

    def fix_rule(m: re.Match) -> str:
        nonlocal changed
        body = m.group(2)
        for var, colour in SHIELD.items():
            # Only touch a variable that is actually declared in this rule.
            new_body, n = re.subn(rf"(--{re.escape(var)}\s*:\s*)[^;]+", rf"\g<1>{colour}", body)
            if n:
                body = new_body
                changed += n
        return m.group(1) + body + m.group(3)

    return RULE.sub(fix_rule, css), changed


def main(root: str) -> int:
    files = sorted(Path(root).rglob("resources/css/app.css"))
    if not files:
        print("ERROR: no app.css found — the layout changed, refusing to silently do nothing")
        return 1
    total = 0
    for f in files:
        css = f.read_text(encoding="utf-8", errors="replace")
        if not RULE.search(css):
            continue  # not every app.css carries the theme rule
        out, n = repaint(css)
        if n:
            f.write_text(out, encoding="utf-8")
            total += n
            print(f"  repainted {n:3} vars in {f}")
    if total == 0:
        print("ERROR: found app.css but repainted nothing — the dark rule changed shape")
        return 1
    print(f"OK: {total} variables repainted across {len(files)} file(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "/var/www/onlyoffice/documentserver/web-apps"))
