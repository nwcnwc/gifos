# Learn Git Branching — fresh-eyes critic

Bar ONE: [learngitbranching.js.org](https://learngitbranching.js.org/) (pcottle.github.io/learnGitBranching redirects there). Bar TWO: GifOS — offline, progress in the GIF, one Invite is a same-lesson race, no account. Driven in one Chromium: the live original (`?NODEMO`), the shipped GIF in `run.html#id=`, desktop 1100×820 and phone 390×844, store listing at `/store.html#app=learn-git-branching`, Home Screen at 64px, two contexts through the local relay.

**Winner: COMP**

**Single biggest remaining gap:** Invite does not put a friend on the same lesson. Host pressed Play a friend, then Invite; the OS minted a real room link; the guest landed in the app. Then nothing raced. Invite remounts the GIF and drops the host out of the race (`friend-bar` hidden after the room flip). The guest’s 1.8s auto-join window is already closed, so they sit on the intro slides with **Play a friend** still in the corner. Host waits on “Waiting for a friend…” with only `Ada (you) · 2 cmds ✓`. First-to-match never had a second player.

**Stranger-reason-to-use-this:** Close it, the checkmarks live in the file. That path actually ran (reopen kept `Introduction to Git Commits ✓` and C0–C3, `Solved in 2 commands (par 2)`). I would not switch from the original for that. The original already remembers the tab. The race is why a stranger would say this version out loud, and the race did not start.

**Wall breaks:**
- **Catalog.** `site/apps/learn-git-branching/{learn-git-branching.gif,cover.jpg,app.json}` exist and the deep link renders. `site/apps/index.json` (156 apps) has no `learn-git-branching`. Store search for `git` and `branching` is “Nothing matches that.” A stranger browsing Learning never sees it.
- **Listing overclaim.** Tagline/body sell Play a friend → Invite → same lesson, first to match. Not true of the build that shipped beside them. An overclaim is a failed round.
- **Not walls:** no CDN / web font / `fetch` in the packed JS (`git fetch` is the simulator). `COPYING.txt` (MIT, Peter Cottle) and `help.md` are inside the GIF. Saved data is `gifos.db` only; this build’s save loaded after close. `minBuild` 947. Signed as gifos.app.

---

## Icon

Home Screen, 64px, next to Welcome / Camera. A dark rounded sticker, two blue nodes and a stem — it reads “commit graph” at a glance. Eight frames grow a side branch and a merge; that earns the loop, it does not wiggle. At this size the yellow tag is a smudge. Fine. Not why this round loses. (This drive placed it at 48,48 on top of Welcome; that is the desktop, not the sticker.)

## Store art

Listing hero is `cover.jpg` from a drawn `screenshot.png`, 1200×720, cropped by the store to ~678×407. Mid-use *idea* is right: a merge, a tiny goal, a command row.

The picture is a different app. Unlabeled blue/green/orange blobs, empty grey chips, a command bar that is a rectangle. The running window is magenta C0–C3 with `main` / `bugFix` pills, a Goal graph, a real `$ git commit`. Chess Grandmaster’s cover is a photograph of the thing you get; 2048’s poster at least names the invite. At card size (~240×144) it is a mute graph that could be any dag tool. At hero it is a toy ROM of a UI this GIF does not paint. No `coverCrop` — there is no GifOS chrome in the drawing, so the crop is not the problem. The drawing is.

## Listing copy

Rendered on `/store.html#app=learn-git-branching`. Tagline: “The git trainer that lives in a GIF — close it, come back, still on the same commit.” Description leads with offline + the file is the save + Play a friend then Invite. Then solo LGB, 36 lessons, phone chips, unofficial-port honesty. Porter / basedOn / blessed:false / MIT / signed gifos.app all show. That is how a port’s store page should read.

Claims that were true in this run: type real git, 36 lessons in the sheet, hint/undo/reset, phone stack, close-and-reopen still on the solved tree, no account. Claims that were not: the invite race. The card cannot be found from the grid.

## Product

### Typing git

The box is a real prompt. `git commit`, `git checkout -b bugFix`, `git merge bugFix` printed `Fast-forward` and matched the intro goal (5 commands, par 2). Official two-commit solution also matched. Shortcuts fill the box. Undo took the last commit back. `git status` on The Staging Area printed `modified: app.js` / `styles.css`. The engine is not a toy: all 36 official `solutionCommand` lines match their goal trees headlessly.

The original’s terminal is still better: a Mac window, one command per line with a check, `commandTextField`, helper dropdown, `main*` + HEAD on the graph as you type. Ours is a one-line input + a log. Usable. Not the original.

### Commit graph

Original after the same five commands: cyan field, teal commits growing **down** from C0, black arrows, `main*` and HEAD and bugFix on C3, Raphael still on the page. Ours: dark field, magenta circles, newest **high**, no arrows, no HEAD pill (HEAD is attached to the branch name `main`, and labels only paint on commit ids, so HEAD never appears while it points at a branch). Remote lesson “Git Fetchin'”: `o/main` and `o/bugFix` sit **on** C3; the Origin pane did not show. Every `render` clears the SVG (`innerHTML = ''`) — the tree snaps, it does not slide.

The Staging Area is the tell. Local graph stays C0–C1. Goal already shows C3. `git add app.js` changes nothing in the picture; the files live in the log. The original exists so you *see* a working directory become a staging area become a commit. This copy is a command runner with a graph of commits only.

And `#solved-banner { display: flex }` beats the `hidden` attribute, so **Solved ✓ / Next lesson** is on screen for unsolved first boot, unsolved Staging Area, unsolved Git Fetchin', and the guest who just arrived. A stranger’s first frame is that they already finished.

### 36 lessons

The Lessons sheet lists 36 ids in seven sequences — the English corpus, with the original names (“Detach yo' HEAD”). Slides are the original teaching markdown (Git Commits 1/3 on first boot; Skip works). Hint on fetch was “just run git fetch!” Sandbox is in the `<select>`. That half is the port.

What the original still has on the same corpus: Main/Remote tabs, numbered 1–4 buttons, Solution, Objective, 20+ locales, Hg, level builder, shareable `?command=` URLs. And a graph that can teach the two working-directory lessons.

### Progress in the GIF

True. Close `run.html`, reopen the same file: `Introduction to Git Commits ✓`, C0–C3, `Solved in 2 commands (par 2)`. Original keeps that in the origin’s localStorage; it does not travel with the trainer.

### Invite race

OS Invite works (link `run.html#j=…&relay=ws://127.0.0.1:8790`, guest mounted, “shared with the meeting by Ada”, Talk: off). The in-app race does not. Guest never joined `players`; host never saw a second name. Listing order “Play a friend, then Invite” is what the host did, and remount still wiped it.

### Phone (390×844)

The stack is the right shape: graph, tiny Goal, chips, `$` box, Run. First boot is the lesson card filling the screen (Skip / Next are thumbable). A chip wrote `git checkout -b ` into the box. Playable. The same false Solved banner, and the Goal is a stamp. Original is a desktop cyan canvas; this is the one you could actually type on a phone — if the banner did not say you were done.

### Offline

Already-running GIF still accepted `git commit` with the network cut. A plane is true of a tab you already opened, not of a store search that cannot find the app.

## A/B

Put a stranger who knows Learn Git Branching in front of both.

Original: cyan tree, HEAD on the branch, commits slide, a terminal, 36 lessons, working-directory sidebar, it remembers the tab.

Ours: a magenta snap-tree with a lying Solved banner, two staging lessons you play from the log, a store card that is not the window, a grid that does not list it — and, if they stay, a GIF that really does keep the checkmarks, plus an Invite that opens the app for a friend and then leaves them alone.

They will use the original. The GIF-is-the-save is why they would come back *after* a guest who opens the link is on the same lesson without pressing anything, HEAD paints, Staging Area shows the files, Solved is hidden until it is true, the cover is a frame of that, and `git` in the App Store finds the card. Until then, COMP.
