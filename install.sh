#!/usr/bin/env bash

set -euo pipefail

app_name="Wisp AmpDeck"
app_id="wisp-ampdeck"
repository="appatalks/wisp-ampdeck"
release_base_url="https://github.com/$repository/releases/latest/download"
raw_base_url="https://raw.githubusercontent.com/$repository/main"
default_appimage_url="$release_base_url/Wisp-AmpDeck-linux-x86_64.AppImage"
default_icon_url="$release_base_url/wisp-ampdeck.png"
default_uninstaller_url="$raw_base_url/scripts/uninstall-linux.sh"

script_source=${BASH_SOURCE[0]:-}
if [[ -n "$script_source" && -f "$script_source" ]]; then
  script_dir=$(cd -- "$(dirname -- "$script_source")" && pwd)
  if [[ -f "$script_dir/Wisp AmpDeck.AppImage" ]]; then
    default_appimage_url="file://$script_dir/Wisp AmpDeck.AppImage"
  fi
  if [[ -f "$script_dir/wisp-ampdeck.png" ]]; then
    default_icon_url="file://$script_dir/wisp-ampdeck.png"
  fi
  if [[ -f "$script_dir/Uninstall Wisp AmpDeck.sh" ]]; then
    default_uninstaller_url="file://$script_dir/Uninstall Wisp AmpDeck.sh"
  fi
fi

appimage_url=${WISP_AMPDECK_APPIMAGE_URL:-$default_appimage_url}
icon_url=${WISP_AMPDECK_ICON_URL:-$default_icon_url}
uninstaller_url=${WISP_AMPDECK_UNINSTALLER_URL:-$default_uninstaller_url}

if [[ $(uname -s) != "Linux" ]]; then
  printf 'Installer error: this command currently supports Linux only.\n' >&2
  exit 1
fi

case $(uname -m) in
  x86_64 | amd64) ;;
  *)
    printf 'Installer error: no Wisp AmpDeck build is available for %s yet.\n' "$(uname -m)" >&2
    exit 1
    ;;
esac

data_home=${XDG_DATA_HOME:-"$HOME/.local/share"}
bin_home=${XDG_BIN_HOME:-"$HOME/.local/bin"}
install_dir="$data_home/$app_id"
applications_dir="$data_home/applications"
icons_dir="$data_home/icons/hicolor/512x512/apps"
installed_appimage="$install_dir/$app_name.AppImage"
installed_uninstaller="$install_dir/uninstall.sh"
desktop_entry="$applications_dir/$app_id.desktop"
installed_icon="$icons_dir/$app_id.png"

mkdir -p "$install_dir" "$applications_dir" "$icons_dir" "$bin_home"

temporary_appimage="$install_dir/.installing.AppImage"
temporary_icon="$install_dir/.installing.png"
temporary_uninstaller="$install_dir/.installing-uninstaller.sh"
trap 'rm -f "$temporary_appimage" "$temporary_icon" "$temporary_uninstaller"' EXIT

download_to() {
  local source=$1
  local destination=$2

  if [[ "$source" == file://* ]]; then
    cp -- "${source#file://}" "$destination"
    return
  fi

  if ! command -v curl >/dev/null 2>&1; then
    printf 'Installer error: curl is required.\n' >&2
    return 1
  fi

  curl --fail --location --silent --show-error "$source" --output "$destination"
}

printf 'Downloading %s...\n' "$app_name"
download_to "$appimage_url" "$temporary_appimage"
chmod 755 "$temporary_appimage"
mv -f "$temporary_appimage" "$installed_appimage"

if download_to "$icon_url" "$temporary_icon"; then
  chmod 644 "$temporary_icon"
  mv -f "$temporary_icon" "$installed_icon"
else
  rm -f "$temporary_icon"
  printf 'Warning: the launcher icon could not be downloaded.\n' >&2
fi

if download_to "$uninstaller_url" "$temporary_uninstaller"; then
  chmod 755 "$temporary_uninstaller"
  mv -f "$temporary_uninstaller" "$installed_uninstaller"
else
  rm -f "$temporary_uninstaller"
  printf 'Warning: the uninstall command could not be installed.\n' >&2
fi

desktop_quote() {
  local value=${1//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//\`/\\\`}
  value=${value//\$/\\\$}
  printf '"%s"' "$value"
}

quoted_appimage=$(desktop_quote "$installed_appimage")

{
  printf '%s\n' '[Desktop Entry]'
  printf '%s\n' 'Type=Application'
  printf 'Name=%s\n' "$app_name"
  printf '%s\n' 'Comment=Classic modular desktop music player'
  printf 'Exec=%s\n' "$quoted_appimage"
  if [[ -f "$installed_icon" ]]; then
    printf 'Icon=%s\n' "$installed_icon"
  fi
  printf '%s\n' 'Terminal=false'
  printf '%s\n' 'Categories=AudioVideo;Audio;Player;'
  printf '%s\n' 'StartupNotify=true'
  printf '%s\n' 'StartupWMClass=wisp-ampdeck'
} > "$desktop_entry"
chmod 644 "$desktop_entry"

ln -sfn "$installed_appimage" "$bin_home/$app_id"
if [[ -f "$installed_uninstaller" ]]; then
  ln -sfn "$installed_uninstaller" "$bin_home/$app_id-uninstall"
fi

desktop_dir="$HOME/Desktop"
if command -v xdg-user-dir >/dev/null 2>&1; then
  resolved_desktop_dir=$(xdg-user-dir DESKTOP 2>/dev/null || true)
  if [[ -n "$resolved_desktop_dir" ]]; then
    desktop_dir=$resolved_desktop_dir
  fi
fi

if [[ -d "$desktop_dir" ]]; then
  desktop_shortcut="$desktop_dir/$app_name.desktop"
  install -m 755 "$desktop_entry" "$desktop_shortcut"
  if command -v gio >/dev/null 2>&1; then
    gio set "$desktop_shortcut" metadata::trusted true >/dev/null 2>&1 || true
  fi
fi

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$applications_dir" >/dev/null 2>&1 || true
fi

printf '%s is installed.\n' "$app_name"
printf 'Launch it from your applications menu, desktop shortcut, or with: %s\n' "$app_id"
if [[ ":$PATH:" != *":$bin_home:"* ]]; then
  printf 'Note: %s is not currently on PATH; the menu and desktop launchers are ready.\n' "$bin_home"
fi
