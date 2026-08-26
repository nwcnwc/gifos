# Offline Cheap Text LLM Gemma 4

This app is a **text brain for your whole computer**. It answers short questions **on this device** — no account, no key, nothing sent away.

It is a **Provider**: other apps ask the computer for cheap text, and this is one of the apps that can answer. **Ask AI** (the Cheapest button), Chat's AI draft, and game hints all go through the same setting.

## First-run wait

The first time this device installs it, you wait for a **one-time download of about 1.75 GB** — the model's data, kept on this device. After that, answers never need the network.

While that download is still going (or if it failed), this app falls back to a tiny **self-test** model. It proves the plumbing works, but it speaks **nonsense on purpose**. If you see a self-test label, the real Gemma 4 data is not ready yet. Wait for the download, then open the app again.

Loading the real model into memory takes another minute or so the first time you ask in a session. The line under **This app serves your OS** tells you which model is actually loaded.

## It is slow on purpose

This is an experimental demo, not an everyday assistant. It writes at about the pace of slow typing. On a phone, an ordinary question can take **minutes** (one measured wait was six minutes). This one is the **slowest of the three** cheap-text apps. A desktop is better, and still far slower than any hosted model. The first answer of a session is slower again because it loads the model first.

Gemma 4 can "think out loud" before answering. **This app turns that off**, so you get the answer instead of watching it reason for extra minutes (and so a short question cannot spend its whole budget thinking and return nothing).

If you want a fast assistant, leave this uninstalled and point **Settings → AI models → Cheapest text LLM** at a hosted service instead.

## Make it serve other apps

Installing it is not enough.

1. Keep its icon in the **Providers** folder. A store install puts it there. Anywhere else it wears a red ✕ and does nothing for other apps.
2. Open **Settings → AI models** and set **Cheapest text LLM** to **Gemma 4 LLM**.
3. Open **Ask AI**, leave it on **Cheapest**, and ask.

You can install more than one cheap-text provider. Only the one you pick in Settings answers.

## Try it here

Type in the box and press **Ask**. That is a test bench, not a chat history. For a real conversation, use **Ask AI**.

## What Invite shares

**Nothing useful.** There is no saved conversation and no live session to hand a friend. Invite does not send the 1.75 GB model. Copy the app file if you want someone else to install their own copy — they still download the model on their device.

## The model

Google's **Gemma 4 E2B**, Apache-2.0 — a real open-source licence with no use restrictions, unlike Gemma 3. That is why this one exists: pick it **for the licence**. You pay for that with the biggest download and the slowest answers of the three.

Siblings that do the same job:

- [Gemma 3](https://gifos.app/store/offline-llm-gemma) — smaller download, fastest of the three, Gemma Terms of Use
- [BitNet](https://gifos.app/store/offline-llm-bitnet) — MIT model, middle size and speed
