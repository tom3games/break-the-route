#!/bin/sh
# Poly Haven（CC0）から素材を取って webp にする。public/assets に置く。
# 使い方: sh tools/fetch-assets.sh
set -e
cd "$(dirname "$0")/../public/assets"
mkdir -p tex hdri
get() { # name res
  for m in diff nor_gl rough; do
    case $m in diff) K=Diffuse;; nor_gl) K=nor_gl;; rough) K=Rough;; esac
    url=$(curl -s "https://api.polyhaven.com/files/$1" | python3 -c "import sys,json;print(json.load(sys.stdin)['$K']['$2']['jpg']['url'])")
    curl -s -o "${TMPDIR:-/tmp}/btr_$1_$m.jpg" "$url"
    cwebp -quiet -q 82 "${TMPDIR:-/tmp}/btr_$1_$m.jpg" -o "tex/$1_$m.webp"
    rm -f "${TMPDIR:-/tmp}/btr_$1_$m.jpg"
  done
}
for t in asphalt_02 rocky_terrain_02 forest_leaves_02 rock_face dirt concrete_wall_004 japanese_cedar_bark rectangular_facade_tiles; do get $t 1k; done
url=$(curl -s https://api.polyhaven.com/files/kloofendal_48d_partly_cloudy_puresky | python3 -c "import sys,json;print(json.load(sys.stdin)['hdri']['2k']['hdr']['url'])")
curl -s -o hdri/sky_2k.hdr "$url"
ls -la tex hdri
