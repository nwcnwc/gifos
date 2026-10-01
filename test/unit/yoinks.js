// apps/yoinks: the pure half of the port, held mechanically.
//
// The screens are upstream's; the engine is a cobalt instance the person
// names. What can rot silently is the contract between the two: the request
// body (a key cobalt 10 never heard of makes every instance answer
// invalid_body), the answer parser (tunnel / redirect / picker /
// local-processing / error), the error copy, and the manifest floor the
// download hand-off needs (capabilities.links, build 2154).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'yoinks');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

// ---- load app.js the way the GIF runs it, minus a document -----------------
const sandbox = { window: {}, console, URL, Promise, setTimeout, clearTimeout };
sandbox.window.URL = URL;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(APP, 'app.js'), 'utf8'), sandbox, { filename: 'app.js' });
const Y = sandbox.window.Yoinks;
check('app.js attaches window.Yoinks without a document', !!(Y && Y.buildChoices && Y.parseResponse));

// ---- platforms (upstream lib/platforms.ts) ----------------------------------
check('youtu.be is YouTube', Y.detectPlatform('https://youtu.be/dQw4w9WgXcQ').key === 'youtube');
check('music.youtube.com is YouTube', Y.detectPlatform('https://music.youtube.com/watch?v=x').key === 'youtube');
check('x.com is X and maps to cobalt service twitter', (() => { const p = Y.detectPlatform('https://x.com/a/status/1'); return p.key === 'x' && p.service === 'twitter'; })());
check('a subdomain matches (www.tiktok.com)', Y.detectPlatform('https://www.tiktok.com/@a/video/1').key === 'tiktok');
check('an unknown host is generic with the hostname as label', (() => { const p = Y.detectPlatform('https://example.org/v'); return p.key === 'generic' && p.label === 'example.org'; })());
check('not a url is unknown', Y.detectPlatform('nope').key === 'unknown');
check('isProbablyUrl accepts http(s) only', Y.isProbablyUrl('https://a.b/c') && Y.isProbablyUrl(' http://a.b ') && !Y.isProbablyUrl('ftp://a.b') && !Y.isProbablyUrl('youtube.com/watch'));

// ---- choices -----------------------------------------------------------------
{
  const yt = Y.buildChoices({ key: 'youtube' });
  check('YouTube gets the ladder 2160…144 plus audio', yt.length === 9 && yt[0].quality === '2160' && yt[7].quality === '144' && yt[8].kind === 'audio', yt.map((c) => c.label));
  check('the ladder reads like upstream: "2160p · mp4"', yt[0].label === '2160p · mp4' && Y.choiceLabel(yt[0]) === '▶ 2160p · mp4');
  check('audio row reads like upstream: "♪ audio only · mp3"', Y.choiceLabel(yt[8]) === '♪ audio only · mp3');
  const other = Y.buildChoices({ key: 'tiktok' });
  check('other sites get best available + audio', other.length === 2 && other[0].quality === 'max' && other[0].label === 'best available · mp4' && other[1].kind === 'audio');
}

// ---- request body (cobalt docs/api.md, keys that exist in cobalt 10) ---------
{
  const V10 = ['url', 'audioBitrate', 'audioFormat', 'downloadMode', 'filenameStyle', 'videoQuality', 'disableMetadata', 'alwaysProxy', 'youtubeVideoCodec', 'youtubeDubLang', 'convertGif', 'allowH265', 'tiktokFullAudio', 'youtubeHLS', 'localProcessing', 'subtitleLang', 'youtubeVideoContainer', 'youtubeBetterAudio'];
  const v = Y.requestBody('https://youtu.be/x', { kind: 'video', quality: '1080' });
  check('video body: quality, auto, h264, always tunnel', v.url === 'https://youtu.be/x' && v.videoQuality === '1080' && v.downloadMode === 'auto' && v.youtubeVideoCodec === 'h264' && v.alwaysProxy === true, v);
  check('video body uses only documented keys', Object.keys(v).every((k) => V10.includes(k)), Object.keys(v));
  const a = Y.requestBody('https://youtu.be/x', { kind: 'audio', quality: 'max' });
  check('audio body: downloadMode audio, mp3, 320', a.downloadMode === 'audio' && a.audioFormat === 'mp3' && a.audioBitrate === '320' && a.alwaysProxy === true, a);
  check('audio body uses only documented keys', Object.keys(a).every((k) => V10.includes(k)), Object.keys(a));
  check('audioBitrate is one of the documented values', ['320', '256', '128', '96', '64', '8'].includes(a.audioBitrate));
  check('filenameStyle is documented', ['classic', 'pretty', 'basic', 'nerdy'].includes(v.filenameStyle));
}

// ---- instance address and auth -----------------------------------------------
check('a bare host becomes https origin', Y.cleanInstance('cobalt.example.com') === 'https://cobalt.example.com');
check('a trailing slash is dropped', Y.cleanInstance('https://cobalt.example.com/') === 'https://cobalt.example.com');
check('a path is kept, trailing slash dropped', Y.cleanInstance('https://example.com/api/') === 'https://example.com/api');
check('http is refused (the bridge is https-only)', Y.cleanInstance('http://cobalt.example.com') === '');
check('http localhost is allowed for dev', Y.cleanInstance('http://localhost:9000') === 'http://localhost:9000');
check('garbage is refused', Y.cleanInstance('not a url') === '' && Y.cleanInstance('') === '');
check('a bare key becomes Api-Key', Y.authHeaders({}, 'abc').Authorization === 'Api-Key abc');
check('a pasted "Bearer x" is kept as is', Y.authHeaders({}, 'Bearer x').Authorization === 'Bearer x');
check('no key, no header', !('Authorization' in Y.authHeaders({}, '  ')));

