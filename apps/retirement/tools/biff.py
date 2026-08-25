import olefile, struct, sys, json

def sheets(path):
    ole = olefile.OleFileIO(path)
    name = 'Workbook' if ole.exists('Workbook') else 'Book'
    data = ole.openstream(name).read()
    return data

def records(data):
    p = 0; n = len(data)
    while p + 4 <= n:
        op, ln = struct.unpack_from('<HH', data, p)
        p += 4
        yield op, data[p:p+ln]
        p += ln

def rkval(v):
    mult = v & 1
    if v & 2:
        num = float(v >> 2 if (v>>2) < 2**29 else (v>>2) - 2**30)
    else:
        num = struct.unpack('<d', struct.pack('<Q', (v & 0xFFFFFFFC) << 32))[0]
    return num / 100.0 if mult else num

def parse(path):
    data = sheets(path)
    # SST strings
    sst = []
    bounds = []          # BOUNDSHEET: (offset, name)
    recs = list(records(data))
    # gather SST (with CONTINUE)
    i = 0
    while i < len(recs):
        op, buf = recs[i]
        if op == 0x0085:  # BOUNDSHEET
            off, = struct.unpack_from('<I', buf, 0)
            ln = buf[6]
            flags = buf[7]
            if flags & 0x01:
                nm = buf[8:8+ln*2].decode('utf-16-le', 'replace')
            else:
                nm = buf[8:8+ln].decode('latin-1', 'replace')
            bounds.append((off, nm))
        if op == 0x00FC:  # SST
            blob = bytearray(buf)
            j = i+1
            cont = []
            while j < len(recs) and recs[j][0] == 0x003C:
                cont.append(recs[j][1]); j += 1
            # decode strings across continuations properly
            total, cnt = struct.unpack_from('<II', blob, 0)
            pos = 8
            chunks = [bytes(blob)] + cont
            ci = 0
            cur = chunks[0]
            def need(k):
                nonlocal pos, ci, cur
                while pos >= len(cur):
                    pos -= len(cur); ci += 1; cur = chunks[ci]
            for _ in range(cnt):
                need(1)
                if pos + 3 > len(cur):
                    # header split — rare; bail to next chunk
                    ci += 1; cur = chunks[ci]; pos = 0
                clen, = struct.unpack_from('<H', cur, pos); pos += 2
                flags = cur[pos]; pos += 1
                rich = 0; far = 0
                if flags & 0x08:
                    rich, = struct.unpack_from('<H', cur, pos); pos += 2
                if flags & 0x04:
                    far, = struct.unpack_from('<I', cur, pos); pos += 4
                out = []
                remaining = clen
                wide = flags & 0x01
                while remaining:
                    avail = len(cur) - pos
                    take = min(remaining, avail // (2 if wide else 1))
                    if take:
                        raw = cur[pos:pos + take*(2 if wide else 1)]
                        out.append(raw.decode('utf-16-le' if wide else 'latin-1', 'replace'))
                        pos += take*(2 if wide else 1); remaining -= take
                    if remaining:
                        ci += 1; cur = chunks[ci]
                        wide = cur[0] & 0x01; pos = 1
                pos += rich*4 + far
                sst.append(''.join(out))
            i = j; continue
        i += 1
    return recs, sst, bounds

def cells(path, sheet_index=0):
    recs, sst, bounds = parse(path)
    data = sheets(path)
    # find the BOF offsets of each sheet in the global record stream by scanning
    # rows: we just collect all cell records that come after the Nth substream BOF
    out = {}
    boflist = []
    p = 0; n = len(data); idx = 0
    offs = [b[0] for b in bounds]
    names = [b[1] for b in bounds]
    if sheet_index >= len(offs): return {}, names
    start = offs[sheet_index]
    end = offs[sheet_index+1] if sheet_index+1 < len(offs) else n
    p = start
    while p + 4 <= end:
        op, ln = struct.unpack_from('<HH', data, p); p += 4
        buf = data[p:p+ln]; p += ln
        if op == 0x0203 and len(buf) >= 14:  # NUMBER
            r, c = struct.unpack_from('<HH', buf, 0)
            v, = struct.unpack_from('<d', buf, 6)
            out[(r,c)] = v
        elif op == 0x027E and len(buf) >= 10:  # RK
            r, c = struct.unpack_from('<HH', buf, 0)
            v, = struct.unpack_from('<I', buf, 6)
            out[(r,c)] = rkval(v)
        elif op == 0x00BD:  # MULRK
            r, cf = struct.unpack_from('<HH', buf, 0)
            k = 4
            col = cf
            while k + 6 <= len(buf) - 2:
                v, = struct.unpack_from('<I', buf, k+2)
                out[(r,col)] = rkval(v)
                col += 1; k += 6
        elif op == 0x00FD and len(buf) >= 10:  # LABELSST
            r, c = struct.unpack_from('<HH', buf, 0)
            si, = struct.unpack_from('<I', buf, 6)
            out[(r,c)] = sst[si] if si < len(sst) else ''
        elif op == 0x0006 and len(buf) >= 16:  # FORMULA (cached value)
            r, c = struct.unpack_from('<HH', buf, 0)
            raw = buf[6:14]
            if raw[6:8] == b'\xff\xff':
                if raw[0] == 3: out[(r,c)] = ''    # empty string
                elif raw[0] == 1: out[(r,c)] = bool(raw[2])
                else: out[(r,c)] = None
            else:
                out[(r,c)], = struct.unpack('<d', raw)
    return out, names

if __name__ == '__main__':
    path = sys.argv[1]
    si = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    c, names = cells(path, si)
    print('SHEETS:', names, file=sys.stderr)
    rows = {}
    for (r,cc), v in c.items(): rows.setdefault(r, {})[cc] = v
    lo = int(sys.argv[3]) if len(sys.argv)>3 else 0
    hi = int(sys.argv[4]) if len(sys.argv)>4 else 15
    for r in sorted(rows)[lo:hi]:
        print(r, {k: rows[r][k] for k in sorted(rows[r])})
