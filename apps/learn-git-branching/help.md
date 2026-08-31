# Learn Git Branching

A visual git trainer. You type real git commands; the commit graph next to the prompt moves. Match the small **Goal** graph to finish a lesson.

## How to play

Pick a lesson from the menu, or **Sandbox** to mess around with no goal. Type a command in the box at the bottom (or tap a chip to fill it) and press **Run** or Enter.

Common commands:

- `git commit` — snapshot on the current branch
- `git branch name` / `git checkout -b name` — create and switch
- `git merge other` / `git rebase other` — combine work
- `git cherry-pick C3` — copy one commit
- `undo` — take back the last command
- `reset` — start the lesson over
- `hint` — the lesson's hint
- `levels` — the full list

Relative refs work: `HEAD~1`, `main^2`, `bugFix^^`. Remotes use `o/main` for origin's branches. `git fakeTeamwork` pretends a teammate committed on origin.

On a **phone**, the graph is the big panel; the command box stays at the bottom. Drag the graph to pan. Shortcut chips sit above the prompt.

## Lessons

Six sequences: Introduction, Ramping Up, Moving and Staging, A Mixed Bag, Advanced, then Push & Pull and advanced remotes. A check mark means you have matched that goal before.

The lesson cards at the start of a level are the original teaching slides. Skip them if you already know the command; **Hint** is still there.

## Play a friend

**Play a friend**, then **Invite** in the bar above the app. You both work the same lesson on your own graphs. First to match the goal wins; you do not see each other's commands. **Next lesson** starts a new round.

## What is saved

Solved lessons, your best command counts, and the tree you were in the middle of. Close the app and open it again — you are still there. Sharing the file shares that progress. A live Invite shares only the current lesson and who has finished, not your private tree.
