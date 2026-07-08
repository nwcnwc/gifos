/* Bonus app for 0.gifos.app (Terminal Zero, the developers' computer): a tiny
 * cowsay toy, filed into Tools. This is the template for per-theme easter eggs —
 * everything about the app lives right here in the theme's own folder. */
GifOS.addEggs([{
  name: 'Cowsay.gif', appId: 'cowsay', accent: [51, 255, 119], folder: 'Tools',
  html: "<!doctype html><html><head><meta charset='utf-8'>"
    + "<meta name='viewport' content='width=device-width,initial-scale=1'><style>"
    + "body{background:var(--bg,#04120a);color:var(--text,#a8ffc4);font:14px ui-monospace,SFMono-Regular,Menlo,monospace;margin:0;padding:16px}"
    + "h1{font-size:1rem;margin:0 0 .6rem;color:var(--accent,#33ff77)}"
    + "textarea{width:100%;box-sizing:border-box;background:#020703;color:#33ff77;border:1px solid #0e3d22;border-radius:6px;padding:8px;font:inherit;resize:vertical}"
    + "pre{white-space:pre;overflow:auto;margin-top:14px;line-height:1.15}</style></head><body>"
    + "<h1>cowsay</h1><textarea id='t' rows='2'>Hello from 0.gifos.app</textarea><pre id='o'></pre>"
    + "<script>var t=document.getElementById('t'),o=document.getElementById('o');"
    + "function cow(s){s=(s||' ').slice(0,42);var b='  '+Array(s.length+3).join('-');"
    + "return ' '+Array(s.length+3).join('_')+'\\n< '+s+' >\\n'+b+"
    + "'\\n        \\\\   ^__^\\n         \\\\  (oo)\\\\_______\\n            (__)\\\\       )\\\\/\\\\\\n                ||----w |\\n                ||     ||';}"
    + "function r(){o.textContent=cow(t.value.split('\\n')[0]);}"
    + "t.addEventListener('input',r);r();"
    + "<\\/script></body></html>",
}]);
