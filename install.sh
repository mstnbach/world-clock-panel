#!/usr/bin/env bash
# Install (and hot-reload) World Clock Panel GNOME extension
set -euo pipefail

UUID="world-clock-panel@dihareb"
SRC="$(cd "$(dirname "$0")" && pwd)"
DST="$HOME/.local/share/gnome-shell/extensions/$UUID"

echo "Installing World Clock Panel → $DST"

# Create extension directory
mkdir -p "$DST/schemas"

# Copy extension files
cp "$SRC/metadata.json"  "$DST/"
cp "$SRC/extension.js"   "$DST/"
cp "$SRC/prefs.js"       "$DST/"
cp "$SRC/stylesheet.css" "$DST/"
cp "$SRC/schemas/"*.xml  "$DST/schemas/"

# Compile GSettings schema
if command -v glib-compile-schemas >/dev/null 2>&1; then
    glib-compile-schemas "$DST/schemas/"
    echo "✓ GSettings schema compiled"
else
    echo "⚠ glib-compile-schemas not found — install libglib2.0-bin"
    exit 1
fi

# Hot-reload via DBus (works on Wayland, no logout needed)
if [ -n "${DBUS_SESSION_BUS_ADDRESS:-}" ] && command -v gnome-extensions >/dev/null 2>&1; then
    if gnome-extensions list 2>/dev/null | grep -q "^$UUID$"; then
        echo "↺  Reloading (disable → enable)…"
        gnome-extensions disable "$UUID" 2>/dev/null || true
        sleep 0.4
        if gnome-extensions enable "$UUID" 2>/dev/null; then
            echo "✓ Reloaded — no logout needed"
        else
            echo "⚠ gnome-extensions enable failed — try it manually"
        fi
    else
        # First install: tell Shell about the extension via DBus
        if gdbus call --session \
               --dest org.gnome.Shell \
               --object-path /org/gnome/Shell \
               --method org.gnome.Shell.Extensions.EnableExtension \
               "$UUID" >/dev/null 2>&1; then
            echo "✓ Extension enabled"
        else
            echo ""
            echo "First install — log out and back in, then run:"
            echo "  gnome-extensions enable $UUID"
        fi
    fi
else
    echo ""
    echo "No active GNOME session — after login run:"
    echo "  gnome-extensions enable $UUID"
fi
