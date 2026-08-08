#!/usr/bin/env python
"""Build the GifOS port's bundled voice + the curriculum parity fixture.

Runs INSIDE the sound-it-out desktop repo's venv, because it uses the real
pipeline - Kokoro, the schwa shaping, the rubberband stretch - so the built-in
voice in the browser is bit-for-bit the desktop app's fallback voice:

    cd ~/projects/sound-it-out && .venv/bin/python \
        ~/projects/gifos/apps/sound-it-out/tools/gen-clips.py

Inputs:  tools/requests.json   (from tools/enumerate-requests.mjs - the same
                                curriculum.js that ships enumerates what it
                                can ask for)
Outputs: ../clips-data.js          GENERATED but COMMITTED (store-catalog
                                   doctrine: Pages has no build step)
         tools/curriculum-fixture.json  what gen/levels.py produces for the
                                   fixed levels, for test/unit/sound-it-out.js
                                   to hold the JS port against

Everything is synthesised with prefer_recordings=False: the family's own
recordings must never leave their device, so the bundle is the built-in voice
only, always.
"""
from __future__ import annotations

import base64
import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
APP = HERE.parent

# must run from the sound-it-out repo root (its venv, its gen package)
sys.path.insert(0, str(Path.cwd()))
try:
    import numpy as np
    import soundfile as sf
    from gen import levels, wordlists
    from gen.paths import RESOURCES
    from gen.soundout import SR
    from gen.voice import VoiceSource, sentence_key
except ImportError as e:  # pragma: no cover
    raise SystemExit(
        f"Run this from the sound-it-out repo root with its venv:\n"
        f"  cd ~/projects/sound-it-out && .venv/bin/python {__file__}\n({e})"
    )


def mp3_bytes(a: np.ndarray, q: int = 7) -> bytes:
    """float32 @ SR -> mono mp3 bytes via ffmpeg/libmp3lame."""
    with tempfile.TemporaryDirectory() as td:
        wav = Path(td) / "in.wav"
        mp3 = Path(td) / "out.mp3"
        sf.write(wav, a.astype("float32"), SR)
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav),
             "-ac", "1", "-ar", str(SR), "-codec:a", "libmp3lame", "-q:a", str(q),
             str(mp3)],
            check=True,
        )
        return mp3.read_bytes()


def build_clips() -> tuple[dict, float]:
    requests = json.loads((HERE / "requests.json").read_text())
    vs = VoiceSource(prefer_recordings=False)
    tables = {"phonemes": {}, "words": {}, "wordsSlow": {}, "blends": {}, "sentences": {}}
    total_s = 0.0
    for i, r in enumerate(requests, 1):
        kind = r["kind"]
        if kind == "phoneme":
            a = vs.phoneme(r["key"])
            table, key = "phonemes", r["key"]
        elif kind == "word":
            a = vs.word(r["text"], slow=r.get("slow", False))
            table, key = ("wordsSlow" if r.get("slow") else "words"), r["key"]
        elif kind == "blend":
            a = vs.blend(r["ipas"])
            table, key = "blends", r["key"]
        elif kind == "sentence":
            a = vs.sentence(r["text"])
            table, key = "sentences", r["key"]
        else:
            raise ValueError(f"unknown kind {kind}")
        total_s += len(a) / SR
        tables[table][key] = base64.b64encode(mp3_bytes(a)).decode()
        if i % 25 == 0 or i == len(requests):
            print(f"  {i}/{len(requests)} clips, {total_s:.0f}s of audio")
    return tables, total_s


# ---------------------------------------------------------- parity fixture

class Tagged(np.ndarray):
    req: tuple


def tag(req) -> Tagged:
    a = np.zeros(int(SR * 0.5), dtype="float32").view(Tagged)
    a.req = req
    return a


class StubVoice:
    """Returns silence tagged with the request, so the fixture records WHICH
    clip each segment asked for without synthesising anything."""

    def word(self, text, slow=False):
        return tag(("word", text.lower(), bool(slow)))

    def phoneme(self, ipa):
        return tag(("phoneme", ipa))

    def blend(self, ipas):
        return tag(("blend", "".join(ipas)))

    def sentence(self, text, tempo=0.68):
        return tag(("sentence", sentence_key(text)))


def build_fixture() -> dict:
    # The DEFAULT word list, never the family's own copy: the fixture is
    # committed to a public repo, and sight-words.txt may hold real names.
    default = RESOURCES / "wordlists" / "sight-words.default.txt"
    orig_load = wordlists.load
    wordlists.load = lambda path=None: orig_load(default)
    try:
        fixture = {}
        opts = {"reps": 3, "pauseSeconds": 1.2, "nonsense": True}
        runs = [(lv, dict(opts)) for lv in range(1, 10)]
        runs += [(12, dict(opts, stage=s)) for s in (1, 2, 3)]
        for level, o in runs:
            segs = levels.build(level, StubVoice(), o)
            fixture[f"{level}" + (f"/stage{o['stage']}" if level == 12 else "")] = [
                {
                    "parts": [[t, bool(h)] for t, h in s.parts],
                    "pad": round(s.pad, 4),
                    "scale": s.scale,
                    "color": s.color,
                    "itemEnd": bool(s.item_end),
                    "clip": list(s.audio.req),
                }
                for s in segs
            ]
        return fixture
    finally:
        wordlists.load = orig_load


def main():
    print("fixture: running gen/levels.py against the default word list…")
    fixture = build_fixture()
    n = sum(len(v) for v in fixture.values())
    (HERE / "curriculum-fixture.json").write_text(json.dumps(fixture))
    print(f"  wrote tools/curriculum-fixture.json ({n} segments across {len(fixture)} runs)")

    print("clips: synthesising with the desktop pipeline (built-in voice only)…")
    tables, total_s = build_clips()
    payload = json.dumps({"format": "mp3",
                          "voice": "Kokoro af_heart via the Sound It Out desktop pipeline",
                          "clips": tables}, ensure_ascii=False)
    out = (
        "// GENERATED by tools/gen-clips.py - the desktop app's built-in voice\n"
        "// (Kokoro af_heart, schwa-stripped and sustained by gen/soundout.py,\n"
        "// slowed variants pre-stretched with rubberband), one mp3 per clip the\n"
        "// curriculum can request. prefer_recordings=False always: no family\n"
        "// recording is ever bundled. Regenerate: see tools/ in this app's README.\n"
        f"window.SIO_CLIPS = {payload};\n"
    )
    (APP / "clips-data.js").write_text(out)
    kb = len(out) / 1024
    print(f"  wrote clips-data.js: {kb:.0f} KB for {total_s:.0f}s of audio")


if __name__ == "__main__":
    main()
