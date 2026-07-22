/*
 * build.js — the edge build number of THIS build.
 *
 * The site root is the unreleased "edge" build. It has no release version, but it
 * DOES carry a monotonic build number so you can tell one edge build from another.
 * This file is baked at deploy time by .github/workflows/pages.yml
 * (BUILD = git rev-list --count HEAD -- site), so it bumps on every push that
 * touches the site tree. Committed value is 0 (a local/dev checkout is "build 0").
 *
 * It is part of the precached shell (cache-first), so a running computer reports
 * the build IT loaded. The LATEST available edge build is published separately in
 * version.json ("edgeBuild", network-first) — the Version panel compares the two
 * and lets you opt into the latest. Edge builds are not archived: you can only
 * move to the newest edge, never back to a specific past one.
 */
window.GIFOS_BUILD = 0;
