#!/usr/bin/env bash

set -euo pipefail

app_name="Wisp AmpDeck"
app_id="wisp-ampdeck"
data_home=${XDG_DATA_HOME:-"$HOME/.local/share"}
bin_home=${XDG_BIN_HOME:-"$HOME/.local/bin"}
applications_dir="$data_home/applications"
desktop_entry="$applications_dir/$app_id.desktop"

rm -f "$desktop_entry"
rm -f "$data_home/icons/hicolor/512x512/apps/$app_id.png"
rm -f "$bin_home/$app_id" "$bin_home/$app_id-uninstall"

desktop_dir="$HOME/Desktop"
if command -v xdg-user-dir >/dev/null 2>&1; then
  resolved_desktop_dir=$(xdg-user-dir DESKTOP 2>/dev/null || true)
  if [[ -n "$resolved_desktop_dir" ]]; then
    desktop_dir=$resolved_desktop_dir
  fi
fi
rm -f "$desktop_dir/$app_name.desktop"
rm -rf "$data_home/$app_id"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$applications_dir" >/dev/null 2>&1 || true
fi

printf '%s has been uninstalled. Your settings and music library references were kept.\n' "$app_name"
