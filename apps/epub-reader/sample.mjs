// A short public-domain EPUB so first-run is not an empty drop zone.
// Original text, dedicated to the public domain. Built with the vendored JSZip.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const JSZip = require(join(dirname(fileURLToPath(import.meta.url)), 'vendor', 'jszip.min.js'));

const CSS = `body{font-family:Georgia,"Times New Roman",serif;line-height:1.55;color:#1c1610;}
h1{font-size:1.8em;margin:0 0 .4em;text-align:center;}
h2{font-size:1.25em;margin:0 0 .8em;}
.sub{text-align:center;font-style:italic;margin:0 0 1.4em;color:#5a4a3a;}
p{margin:0 0 .9em;text-align:justify;}
.orn{text-align:center;letter-spacing:.4em;margin:1.4em 0;color:#8a6a40;}
.sig{text-align:right;font-style:italic;margin-top:1.6em;}
`;

function chap(title, kicker, paras) {
  const body = paras.map((p) => '<p>' + p + '</p>').join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
<head><meta charset="utf-8"/><title>${title}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
<h2>${title}</h2>
${kicker ? '<p class="sub">' + kicker + '</p>' : ''}
${body}
</body>
</html>`;
}

const TITLE = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
<head><meta charset="utf-8"/><title>Paper Boats</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
<p class="orn">· · ·</p>
<h1>Paper Boats</h1>
<p class="sub">A note on folding, water, and why a scrap of paper stays up</p>
<p class="orn">· · ·</p>
<p>Three short chapters. Public domain. Packed in this app so the first
opening is a book, not an empty tray.</p>
<p>Turn the page. On a phone, swipe. Open Contents for the list of
chapters. Find the word “glide”. Hold on a line and a friend who opened
your invite sees a pointer on the same sentence.</p>
<p class="sig">— packed with the reader</p>
</body>
</html>`;

const C1 = chap('Folding a boat', 'A square of paper, a table, a thumbnail.', [
  'A boat is a crease that holds air under it. Start with a square. If you have a rectangle, fold one short edge to a long edge and cut off the leftover strip. The square is the hull.',
  'Fold the square in half into a triangle, point toward you. Fold the two sharp corners up so they meet the top point. You now have a smaller diamond sitting on a triangle. Fold the front flap of that triangle up over the diamond, and turn the paper over and do the same on the back. Tuck the leftover points into the pockets you just made.',
  'Open the diamond into a pocket. Flatten it into a square. Fold the bottom points of both layers up to the top, front and back, so you have a triangle again. Open that triangle into a pocket and flatten it. Pinch the two outer points and pull. The hull opens. Sharpen every crease with a thumbnail. A lazy fold ships water.',
  'The first boat will be ugly. The second will float. The third will take a cargo of two pebbles if you crease the keel hard. That is the whole craft: paper, water, and the habit of pressing the fold until it remembers.',
  'There is no account and no upload. The file you are reading lives in this app. Close it, open it again, you are still here.'
]);

const C2 = chap('The water', 'A basin, a gutter, a slow river if you have one.', [
  'A paper boat is a fair-weather sailor. Still water is kind. Moving water is a lesson. Place the boat on a basin first, where you can see the waterline. If the sides drink, the creases were not sharp. Take it out, dry it, press the keel again.',
  'On a gutter after rain the boat will travel farther than you expect. The current is the engine. Your job is only to launch it pointing downstream and not to poke it. A stick is a rudder, not a motor. One tap on the stern. Then walk beside it.',
  'It will catch on a leaf. Free it from the bank, not from the middle. It will spin in an eddy and you will wait. That is the sport. The boat that finishes the block is the one whose folds still hold a pocket of air after the third soaking.',
  'Why it glides: four forces, same as any hull, just quieter. Buoyancy is the pocket. Weight is the paper, a little more at the stern if you have folded the transom twice. Drag is the wet edge. Thrust is the water moving under it, or your breath if the basin is still. A paper-clip on the bow is ballast. Too much and it dives; too little and it skates and capsizes in a ripple.',
  'Do not use glossy magazine paper. It is pretty and it does not hold a crease. Newsprint is honest. A leaf from a notebook is best: it drinks slowly and the lines are already a deck.'
]);

const C3 = chap('Why it stays up', 'A pocket of air, a crease that remembers.', [
  'Paper is a fibre mat. Water wants the gaps. A crease is a wall: it lines the fibres up and makes a ridge that water has to climb. Climb costs energy, so the boat stays dry a little longer than a flat sheet would. That is all the magic is.',
  'The pocket under the deck is the displacement. Archimedes does not care that the hull is two millimetres of cellulose. As long as the weight of the water the boat pushes aside is more than the weight of the paper, it floats. When the paper drinks, the weight goes up and the pocket goes down. Then it sits lower, then it ships a ripple, then it is a wet triangle and the voyage is over.',
  'So the work is not in the launch. The work is in the fold. A sharp keel is a longer voyage. A double transom is a drier stern. A square bow takes a wave better than a point. None of this is a secret. It is the same advice a real boatbuilder would give, scaled to a kitchen table.',
  'Find the word glide if you want to try the search. Hold this line if you want to try the pointer. The next page is the end of the book, which is a kindness: a paper boat is a short story, and so is this.',
  'Fold another. The first one was practice. The river, or the basin, is still there.'
]);

const NAV = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head><meta charset="utf-8"/><title>Contents</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
<nav epub:type="toc" id="toc">
<h1>Contents</h1>
<ol>
<li><a href="title.xhtml">Title</a></li>
<li><a href="c1.xhtml">Folding a boat</a></li>
<li><a href="c2.xhtml">The water</a></li>
<li><a href="c3.xhtml">Why it stays up</a></li>
</ol>
</nav>
</body>
</html>`;

const NCX = `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head>
<meta name="dtb:uid" content="urn:uuid:gifos-paper-boats-1"/>
<meta name="dtb:depth" content="1"/>
<meta name="dtb:totalPageCount" content="0"/>
<meta name="dtb:maxPageNumber" content="0"/>
</head>
<docTitle><text>Paper Boats</text></docTitle>
<navMap>
<navPoint id="n0" playOrder="1"><navLabel><text>Title</text></navLabel><content src="title.xhtml"/></navPoint>
<navPoint id="n1" playOrder="2"><navLabel><text>Folding a boat</text></navLabel><content src="c1.xhtml"/></navPoint>
<navPoint id="n2" playOrder="3"><navLabel><text>The water</text></navLabel><content src="c2.xhtml"/></navPoint>
<navPoint id="n3" playOrder="4"><navLabel><text>Why it stays up</text></navLabel><content src="c3.xhtml"/></navPoint>
</navMap>
</ncx>`;

const OPF = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bid" version="3.0">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bid">urn:uuid:gifos-paper-boats-1</dc:identifier>
<dc:title>Paper Boats</dc:title>
<dc:language>en</dc:language>
<dc:creator>Public domain</dc:creator>
<dc:publisher>GifOS sample</dc:publisher>
<meta property="dcterms:modified">2026-08-30T00:00:00Z</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="style.css" media-type="text/css"/>
<item id="t" href="title.xhtml" media-type="application/xhtml+xml"/>
<item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>
<item id="c2" href="c2.xhtml" media-type="application/xhtml+xml"/>
<item id="c3" href="c3.xhtml" media-type="application/xhtml+xml"/>
</manifest>
<spine toc="ncx">
<itemref idref="t"/>
<itemref idref="c1"/>
<itemref idref="c2"/>
<itemref idref="c3"/>
</spine>
</package>`;

const CONTAINER = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles>
<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
</rootfiles>
</container>`;

export async function sampleEpubBytes() {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', CONTAINER);
  zip.file('OEBPS/content.opf', OPF);
  zip.file('OEBPS/toc.ncx', NCX);
  zip.file('OEBPS/nav.xhtml', NAV);
  zip.file('OEBPS/style.css', CSS);
  zip.file('OEBPS/title.xhtml', TITLE);
  zip.file('OEBPS/c1.xhtml', C1);
  zip.file('OEBPS/c2.xhtml', C2);
  zip.file('OEBPS/c3.xhtml', C3);
  const buf = await zip.generateAsync({
    type: 'nodebuffer',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });
  return Buffer.from(buf);
}
