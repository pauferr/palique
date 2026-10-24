#!/usr/bin/env bash
# Builds every app icon from build/icon.svg and build/tray.svg (needs rsvg-convert, and
# iconutil on macOS for the .icns). Run from the repository root: build/icons.sh
set -euo pipefail
tmp=$(mktemp -d)

# Windows and Linux: the tile fills the canvas. electron-builder makes the .ico from it.
rsvg-convert -w 1024 -h 1024 build/icon.svg -o build/icon.png
rsvg-convert -w 512 -h 512 build/icon.svg -o resources/icon.png

# macOS: Big Sur icons keep a margin around the tile (824 of 1024 px).
sed 's|viewBox="0 0 100 100"|viewBox="-7.15 -7.15 114.3 114.3"|' build/icon.svg > "$tmp/mac.svg"
mkdir "$tmp/icon.iconset"
for size in 16 32 128 256 512; do
  rsvg-convert -w $size -h $size "$tmp/mac.svg" -o "$tmp/icon.iconset/icon_${size}x${size}.png"
  rsvg-convert -w $((size * 2)) -h $((size * 2)) "$tmp/mac.svg" -o "$tmp/icon.iconset/icon_${size}x${size}@2x.png"
done
iconutil -c icns "$tmp/icon.iconset" -o build/icon.icns

# macOS menu bar: a template image (black + transparency), 16 pt.
rsvg-convert -w 16 -h 16 build/tray.svg -o resources/trayTemplate.png
rsvg-convert -w 32 -h 32 build/tray.svg -o resources/trayTemplate@2x.png

rm -rf "$tmp"
