/* Easter eggs for imagine.gifos.app — creative toys that live only here. */
GifOS.addEggs([{
  name: 'Prompt Lab',
  appId: 'promptlab',
  accent: [255, 92, 200],
  folder: 'Studio',
  html: "<!doctype html><html><head><meta charset='utf-8'>"
    + "<meta name='viewport' content='width=device-width,initial-scale=1'><style>"
    + "body{margin:0;padding:18px;background:var(--bg,#0a0614);color:var(--text,#f5e8ff);"
    + "font:15px system-ui,sans-serif}"
    + "h1{font-size:1.15rem;margin:0 0 .4rem;background:linear-gradient(90deg,#ff5cc8,#4dd6ff);"
    + "-webkit-background-clip:text;color:transparent}"
    + "p{color:var(--muted,#a888c0);font-size:13px;margin:0 0 14px}"
    + "textarea{width:100%;box-sizing:border-box;min-height:110px;padding:12px;border-radius:12px;"
    + "border:1px solid var(--border,#3d2060);background:var(--surface,#140a22);color:inherit;font:inherit}"
    + "button{margin-top:10px;padding:10px 16px;border:0;border-radius:10px;"
    + "background:var(--accent,#ff5cc8);color:var(--onaccent,#1a0a2e);font:inherit;font-weight:700;cursor:pointer}"
    + ".out{margin-top:14px;padding:12px;border-radius:12px;background:rgba(255,92,200,.08);"
    + "border:1px solid var(--border,#3d2060);white-space:pre-wrap;font-size:13px;line-height:1.45}"
    + "</style></head><body>"
    + "<h1>Prompt Lab</h1>"
    + "<p>Sketch a Grok Imagine prompt. Saved on this computer inside the app GIF.</p>"
    + "<textarea id='t' placeholder='A luminous crystal floating in a dark studio…'></textarea>"
    + "<button id='s'>Save prompt</button>"
    + "<div class='out' id='o'>Nothing saved yet.</div>"
    + "<script>"
    + "const db=window.gifos?gifos.db('prompts'):null;"
    + "const t=document.getElementById('t'),o=document.getElementById('o');"
    + "function show(items){const last=items&&items[items.length-1];"
    + "o.textContent=last?('Saved: '+last.text):'Nothing saved yet.';"
    + "if(last)t.value=last.text;}"
    + "if(db){db.subscribe(show);} "
    + "document.getElementById('s').onclick=async()=>{"
    + "const text=(t.value||'').trim();if(!text)return;"
    + "if(db)await db.put({text,at:Date.now()});else o.textContent='Saved (local only): '+text;"
    + "};"
    + "</script></body></html>",
}]);
