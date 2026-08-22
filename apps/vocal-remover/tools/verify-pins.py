#!/usr/bin/env python3
"""
verify-pins.py — download what manifest.json pins and prove it is UVR's file.

The app never fetches anything itself; the OS does, at install, against the
sha256 in the manifest. So a wrong pin is not a security hole — the install
refuses — but it IS an app that can never work, and it fails in a stranger's
browser rather than here. This checks it here.

For each pinned asset it checks three things, in this order, because they fail
differently:

  1. the URL serves the exact BYTES we pinned (sha256 + length);
  2. the host sends Access-Control-Allow-Origin, without which the browser
     cannot read the download at all — GitHub's own release-asset URLs do NOT,
     which is why the pins point at a mirror;
  3. the file's UVR HASH (md5 of its last 10 MB, UVR.py get_model_hash) is the
     one that keys the n_fft / dim_f / compensate row models.js copies out of
     UVR's model_data.json. This is the check that catches a mirror serving a
     re-export, a different revision, or a quantisation: same job, same name,
     different numbers, and the app would run it at the wrong settings and just
     sound worse.

    python3 apps/vocal-remover/tools/verify-pins.py            # all pins
    python3 apps/vocal-remover/tools/verify-pins.py --head     # headers only

Needs network. Not part of the release gate for that reason — run it whenever a
pin moves.
"""
import argparse
import hashlib
import json
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, '..')
CHUNK = 1 << 20
TAIL = 10000 * 1024        # UVR.py: f.seek(-10000 * 1024, 2)


def get(url, method='GET'):
    req = urllib.request.Request(url, method=method, headers={
        'Origin': 'https://gifos.app',
        'User-Agent': 'gifos-vocal-remover-pin-check',
    })
    return urllib.request.urlopen(req, timeout=120)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--head', action='store_true', help='check reachability and CORS only')
    args = ap.parse_args()

    manifest = json.load(open(os.path.join(APP, 'manifest.json')))
    pins = json.load(open(os.path.join(APP, 'MODEL-PINS.json')))
    by_path = {p['id'] + '.onnx': p for p in pins['pins']}

    bad = 0
    for a in manifest.get('assets', []):
        pin = by_path.get(a['path'])
        print('== ' + a['path'] + '  <-  ' + a['url'])
        if not pin:
            print('   FAIL  MODEL-PINS.json has no record for this asset')
            bad += 1
            continue

        try:
            r = get(a['url'], 'HEAD' if args.head else 'GET')
        except Exception as e:                                    # noqa: BLE001
            print('   FAIL  unreachable: ' + str(e))
            bad += 1
            continue

        acao = r.headers.get('Access-Control-Allow-Origin')
        if acao in ('*', 'https://gifos.app'):
            print('   PASS  CORS: Access-Control-Allow-Origin: ' + acao)
        else:
            print('   FAIL  CORS: no usable Access-Control-Allow-Origin (got ' + repr(acao) + ')')
            print('         The browser cannot read this download. Pin a host that sends one.')
            bad += 1
        if args.head:
            continue

        h = hashlib.sha256()
        tail = bytearray()
        total = 0
        while True:
            b = r.read(CHUNK)
            if not b:
                break
            h.update(b)
            total += len(b)
            tail += b
            if len(tail) > TAIL:
                del tail[:len(tail) - TAIL]
        got = h.hexdigest()

        for what, got_v, want_v in (('bytes', total, a['bytes']), ('sha256', got, a['sha256'])):
            if got_v == want_v:
                print('   PASS  ' + what + ': ' + str(got_v))
            else:
                print('   FAIL  ' + what + ': served ' + str(got_v) + ', manifest pins ' + str(want_v))
                bad += 1

        uvr = hashlib.md5(bytes(tail[-TAIL:]) if total >= TAIL else bytes(tail)).hexdigest()
        if uvr == pin['uvrHash']:
            print('   PASS  UVR model hash: ' + uvr + ' — models.js is reading the right model_data row')
        else:
            print('   FAIL  UVR model hash: ' + uvr + ', expected ' + pin['uvrHash'])
            print('         This is a DIFFERENT file from the one whose n_fft/dim_f/compensate')
            print('         models.js copies. Look it up in UVR model_data.json before pinning it.')
            bad += 1

    print()
    print('every pin verified' if not bad else str(bad) + ' PROBLEM(S) — do not ship these pins')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
