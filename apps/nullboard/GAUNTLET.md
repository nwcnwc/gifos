# Nullboard gauntlet

**Win:** A stranger who knows Nullboard uses this copy because the board *is* the GIF — close it and the lists are still there — and one Invite is the board with a friend, no Trello account.

## Bars

- **ONE:** [nullboard.io/preview](https://nullboard.io/preview) / Trello. Compact lists, in-place notes, hidden ≡, Barlow. Trello is the product people actually have an account for.
- **TWO:** The file is the save; Invite is the room; phone columns with a + Note bar. Upstream is desktop-only and stores in the page.

## Rounds

1. **License.** BSD-2-Clause with Commons Clause — free redistribution, do not sell. Packed as `COPYING.txt`. Barlow OFL, jQuery MIT. Proceed.
2. **Vendor.** Pin `db65363` (2023-11-05). jQuery CDN fallback gone. Barlow inlined as data URLs. Agent backup UI hidden (the file is the save). Init wrapped so `gifos.db` hydrates first.
3. **Persistence.** `ls-stub.js` dumps `nullboard.*` keys into `save`. Demo board rewritten: file-is-the-save, phone ≡, Invite.
4. **Phone.** Tap ≡ opens menus hover would. Lists swipe. Bottom bar: + Note / + List / Undo / Boards. Pointer drag.
5. **Invite.** `room` is read-write; newest `at` is the board on every screen. Roster line when someone else is in.
6. **Icon / cover / listing.** Icon: a card slides Doing → Done. Cover: Ship 0.9.11 with Inbox / Doing / Done, real notes. Tagline leads with the file and the missing Trello account.

## Remaining gap

Last-write-wins on the whole board: two people typing in different notes at the same instant can clobber one edit. Fine for a shared kitchen list; not Trello's operational transform.
