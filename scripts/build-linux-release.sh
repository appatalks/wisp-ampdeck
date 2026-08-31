#!/usr/bin/env bash

set -euo pipefail

project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
version=$(node -p "require('$project_dir/package.json').version")
appimage="$project_dir/dist/Wisp AmpDeck-$version.AppImage"
release_root="$project_dir/release"
bundle_name="Wisp AmpDeck-$version-linux-x64"
bundle_dir="$release_root/$bundle_name"

if [[ ! -f "$appimage" ]]; then
  printf 'Release error: AppImage not found at %s\n' "$appimage" >&2
  exit 1
fi

rm -rf "$bundle_dir"
mkdir -p "$bundle_dir"
install -m 755 "$appimage" "$bundle_dir/Wisp AmpDeck.AppImage"
install -m 755 "$project_dir/install.sh" "$bundle_dir/Install Wisp AmpDeck.sh"
install -m 755 "$project_dir/scripts/uninstall-linux.sh" "$bundle_dir/Uninstall Wisp AmpDeck.sh"
install -m 644 "$project_dir/build/icon.png" "$bundle_dir/wisp-ampdeck.png"
install -m 755 "$appimage" "$release_root/Wisp-AmpDeck-linux-x86_64.AppImage"
install -m 644 "$project_dir/build/icon.png" "$release_root/wisp-ampdeck.png"

rm -f "$release_root/$bundle_name.zip"
(
  cd "$release_root"
  zip -qr "$bundle_name.zip" "$bundle_name"
)

printf 'Linux installer bundle: %s\n' "$release_root/$bundle_name.zip"
printf 'One-line installer assets: %s\n' "$release_root/Wisp-AmpDeck-linux-x86_64.AppImage"
