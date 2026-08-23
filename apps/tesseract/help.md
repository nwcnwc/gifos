# Tesseract OCR

Hand it a photograph of a page, a screenshot, or a scan — it types the words back. English, on this device. Nothing is uploaded.

This is **not** a table tool. It returns words in reading order, not a spreadsheet. For tables in a PDF, use Scanned PDF Tables.

## Read a picture

1. Drop a JPEG, PNG, WebP, or GIF on the page, or tap the drop zone to pick a file.
2. On a phone, the picker offers the **camera**.
3. Choose a **Layout** if the default is wrong.
4. Tap **Read text**.
5. Edit the result if you need to. **Copy** puts it on the clipboard. **Save .txt** downloads a text file.

The first read downloads English (about 15 MB). After that it stays on this computer and later pages start faster. A progress bar runs while it works.

## Layout

- **Full page (auto)** — a normal document. Start here.
- **Single column** — one column of text.
- **Single block** — a uniform paragraph block.
- **Single line** — one line, such as a sign.
- **Sparse words (a photo)** — words scattered on a picture, not a page.
- **Raw line** — treat the image as one line with no extra guessing.

**Straighten** (on by default) rotates a crooked scan from the detected text lines. It does not flip a page photographed upside-down — turn that around yourself and read again.

## Limits

A reading is a reading, not a transcript. Faint, skewed, handwritten, or low-resolution pages come back imperfect. Check the words that matter.

It reads **English** only. Other languages are not in this build.

It does not recover a table grid, and it does not open a PDF. Drop a picture of the page instead.

If it finds nothing, try a sharper photo, more light, or a different layout.

## Invite and save

This is a solo tool. **Invite** in the bar above the app does not send the picture or the text.

Your last layout and straighten choice stay in this file. The last 20 readings on this device sit under **Recent** — tap one to restore the text. The original picture is not kept.

Unofficial port of [Tesseract.js](https://github.com/naptha/tesseract.js).
