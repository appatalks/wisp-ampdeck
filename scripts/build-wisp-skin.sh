#!/usr/bin/env bash

set -euo pipefail

project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
source_dir="$project_dir/skins/wisp"
output_dir="$project_dir/public/skins"
output_skin="$output_dir/Wisp-AmpDeck.wsz"
upstream_commit="88ed5815d968c201962f6549915579b3d2f93c5e"
upstream_skin_url="https://raw.githubusercontent.com/captbaritone/webamp/$upstream_commit/packages/webamp/assets/skins/base-2.91.wsz"
temporary_dir=$(mktemp -d)
trap 'rm -rf "$temporary_dir"' EXIT

for command in curl unzip zip ffmpeg convert; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'Skin build error: %s is required.\n' "$command" >&2
    exit 1
  fi
done

mkdir -p "$temporary_dir/base" "$temporary_dir/output" "$output_dir"
curl --fail --location --silent --show-error "$upstream_skin_url" --output "$temporary_dir/base.wsz"
unzip -q "$temporary_dir/base.wsz" -d "$temporary_dir/base"

chrome_palette="$temporary_dir/chrome-palette.png"
neon_palette="$temporary_dir/neon-palette.png"

convert \
  -size 1x64 gradient:'#04040c-#151126' \
  -size 1x64 gradient:'#151126-#453166' \
  -size 1x64 gradient:'#453166-#9a70be' \
  -size 1x64 gradient:'#9a70be-#f0dcff' \
  -append "$chrome_palette"

convert \
  -size 1x64 gradient:'#020806-#12351b' \
  -size 1x64 gradient:'#12351b-#4c8c2a' \
  -size 1x64 gradient:'#4c8c2a-#b7ff65' \
  -size 1x64 gradient:'#b7ff65-#efffc9' \
  -append "$neon_palette"

find "$temporary_dir/base" -maxdepth 1 -type f \
  ! -iname '*.bmp' \
  ! -iname 'pledit.txt' \
  ! -iname 'viscolor.txt' \
  ! -iname 'skining updates.txt' \
  -exec cp -- '{}' "$temporary_dir/output/" \;

while IFS= read -r -d '' bitmap; do
  file_name=$(basename "$bitmap")
  decoded="$temporary_dir/${file_name%.*}.png"
  ffmpeg -v error -y -i "$bitmap" "$decoded"

  case ${file_name^^} in
    TEXT.BMP | NUMBERS.BMP | PLAYPAUS.BMP | MONOSTER.BMP)
      convert "$decoded" -colorspace gray "$neon_palette" -clut -depth 8 -colors 256 "BMP3:$temporary_dir/output/$file_name"
      ;;
    *)
      convert "$decoded" -colorspace gray "$chrome_palette" -clut -depth 8 -colors 256 "BMP3:$temporary_dir/output/$file_name"
      ;;
  esac
done < <(find "$temporary_dir/base" -maxdepth 1 -type f -iname '*.bmp' -print0)

accent_region() {
  local file_name=$1
  local x=$2
  local y=$3
  local width=$4
  local height=$5
  local bitmap="$temporary_dir/output/$file_name"
  local accented="$temporary_dir/accented-$file_name"

  convert "$bitmap" \
    \( +clone -crop "${width}x${height}+${x}+${y}" +repage -colorspace gray "$neon_palette" -clut \) \
    -geometry "+${x}+${y}" -composite -depth 8 -colors 256 "BMP3:$accented"
  mv "$accented" "$bitmap"
}

accent_region CBUTTONS.BMP 0 18 114 18
accent_region CBUTTONS.BMP 114 16 22 16
accent_region SHUFREP.BMP 0 15 75 45
accent_region SHUFREP.BMP 46 61 46 12
accent_region SHUFREP.BMP 0 73 92 12
accent_region EQMAIN.BMP 13 164 209 129
accent_region EQMAIN.BMP 0 176 11 11
accent_region EQMAIN.BMP 69 119 176 12
accent_region EQMAIN.BMP 224 176 44 12
accent_region POSBAR.BMP 0 0 248 10
accent_region POSBAR.BMP 278 0 29 10
accent_region VOLUME.BMP 0 0 68 420
accent_region VOLUME.BMP 0 422 14 11
accent_region BALANCE.BMP 9 0 38 420
accent_region BALANCE.BMP 0 422 14 11
accent_region PLEDIT.BMP 61 53 8 18
accent_region PLEDIT.BMP 23 111 22 57
accent_region PLEDIT.BMP 77 111 22 76
accent_region PLEDIT.BMP 127 111 22 57
accent_region PLEDIT.BMP 177 111 22 57
accent_region PLEDIT.BMP 227 111 22 57

convert "$temporary_dir/output/TITLEBAR.BMP" +antialias \
  -fill '#100c20' \
  -draw 'rectangle 140,2 190,11 rectangle 140,17 190,26 rectangle 45,31 84,40 rectangle 45,44 84,53' \
  -font DejaVu-Sans-Mono-Bold -pointsize 7 -fill '#b7ff65' \
  -draw "text 140,10 'Wisp AmpDeck' text 140,25 'Wisp AmpDeck' text 55,39 'Wisp' text 55,52 'Wisp'" \
  -depth 8 -colors 256 "BMP3:$temporary_dir/TITLEBAR.BMP"
mv "$temporary_dir/TITLEBAR.BMP" "$temporary_dir/output/TITLEBAR.BMP"

convert "$temporary_dir/output/EQMAIN.BMP" +antialias \
  -fill '#100c20' \
  -draw 'rectangle 88,136 188,146 rectangle 88,151 188,161' \
  -font DejaVu-Sans-Mono-Bold -pointsize 7 -fill '#dcb8ff' \
  -draw "text 119,144 'EQUALIZER' text 119,159 'EQUALIZER'" \
  -depth 8 -colors 256 "BMP3:$temporary_dir/EQMAIN.BMP"
mv "$temporary_dir/EQMAIN.BMP" "$temporary_dir/output/EQMAIN.BMP"

convert "$temporary_dir/output/PLEDIT.BMP" +antialias \
  -fill '#100c20' \
  -draw 'rectangle 28,4 124,15 rectangle 28,25 124,36' \
  -font DejaVu-Sans-Mono-Bold -pointsize 7 -fill '#dcb8ff' \
  -draw "text 59,13 'PLAYLIST' text 59,34 'PLAYLIST'" \
  -depth 8 -colors 256 "BMP3:$temporary_dir/PLEDIT.BMP"
mv "$temporary_dir/PLEDIT.BMP" "$temporary_dir/output/PLEDIT.BMP"

install -m 644 "$source_dir/PLEDIT.TXT" "$temporary_dir/output/PLEDIT.TXT"
install -m 644 "$source_dir/VISCOLOR.TXT" "$temporary_dir/output/VISCOLOR.TXT"
install -m 644 "$source_dir/SKININFO.TXT" "$temporary_dir/output/SKININFO.TXT"

rm -f "$output_skin"
(
  cd "$temporary_dir/output"
  zip -q "$output_skin" ./*
)

printf 'Wisp AmpDeck skin: %s\n' "$output_skin"
