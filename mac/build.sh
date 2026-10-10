#!/bin/zsh
# Compila Trazo.app, genera los íconos (Mac, iPad/iPhone y web), la instala en /Applications y la deja en el Dock
set -e
cd "$(dirname "$0")/.."
B=build; APP="${TMPDIR:-/tmp}/trazo-build/Trazo.app"; mkdir -p "$(dirname "$APP")" "$B"
swiftc -O mac/icon.swift -o "$B/icongen" && "$B/icongen" "$B"
# íconos web / iOS
sips -z 180 180 "$B/icon-ios-1024.png" --out apple-touch-icon.png >/dev/null
sips -z 192 192 "$B/icon-ios-1024.png" --out icon-192.png >/dev/null
sips -z 512 512 "$B/icon-ios-1024.png" --out icon-512.png >/dev/null
rm -rf "$B/AppIcon.iconset" "$APP"; mkdir -p "$B/AppIcon.iconset"
for s in 16 32 128 256 512; do
  sips -z $s $s "$B/icon-mac-1024.png" --out "$B/AppIcon.iconset/icon_${s}x${s}.png" >/dev/null
  d=$((s*2)); sips -z $d $d "$B/icon-mac-1024.png" --out "$B/AppIcon.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$B/AppIcon.iconset" -o "$B/AppIcon.icns"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
swiftc -O mac/main.swift -o "$APP/Contents/MacOS/Trazo" -target arm64-apple-macos13.0
cp mac/Info.plist "$APP/Contents/Info.plist"
cp index.html manifest.webmanifest icon-192.png icon-512.png apple-touch-icon.png "$APP/Contents/Resources/"
cp -R js lib "$APP/Contents/Resources/"
cp "$B/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
xattr -cr "$APP"
codesign --force --deep --sign - "$APP"
rm -rf "/Applications/Trazo.app"
cp -R "$APP" /Applications/
if ! defaults read com.apple.dock persistent-apps | grep -q "Trazo.app"; then
  defaults write com.apple.dock persistent-apps -array-add "<dict><key>tile-data</key><dict><key>file-data</key><dict><key>_CFURLString</key><string>file:///Applications/Trazo.app/</string><key>_CFURLStringType</key><integer>15</integer></dict></dict></dict>"
  killall Dock
fi
echo "Instalada en /Applications/Trazo.app"
