#!/usr/bin/env bash
# Downloads the 12 AI-generated BJJ stop-motion frames and saves them as
# assets/img/bjj/frame-00.webp … frame-11.webp. Needs curl and either cwebp
# or ImageMagick (`magick`/`convert`). Run from the repo root.
set -euo pipefail
cd "$(dirname "$0")/.."
out=assets/img/bjj; mkdir -p "$out"
urls=(
  https://v3b.fal.media/files/b/0aafb8e8/ZUtXZGVgqZZiNBVCubYhK_il5mAU97.png   # 00 grips
  https://v3b.fal.media/files/b/0aafb8f9/MMufwbfblx0uoIwtcV9j1_OJdnmPD8.png   # 01 pull and step in
  https://v3b.fal.media/files/b/0aafb8f9/7QJNdlPbSu_WOq7mnkV0F_ciu8jKsR.png   # 02 sitting to pull guard
  https://v3b.fal.media/files/b/0aafb8fa/g9HbS9Mk5hIig4BLAdGMA_mh9SAayT.png   # 03 legs wrapping
  https://v3b.fal.media/files/b/0aafb8e8/q74H3pNI00evPnAXVpTnE_7EXzxh3q.png   # 04 closed guard
  https://v3b.fal.media/files/b/0aafb8f9/OsNoFAyvHG7CXC00l0NIb_2GLVWldx.png   # 05 break posture
  https://v3b.fal.media/files/b/0aafb8f9/m1WfNVC1fJi0N0dHHPx3y_y6UAbjag.png   # 06 hips out, leg climbing
  https://v3b.fal.media/files/b/0aafb8f9/-yBYNet1vo4d1Qs2lnplO_uRANtc17.png   # 07 leg over head
  https://v3b.fal.media/files/b/0aafb8e8/MaPtOkPXrLHWtahJSN6Hu_9vZkOH0J.png   # 08 armbar
  https://v3b.fal.media/files/b/0aafb8fa/Et4ZFJ3HNeWizRP0csxmn_X1MJRF5x.png   # 09 tap
  https://v3b.fal.media/files/b/0aafb8f9/SyS3BJVLPoBqyBE3pAARU_4rjQfCz1.png   # 10 releasing and sitting up
  https://v3b.fal.media/files/b/0aafb8e8/ibr3FmhG39k-utUqNm0gL_AWIqiKrD.png   # 11 handshake
)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for i in "${!urls[@]}"; do
  n=$(printf "%02d" "$i")
  curl -fsSL "${urls[$i]}" -o "$tmp/$n.png"
  if command -v cwebp >/dev/null; then
    cwebp -quiet -q 78 -resize 1024 0 "$tmp/$n.png" -o "$out/frame-$n.webp"
  else
    $(command -v magick || echo convert) "$tmp/$n.png" -resize 1024x -quality 78 "$out/frame-$n.webp"
  fi
  echo "frame-$n.webp"
done
