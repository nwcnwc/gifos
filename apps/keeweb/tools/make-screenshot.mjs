// Paint a store-cover screenshot of KeeWeb. No live app needed.
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const out = join(dir, '..', 'screenshot.png');

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800">
  <rect width="1280" height="800" fill="#1a1d1b"/>
  <rect width="1280" height="56" fill="#151816"/>
  <rect x="0" y="55" width="1280" height="2" fill="#6bbd58"/>
  <text x="24" y="26" fill="#e8eee6" font-family="DejaVu Sans, sans-serif" font-size="16" font-weight="700">KeeWeb</text>
  <text x="24" y="44" fill="#8a9686" font-family="DejaVu Sans, sans-serif" font-size="11">on this device</text>
  <rect x="220" y="14" width="280" height="28" rx="6" fill="#121512" stroke="#323833"/>
  <text x="232" y="33" fill="#8a9686" font-family="DejaVu Sans, sans-serif" font-size="13">Search</text>
  <text x="640" y="34" fill="#8a9686" font-family="DejaVu Sans, sans-serif" font-size="12">Saved on this device</text>
  <rect x="980" y="14" width="96" height="28" rx="6" fill="#6bbd58"/>
  <text x="994" y="33" fill="#10200c" font-family="DejaVu Sans, sans-serif" font-size="13" font-weight="700">New entry</text>
  <rect x="1084" y="14" width="86" height="28" rx="6" fill="none" stroke="#323833"/>
  <text x="1096" y="33" fill="#8a9686" font-family="DejaVu Sans, sans-serif" font-size="13">Export</text>
  <rect x="1178" y="14" width="78" height="28" rx="6" fill="none" stroke="#323833"/>
  <text x="1198" y="33" fill="#8a9686" font-family="DejaVu Sans, sans-serif" font-size="13">Lock</text>

  <rect x="0" y="57" width="220" height="743" fill="#1e221f"/>
  <rect x="220" y="57" width="1" height="743" fill="#323833"/>
  <text x="16" y="84" fill="#8a9686" font-family="DejaVu Sans, sans-serif" font-size="12">GROUPS</text>
  <rect x="8" y="98" width="204" height="32" rx="4" fill="#2a4a24"/>
  <text x="20" y="119" fill="#e8eee6" font-family="DejaVu Sans, sans-serif" font-size="14">My Vault</text>
  <text x="32" y="151" fill="#8a9686" font-family="DejaVu Sans, sans-serif" font-size="14">Email</text>
  <text x="32" y="179" fill="#8a9686" font-family="DejaVu Sans, sans-serif" font-size="14">Banking</text>
  <text x="20" y="215" fill="#8a9686" font-family="DejaVu Sans, sans-serif" font-size="14">Recycle Bin</text>

  <rect x="221" y="57" width="300" height="743" fill="#1a1d1b"/>
  <rect x="520" y="57" width="1" height="743" fill="#323833"/>
  <rect x="221" y="70" width="299" height="64" fill="#2a4a24"/>
  <text x="236" y="96" fill="#e8eee6" font-family="DejaVu Sans, sans-serif" font-size="15" font-weight="700">GitHub</text>
  <text x="236" y="116" fill="#8a9686" font-family="DejaVu Sans, sans-serif" font-size="12">nate</text>
  <text x="236" y="162" fill="#e8eee6" font-family="DejaVu Sans, sans-serif" font-size="15" font-weight="700">GifOS</text>
  <text x="236" y="182" fill="#8a9686" font-family="DejaVu Sans, sans-serif" font-size="12">nathan</text>
  <text x="236" y="222" fill="#e8eee6" font-family="DejaVu Sans, sans-serif" font-size="15" font-weight="700">Mail</text>
  <text x="236" y="242" fill="#8a9686" font-family="DejaVu Sans, sans-serif" font-size="12">me@example.com</text>

  <rect x="521" y="57" width="759" height="743" fill="#222623"/>
  <text x="548" y="96" fill="#e8eee6" font-family="DejaVu Sans, sans-serif" font-size="22" font-weight="700">GitHub</text>
  <text x="548" y="140" fill="#8a9686" font-family="DejaVu Sans, sans-serif" font-size="12">Username</text>
  <rect x="548" y="148" width="430" height="36" rx="6" fill="#121512" stroke="#323833"/>
  <text x="560" y="172" fill="#e8eee6" font-family="DejaVu Sans, sans-serif" font-size="14">nate</text>
  <rect x="986" y="148" width="72" height="36" rx="6" fill="none" stroke="#323833"/>
  <text x="1002" y="172" fill="#8a9686" font-family="DejaVu Sans, sans-serif" font-size="13">Copy</text>
  <text x="548" y="220" fill="#8a9686" font-family="DejaVu Sans, sans-serif" font-size="12">Password</text>
  <rect x="548" y="228" width="340" height="36" rx="6" fill="#121512" stroke="#323833"/>
  <text x="560" y="252" fill="#e8eee6" font-family="DejaVu Sans, sans-serif" font-size="16">••••••••••••</text>
  <rect x="896" y="228" width="72" height="36" rx="6" fill="none" stroke="#323833"/>
  <text x="912" y="252" fill="#8a9686" font-family="DejaVu Sans, sans-serif" font-size="13">Show</text>
  <rect x="976" y="228" width="82" height="36" rx="6" fill="#6bbd58"/>
  <text x="992" y="252" fill="#10200c" font-family="DejaVu Sans, sans-serif" font-size="13" font-weight="700">Copy</text>
  <text x="548" y="300" fill="#8a9686" font-family="DejaVu Sans, sans-serif" font-size="12">URL</text>
  <rect x="548" y="308" width="430" height="36" rx="6" fill="#121512" stroke="#323833"/>
  <text x="560" y="332" fill="#e8eee6" font-family="DejaVu Sans, sans-serif" font-size="14">https://github.com</text>
  <rect x="986" y="308" width="72" height="36" rx="6" fill="none" stroke="#323833"/>
  <text x="1002" y="332" fill="#8a9686" font-family="DejaVu Sans, sans-serif" font-size="13">Copy</text>
  <text x="548" y="380" fill="#8a9686" font-family="DejaVu Sans, sans-serif" font-size="12">Notes</text>
  <rect x="548" y="388" width="510" height="88" rx="6" fill="#121512" stroke="#323833"/>
  <text x="560" y="416" fill="#e8eee6" font-family="DejaVu Sans, sans-serif" font-size="14">Personal account. Copy-paste only —</text>
  <text x="560" y="438" fill="#e8eee6" font-family="DejaVu Sans, sans-serif" font-size="14">this vault never fills another site.</text>
  <text x="548" y="516" fill="#6bbd58" font-family="DejaVu Sans, sans-serif" font-size="28" font-weight="700" letter-spacing="4">482 193</text>
  <text x="548" y="540" fill="#8a9686" font-family="DejaVu Sans, sans-serif" font-size="12">12s remaining · copy-paste only</text>
  <rect x="548" y="580" width="110" height="36" rx="6" fill="#6bbd58"/>
  <text x="564" y="604" fill="#10200c" font-family="DejaVu Sans, sans-serif" font-size="13" font-weight="700">Save entry</text>
</svg>`;

const png = await sharp(Buffer.from(svg)).png().toBuffer();
writeFileSync(out, png);
console.log('wrote', out, png.length, 'bytes');
