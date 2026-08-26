# Vocal Remover

Hand it a song. It hands you back the singing and the rest, as separate files, on this device. Nothing is uploaded.

## Jobs

- **Vocals + Instrumental** — the usual split. Two files: the voice, and everything else.
- **Vocals + Instrumental, then Lead + Backing** — first the singing, then that singing split into lead and backing. Four files, about twice the wait.
- **Lead + Backing vocals** — for a track that is already just singing, with no instruments.

It works on anything this browser can play: mp3, wav, flac, m4a, ogg.

## First run

The first time you press **Separate** for a job, this app downloads the model that job needs (about 67 MB for the main split, about 53 MB more for karaoke). That happens once, then the model lives on this device. Open it while you have a connection the first time.

If the models are not here yet, a banner says so and the app will only pass the audio back unchanged. That is a test, not a split.

## Settings

- **Length** — whole track, or first 30 seconds / 1 minute / 3 minutes. Try 30 seconds before you commit to a long song.
- **Output** — 16-bit WAV (usual) or 32-bit WAV (bigger, never clips if a part comes out louder than the original).
- **Overlap**, extra noise reduction, cleaner vocals, and alternate math — leave the defaults unless a result sounds off.

## Time

This is real work. The song is heard in six-second pieces.

- On the processor alone, expect about **ten times** the length of the track — a four-minute song is most of an hour.
- On a phone it can be three to four times longer still.
- A device with a usable **graphics chip is much faster**. The engine line at the top tells you which this device is using, and the bar times itself from the first piece.

**Stop** finishes the current piece and quits. Results only last while this page is open — download what you want before you close it.

If the graphics chip failed on an earlier run, the app stays on the processor and offers **Try the graphics chip again**.

## What is saved

Your last job and settings stay on this device. The audio and the stems do not. There is no Invite — this is a private tool.

Unofficial port of [Ultimate Vocal Remover](https://github.com/Anjok07/ultimatevocalremovergui) by Anjok07 and aufr33. Not the full desktop app: just these two splits.
