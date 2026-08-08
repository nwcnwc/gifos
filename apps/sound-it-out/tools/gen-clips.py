#!/usr/bin/env python
"""Build the GifOS port's bundled starter voice + the parity fixture.

Runs INSIDE the sound-it-out desktop repo's venv (it imports gen/ for the
fixture and reads the starter voice from the repo's assets):

    cd ~/projects/sound-it-out && .venv/bin/python \
        ~/projects/gifos/apps/sound-it-out/tools/gen-clips.py

Outputs: ../clips-data.js               GENERATED but COMMITTED.
         tools/curriculum-fixture.json  gen/levels.py's library builder over a
                                        canonical library, for
                                        test/unit/sound-it-out.js.

THE BUNDLE IS THE STARTER VOICE AND NOTHING ELSE - the app author's own
recordings, shipped so a buildup is never two voices. No synthesis: a Kokoro
word arriving after human phonemes is jarring enough to make the buildup not
worth doing (the author's words). Whatever exists under assets/starter-voice/
{phonemes,words,sentences} is transcoded and packed; today that is the 42
phoneme clips, and when the author records the pack words and sentences
upstream, rerunning this picks them up with no code change. The FAMILY's
recordings are never touched - they live only in their own device's app.
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

sys.path.insert(0, str(Path.cwd()))
try:
    import numpy as np
    import soundfile as sf
    from gen import levels, sentences as slib
    from gen.paths import STARTER_VOICE
    from gen.soundout import SR, loud
    from gen.voice import sentence_key
except ImportError as e:  # pragma: no cover
    raise SystemExit(
        f"Run this from the sound-it-out repo root with its venv:\n"
        f"  cd ~/projects/sound-it-out && .venv/bin/python {__file__}\n({e})"
    )


def mp3_bytes(a: np.ndarray, q: int = 7) -> bytes:
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


def _unsafe(stem: str) -> str:
    """Undo gen/voice._safe's filename encoding (uXXXX per non-alnum char):
    the studio saves sentences as e.g. chaseu005fis…, and the lookup key is
    the decoded form. Only accepted when it round-trips, so a real word that
    happens to contain u+hex is never mangled."""
    import re

    decoded = re.sub(r"u([0-9a-f]{4})", lambda m: chr(int(m.group(1), 16)), stem)
    safe = "".join(f"u{ord(c):04x}" if not c.isalnum() else c for c in decoded)
    return decoded if safe == stem else stem


def pack_dir(sub: str) -> dict:
    """Transcode one starter-voice directory, keyed by decoded filename stem
    (phonemes by their IPA, words by the word, sentences by their
    sentence_key). Levelled with the pipeline's own loud()."""
    out = {}
    src = STARTER_VOICE / sub
    if not src.exists():
        return out
    for f in sorted(src.glob("*.wav")):
        a, sr = sf.read(str(f), dtype="float32")
        if sr != SR:
            raise SystemExit(f"{f}: rate {sr}, expected {SR}")
        out[_unsafe(f.stem)] = base64.b64encode(mp3_bytes(loud(a))).decode()
    return out


# ---------------------------------------------------------- parity fixture

# A canonical library covering every mechanic: letters, a sight name that IS
# decodable (Chase = ch + ase), CVC, magic-e, the voiced-s lexicon, an
# irregular word, a nonsense word, and sentences with punctuation and
# repeated words.
FIXTURE_LIBRARY = [
    "s",
    "a",
    "Chase",
    "sat",
    "case",
    "is",
    "the",
    "vam",
    "face",
    "cage",
    "happy",
    "Sam sat.",
    "Chase is on the case.",
    "A duck sat on the rock.",
]


class Tagged(np.ndarray):
    req: tuple


def tag(req) -> Tagged:
    a = np.zeros(int(SR * 0.5), dtype="float32").view(Tagged)
    a.req = req
    return a


class StubVoice:
    def word(self, text, slow=False):
        return tag(("word", text.lower(), bool(slow)))

    def phoneme(self, ipa):
        return tag(("phoneme", ipa))

    def blend(self, ipas):
        return tag(("blend", "".join(ipas)))

    def sentence(self, text, tempo=0.68):
        return tag(("sentence", sentence_key(text)))


def build_fixture() -> list:
    orig_load = slib.load
    slib.load = lambda: list(FIXTURE_LIBRARY)
    try:
        segs = levels.build(13, StubVoice(), {"reps": 3, "pauseSeconds": 1.2})
        rows = []
        for s in segs:
            req = getattr(s.audio, "req", None)
            rows.append({
                "parts": [[t, bool(h)] for t, h in s.parts],
                "pad": round(s.pad, 4),
                "scale": s.scale,
                "color": s.color,
                "itemEnd": bool(s.item_end),
                # read-along slices carry raw audio, not a request
                "clip": list(req) if req is not None else ["slice"],
            })
        return rows
    finally:
        slib.load = orig_load


def main():
    print("fixture: running gen/levels.py's library builder…")
    rows = build_fixture()
    (HERE / "curriculum-fixture.json").write_text(json.dumps(
        {"library": FIXTURE_LIBRARY, "opts": {"reps": 3, "pauseSeconds": 1.2},
         "segments": rows}))
    print(f"  wrote tools/curriculum-fixture.json ({len(rows)} segments)")

    print("starter voice: transcoding assets/starter-voice/…")
    tables = {
        "phonemes": pack_dir("phonemes"),
        "words": pack_dir("words"),
        "sentences": pack_dir("sentences"),
    }
    for k, v in tables.items():
        print(f"  {k}: {len(v)} clips")

    payload = json.dumps({
        "format": "mp3",
        "voice": "the starter voice - the app author's own recordings, and nothing synthetic",
        "clips": tables,
    }, ensure_ascii=False)
    out = (
        "// GENERATED by tools/gen-clips.py - the STARTER VOICE: the app\n"
        "// author's own recordings from the sound-it-out repo's\n"
        "// assets/starter-voice/, transcoded. Nothing synthetic is bundled -\n"
        "// a buildup must never be two voices - and no family recording is\n"
        "// ever touched. Regenerate: see the README.\n"
        f"window.SIO_CLIPS = {payload};\n"
    )
    (APP / "clips-data.js").write_text(out)
    print(f"  wrote clips-data.js: {len(out) / 1024:.0f} KB")


if __name__ == "__main__":
    main()
