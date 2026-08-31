The tab lives in the GIF, plays offline, and one invite is follow-the-playhead — that is why you would use this instead of Songsterr or alphatab.net.

## Bars

- **ONE:** Songsterr / Guitar Pro / alphatab.net — a real score, a walking cursor, sound.
- **TWO:** the tab is saved inside the GIF; nothing is uploaded; Invite shares the playhead.

## Rounds

1. **Engine in the sandbox.** alphaTab 1.8.4 UMD, blob workers via `Environment.initializeMain`, Bravura as a `data:` font, SONiVOX via `loadSoundFont`. ScriptProcessor output, no AudioWorklet, no CDN.
2. **A song on first run.** Public-domain Greensleeves in alphaTex so the empty Open is not the first impression.
3. **Phone.** Big play/pause, the viewport scrolls, horizontal layout on a narrow screen.
4. **Follow-along.** Host's song is `read-only` for guests. Playhead (tick + playing) is `lead`-able. Last song is private.
5. **Face.** Icon walks a playhead across six strings. Cover is Greensleeves mid-bar with the cursor on the G.

## Remaining gap

Guitar Pro 8 files and huge multi-track scores may hitch on a phone (workers help; there is no lazy-decode of a 50-page part). No backing-track audio sync. Files over 8 MB open but are not kept in the app.
