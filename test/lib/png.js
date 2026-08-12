// Decode a PNG to raw RGBA, with nothing but node's own zlib.
//
// This exists so a browser suite can make assertions about PIXELS. Some bugs are
// only visible in the framebuffer: anyroad's floating street names were being
// erased by the sky pass, and every data-level check passed while it happened —
// the app's own debug() cheerfully listed labels that were not on screen. Reading
// the screenshot back is the only way to catch that class of defect.
//
// Handles what Playwright's screenshots actually are: 8-bit colour type 2 (RGB)
// or 6 (RGBA), non-interlaced. Anything else throws rather than guessing, because
// a silently mis-decoded image would make a pixel assertion meaningless.
const zlib = require('zlib');

function decodePng(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let p = 8;
  let width = 0, height = 0, depth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;                        // len + type + data + crc
  }
  if (!width || !height) throw new Error('PNG has no IHDR');
  if (depth !== 8) throw new Error('PNG bit depth ' + depth + ' unsupported (want 8)');
  if (colorType !== 2 && colorType !== 6) throw new Error('PNG colour type ' + colorType + ' unsupported (want 2 or 6)');
  if (interlace !== 0) throw new Error('interlaced PNG unsupported');

  const channels = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);        // the row above, for the filters that need it

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const row = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride));
    // Un-filter in place. Predictors are per BYTE offset by the pixel size, which
    // is why bpp is in bytes here and not in channels.
    const bpp = channels;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp] : 0;   // left
      const b = prev[i];                        // up
      const c = i >= bpp ? prev[i - bpp] : 0;   // up-left
      let v = row[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      } else if (filter !== 0) throw new Error('unknown PNG row filter ' + filter);
      row[i] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const s = x * channels, d = (y * width + x) * 4;
      out[d] = row[s]; out[d + 1] = row[s + 1]; out[d + 2] = row[s + 2];
      out[d + 3] = channels === 4 ? row[s + 3] : 255;
    }
    prev = row;
  }
  return { width, height, rgba: out };
}

module.exports = { decodePng };