// ---- answers -------------------------------------------------------------------
{
  const t = Y.parseResponse({ status: 'tunnel', url: 'https://i/tunnel?id=1', filename: 'a.mp4' });
  check('tunnel → file', t.kind === 'file' && t.url === 'https://i/tunnel?id=1' && t.filename === 'a.mp4');
  const r = Y.parseResponse({ status: 'redirect', url: 'https://cdn/x.mp4' });
  check('redirect → file, empty filename tolerated', r.kind === 'file' && r.filename === '');
  const p = Y.parseResponse({ status: 'picker', picker: [{ type: 'photo', url: 'https://a/1' }, { type: 'video', url: 'https://a/2' }, { type: 'gif', url: 'https://a/3' }, { bad: 1 }], audio: 'https://a/bg', audioFilename: 'bg.mp3' });
  check('picker → items with types, junk dropped, audio kept', p.kind === 'picker' && p.items.length === 3 && p.items[0].type === 'photo' && p.items[2].type === 'gif' && p.audio === 'https://a/bg' && p.audioFilename === 'bg.mp3', p);
  const l = Y.parseResponse({ status: 'local-processing', type: 'merge', tunnel: ['https://a/v', 'https://a/a'], output: { filename: 'x.mp4' } });
  check('local-processing → local with the tunnels and filename', l.kind === 'local' && l.type === 'merge' && l.urls.length === 2 && l.filename === 'x.mp4', l);
  const e = Y.parseResponse({ status: 'error', error: { code: 'error.api.content.too_long', context: { limit: 180 } } });
  check('error → the sentence, with the limit filled in', e.kind === 'error' && e.message === 'too long — this instance stops at 180 minutes', e);
  const u = Y.parseResponse({ status: 'stream', url: 'x' });
  check('an unknown status is an error, not a crash', u.kind === 'error' && /doesn’t understand/.test(u.message));
  check('null is an error, not a crash', Y.parseResponse(null).kind === 'error');
}
check('Turnstile refusal explains the api key or another instance', /api key/.test(Y.errorText('error.api.auth.jwt.missing')) && /another instance/.test(Y.errorText('error.api.auth.jwt.missing')));
check('an unmapped code is shown, trimmed', Y.errorText('error.api.something.new') === 'the instance said: something.new');
check('no code at all still says something', Y.errorText('') === 'the instance hit an error it didn’t explain');

// ---- GET / -----------------------------------------------------------------------
{
  const i = Y.parseInstance({ cobalt: { version: '11.7.1', services: ['youtube', 'twitter', 'tiktok'], turnstileSitekey: '0x1' } }, 'https://i');
  check('instance info: version, services, turnstile', i && i.version === '11.7.1' && i.services.length === 3 && i.turnstile === true && i.base === 'https://i', i);
  check('not cobalt → null', Y.parseInstance({ hello: 1 }, 'https://i') === null);
  check('sites line leads with the four upstream names it has, counts the rest', Y.sitesLine(['bilibili', 'youtube', 'twitter', 'tiktok', 'vimeo']) === 'youtube · x · tiktok · +2 more', Y.sitesLine(['bilibili', 'youtube', 'twitter', 'tiktok', 'vimeo']));
  check('no services yet → the placeholder line', Y.sitesLine([]) === 'youtube · x · instagram · tiktok · +more');
}
check('oEmbed goes to the site itself for YouTube', /^https:\/\/www\.youtube\.com\/oembed\?/.test(Y.oembedUrl('https://youtu.be/x', { key: 'youtube' })));
check('oEmbed goes to noembed for the rest', /^https:\/\/noembed\.com\/embed\?/.test(Y.oembedUrl('https://x.com/a', { key: 'x' })));

// ---- manifest and listing ----------------------------------------------------------
{
  const m = JSON.parse(fs.readFileSync(path.join(APP, 'manifest.json'), 'utf8'));
  const l = JSON.parse(fs.readFileSync(path.join(APP, 'listing.json'), 'utf8'));
  check('manifest declares links (the hand-off) and network ["*"] (a user-supplied URL)', m.capabilities.links === true && JSON.stringify(m.capabilities.network) === '["*"]');
  check('minBuild is at least 2154, where capabilities.links landed', m.minBuild >= 2154, m.minBuild);
  check('prefs and history are private', m.data.prefs.visibility === 'private' && m.data.history.visibility === 'private');
  check('the author is Pablo Stanley, the porter GifOS, basedOn yoinks', /Pablo Stanley/.test(l.author.name) && l.porter.name === 'GifOS' && l.basedOn.url === 'https://github.com/pablostanley/yoinks' && l.basedOn.blessed === false);
  check('the copy does not promise yt-dlp’s 1,800 sites', !/1,?800|Threads/.test(JSON.stringify(l) + m.description));
  const help = fs.readFileSync(path.join(APP, 'help.md'), 'utf8');
  check('help.md explains naming an instance and the Turnstile case', /cobalt instance/.test(help) && /Turnstile/.test(help) && /API key/.test(help));
}

console.log(failures ? 'FAILURES: ' + failures : 'ALL PASS');
process.exit(failures ? 1 : 0);
