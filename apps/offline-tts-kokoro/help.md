# Offline Neural TTS (Kokoro, GPU)

This app is a **natural-sounding voice for your whole computer**. It turns text into speech **on this device** — no account, no key, nothing sent away.

It is a **Provider**: instead of doing a job only on its own screen, it gives every app the **Text → speech** ability. **Reader** in the Tools folder is the first consumer. Games and anything else that asks the computer to speak use the same setting.

## First-run wait

The first time this device installs it, you wait for a **one-time download of about 163 MB** — the voice's data, kept on this device. After that it never needs the network.

If you press **Speak** before that download finishes, you get an error asking you to open the app (or reinstall it) so the 163 MB voice can land. There is no pretend voice for ordinary speech. Wait, then try again.

## It thinks, then it speaks

This is a natural-sounding model, not the instant robotic kind. It **generates a passage of audio before that passage can start playing**, so there is a pause at the start of each one — shorter on a graphics chip, longer on the processor, and longer the more text you hand it at once. That pause is work, not a hang.

On a device with a real graphics chip it runs faster there; where there isn't one, it runs on the processor. Same eight voices either way. After it speaks, the status line tells you which it used.

If you want an **instant robotic** voice with no download and no pause, use [Offline Text to Speech](https://gifos.app/store/offline-tts) instead.

## Make it serve other apps

Installing it is not enough.

1. Keep its icon in the **Providers** folder. A store install puts it there. Anywhere else it wears a red ✕ and does nothing for other apps.
2. Open **Settings → AI models** and set **Text → speech** to **Kokoro TTS** (listed as Offline Neural TTS (Kokoro, GPU)).
3. Open **Reader**, paste text, press **Read aloud**.

You can install more than one speech provider. Only the one you pick in Settings answers.

## Voices

Eight English voices: **Heart**, **Bella**, **Nicole**, **Sarah** (American female), **Michael**, **Fenrir** (American male), **Emma** (British female), **George** (British male). Heart is the default.

It also answers to the familiar cloud names (`nova`, `shimmer`, `fable`, `echo`, `onyx`, `alloy`), so anything written for a hosted voice works here without changes.

## Try the voice

Type in the box, pick a voice, press **Speak**. Long text is split into passages; you hear each one as it is ready.

## A link that asks this computer to speak

Someone can send you a link that asks this computer to say a sentence out loud. You see the words first and confirm. If your browser refuses to make a sound unasked, tap **Tap to hear it**. The first time, the 163 MB voice still has to be on this device.

## What Invite shares

**Nothing useful.** There is no saved recording and no live session to hand a friend. Invite does not send the 163 MB voice. Copy the app file if you want someone else to install their own copy — they still download the voice on their device.

## What is saved

Nothing. The Try box is not a library. Reader keeps *its* text in Reader, not here.
