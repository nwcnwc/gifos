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
# Freeze the themes too, so a pinned build is a pixel-perfect time capsule — its
# chrome, icon packs, eggs, and wallpapers as they were at the cut. The frozen
# gifos-themes.js resolves theme files relative to its own /versions/<v>/js/
# location, so this copy is what a pinned build actually loads (the live root and
# subdomains still resolve to the top-level /themes/). Whole tree = every
# computer's override folder, so a pinned build works on any subdomain.
cp -r "$SITE/themes" "$DEST/"

# Freeze the snapshot's identity. The copied root files say GIFOS_VERSION='edge'
# (unreleased) — stamp the real release number into the snapshot's index.html and
# boot.html, and bake its build number into the snapshot's build.js so the frozen
# release reports the build it was cut from. The channel loader in these copies is
# inert under /versions/ (it returns early), so the snapshot just runs directly.
# Anchored build number — MUST match .github/workflows/pages.yml, or the release
# and the edge build it was cut from disagree. The old anchor (3d84267) was a
# dangling object that existed only in one local clone: here it resolved and
# stamped 825, while CI could not resolve it, swallowed the error via `|| echo 0`
# and stamped the bare anchor 280 — so the live edge build went BACKWARD and the
# Version panel offered an "upgrade" to a lower number. Anchor only ever to a
# commit that is PUSHED, and never let a failed count fall back to a number.
ANCHOR_SHA=b4ada94            # the "release: cut v0.8.4" commit
ANCHOR_BUILD=825              # the edge build 0.8.4 was cut from
if ! git -C "$ROOT" cat-file -e "${ANCHOR_SHA}^{commit}" 2>/dev/null; then
  echo "ANCHOR_SHA ${ANCHOR_SHA} is not in this repo — re-anchor archive-version.sh (and pages.yml) to a pushed commit." >&2
  exit 1
fi
BUILD=$(( ANCHOR_BUILD + $(git -C "$ROOT" rev-list --count ${ANCHOR_SHA}..HEAD -- site) ))
# PIN THE DOCUMENT BASE to this snapshot. A meeting rewrites its address bar to
# the pretty /meet/<room> link it hands out — a root path — and without a <base>
# that drags document.baseURI off /versions/<V>/, after which every relative load
# resolves against the EDGE build instead of this frozen one. That is what left a
# meeting guest looking at an app header over blank space. With the base pinned,
# the address bar can stay the short shareable link while the page keeps loading
# its OWN code. Inserted immediately after <head> so it precedes every relative
# reference; the channel loader beneath it uses absolute paths and is unaffected.
for f in "$DEST"/*.html; do
  [ -e "$f" ] || continue
  # Match a REAL injected base, not any mention of one. A loose '<base ' grep
  # matched prose inside meet.html's own comments and silently skipped the file
  # — producing a snapshot with no pin and no warning, the exact failure this
  # whole change exists to prevent.
  grep -q '<base href="/versions/' "$f" && continue
  perl -0pi -e "s|<head>|<head>\n<base href=\"/versions/$V/\">|i" "$f"
done
# Injection is load-bearing: a snapshot without it moves its base the moment a
# meeting rewrites the address bar. Fail the cut rather than ship one.
for f in "$DEST"/*.html; do
  [ -e "$f" ] || continue
  grep -q "<base href=\"/versions/$V/\">" "$f" || {
    echo "archive-version.sh: FAILED to stamp the document base into $(basename "$f") — refusing to cut." >&2
    exit 1
  }
done
sed -i -E "s/window\.GIFOS_VERSION = '[^']*';/window.GIFOS_VERSION = '$V';/" "$DEST/index.html" "$DEST/boot.html"
printf '/* frozen at release cut by archive-version.sh */\nwindow.GIFOS_BUILD = %s;\n' "$BUILD" > "$DEST/js/build.js"

# Rebuild version.json (node, so the version→build 'builds' map is preserved and
# extended). newest first, current = the new version. minData tracks the OLDEST
# build still shipped under /versions/ (they get pruned over time). There is no
# 'edge' release number: the site root is the UNRELEASED edge build, identified by
# a build number (baked at deploy). 'edgeBuild' here is a placeholder (0) —
# pages.yml overwrites it at deploy. 'builds[V]' records the edge build this
# release was cut from.
mapfile -t VERSIONS < <(ls -1 "$SITE/versions" | sort -rV)
LIST=$(printf '"%s",' "${VERSIONS[@]}"); LIST="[${LIST%,}]"
MINDATA="${VERSIONS[${#VERSIONS[@]}-1]:-$V}"
NOTE="Data migrations are additive-only and the App-GIF window.gifos API is a stable, add-only contract, so any archived build under /versions/ can safely read the current desktop. 'current' is the live release — an immutable snapshot under /versions/. The site root (/) is the unreleased edge build, ahead of the release; 'edgeBuild' is its latest build number (baked at deploy by pages.yml). Edge builds are not archived — you can only move to the newest. 'builds' maps each release to the edge build number it was cut from (releases before build numbering are absent)."
V="$V" BUILD="$BUILD" LIST="$LIST" MINDATA="$MINDATA" NOTE="$NOTE" SITE="$SITE" node -e '
  const fs = require("fs"), f = process.env.SITE + "/version.json";
  let old = {}; try { old = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) {}
  const builds = Object.assign({}, old.builds || {}); builds[process.env.V] = Number(process.env.BUILD) || 0;
  const out = {
    current: process.env.V,
    edgeBuild: 0,
    versions: JSON.parse(process.env.LIST),
    builds,
    minData: process.env.MINDATA,
    note: process.env.NOTE,
  };
  fs.writeFileSync(f, JSON.stringify(out, null, 2) + "\n");
'

echo "Archived site/versions/$V (frozen as GIFOS_VERSION=$V, build $BUILD) and set version.json current=$V."
echo "The site root stays the UNRELEASED edge build (GIFOS_VERSION='edge'); its build number auto-bumps at deploy."
echo "Next: commit + push. Pages will deploy and stamp the live edge build number."
