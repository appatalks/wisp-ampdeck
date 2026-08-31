#!/usr/bin/env bash

set -euo pipefail

project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
appimage=${1:-"$project_dir/dist/Wisp AmpDeck-$(node -p "require('$project_dir/package.json').version").AppImage"}

WISP_AMPDECK_APPIMAGE_URL="file://$appimage" \
WISP_AMPDECK_ICON_URL="file://$project_dir/build/icon.png" \
WISP_AMPDECK_UNINSTALLER_URL="file://$project_dir/scripts/uninstall-linux.sh" \
  bash "$project_dir/install.sh"
