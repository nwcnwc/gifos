# BreakLock — fresh-eyes critic

Bar ONE is the original at https://maxwellito.github.io/breaklock/. Bar TWO is the GifOS file and the invite. Played both, desktop and a 390×844 phone, then one invite (Hana set, Cleo cracked). Labels stripped while judging.

## Winner

**OURS.**

Solo, the lock is the original: same 3×3, same red miss, same greydient thumbnail, same pegs, same snark. The original still wins the *menu* — Roboto Mono, a live airport title, Easy/Medium/Hard on one row, and on a phone the instructions collapse so START_ is on the first screen. Ours dumps the whole lecture, wraps Hard onto a second row, and hides START_ below the fold under the GifOS chrome. That is a real loss on the device this game was made for.

It is not enough to pick COMP. The original's localStorage was empty after a game. Ours put `1–0 · streak 1 · best 1 · best lock 4:2` on the menu, and closing the app and opening it again still had the same line *and* the lock I was mid-crack (counter 001, the miss still in the history). One Invite made Cleo crack a pattern Hana drew; the setter watched the miss land live. The original cannot do either.

## Stranger-reason

You know the original. Use this one because the GIF *is* the save — streak, bests, the lock you were on — and because one link is a lock *you* drew, which their tab will never be.

## Single biggest remaining gap

**YOUR TURN_ does not hand the cracker the next secret.**

The first round works. Setter sees "Draw the secret. They will not see it." Cracker waits on a dim lock, then "Crack the lock they set." A miss shows up in both histories (001). A hit is Success on both sides, with "Cleo cracked it in 2 attempts." on the setter and YOUR TURN_ under the actions.

Press YOUR TURN_. The setter goes to "Waiting — they are setting the lock." The cracker stays on Success (NEW_GAME / SOLUTION / BACK_HOME). They have no YOUR TURN_, no draw-the-secret, no idea anyone is waiting. The loop the tagline sells dies after one lock.

While they wait to set, the cracker's vs-note also lies: "Same lock. First to find it wins." on a lock they cannot touch.

## Pieces

**Icon.** A 64px sticker of a 3×3 being drawn, then pegs. It reads as a pattern lock at a glance next to Camera and Meeting, and the loop earns its keep (the path grows). On the light Home Screen the white dots are thin; the pegs sit under the grid and look like extra dots. Not a wiggle. Not the strongest face in the catalog.

**Cover.** Hero size (listing, ~680px) is a mid-swipe reverse-C with four tries and pegs — that is the right moment. Card size (240px, 16:10) is mud: BREAKLOCK becomes "RRFAkLOCK", the history is a stack of specks, most of the frame is empty black. It is a reconstruction in a pixel font the running app does not use, and it does not show two people or a streak. Next to 2048 ("RACE A FRIEND FROM ONE LINK") and Word Master (YOU 2 / SAM 1) it loses the store before anyone plays.

**Listing.** Tagline is the reason, in one line: "You draw the secret. They have to crack it. Your streak lives in the file." Description then teaches the pegs and the three modes, and it is true of the build I played — except the first sentence, "Send the Invite in the bar above," which is false *on the listing page*. The bar above is the store chrome. Invite exists only after Install. 2048 says "Invite in the bar above the app." Say that.

The grid does not contain this app at all (see walls). A stranger browsing All apps never sees the card.

**Pattern-lock feel.** After a miss, ours and the original are the same picture: red polyline, 001, a greydient miniature with pegs. Drawing hit every time on mouse and on a phone-sized lock (`touch-action: none`, ~294px). Practice 000, Challenge 010, Countdown 060 with the bar — all present. What is worse: the phone menu (START_ off-screen), Hard wrapping, and the original's two teaching diagrams (pegs ●○○, and a lock glyph on a pattern) replaced by a single looping trail that never shows a peg.

**Stats in the file.** Work. Original: no keys in localStorage. Ours: win recorded, streak, best-on-4, and a practice lock in progress all survived a full close and reopen. Abort is a throw-away (as in the original). Countdown is not kept, which the listing does not claim.

**Invite setter/cracker.** The reason to switch, and it is 80% there. Guest boots to "Hana is here. You draw a secret pattern; they have to crack it." / SET A LOCK_. Practice/Challenge vanish, which is right. Setter's secret is not painted. Watcher gets the miss. Cracker gets Success. Then YOUR TURN_ fails, as above. Both can mash SET A LOCK_ from the menu at once; there is no "you already have a setter" gate.

## Wall breaks

1. **Catalog.** `site/apps/index.json` has 156 apps and no `breaklock`. The store grid I opened did not show it. `site/apps/breaklock/app.json`, `cover.jpg`, and the signed GIF are on disk, and `/store.html#app=breaklock` renders the listing — so a deep link works and Browse does not. The catalog has not been regenerated. A stranger who does not already know the slug cannot find the app.

2. **Listing overclaim** (not a sandbox wall, a failed listing round): "Send the Invite in the bar above" is not true of the page it is printed on.

Sandbox walls that held: the running app fetched nothing off-origin; the original fetched `robotomono-light-webfont.woff2`. Manifest has no network. Stats wrote through gifos.db (`prefs`) and reloaded. GIF is signed by gifos.app, `minBuild` 947. Cover has no GifOS toolbar in it, so the missing `coverCrop` is honest.
