// End-to-end: every computer's chrome must stay readable.
//
// The page-theming pass (each page wears its computer's theme) turned fixed
// colours into CSS variables. On the five LIGHT computers (1,2,3,6,9) that
// silently flipped any text sitting on a permanently-dark overlay to a dark-
// on-dark smear, and white button labels vanish on the bright-accent computers
// (Terminal green, Stadium gold, Toybox pink). This walks all 11 themes and
// asserts the real composited contrast ratio of the load-bearing labels.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}

// WCAG contrast, computed against the element's *composited* background: walk
// the ancestor chain, paint each background-color over the one behind it, and
// measure the winning text colour against the result. Fixed-dark overlays over
// a light theme therefore read as the true dark pill they render as.
const CONTRAST_FN = `
function _lin(c){ c/=255; return c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055,2.4); }
function _lum(r,g,b){ return 0.2126*_lin(r)+0.7152*_lin(g)+0.0722*_lin(b); }
function _rgba(s){ if(!s) return null;
  // color-mix() computes to color(srgb r g b / a) with 0..1 channels
  let m=s.match(/color\\(srgb\\s+([0-9.]+)\\s+([0-9.]+)\\s+([0-9.]+)(?:\\s*\\/\\s*([0-9.]+))?\\)/);
  if(m) return {r:+m[1]*255,g:+m[2]*255,b:+m[3]*255,a:m[4]===undefined?1:+m[4]};
  m=s.match(/rgba?\\(([^)]+)\\)/); if(!m) return null;
  const p=m[1].split(/[,\\s\\/]+/).map(x=>parseFloat(x)); return {r:p[0],g:p[1],b:p[2],a:p[3]===undefined?1:p[3]}; }
function _over(src,dst){ const a=src.a+dst.a*(1-src.a); if(a===0) return {r:0,g:0,b:0,a:0};
  return { r:(src.r*src.a+dst.r*dst.a*(1-src.a))/a, g:(src.g*src.a+dst.g*dst.a*(1-src.a))/a,
           b:(src.b*src.a+dst.b*dst.a*(1-src.a))/a, a:a }; }
function _bg(el){
  const chain=[]; let n=el; while(n){ chain.push(n); n=n.parentElement; }
  let acc={r:255,g:255,b:255,a:1}; // opaque white base behind the root
  for(let i=chain.length-1;i>=0;i--){ const c=_rgba(getComputedStyle(chain[i]).backgroundColor);
    if(c&&c.a>0) acc=_over(c,acc); }
  return acc;
}
window.contrast = function(el){
  const fg=_rgba(getComputedStyle(el).color); const bg=_bg(el);
  const l1=_lum(fg.r,fg.g,fg.b), l2=_lum(bg.r,bg.g,bg.b);
  return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
};
`;

const THEMES = ['home', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const MIN = 3.0;   // WCAG AA for UI components / large bold text (labels, chips, buttons)
const PROSE = 2.5; // soft "muted" secondary prose: catch dark-on-dark, allow the quiet look

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });

  for (const t of THEMES) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.addInitScript((th) => { window.GIFOS_THEME = th === 'home' ? '' : th; }, t);
    await page.addInitScript(CONTRAST_FN);

    // --- meet.html: tile status overlays + accent modal button ---
    await page.goto(BASE + '/meet.html', { waitUntil: 'domcontentloaded' });
    const vid = await page.evaluate(() => {
      const grid = document.getElementById('grid');
      grid.innerHTML = '';
      const tile = document.createElement('div');
      tile.className = 'tile me cam-off';
      tile.innerHTML =
        '<div class="chips"><span>muted</span><span class="warn">max blur</span></div>' +
        '<div class="name">nc (you)</div>' +
        '<button class="maxbtn">max</button>';
      grid.appendChild(tile);
      // A reliably-present accent button: the password modal's Save (id=pw-save
      // is a .name-box button with the accent fill). Force its modal visible so
      // it lays out. (The dynamic name prompt shares the exact same rule.)
      const pm = document.getElementById('pw-modal'); if (pm) pm.style.display = 'flex';
      const btn = document.getElementById('pw-save');
      return {
        chip: contrast(document.querySelector('.tile .chips span')),
        name: contrast(document.querySelector('.tile .name')),
        maxbtn: contrast(document.querySelector('.tile .maxbtn')),
        seg: contrast(document.querySelector('.segwrap .seg')),
        cancel: contrast(document.getElementById('pw-cancel')), // themed secondary button
        accentBtn: btn ? contrast(btn) : 99,
      };
    });
    check(`video[${t}] status chip`, vid.chip >= MIN, vid.chip.toFixed(2));
    check(`video[${t}] name pill`, vid.name >= MIN, vid.name.toFixed(2));
    check(`video[${t}] maximize button`, vid.maxbtn >= MIN, vid.maxbtn.toFixed(2));
    check(`video[${t}] blur segment`, vid.seg >= MIN, vid.seg.toFixed(2));
    check(`video[${t}] secondary (Close) button`, vid.cancel >= MIN, vid.cancel.toFixed(2));
    check(`video[${t}] Save (on-accent) button`, vid.accentBtn >= MIN, vid.accentBtn.toFixed(2));

    // --- run.html: signature + permission chips, accent modal button ---
    await page.goto(BASE + '/run.html', { waitUntil: 'domcontentloaded' });
    const run = await page.evaluate(() => {
      const sig = document.getElementById('sig'); sig.style.display = ''; sig.className = 'sig ok'; sig.textContent = 'signed';
      const per = document.getElementById('perms'); per.style.display = ''; per.className = 'perms unsafe'; per.textContent = 'any site';
      const btn = document.querySelector('.name-box button');
      return {
        sig: contrast(sig), perms: contrast(per),
        accentBtn: btn ? contrast(btn) : 99,
      };
    });
    check(`run[${t}] signature chip`, run.sig >= MIN, run.sig.toFixed(2));
    check(`run[${t}] permission chip`, run.perms >= MIN, run.perms.toFixed(2));
    check(`run[${t}] name (on-accent) button`, run.accentBtn >= MIN, run.accentBtn.toFixed(2));

    // --- sign.html: active tab + accent action button + result message ---
    await page.goto(BASE + '/sign.html', { waitUntil: 'domcontentloaded' });
    const sign = await page.evaluate(() => {
      const tab = document.querySelector('.tabs button'); if (tab) tab.classList.add('on');
      const act = document.querySelector('button.act');
      const msg = document.querySelector('.msg'); if (msg) { msg.classList.add('ok'); msg.textContent = 'ok'; }
      return {
        tab: tab ? contrast(tab) : 99,
        act: act ? contrast(act) : 99,
        msg: msg ? contrast(msg) : 99,
      };
    });
    check(`sign[${t}] active tab`, sign.tab >= MIN, sign.tab.toFixed(2));
    check(`sign[${t}] action (on-accent) button`, sign.act >= MIN, sign.act.toFixed(2));
    check(`sign[${t}] success message`, sign.msg >= MIN, sign.msg.toFixed(2));

    // --- about.html: body text + CTA button ---
    await page.goto(BASE + '/about.html', { waitUntil: 'domcontentloaded' });
    const about = await page.evaluate(() => ({
      body: contrast(document.querySelector('p')),
      cta: contrast(document.querySelector('.cta')),
    }));
    check(`about[${t}] body paragraph`, about.body >= PROSE, about.body.toFixed(2));
    check(`about[${t}] CTA (on-accent) button`, about.cta >= MIN, about.cta.toFixed(2));

    await ctx.close();
  }

  await browser.close();
  console.log(failures ? `\n${failures} FAIL` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
