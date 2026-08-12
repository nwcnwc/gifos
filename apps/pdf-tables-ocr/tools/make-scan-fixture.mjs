// Regenerate test/fixtures/rate-table-scanned.pdf — the IMAGE-ONLY twin of
// test/fixtures/rate-table.pdf that forces the OCR path in
// test/browser/e2e-pdf-tables-ocr.js.
//
// Why a synthesized scan and not a photograph of a real filing: the guard has to
// assert cell-for-cell ("Aetna", "16242", "1.05"), which needs known-correct
// expected text. A real scan is the QUALITY test, and it cannot be a gate.
//
// The output page carries a single DCTDecode image XObject and NOTHING else — no
// font, no text-showing operator — so pdf.js getTextContent() returns zero runs,
// which is exactly what a photocopied exhibit looks like to the app.
//
// Run:  node apps/pdf-tables-ocr/tools/make-scan-fixture.mjs
// Needs: pdftoppm (poppler-utils) on PATH.
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SRC = join(ROOT, 'test', 'fixtures', 'rate-table.pdf');
const DST = join(ROOT, 'test', 'fixtures', 'rate-table-scanned.pdf');
const DPI = 200;   // a realistic office-scanner setting, and plenty for PP-OCR

// ---- 1. rasterize page 1 to a JPEG ------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), 'scanfix-'));
try {
  execFileSync('pdftoppm', ['-r', String(DPI), '-gray', '-jpeg', '-jpegopt', 'quality=85',
    '-f', '1', '-l', '1', SRC, join(tmp, 'scan')], { stdio: 'inherit' });
  const jpgName = readdirSync(tmp).find((f) => f.endsWith('.jpg'));
  if (!jpgName) throw new Error('pdftoppm produced no JPEG');
  const jpg = readFileSync(join(tmp, jpgName));

  // ---- 2. read the frame header for the true pixel size ---------------------
  function jpegInfo(b) {
    let p = 2;                                     // skip SOI
    while (p < b.length) {
      if (b[p] !== 0xff) { p++; continue; }
      const marker = b[p + 1];
      const len = (b[p + 2] << 8) | b[p + 3];
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {   // SOF0/1/2
        return { h: (b[p + 5] << 8) | b[p + 6], w: (b[p + 7] << 8) | b[p + 8], comps: b[p + 9] };
      }
      p += 2 + len;
    }
    throw new Error('no SOF marker — pdftoppm did not write a JPEG?');
  }
  const { w, h, comps } = jpegInfo(jpg);
  const pw = +(w * 72 / DPI).toFixed(2), ph = +(h * 72 / DPI).toFixed(2);
  const cs = comps === 1 ? '/DeviceGray' : '/DeviceRGB';

  // ---- 3. wrap it as a one-page PDF ---------------------------------------
  // Hand-rolled rather than via ImageMagick/Ghostscript: this is a committed
  // fixture, and it should be byte-reproducible from a script in the repo rather
  // than from whatever those tools' policies allow on a given box.
  const content = Buffer.from(`q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q\n`, 'latin1');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`,
    { dict: `<< /Length ${content.length} >>`, stream: content },
    { dict: `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>`, stream: jpg },
  ];

  const chunks = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  let pos = chunks[0].length;
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(pos);
    const parts = [Buffer.from(`${i + 1} 0 obj\n`, 'latin1')];
    if (typeof o === 'string') parts.push(Buffer.from(o + '\n', 'latin1'));
    else {
      parts.push(Buffer.from(o.dict + '\nstream\n', 'latin1'), o.stream, Buffer.from('\nendstream\n', 'latin1'));
    }
    parts.push(Buffer.from('endobj\n', 'latin1'));
    const b = Buffer.concat(parts);
    chunks.push(b);
    pos += b.length;
  });
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += String(off).padStart(10, '0') + ' 00000 n \n';
  xref += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, 'latin1'));

  const out = Buffer.concat(chunks);
  writeFileSync(DST, out);
  console.log(`wrote ${DST.replace(ROOT + '/', '')} — ${out.length} bytes, ` +
    `${w}x${h}px ${cs.slice(1)} image on a ${pw}x${ph}pt page at ${DPI} DPI`);
  console.log('verify it really has no text layer:  pdftotext test/fixtures/rate-table-scanned.pdf -   (must print nothing)');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
