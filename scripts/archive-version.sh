#!/usr/bin/env bash
# Cut a GifOS release: snapshot the current site/ into site/versions/<version>/
# so users can pin to it later, and update version.json.
#
# Usage:  scripts/archive-version.sh 0.6.0
# Then bump window.GIFOS_VERSION in site/index.html (and its archived copies
# never change), commit, and push. The Pages workflow ships site/ as-is, so
# /versions/<version>/ is served automatically.
set -euo pipefail

V="${1:?usage: archive-version.sh <x.y.z>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE="$ROOT/site"
DEST="$SITE/versions/$V"

if [ -d "$DEST" ]; then echo "versions/$V already exists — refusing to overwrite"; exit 1; fi

mkdir -p "$DEST"
# Copy only the runtime site — never version.json, CNAME, .nojekyll, or versions/.
cp "$SITE/index.html" "$SITE/run.html" "$DEST/"
cp -r "$SITE/js" "$SITE/css" "$DEST/"

# Rebuild version.json: newest first, current = the new version.
mapfile -t VERSIONS < <(ls -1 "$SITE/versions" | sort -rV)
LIST=$(printf '"%s",' "${VERSIONS[@]}"); LIST="[${LIST%,}]"
cat > "$SITE/version.json" <<EOF
{
  "current": "$V",
  "versions": $LIST,
  "minData": "0.5.0",
  "note": "Data migrations are additive-only and the App-GIF window.gifos API is a stable, add-only contract, so any archived build under /versions/ can safely read the current desktop."
}
EOF

echo "Archived site/versions/$V and updated version.json."
echo "Next: set window.GIFOS_VERSION = '$V' in site/index.html, then commit + push."
