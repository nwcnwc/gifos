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
cp "$SITE/index.html" "$SITE/run.html" "$SITE/meet.html" "$SITE/boot.html" "$DEST/"
cp "$SITE/sign.html" "$SITE/about.html" "$DEST/" 2>/dev/null || true
cp -r "$SITE/js" "$SITE/css" "$DEST/"

# Freeze the snapshot's identity. The copied root files say GIFOS_VERSION='edge'
# (unreleased) — stamp the real release number into the snapshot's index.html and
# boot.html, and bake its build number into the snapshot's build.js so the frozen
# release reports the build it was cut from. The channel loader in these copies is
# inert under /versions/ (it returns early), so the snapshot just runs directly.
BUILD=$(git -C "$ROOT" rev-list --count HEAD -- site 2>/dev/null || echo 0)
sed -i -E "s/window\.GIFOS_VERSION = '[^']*';/window.GIFOS_VERSION = '$V';/" "$DEST/index.html" "$DEST/boot.html"
printf '/* frozen at release cut by archive-version.sh */\nwindow.GIFOS_BUILD = %s;\n' "$BUILD" > "$DEST/js/build.js"

# Rebuild version.json: newest first, current = the new version. minData tracks
# the OLDEST build still shipped under /versions/ (they get pruned over time).
# There is no 'edge' release number: the site root is the UNRELEASED edge build,
# identified by a build number (baked at deploy). Releases are the numbered
# immutable snapshots under /versions/; 'current' names the one that is live.
# 'edgeBuild' here is a placeholder (0) — pages.yml overwrites it at deploy.
mapfile -t VERSIONS < <(ls -1 "$SITE/versions" | sort -rV)
LIST=$(printf '"%s",' "${VERSIONS[@]}"); LIST="[${LIST%,}]"
MINDATA="${VERSIONS[${#VERSIONS[@]}-1]:-$V}"
cat > "$SITE/version.json" <<EOF
{
  "current": "$V",
  "edgeBuild": 0,
  "versions": $LIST,
  "minData": "$MINDATA",
  "note": "Data migrations are additive-only and the App-GIF window.gifos API is a stable, add-only contract, so any archived build under /versions/ can safely read the current desktop. 'current' is the live release — an immutable snapshot under /versions/. The site root (/) is the unreleased edge build, ahead of the release; 'edgeBuild' is its latest build number (baked at deploy by pages.yml). Edge builds are not archived — you can only move to the newest."
}
EOF

echo "Archived site/versions/$V (frozen as GIFOS_VERSION=$V, build $BUILD) and set version.json current=$V."
echo "The site root stays the UNRELEASED edge build (GIFOS_VERSION='edge'); its build number auto-bumps at deploy."
echo "Next: commit + push. Pages will deploy and stamp the live edge build number."
