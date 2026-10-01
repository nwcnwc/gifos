# yoinks

**yoink any video. paste. yoink. done.**

Paste a link from YouTube, X, Instagram, TikTok and twenty more sites, pick a resolution or audio-only mp3, and your browser saves the file the way it saves any download.

## First: name an instance

The downloading is done by a **cobalt instance**, the open-source media downloader behind cobalt.tools. Nothing is baked in, because the public instances ask browsers to pass a bot check this app cannot. So, once:

1. Open **Settings** (the ⚙ hint at the bottom, or press `,`).
2. Paste the address of an instance, such as `https://cobalt.example.com`.
3. Add its **API key** if the owner gave you one, then press **Enter**.

The app checks the instance and lists what it serves. Running your own is one Docker container: search for "cobalt run an instance". The address and key stay on this device.

## Yoinking

- **Paste a link** into the box and press **Enter** or tap **yoink**. Pasting a link on an empty box yoinks straight away.
- **Pick a format.** YouTube offers a ladder from 2160p down to 144p plus audio-only mp3; other sites offer best available and audio-only. `↑` `↓` or `j` `k` move, number keys jump, **Enter** picks, **Esc** goes back. Rows are clickable.
- **Save.** The instance answers with a file link and the app opens it; your browser saves the file to its usual downloads folder. If the browser blocked the pop-up, a **save** button appears: tap it.
- Posts with several pictures or clips show a picker; each item saves on its own tap.

## Hints, keys, history

The bottom line lists the keys for the current screen. `↑` on an empty paste box walks back through your last fifty links. `Alt+T` (or tapping the theme hint) cycles **auto**, **light** and **dark**. Tapping the logo takes you home.

## When it does not work

The message under the logo says what the instance said: a private or age-restricted video, a site it does not serve, a link it does not understand, a rate limit. "Needs a browser challenge" means the instance is protected by Turnstile and needs an API key or a different instance. A very old instance may reject the request outright; anything running cobalt 10 or newer works.

## What is saved in this file

Your instance address, API key, theme and link history. All of it stays on this device; an Invite shares none of it.
