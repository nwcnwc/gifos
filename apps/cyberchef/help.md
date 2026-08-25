# CyberChef

The Cyber Swiss Army Knife. Drag operations into a **recipe**, put data in **Input**, and **Bake**. Encoding, hashing, encryption, compression — chained in whatever order you like. Every conversion runs on this device.

This copy is unofficial. GCHQ did not endorse it.

## The four panes

- **Operations** (left) — the catalogue. Search by name. Double-click or drag into the recipe.
- **Recipe** — the steps, in order. Drag to reorder. Double-click a step to remove it. Each step has its own arguments (the “ingredients”).
- **Input** — type, paste, or drop a file. New tabs hold extra inputs.
- **Output** — the result. Copy it, save it to a file, or **Replace input with output** to keep baking.

**Bake!** runs the recipe. **Auto Bake** (on by default) runs it whenever the input or the recipe changes. **Step** runs one operation at a time so you can see each stage.

A wand (**Magic**) appears when the output looks encoded; click it to add a suggested next step.

Hover a control and press `F1` for the original in-app help on that control.

## Common jobs

**Decode something opaque.** Paste it. Search **From Base64**, **From Hex**, **URL Decode**, **From Binary**, or try **Magic** and Bake.

**Convert a format.** **To Hex** / **From Hex**, **To Base64**, character encodings, **To Upper case**, date and time, data units. Chain them: hexdump → gunzip is a typical two-step.

**Hash.** Search **MD5**, **SHA1**, **SHA2**, **SHA3**. Drop the text in, Bake, copy the digest. For a file, drop the file on Input first.

**Encrypt / decrypt.** AES, DES, Blowfish, RC4, XOR — under **Ciphers** / **Crypto**. You supply the key in the step. Nothing leaves this device.

**Compress.** Gzip, zlib, Bzip2. **From Hexdump** then **Gunzip** is a frequent pair.

**Pick data apart.** Regex, JSON, JWT, protobuf, X.509 certificates, timestamps, User-Agent strings.

Save a recipe with the disk icon (a name on this device, or a Chef / JSON blob you can paste later). Load it from the folder icon.

## What stays private

Favourites, Options (theme, wrap, Magic, …), and named recipes stay **on this device**, inside the app.

**Invite** in the bar above the app shares the app, not your input or your recipe. Do not paste secrets into a recipe you then send to someone else.

Deep links from the public CyberChef site do not load here — paste the recipe into **Load recipe** instead.

## What this copy cannot do

A few operations need the network or an extra language pack, and this copy has no path out:

- **HTTP request** and **DNS over HTTPS**
- **Show on map**
- **OCR** (reading text in a picture)

They fail and say so. Image rendering, hashes, ciphers, and the rest still run here.

**Download CyberChef** in the banner is the original site’s zip link; it will not fetch from here.

## Credit

Unofficial port of [CyberChef](https://github.com/gchq/CyberChef) by GCHQ. Crown Copyright. Apache-2.0.
