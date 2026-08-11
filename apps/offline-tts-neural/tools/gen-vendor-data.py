#!/usr/bin/env python3
"""Regenerate the DERIVED vendor data: vocab.json and voices.f32/voices-index.json.

Both are GENERATED but COMMITTED, the same doctrine as the App Store catalog and
run.html's browser table — Pages serves static files and build.mjs must not need
the network.

Neither file may be hand-written:

  * vocab.json is the model's token table. It is built from the symbol lists in
    KittenTTS's own onnx_model.py, extracted with eval() rather than retyped,
    because the list CONTAINS DUPLICATES ("'" and '"' each appear twice) and
    python's `for i, s in enumerate(symbols): d[s] = i` means the LAST
    occurrence wins. 178 positions collapse to 175 keys. Retyping that by eye
    silently shifts token ids and the voice turns to mush.

  * voices.f32 is the 8 style tables (400 x 256 float32 each) unpacked from
    voices.npz into ONE flat little-endian blob, so the app needs no zip or npy
    reader at runtime. Row order follows voices-index.json.

Usage (needs network):
    python3 tools/gen-vendor-data.py

Sources, both Apache-2.0:
    https://huggingface.co/KittenML/kitten-tts-nano-0.8-int8/resolve/main/voices.npz
    https://github.com/KittenML/KittenTTS/releases/download/0.8/kittentts-0.8.0-py3-none-any.whl
"""
import ast
import io
import json
import os
import re
import struct
import sys
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
VENDOR = os.path.join(os.path.dirname(HERE), 'vendor')
WHEEL = 'https://github.com/KittenML/KittenTTS/releases/download/0.8/kittentts-0.8.0-py3-none-any.whl'
NPZ = 'https://huggingface.co/KittenML/kitten-tts-nano-0.8-int8/resolve/main/voices.npz'


def fetch(url):
    print('fetching', url)
    with urllib.request.urlopen(url) as r:
        return r.read()


def build_vocab():
    src = zipfile.ZipFile(io.BytesIO(fetch(WHEEL))).read('kittentts/onnx_model.py').decode('utf-8')
    m = re.search(r'_pad = (.+)\n\s*_punctuation = (.+)\n\s*_letters = (.+)\n\s*_letters_ipa = (.+)\n', src)
    if not m:
        sys.exit('onnx_model.py: symbol lists not found — the upstream shape changed.')
    pad, punc, letters, ipa = [ast.literal_eval(g) for g in m.groups()]
    symbols = [pad] + list(punc) + list(letters) + list(ipa)
    mapping = {}
    for i, s in enumerate(symbols):          # LAST occurrence wins — see the docstring
        mapping[s] = i
    out = {'symbols': symbols, 'map': mapping}
    with open(os.path.join(VENDOR, 'vocab.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False)
    print('vocab.json: %d positions, %d unique keys' % (len(symbols), len(mapping)))


def build_voices():
    z = zipfile.ZipFile(io.BytesIO(fetch(NPZ)))
    names, rows, cols = [], None, None
    blob = bytearray()
    for entry in z.namelist():                # namelist order IS the row order we record
        b = z.read(entry)
        if b[:6] != b'\x93NUMPY':
            sys.exit(entry + ': not a .npy')
        hlen = struct.unpack('<H', b[8:10])[0]
        hdr = ast.literal_eval(b[10:10 + hlen].decode('latin1').strip())
        if hdr['descr'] != '<f4' or hdr['fortran_order']:
            sys.exit(entry + ': expected little-endian float32, C order, got ' + repr(hdr))
        r, c = hdr['shape']
        if rows is None:
            rows, cols = r, c
        elif (r, c) != (rows, cols):
            sys.exit(entry + ': ragged voice tables %r vs %r' % ((r, c), (rows, cols)))
        names.append(entry[:-4] if entry.endswith('.npy') else entry)
        blob += b[10 + hlen:]
    with open(os.path.join(VENDOR, 'voices.f32'), 'wb') as f:
        f.write(blob)
    with open(os.path.join(VENDOR, 'voices-index.json'), 'w', encoding='utf-8') as f:
        json.dump({'voices': names, 'rows': rows, 'cols': cols}, f)
    print('voices.f32: %d voices, %dx%d, %d bytes' % (len(names), rows, cols, len(blob)))


if __name__ == '__main__':
    build_vocab()
    build_voices()
    print('done — commit the regenerated files')
