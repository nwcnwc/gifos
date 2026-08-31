// A three-page public-domain sample so first-run is not an empty drop zone.
// Helvetica / Times are the built-in Type1 faces — no embedded font, no CMap.
// Deterministic bytes. Public domain text (original to this file).

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function T(font, size, x, y, text) {
  return 'BT /' + font + ' ' + size + ' Tf 1 0 0 1 ' + x + ' ' + y + ' Tm (' + esc(text) + ') Tj ET\n';
}

function lines(font, size, x, y, leading, arr) {
  let s = '';
  for (let i = 0; i < arr.length; i++) s += T(font, size, x, y - i * leading, arr[i]);
  return s;
}

function page1() {
  let s = '';
  s += '0.86 0.18 0.18 rg 54 742 504 8 re f\n';
  s += T('Fb', 36, 72, 680, 'Paper Planes');
  s += T('Fi', 14, 72, 650, 'How to fold a dart, and why it stays up');
  s += '0.2 0.2 0.22 RG 0.6 w 72 636 468 0 m S\n';
  s += lines('Fr', 12, 72, 600, 18, [
    'A sheet of paper is already a wing. Crease it well, throw it',
    'gently, and it will glide farther than it has any right to. This',
    'note is three pages: a fold, a reason, and nothing else.',
    '',
    'There is no account and no upload. The file you are reading',
    'lives in this app. Close it, open it again, you are still here.',
    '',
    'Turn the page. On a phone, swipe. Find the word "glide".',
    'Hold on a line and a friend who opened your invite sees a',
    'pointer on the same sentence.',
  ]);
  s += T('Fh', 9, 72, 72, 'Page 1 of 3  ·  public domain  ·  sample packed in the app');
  return s;
}

function page2() {
  let s = '';
  s += '0.86 0.18 0.18 rg 54 742 504 8 re f\n';
  s += T('Fb', 22, 72, 700, 'Folding a dart');
  s += T('Fi', 12, 72, 676, 'Letter or A4. Work on a table. Sharp creases fly straighter.');
  const steps = [
    '1.  Fold the sheet in half the long way. Open it again. The',
    '    centre crease is the spine.',
    '2.  Fold the top two corners down to the spine so they meet',
    '    in a point. This is the nose.',
    '3.  Fold the long edges in to the spine. The nose gets',
    '    sharper. Crease firmly with a thumbnail.',
    '4.  Fold the plane in half along the spine, printed side out.',
    '5.  Fold each wing down so the top edge of the wing lines',
    '    up with the bottom of the fuselage. Leave a finger of',
    '    body under the wings.',
    '6.  Pinch the fuselage. Hold it under the wings, a little',
    '    behind the nose. Throw level, not up. A gentle toss.',
  ];
  s += lines('Fr', 12, 72, 640, 18, steps);
  s += T('Fh', 9, 72, 72, 'Page 2 of 3  ·  public domain  ·  sample packed in the app');
  return s;
}

function page3() {
  let s = '';
  s += '0.86 0.18 0.18 rg 54 742 504 8 re f\n';
  s += T('Fb', 22, 72, 700, 'Why it glides');
  s += lines('Fr', 12, 72, 664, 18, [
    'Four forces, same as any aeroplane, just quieter.',
    '',
    'Lift comes from air moving faster over the top of the wing',
    'than under it. A paper dart is a poor aerofoil, but a good',
    'enough one if the wings are even and the nose is not too',
    'heavy.',
    '',
    'Weight is the paper. A slightly heavier nose keeps the dart',
    'from stalling. A paper-clip on the tip is a trim tab.',
    '',
    'Thrust is your throw. After that there is only glide. Drag is',
    'everything that is not smooth: a puffy crease, a bent wing,',
    'a throw that starts the plane tumbling.',
    '',
    'If it dives, unfold a millimetre of up-elevator at the back of',
    'each wing. If it stalls, add a little weight to the nose. If it',
    'rolls, the wings are not the same. Make them the same.',
  ]);
  // A tiny side-view dart: nose, body, wing.
  s += '0.15 0.15 0.18 RG 1.4 w\n';
  s += '140 160 m 220 176 l 420 176 l 440 168 l S\n';
  s += '220 176 m 300 210 l 380 176 l S\n';
  s += '220 176 m 300 150 l 380 176 l S\n';
  s += T('Fh', 9, 140, 128, 'side view  ·  even wings, a little weight in the nose');
  s += T('Fh', 9, 72, 72, 'Page 3 of 3  ·  public domain  ·  sample packed in the app');
  return s;
}

export function samplePdfBytes() {
  const streams = [page1(), page2(), page3()];
  const objs = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = '<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>';
  objs[6] = '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>';
  objs[7] = '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>';
  objs[8] = '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic >>';
  objs[9] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  for (let i = 0; i < 3; i++) {
    const contentId = 10 + i;
    const stream = streams[i];
    const len = Buffer.byteLength(stream, 'latin1');
    objs[3 + i] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /Fb 6 0 R /Fr 7 0 R /Fi 8 0 R /Fh 9 0 R >> >> /Contents ' + contentId + ' 0 R >>';
    objs[contentId] = '<< /Length ' + len + ' >>\nstream\n' + stream + 'endstream';
  }

  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0];
  const maxId = 12;
  for (let i = 1; i <= maxId; i++) {
    offsets[i] = Buffer.byteLength(out, 'latin1');
    out += i + ' 0 obj\n' + objs[i] + '\nendobj\n';
  }
  const xrefAt = Buffer.byteLength(out, 'latin1');
  let xref = 'xref\n0 ' + (maxId + 1) + '\n';
  xref += '0000000000 65535 f \n';
  for (let i = 1; i <= maxId; i++) {
    xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  out += xref;
  out += 'trailer << /Size ' + (maxId + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefAt + '\n%%EOF\n';
  return Buffer.from(out, 'latin1');
}
