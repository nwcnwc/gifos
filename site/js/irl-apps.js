/*
 * irl-apps.js — The "IRL Games" folder: party games where the PHONE only
 * facilitates (dealing secrets, keeping time, collecting votes) and the fun
 * happens face to face — talking, acting, accusing, pointing.
 *
 * Every game supports pass-the-phone (one device, zero network) and most get
 * better when everyone joins from their own phone via Invite. Mechanics are
 * classic public-domain party-game loops; all names and content lists are our
 * own (no trademarked titles or copied card lists).
 *
 * Attaches to `GifOS.irl` (consumed by sample-apps.js at seed time).
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});

  // ---- shared cute "party" look (inlined into every app) -------------------
  const STYLE = (acc) => `
  *{box-sizing:border-box}
  body{font:16px/1.45 system-ui;margin:0;background:#faf7ef;color:#2b2440;display:flex;flex-direction:column;min-height:100vh}
  header{padding:13px 18px;font-weight:800;font-size:18px;color:#fff;background:${acc};border-bottom:3px solid #2b2440}
  main{flex:1;padding:14px;max-width:540px;margin:0 auto;width:100%}
  .card{background:#fff;border:3px solid #2b2440;border-radius:16px;padding:14px 16px;margin-bottom:12px;box-shadow:0 4px 0 rgba(43,36,64,.15)}
  .card h2{margin:0 0 6px;font-size:17px}
  .muted{color:#7a7391;font-size:13.5px}
  .btn{display:block;width:100%;padding:13px;border:3px solid #2b2440;border-radius:14px;background:${acc};color:#fff;font:inherit;font-weight:800;font-size:17px;cursor:pointer;box-shadow:0 4px 0 #2b2440;margin:10px 0;user-select:none;-webkit-user-select:none}
  .btn:active{transform:translateY(3px);box-shadow:0 1px 0 #2b2440}
  .btn.alt{background:#fff;color:#2b2440}
  .btn.small{width:auto;display:inline-block;padding:8px 14px;font-size:14px;margin:4px 6px 4px 0}
  .btn[disabled]{opacity:.45;pointer-events:none}
  input[type=text]{width:100%;padding:11px 12px;border:3px solid #2b2440;border-radius:12px;font:inherit;background:#fff}
  .chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
  .chip{background:#fff;border:2.5px solid #2b2440;border-radius:999px;padding:5px 12px;font-weight:700;font-size:14px}
  .chip.me{background:${acc};color:#fff}
  .bigword{font-size:34px;font-weight:900;text-align:center;margin:18px 0;word-break:break-word}
  .center{text-align:center}
  .timer{font-size:40px;font-weight:900;text-align:center;font-variant-numeric:tabular-nums;margin:8px 0}
  .timer.low{color:#d43d3d}
  .scores td{padding:4px 10px 4px 0}
  .tag{display:inline-block;background:#2b2440;color:#fff;border-radius:8px;padding:2px 8px;font-size:12px;font-weight:700}
  `;

  // Every game shares one tiny multiplayer heartbeat: each phone registers a
  // player doc; the shared game doc 'g' carries phase + a seed. Secrets are
  // render-side only (each phone shows just its own role) — party-grade, and
  // honest about it.
  const PARTY_LIB = `
  const IRL = {
    db: window.gifos ? gifos.db('party')
      : { subscribe:function(){}, put:function(){return Promise.resolve();}, delete:function(){return Promise.resolve();} },
    me: { id:'local', name:'You' },
    players: [], g: null,
    onchange: null,
    async init(){
      if (window.gifos) { const m = await gifos.me(); IRL.me = { id:m.id, name:m.name||'You' }; }
      IRL.db.subscribe(function(items){
        IRL.players = items.filter(function(x){ return x.id && String(x.id).indexOf('p_')===0; });
        IRL.g = items.find(function(x){ return x.id==='g'; }) || null;
        IRL.extra = items;
        if (IRL.onchange) IRL.onchange();
      });
      await IRL.db.put({ id:'p_'+IRL.me.id, name: IRL.me.name });
    },
    save(g){ g.id='g'; return IRL.db.put(g); },
    put(doc){ return IRL.db.put(doc); },
    del(id){ return IRL.db.delete(id); },
    names(){ return IRL.players.map(function(p){ return p.name; }); },
    esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); },
    shuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); const t=a[i]; a[i]=a[j]; a[j]=t; } return a; },
    beep(freq,ms){ try{ const C=window.AudioContext||window.webkitAudioContext; if(!C)return; IRL.ac=IRL.ac||new C();
      const o=IRL.ac.createOscillator(), g=IRL.ac.createGain(); o.frequency.value=freq||880; g.gain.value=.12;
      o.connect(g); g.connect(IRL.ac.destination); o.start(); setTimeout(function(){o.stop();},ms||180); }catch(e){} },
    // deterministic shuffle: same seed → same order on every phone
    seeded(seed){ let a=seed>>>0; return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a);
      t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; },
    seededShuffle(arr,seed){ const r=IRL.seeded(seed), a=arr.slice();
      for(let i=a.length-1;i>0;i--){ const j=Math.floor(r()*(i+1)); const t=a[i]; a[i]=a[j]; a[j]=t; } return a; },
    norm(s){ s=String(s||'').toLowerCase().trim().replace(/[^a-z0-9 ]/g,'');
      if(s.length>3&&s.slice(-1)==='s') s=s.slice(0,-1); return s; },
    // docs for this round with a given prefix, e.g. IRL.docs('v', g.round)
    docs(prefix,round){ return (IRL.extra||[]).filter(function(x){ return String(x.id).indexOf(prefix+round+'_')===0; }); },
    coordinator(g){ return g&&g.ids&&g.ids[0]===IRL.me.id; },
    // the everyone-joins lobby: live player chips (tap a chip to drop a stale
    // player), invite guidance, and a start button gated on the minimum count
    lobby(min,title,text,startLabel){
      const ps=IRL.players;
      return '<div class="card"><h2>'+title+'</h2><div class="muted">'+text+'</div></div>'
        +'<div class="card"><h2>Players here ('+ps.length+')</h2><div class="chips">'
        +ps.map(function(p){ return '<span class="chip'+(p.id==='p_'+IRL.me.id?' me':'')+'" data-drop="'+p.id+'">'+IRL.esc(p.name)+'</span>'; }).join('')
        +'</div><div class="muted">📲 Everyone plays on their OWN phone: tap <b>Invite</b> in the top bar, send the link, and friends appear here as they open it.</div></div>'
        +'<button class="btn" id="start" '+(ps.length<min?'disabled':'')+'>'+(startLabel||'Start')+' ('+ps.length+' players)</button>'
        +(ps.length<min?'<div class="muted center">Needs at least '+min+' players</div>':'');
    },
    // Re-render without eating what the player is typing: live db changes
    // (someone else's answer landing) redraw the screen, so the input's value,
    // focus, and caret must survive the rebuild.
    setHtml(el, html){
      const inp=el.querySelector('#inp');
      const v=inp?inp.value:null, hadFocus=inp&&document.activeElement===inp;
      el.innerHTML=html;
      const n=el.querySelector('#inp');
      if(n&&v){ n.value=v; }
      if(n&&hadFocus){ n.focus(); try{ n.setSelectionRange(n.value.length,n.value.length); }catch(e){} }
    },
    bindLobby(onStart){
      const s=document.getElementById('start'); if(s) s.onclick=onStart;
      document.querySelectorAll('[data-drop]').forEach(function(el){
        el.onclick=function(){ const pid=el.dataset.drop;
          if(pid!=='p_'+IRL.me.id && confirm('Remove '+el.textContent+' from the lobby?')) IRL.del(pid); };
      });
    },
  };
  `;

  // ============================ ODD WORD OUT =================================
  // Everyone gets the same secret word — except one imposter, who gets a
  // near-miss word. One clue each, out loud, then point at the faker.
  const ODDWORD_PAIRS = [
    ['Coffee','Tea'],['Cat','Dog'],['Beach','Pool'],['Pizza','Burger'],['Piano','Guitar'],
    ['Snow','Rain'],['Airplane','Helicopter'],['Soccer','Basketball'],['Vampire','Zombie'],
    ['Pancakes','Waffles'],['Moon','Sun'],['Library','Bookstore'],['Doctor','Dentist'],
    ['Ketchup','Mustard'],['Christmas','Halloween'],['Elevator','Escalator'],['Butterfly','Bee'],
    ['Ocean','Lake'],['Cake','Pie'],['King','President'],['Ski','Skate'],['Hotel','Hospital'],
    ['Spoon','Fork'],['Rainbow','Lightning'],['Circus','Zoo'],['Homework','Exam'],
    ['Ghost','Angel'],['Sandwich','Taco'],['Violin','Trumpet'],['Desert','Jungle'],
    ['Wedding','Birthday'],['Robot','Alien'],['Chess','Checkers'],['Camping','Picnic'],
    ['Superhero','Wizard'],['Train','Bus'],['Cookie','Brownie'],['Winter','Autumn'],
  ];

  const ODDWORD_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${STYLE('#3ba55d')}
  .peek{background:#2b2440;color:#fff;border-radius:16px;padding:26px 16px;text-align:center;margin:12px 0}
  .peek .w{font-size:32px;font-weight:900;min-height:44px}
  .order li{font-weight:700;padding:3px 0}
</style>
<header>🕵️ Odd Word Out</header>
<main id="m"></main>
<script>
${PARTY_LIB}
const PAIRS=${JSON.stringify(ODDWORD_PAIRS)};
const M=document.getElementById('m');
let localNames=[], peeking=false, localVotes=null, voteIdx=0;

function fresh(){ return { phase:'setup', round:1, scores:{} }; }
let L=fresh(); // local pass-the-phone state lives here; net state lives in IRL.g

function startRound(state, names){
  const pair=PAIRS[Math.floor(Math.random()*PAIRS.length)];
  const flip=Math.random()<0.5;
  state.pair=flip?[pair[1],pair[0]]:pair;
  state.imposter=Math.floor(Math.random()*names.length);
  state.order=IRL.shuffle(names.map(function(_,i){return i;}));
  state.names=names; state.dealt=0; state.votes={}; state.accused=null;
  state.phase='deal';
}
function score(state, imposterCaught, guessedWord){
  const sc=Object.assign({},state.scores);
  const imp=state.names[state.imposter];
  if(!imposterCaught || guessedWord){ sc[imp]=(sc[imp]||0)+3; }
  if(imposterCaught){ state.names.forEach(function(n,i){ if(i!==state.imposter) sc[n]=(sc[n]||0)+(guessedWord?0:1); }); }
  state.scores=sc;
}
function scoreTable(sc){ const ks=Object.keys(sc); if(!ks.length) return '';
  ks.sort(function(a,b){return (sc[b]||0)-(sc[a]||0);});
  return '<div class="card"><h2>Scores</h2><table class="scores">'+ks.map(function(k){return '<tr><td>'+IRL.esc(k)+'</td><td><b>'+sc[k]+'</b></td></tr>';}).join('')+'</table></div>';
}

// ---------- pass-the-phone flow ----------
function rSetup(){
  M.innerHTML='<div class="card"><h2>One phone, everyone plays</h2>'
    +'<div class="muted">Everyone gets the same secret word — except one imposter with a near-miss word. One clue each, out loud. Then point at the faker! 4+ players.</div></div>'
    +'<div class="card"><h2>Who\\'s playing?</h2><div class="chips" id="chips"></div>'
    +'<input type="text" id="nm" placeholder="Add a name, press Enter"></div>'
    +'<button class="btn" id="go" '+(localNames.length<3?'disabled':'')+'>Deal the words</button>'
    +(IRL.players.length>1?'<button class="btn alt" id="net">Everyone\\'s on their own phone → play that way</button>':'')
    +scoreTable(L.scores);
  const chips=document.getElementById('chips');
  chips.innerHTML=localNames.map(function(n,i){return '<span class="chip" data-i="'+i+'">'+IRL.esc(n)+' ✕</span>';}).join('')||'<span class="muted">No players yet</span>';
  chips.onclick=function(e){ const i=e.target.dataset.i; if(i!==undefined){ localNames.splice(+i,1); rSetup(); } };
  const nm=document.getElementById('nm');
  nm.onkeydown=function(e){ if(e.key==='Enter'&&nm.value.trim()){ localNames.push(nm.value.trim()); rSetup(); } };
  document.getElementById('go').onclick=function(){ startRound(L, localNames); render(); };
  const nb=document.getElementById('net'); if(nb) nb.onclick=function(){ netStart(); };
}
function rDeal(){
  const i=L.dealt, name=L.names[i];
  const word=(i===L.imposter)?L.pair[1]:L.pair[0];
  M.innerHTML='<div class="card center"><h2>Pass the phone to</h2><div class="bigword">'+IRL.esc(name)+'</div>'
    +'<div class="peek"><div class="muted" style="color:#bbb">Hold to peek at your secret word</div><div class="w" id="w">·····</div></div>'
    +'<button class="btn" id="ok">I\\'ve seen it — pass on</button></div>';
  const w=document.getElementById('w'); let shown=false;
  const show=function(on){ w.textContent=on?word:'·····'; shown=shown||on; };
  ['pointerdown','touchstart'].forEach(function(ev){ w.parentElement.addEventListener(ev,function(e){e.preventDefault();show(true);}); });
  ['pointerup','pointerleave','touchend'].forEach(function(ev){ w.parentElement.addEventListener(ev,function(){show(false);}); });
  document.getElementById('ok').onclick=function(){ if(!shown){ IRL.beep(220,120); return; } L.dealt++; if(L.dealt>=L.names.length) L.phase='talk'; render(); };
}
function rTalk(){
  M.innerHTML='<div class="card"><h2>🗣 Clue time — phone down!</h2>'
    +'<div class="muted">In this order, everyone says <b>one word or short phrase</b> about their secret word. Specific enough to prove you know it, vague enough to hide it from the imposter. Then argue!</div>'
    +'<ol class="order">'+L.order.map(function(i){return '<li>'+IRL.esc(L.names[i])+'</li>';}).join('')+'</ol></div>'
    +'<button class="btn" id="vote">We\\'re ready to vote</button>';
  document.getElementById('vote').onclick=function(){ L.phase='vote'; render(); };
}
function rVote(){
  M.innerHTML='<div class="card center"><h2>👉 On three, point at your suspect!</h2>'
    +'<div class="muted">Count it out loud. Whoever gets the most fingers is accused — tap them:</div></div>'
    +L.names.map(function(n,i){return '<button class="btn alt" data-i="'+i+'">'+IRL.esc(n)+'</button>';}).join('');
  M.onclick=function(e){ const i=e.target.dataset.i; if(i===undefined) return; M.onclick=null;
    L.accused=+i; L.phase='reveal'; render(); };
}
function rReveal(){
  const caught=L.accused===L.imposter;
  const imp=L.names[L.imposter];
  if(!caught){
    score(L,false,false);
    M.innerHTML='<div class="card center"><h2>'+IRL.esc(L.names[L.accused])+' was innocent! 😱</h2>'
      +'<div class="bigword">'+IRL.esc(imp)+' was the imposter</div>'
      +'<div class="muted">The imposter wins this round (+3). The words were “'+IRL.esc(L.pair[0])+'” vs “'+IRL.esc(L.pair[1])+'”.</div></div>'
      +'<button class="btn" id="next">Next round</button>'+scoreTable(L.scores);
  } else {
    M.innerHTML='<div class="card center"><h2>Caught! '+IRL.esc(imp)+' was the imposter 🎯</h2>'
      +'<div class="muted">Last chance, '+IRL.esc(imp)+': say the group\\'s word OUT LOUD. Group — did they get it?</div></div>'
      +'<button class="btn" id="yes">😤 They guessed “'+IRL.esc(L.pair[0])+'” (imposter +3)</button>'
      +'<button class="btn alt" id="no">❌ Nope (everyone else +1)</button>';
    document.getElementById('yes').onclick=function(){ score(L,true,true); L.phase='done'; render(); };
    document.getElementById('no').onclick=function(){ score(L,true,false); L.phase='done'; render(); };
    return;
  }
  document.getElementById('next').onclick=function(){ L.round++; startRound(L, L.names); render(); };
}
function rDone(){
  M.innerHTML='<div class="card center"><h2>Round '+L.round+' done!</h2></div>'+scoreTable(L.scores)
    +'<button class="btn" id="next">Next round</button><button class="btn alt" id="reset">New group</button>';
  document.getElementById('next').onclick=function(){ L.round++; startRound(L, L.names); render(); };
  document.getElementById('reset').onclick=function(){ L=fresh(); localNames=[]; render(); };
}

// ---------- everyone-has-a-phone flow (roles dealt over the wire) ----------
function netStart(){
  const ids=IRL.players.map(function(p){return p.id.slice(2);});
  const names=IRL.players.map(function(p){return p.name;});
  const pair=PAIRS[Math.floor(Math.random()*PAIRS.length)];
  const flip=Math.random()<0.5;
  IRL.save({ net:true, phase:'talk', round:(IRL.g&&IRL.g.round||0)+1,
    pair:flip?[pair[1],pair[0]]:pair, ids:ids, names:names,
    imposter:Math.floor(Math.random()*ids.length),
    order:IRL.shuffle(names), scores:(IRL.g&&IRL.g.scores)||{} });
}
function myNetRole(g){ const i=g.ids.indexOf(IRL.me.id); return i<0?null:(i===g.imposter?g.pair[1]:g.pair[0]); }
function rNet(){
  const g=IRL.g;
  const myWord=myNetRole(g);
  const votes=IRL.extra.filter(function(x){ return String(x.id).indexOf('v'+g.round+'_')===0; });
  if(g.phase==='talk'||g.phase==='vote'){
    let html='<div class="peek"><div class="muted" style="color:#bbb">Hold to peek — your secret word</div><div class="w" id="w">·····</div></div>'
      +'<div class="card"><h2>🗣 Clue order</h2><ol class="order">'+g.order.map(function(n){return '<li>'+IRL.esc(n)+'</li>';}).join('')+'</ol>'
      +'<div class="muted">One clue each, out loud. Discuss. Then vote below — votes stay hidden until everyone\\'s in.</div></div>'
      +'<div class="card"><h2>🗳 Your vote ('+votes.length+'/'+g.ids.length+' in)</h2>'
      +g.names.map(function(n,i){return '<button class="btn alt small" data-v="'+i+'">'+IRL.esc(n)+'</button>';}).join('')+'</div>'
      +scoreTable(g.scores||{});
    M.innerHTML=html;
    const w=document.getElementById('w');
    ['pointerdown','touchstart'].forEach(function(ev){ w.parentElement.addEventListener(ev,function(e){e.preventDefault(); w.textContent=myWord||'(watching)';}); });
    ['pointerup','pointerleave','touchend'].forEach(function(ev){ w.parentElement.addEventListener(ev,function(){ w.textContent='·····'; }); });
    M.onclick=function(e){ const v=e.target.dataset.v; if(v===undefined) return;
      IRL.put({ id:'v'+g.round+'_'+IRL.me.id, t:+v });
      if(votes.length+1>=g.ids.length){ finishNetVote(g, votes.concat([{t:+v}])); }
    };
  } else if(g.phase==='reveal'){
    const caught=g.accused===g.imposter;
    const imp=g.names[g.imposter];
    M.innerHTML='<div class="card center"><h2>'+(caught?'Caught! '+IRL.esc(imp)+' was the imposter 🎯':IRL.esc(g.names[g.accused])+' was innocent 😱 — it was '+IRL.esc(imp))+'</h2>'
      +'<div class="muted">Words: “'+IRL.esc(g.pair[0])+'” vs “'+IRL.esc(g.pair[1])+'”.'
      +(caught?' '+IRL.esc(imp)+': say the group\\'s word out loud — group taps the result.':' Imposter wins +3.')+'</div></div>'
      +(caught?'<button class="btn" id="yes">They guessed it (imposter +3)</button><button class="btn alt" id="no">Nope (others +1)</button>'
              :'<button class="btn" id="again">Play another round</button>')
      +scoreTable(g.scores||{});
    const done=function(guessed){
      const sc=Object.assign({},g.scores||{});
      if(caught&&!guessed){ g.names.forEach(function(n,i){ if(i!==g.imposter) sc[n]=(sc[n]||0)+1; }); }
      else { sc[imp]=(sc[imp]||0)+3; }
      IRL.save(Object.assign({},g,{phase:'scores',scores:sc}));
    };
    if(caught){ document.getElementById('yes').onclick=function(){done(true);}; document.getElementById('no').onclick=function(){done(false);}; }
    else document.getElementById('again').onclick=function(){ const sc=Object.assign({},g.scores||{}); sc[imp]=(sc[imp]||0)+3; IRL.save(Object.assign({},g,{scores:sc})); netStart(); };
  } else if(g.phase==='scores'){
    M.innerHTML='<div class="card center"><h2>Round '+g.round+' done!</h2></div>'+scoreTable(g.scores||{})
      +'<button class="btn" id="again">Next round</button>';
    document.getElementById('again').onclick=netStart;
  }
}
function finishNetVote(g,votes){
  const tally={}; votes.forEach(function(v){ tally[v.t]=(tally[v.t]||0)+1; });
  let best=0,acc=0; Object.keys(tally).forEach(function(k){ if(tally[k]>best){best=tally[k];acc=+k;} });
  IRL.save(Object.assign({},g,{phase:'reveal',accused:acc}));
}

function render(){
  if(IRL.g&&IRL.g.net&&IRL.g.phase!=='setup'){ rNet(); return; }
  ({setup:rSetup,deal:rDeal,talk:rTalk,vote:rVote,reveal:rReveal,done:rDone})[L.phase]();
}
IRL.onchange=render;
IRL.init().then(render); render();
</script>`;

  // ============================ CATCH THE SPY ================================
  // Everyone knows the secret place except the spy. Question each other —
  // vaguely! — until the timer runs out or somebody cracks.
  const SPY_PLACES = [
    ['Airplane','pilot|flight attendant|nervous flyer|air marshal|tourist|sleeping passenger'],
    ['Beach','lifeguard|ice-cream seller|surfer|sunburned tourist|sandcastle architect|dog walker'],
    ['Pirate Ship','captain|cook|lookout|stowaway|parrot trainer|prisoner'],
    ['Space Station','commander|scientist|engineer|space tourist|robot|medic'],
    ['Movie Theater','usher|projectionist|popcorn seller|critic|first-dater|loud talker'],
    ['Hospital','surgeon|nurse|patient|visitor|intern|ambulance driver'],
    ['School','teacher|principal|student|janitor|lunch lady|gym coach'],
    ['Supermarket','cashier|butcher|shelf stocker|coupon collector|free-samples fan|security guard'],
    ['Circus','ringmaster|clown|acrobat|lion tamer|ticket seller|juggler'],
    ['Submarine','captain|sonar operator|cook|mechanic|navigator|new recruit'],
    ['Ski Resort','instructor|lift operator|snowboarder|first-timer|ski patrol|lodge chef'],
    ['Zoo','zookeeper|vet|tour guide|ticket taker|photographer|kid on a field trip'],
    ['Wedding','the happy couple|officiant|caterer|DJ|photographer|distant cousin'],
    ['Bank','teller|manager|security guard|customer|auditor|intern'],
    ['Amusement Park','ride operator|mascot|food vendor|thrill seeker|lost kid|maintenance crew'],
    ['Restaurant Kitchen','head chef|dishwasher|waiter|food critic|health inspector|sous-chef'],
    ['Library','librarian|student|author|sleeper|kid at storytime|security'],
    ['Train','conductor|engineer|snack-cart attendant|commuter|ticket inspector|tourist'],
    ['Farm','farmer|vet|tractor mechanic|farmhand|scarecrow stuffer|city visitor'],
    ['Aquarium','diver|dolphin trainer|guide|gift-shop clerk|marine biologist|kid'],
    ['Haunted House','actor-ghost|ticket taker|scaredy-cat|skeptic|makeup artist|owner'],
    ['Gym','personal trainer|receptionist|bodybuilder|resolutioner|yoga teacher|janitor'],
    ['Cruise Ship','captain|entertainer|bartender|honeymooner|deckhand|retiree'],
    ['Campground','ranger|scout leader|marshmallow roaster|fisherman|bear watcher|camper'],
    ['TV Studio','host|camera operator|makeup artist|guest star|producer|audience member'],
    ['Museum','curator|guard|tour guide|art student|restorer|lost tourist'],
    ['Fire Station','chief|firefighter|dispatcher|dalmatian trainer|rookie|cook'],
    ['Castle','royalty|knight|jester|cook|wizard|tourist'],
    ['North Pole Workshop','the boss in red|elf|reindeer handler|toy tester|list checker|mail sorter'],
    ['Desert Island','castaway|treasure hunter|coconut chef|raft builder|volleyball friend|rescue pilot'],
  ];

  const SPY_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${STYLE('#4d7cd6')}
  .peek{background:#2b2440;color:#fff;border-radius:16px;padding:24px 16px;text-align:center;margin:12px 0}
  .peek .w{font-size:24px;font-weight:900;min-height:60px}
  .places{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  .pl{border:2px solid #2b2440;border-radius:10px;padding:6px 8px;font-size:13px;font-weight:700;background:#fff}
  .pl.sel{background:#4d7cd6;color:#fff}
</style>
<header>🔎 Catch the Spy</header>
<main id="m"></main>
<script>
${PARTY_LIB}
const PLACES=${JSON.stringify(SPY_PLACES)};
const M=document.getElementById('m');
let localNames=[], L={ phase:'setup', scores:{} }, tickInt=null;

function placeList(sel){ return '<div class="places">'+PLACES.map(function(p,i){
  return '<div class="pl'+(sel===i?' sel':'')+'">'+IRL.esc(p[0])+'</div>'; }).join('')+'</div>'; }
function startRound(state,names){
  state.place=Math.floor(Math.random()*PLACES.length);
  state.spy=Math.floor(Math.random()*names.length);
  const roles=IRL.shuffle(PLACES[state.place][1].split('|'));
  state.roles=names.map(function(_,i){ return roles[i%roles.length]; });
  state.names=names; state.dealt=0;
  state.mins=names.length>=6?8:6;
  state.first=names[Math.floor(Math.random()*names.length)];
  state.phase='deal';
}
function scoreTable(sc){ const ks=Object.keys(sc); if(!ks.length) return '';
  ks.sort(function(a,b){return (sc[b]||0)-(sc[a]||0);});
  return '<div class="card"><h2>Scores</h2><table class="scores">'+ks.map(function(k){return '<tr><td>'+IRL.esc(k)+'</td><td><b>'+sc[k]+'</b></td></tr>';}).join('')+'</table></div>'; }

function rSetup(){
  M.innerHTML='<div class="card"><h2>Somebody here is a spy 👀</h2>'
    +'<div class="muted">Everyone learns the secret place — except the spy. Take turns asking each other questions about it. Too vague? Suspicious. Too specific? You just told the spy. 4+ players.</div></div>'
    +'<div class="card"><h2>Who\\'s playing?</h2><div class="chips" id="chips"></div>'
    +'<input type="text" id="nm" placeholder="Add a name, press Enter"></div>'
    +'<button class="btn" id="go" '+(localNames.length<3?'disabled':'')+'>Deal the roles</button>'
    +scoreTable(L.scores);
  const chips=document.getElementById('chips');
  chips.innerHTML=localNames.map(function(n,i){return '<span class="chip" data-i="'+i+'">'+IRL.esc(n)+' ✕</span>';}).join('')||'<span class="muted">No players yet</span>';
  chips.onclick=function(e){ const i=e.target.dataset.i; if(i!==undefined){ localNames.splice(+i,1); rSetup(); } };
  const nm=document.getElementById('nm');
  nm.onkeydown=function(e){ if(e.key==='Enter'&&nm.value.trim()){ localNames.push(nm.value.trim()); rSetup(); } };
  document.getElementById('go').onclick=function(){ startRound(L,localNames); render(); };
}
function rDeal(){
  const i=L.dealt, name=L.names[i], isSpy=i===L.spy;
  const secret=isSpy?'🕶 YOU ARE THE SPY\\nFigure out where everyone is!':('📍 '+PLACES[L.place][0]+'\\nYour role: '+L.roles[i]);
  M.innerHTML='<div class="card center"><h2>Pass the phone to</h2><div class="bigword">'+IRL.esc(name)+'</div>'
    +'<div class="peek"><div class="muted" style="color:#bbb">Hold to peek</div><div class="w" id="w" style="white-space:pre-line">·····</div></div>'
    +'<button class="btn" id="ok">Got it — pass on</button></div>';
  const w=document.getElementById('w'); let shown=false;
  ['pointerdown','touchstart'].forEach(function(ev){ w.parentElement.addEventListener(ev,function(e){e.preventDefault(); w.textContent=secret; shown=true;}); });
  ['pointerup','pointerleave','touchend'].forEach(function(ev){ w.parentElement.addEventListener(ev,function(){ w.textContent='·····'; }); });
  document.getElementById('ok').onclick=function(){ if(!shown){IRL.beep(220,120);return;} L.dealt++; if(L.dealt>=L.names.length){ L.phase='play'; L.t0=Date.now(); } render(); };
}
function rPlay(){
  M.innerHTML='<div class="card center"><h2>❓ Interrogate each other</h2>'
    +'<div class="muted"><b>'+IRL.esc(L.first)+'</b> asks first. Answer, then YOU ask someone else. Phones down — except to peek at the place list.</div>'
    +'<div class="timer" id="tm">--:--</div></div>'
    +'<button class="btn alt" id="list">📜 Peek at all possible places</button>'
    +'<button class="btn" id="acc">🫵 We\\'re accusing someone!</button>'
    +'<button class="btn alt" id="spyup">🕶 The spy surrenders &amp; guesses the place</button>';
  const t=document.getElementById('tm');
  clearInterval(tickInt);
  tickInt=setInterval(function(){
    const left=L.mins*60000-(Date.now()-L.t0);
    if(left<=0){ clearInterval(tickInt); IRL.beep(660,400); L.phase='accuse'; L.timeUp=true; render(); return; }
    const s=Math.ceil(left/1000);
    t.textContent=Math.floor(s/60)+':'+('0'+s%60).slice(-2);
    t.classList.toggle('low',s<60);
  },250);
  document.getElementById('list').onclick=function(){
    M.innerHTML='<div class="card"><h2>All possible places</h2>'+placeList(-1)+'</div><button class="btn" id="back">← Back</button>';
    document.getElementById('back').onclick=render;
  };
  document.getElementById('acc').onclick=function(){ clearInterval(tickInt); L.phase='accuse'; render(); };
  document.getElementById('spyup').onclick=function(){ clearInterval(tickInt); L.phase='spyguess'; render(); };
}
function rAccuse(){
  M.innerHTML='<div class="card center"><h2>'+(L.timeUp?'⏰ Time\\'s up — final vote!':'🫵 Point on three!')+'</h2>'
    +'<div class="muted">Who does the group accuse? Tap them:</div></div>'
    +L.names.map(function(n,i){return '<button class="btn alt" data-i="'+i+'">'+IRL.esc(n)+'</button>';}).join('');
  M.onclick=function(e){ const i=e.target.dataset.i; if(i===undefined) return; M.onclick=null;
    const sc=Object.assign({},L.scores);
    if(+i===L.spy){
      L.names.forEach(function(n,idx){ if(idx!==L.spy) sc[n]=(sc[n]||0)+1; });
      L.scores=sc; L.result='✅ Got \\'em! '+L.names[L.spy]+' was the spy at the '+PLACES[L.place][0]+'.';
    } else {
      sc[L.names[L.spy]]=(sc[L.names[L.spy]]||0)+2;
      L.scores=sc; L.result='😱 '+L.names[+i]+' was innocent! The spy was '+L.names[L.spy]+' — spy +2.';
    }
    L.phase='result'; render(); };
}
function rSpyGuess(){
  M.innerHTML='<div class="card"><h2>🕶 Spy — where is everyone?</h2><div class="muted">Tap your guess:</div>'
    +'<div class="places">'+PLACES.map(function(p,i){return '<div class="pl" data-i="'+i+'">'+IRL.esc(p[0])+'</div>';}).join('')+'</div></div>';
  M.onclick=function(e){ const i=e.target.dataset.i; if(i===undefined) return; M.onclick=null;
    const sc=Object.assign({},L.scores);
    if(+i===L.place){ sc[L.names[L.spy]]=(sc[L.names[L.spy]]||0)+4; L.result='🎯 The spy guessed it — '+PLACES[L.place][0]+'! Spy +4.'; }
    else { L.names.forEach(function(n,idx){ if(idx!==L.spy) sc[n]=(sc[n]||0)+1; }); L.result='❌ Wrong! It was the '+PLACES[L.place][0]+'. Everyone else +1.'; }
    L.scores=sc; L.phase='result'; render(); };
}
function rResult(){
  M.innerHTML='<div class="card center"><h2>'+IRL.esc(L.result)+'</h2></div>'+scoreTable(L.scores)
    +'<button class="btn" id="next">Next round</button><button class="btn alt" id="reset">New group</button>';
  document.getElementById('next').onclick=function(){ startRound(L,L.names); render(); };
  document.getElementById('reset').onclick=function(){ L={phase:'setup',scores:{}}; localNames=[]; render(); };
}
function render(){ ({setup:rSetup,deal:rDeal,play:rPlay,accuse:rAccuse,spyguess:rSpyGuess,result:rResult})[L.phase](); }
IRL.onchange=function(){};
IRL.init(); render();
</script>`;

  // ================================ TILT =====================================
  // Phone on your forehead; the room shouts clues; tilt down = got it,
  // tilt up = pass. The mainstream classic, single phone by design.
  const TILT_DECKS = {
    'Animals 🐘': ['Elephant','Penguin','Kangaroo','Octopus','Sloth','Flamingo','T-Rex','Hamster','Jellyfish','Owl','Crab','Gorilla','Unicorn','Skunk','Dolphin','Porcupine','Llama','Chameleon','Lobster','Eagle','Giraffe','Panda','Rooster','Walrus'],
    'Act It Out 🎭': ['Brushing teeth','Riding a horse','Karate','Milking a cow','Tightrope walking','Making pizza','Opening a stuck jar','Being a robot','Fishing','Bowling','Sneezing','Ice skating','Conducting an orchestra','Taking a selfie','Walking a big dog','Juggling','Swimming','Playing drums','Being a zombie','Changing a diaper','Mowing the lawn','Popping popcorn'],
    'Jobs 👷': ['Firefighter','Dentist','Barista','Astronaut','Referee','Magician','Plumber','News anchor','DJ','Lifeguard','Chef','Mail carrier','Farmer','Pilot','Hairdresser','Detective','Teacher','Vet','Race car driver','Clown','Librarian','Photographer'],
    'Foods 🌮': ['Spaghetti','Sushi','Popcorn','Guacamole','Pancakes','Corn on the cob','Hot sauce','Marshmallow','Pretzel','Burrito','Watermelon','Mac and cheese','Donut','Pickle','Smoothie','Garlic bread','Cotton candy','Ramen','Cheeseburger','Ice cream sandwich','Nachos','Meatball'],
    'Around the House 🏠': ['Vacuum cleaner','Toaster','Remote control','Laundry basket','Doorbell','Shower curtain','Alarm clock','Blender','Mirror','Couch cushion','Light switch','Garden hose','Ladder','Umbrella','Junk drawer','Ceiling fan','Welcome mat','Coffee mug','Extension cord','Mousetrap','Bubble wrap','Piggy bank'],
    'Legends & Heroes 🦸': ['Santa Claus','Sherlock Holmes','Robin Hood','Dracula','Bigfoot','The Tooth Fairy','King Arthur','Cleopatra','Hercules','A genie','Mermaid','Pirate captain','Ninja','Cowboy','Knight in armor','Wizard','Snowman that talks','Time traveler','Superhero landing','Alien tourist'],
  };

  const TILT_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${STYLE('#e8a33c')}
  #stage{position:fixed;inset:0;display:none;flex-direction:column;background:#e8a33c;color:#fff;text-align:center;user-select:none;-webkit-user-select:none;touch-action:none}
  #stage.on{display:flex}
  #zoneUp,#zoneDown{flex:1;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;opacity:.75}
  #word{font-size:11vw;font-weight:900;padding:2vh 4vw;word-break:break-word}
  #stTimer{font-size:26px;font-weight:900;font-variant-numeric:tabular-nums;padding-top:10px}
  #stage.hit{background:#3ba55d}#stage.pass{background:#d4703d}
  .res{display:flex;justify-content:space-between;border-bottom:2px solid #eee;padding:6px 2px;font-weight:700}
</style>
<header>🙃 Tilt</header>
<main id="m"></main>
<div id="stage">
  <div id="stTimer">60</div>
  <div id="zoneUp">▲ tap or tilt UP to pass ▲</div>
  <div id="word">Ready…</div>
  <div id="zoneDown">▼ tap or tilt DOWN when they get it ▼</div>
</div>
<script>
${PARTY_LIB}
const DECKS=${JSON.stringify(TILT_DECKS)};
const M=document.getElementById('m'), stage=document.getElementById('stage');
let deckName=null, results=[], scores=[], timer=null, tleft=0, cur='', pool=[], armed=true, orientOK=false;

function rMenu(){
  stage.classList.remove('on');
  M.innerHTML='<div class="card"><h2>Stick this phone on your forehead 😄</h2>'
    +'<div class="muted">Screen facing your friends. They shout clues (or act them out — the deck says which). Tilt DOWN when you get it, UP to pass. 60 seconds. Then pass the phone!</div></div>'
    +'<div class="card"><h2>Pick a deck</h2>'+Object.keys(DECKS).map(function(d){return '<button class="btn alt" data-d="'+IRL.esc(d)+'">'+IRL.esc(d)+'</button>';}).join('')+'</div>'
    +(scores.length?'<div class="card"><h2>This session</h2>'+scores.map(function(s){return '<div class="res"><span>'+IRL.esc(s.deck)+'</span><b>'+s.n+' ✓</b></div>';}).join('')+'</div>':'');
  M.onclick=function(e){ const d=e.target.dataset.d; if(!d) return; deckName=d; rReady(); };
}
function rReady(){
  M.innerHTML='<div class="card center"><h2>'+IRL.esc(deckName)+'</h2>'
    +'<div class="muted">Hand the phone to the guesser. When it\\'s on their forehead, anyone taps Start.</div></div>'
    +'<button class="btn" id="go">Start (3·2·1)</button><button class="btn alt" id="back">← Decks</button>';
  document.getElementById('back').onclick=rMenu;
  document.getElementById('go').onclick=async function(){
    try{ if(window.DeviceOrientationEvent&&DeviceOrientationEvent.requestPermission){ orientOK=(await DeviceOrientationEvent.requestPermission())==='granted'; }
      else orientOK=('ondeviceorientation' in window); }catch(e){ orientOK=false; }
    countdown(3);
  };
}
function countdown(n){
  stage.classList.add('on'); stage.className='on';
  document.getElementById('word').textContent=n||'GO!';
  IRL.beep(n?520:880,150);
  if(n>0) setTimeout(function(){countdown(n-1);},800);
  else setTimeout(startRun,500);
}
function startRun(){
  pool=IRL.shuffle(DECKS[deckName]); results=[]; tleft=60; armed=true;
  nextWord();
  timer=setInterval(function(){ tleft--; document.getElementById('stTimer').textContent=tleft;
    if(tleft<=5&&tleft>0) IRL.beep(440,90);
    if(tleft<=0) endRun(); },1000);
}
function nextWord(){ if(!pool.length) pool=IRL.shuffle(DECKS[deckName]); cur=pool.pop(); document.getElementById('word').textContent=cur; }
function mark(hit){
  if(!stage.classList.contains('on')||tleft<=0) return;
  results.push({w:cur,ok:hit}); IRL.beep(hit?880:300,150);
  stage.classList.add(hit?'hit':'pass');
  setTimeout(function(){ stage.className='on'; },220);
  nextWord();
}
function endRun(){
  clearInterval(timer); IRL.beep(200,600); stage.classList.remove('on');
  const n=results.filter(function(r){return r.ok;}).length;
  scores.push({deck:deckName,n:n});
  M.innerHTML='<div class="card center"><h2>'+n+' correct! 🎉</h2></div>'
    +'<div class="card">'+results.map(function(r){return '<div class="res"><span>'+IRL.esc(r.w)+'</span><b>'+(r.ok?'✓':'✗')+'</b></div>';}).join('')+'</div>'
    +'<button class="btn" id="again">Next player, same deck</button><button class="btn alt" id="menu">Change deck</button>';
  document.getElementById('again').onclick=rReady;
  document.getElementById('menu').onclick=rMenu;
}
document.getElementById('zoneUp').addEventListener('pointerdown',function(){mark(false);});
document.getElementById('zoneDown').addEventListener('pointerdown',function(){mark(true);});
window.addEventListener('deviceorientation',function(e){
  if(!stage.classList.contains('on')||e.beta===null) return;
  const b=e.beta; // phone held vertically on forehead ≈ 90
  if(armed){ if(b>140){ armed=false; mark(true); } else if(b<40){ armed=false; mark(false); } }
  else if(b>65&&b<115) armed=true; // back upright → re-arm
});
IRL.init(); rMenu();
</script>`;

  // ================================ THE DIAL =================================
  // One psychic sees a hidden target on a spectrum and gives one clue;
  // the room argues and drags the dial. Telepathy scored 0–4.
  const DIAL_SPECTRUMS = [
    ['Cold food','Hot food'],['Bad superpower','Good superpower'],['Underrated','Overrated'],
    ['Smells bad','Smells good'],['Hard to spell','Easy to spell'],['Scary animal','Cute animal'],
    ['Cheap','Expensive'],['Bad pizza topping','Good pizza topping'],['Quiet','Loud'],
    ['Guilty pleasure','Actually good'],['Useless invention','Useful invention'],['Movie villain','Movie hero'],
    ['Snack','Meal'],['Round','Pointy'],['Bad habit','Good habit'],['Easy to draw','Hard to draw'],
    ['Weird pet','Normal pet'],['Dry','Wet'],['Optional','Mandatory'],['Bad gift','Good gift'],
    ['Sport','Not a sport'],['Sandwich','Not a sandwich'],['Old-timey name','Modern name'],
    ['Needs luck','Needs skill'],['Relaxing','Stressful'],['Comfortable','Stylish'],
    ['Kids’ movie','Grown-up movie'],['Worst chore','Best chore'],['Soft','Crunchy'],
    ['Famous','Obscure'],['Healthy','Delicious'],['Introvert hobby','Extrovert hobby'],
    ['Survives the horror movie','Doomed in the horror movie'],['Breakfast food','Dinner food'],['Whisper','Shout'],
  ];

  const DIAL_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${STYLE('#c65ccc')}
  #dialbox{touch-action:none}
  .ends{display:flex;justify-content:space-between;font-weight:800;margin-top:4px}
</style>
<header>📻 The Dial</header>
<main id="m"></main>
<script>
${PARTY_LIB}
const SPECS=${JSON.stringify(DIAL_SPECTRUMS)};
const M=document.getElementById('m');
let L={ phase:'menu', round:0, total:0, psychic:0 }, names=[], dial=50, dragging=false;

function arc(cx,cy,r,a0,a1){ const p=function(a){ a=Math.PI*(1-a/100); return [cx+r*Math.cos(a),cy-r*Math.sin(a)]; };
  const s=p(a0),e=p(a1);
  return 'M'+cx+' '+cy+' L'+s[0]+' '+s[1]+' A'+r+' '+r+' 0 0 1 '+e[0]+' '+e[1]+' Z'; }
function dialSvg(showTarget){
  const t=L.target;
  let bands='';
  if(showTarget){
    bands=[[t-18,t+18,'#f5cf6e'],[t-12,t+12,'#eda65c'],[t-6,t+6,'#d4703d']].map(function(b){
      const a0=Math.max(0,b[0]),a1=Math.min(100,b[1]);
      return '<path d="'+arc(150,150,140,a0,a1)+'" fill="'+b[2]+'"/>';
    }).join('');
  }
  const na=Math.PI*(1-dial/100);
  return '<svg id="dialbox" viewBox="0 0 300 165" style="width:100%;display:block">'
    +'<path d="'+arc(150,150,140,0,100)+'" fill="#efe9db" stroke="#2b2440" stroke-width="3"/>'
    +bands
    +'<line id="needle" x1="150" y1="150" x2="'+(150+132*Math.cos(na))+'" y2="'+(150-132*Math.sin(na))+'" stroke="#2b2440" stroke-width="6" stroke-linecap="round"/>'
    +'<circle cx="150" cy="150" r="12" fill="#2b2440"/></svg>';
}
function moveNeedle(){ const nd=document.getElementById('needle'); if(!nd) return;
  const na=Math.PI*(1-dial/100);
  nd.setAttribute('x2',150+132*Math.cos(na)); nd.setAttribute('y2',150-132*Math.sin(na)); }
function bindDial(onmove){
  const el=document.getElementById('dialbox'); if(!el) return;
  const set=function(ev){ const r=el.getBoundingClientRect();
    const x=(ev.clientX-r.left)/r.width*300, y=(ev.clientY-r.top)/r.height*165;
    let a=Math.atan2(150-y,x-150); a=Math.max(0,Math.min(Math.PI,a));
    dial=Math.round((1-a/Math.PI)*100); onmove(); };
  el.addEventListener('pointerdown',function(e){ dragging=true; el.setPointerCapture(e.pointerId); set(e); });
  el.addEventListener('pointermove',function(e){ if(dragging) set(e); });
  el.addEventListener('pointerup',function(){ dragging=false; });
}
function rMenu(){
  M.innerHTML='<div class="card"><h2>How in-sync is this room? 🧠</h2>'
    +'<div class="muted">Each round one psychic secretly sees a target on a spectrum and gives ONE clue that sits right there. The room argues and turns the dial. 7 rounds, score the group. 3+ players.</div></div>'
    +'<div class="card"><h2>Who\\'s playing?</h2><div class="chips" id="chips"></div>'
    +'<input type="text" id="nm" placeholder="Add a name, press Enter"></div>'
    +'<button class="btn" id="go" '+(names.length<2?'disabled':'')+'>Start (7 rounds)</button>';
  const chips=document.getElementById('chips');
  chips.innerHTML=names.map(function(n,i){return '<span class="chip" data-i="'+i+'">'+IRL.esc(n)+' ✕</span>';}).join('')||'<span class="muted">No players yet</span>';
  chips.onclick=function(e){ const i=e.target.dataset.i; if(i!==undefined){ names.splice(+i,1); rMenu(); } };
  const nm=document.getElementById('nm');
  nm.onkeydown=function(e){ if(e.key==='Enter'&&nm.value.trim()){ names.push(nm.value.trim()); rMenu(); } };
  document.getElementById('go').onclick=function(){ L={phase:'peek',round:1,total:0,psychic:0}; newTarget(); render(); };
}
function newTarget(){ L.spec=SPECS[Math.floor(Math.random()*SPECS.length)]; L.target=8+Math.floor(Math.random()*84); dial=50; }
function rPeek(){
  const who=names[L.psychic%names.length];
  M.innerHTML='<div class="card center"><h2>Round '+L.round+' of 7</h2>'
    +'<div class="muted"><b>'+IRL.esc(who)+'</b> is the psychic. Everyone else, look away! Psychic: hold to peek at the target, think of ONE clue that sits exactly there, then hide it and say the clue out loud.</div></div>'
    +'<div class="card"><div id="dial">'+dialSvg(false)+'</div>'
    +'<div class="ends"><span>◀ '+IRL.esc(L.spec[0])+'</span><span>'+IRL.esc(L.spec[1])+' ▶</span></div></div>'
    +'<button class="btn alt" id="peek">👁 Hold to peek at the target</button>'
    +'<button class="btn" id="go">Clue given — hand the room the dial</button>';
  const pk=document.getElementById('peek'), dl=document.getElementById('dial');
  const show=function(on){ dl.innerHTML=dialSvg(on); };
  ['pointerdown','touchstart'].forEach(function(ev){ pk.addEventListener(ev,function(e){ e.preventDefault(); show(true); }); });
  ['pointerup','pointerleave','touchend'].forEach(function(ev){ pk.addEventListener(ev,function(){ show(false); }); });
  document.getElementById('go').onclick=function(){ L.phase='guess'; render(); };
}
function rGuess(){
  M.innerHTML='<div class="card center"><h2>🎯 Where does the clue land?</h2>'
    +'<div class="muted">Argue it out, drag the needle, then lock it in.</div></div>'
    +'<div class="card"><div id="dial">'+dialSvg(false)+'</div>'
    +'<div class="ends"><span>◀ '+IRL.esc(L.spec[0])+'</span><span>'+IRL.esc(L.spec[1])+' ▶</span></div></div>'
    +'<button class="btn" id="lock">Lock it in!</button>';
  bindDial(moveNeedle); // needle updates in place — the drag survives
  document.getElementById('lock').onclick=function(){
    const d=Math.abs(dial-L.target);
    L.pts=d<=6?4:d<=12?3:d<=18?2:0; L.total+=L.pts; L.phase='reveal'; render();
  };
}
function rReveal(){
  M.innerHTML='<div class="card center"><h2>'+(L.pts?'+'+L.pts+' points! '+(L.pts===4?'🎯 Bullseye!':''):'0 points 😅')+'</h2></div>'
    +'<div class="card"><div>'+dialSvg(true)+'</div>'
    +'<div class="ends"><span>◀ '+IRL.esc(L.spec[0])+'</span><span>'+IRL.esc(L.spec[1])+' ▶</span></div></div>'
    +'<button class="btn" id="next">'+(L.round>=7?'See the verdict':'Next psychic')+'</button>';
  document.getElementById('next').onclick=function(){
    if(L.round>=7){ L.phase='verdict'; render(); return; }
    L.round++; L.psychic++; newTarget(); L.phase='peek'; render();
  };
}
function rVerdict(){
  const t=L.total;
  const v=t>=21?'🧠✨ SAME BRAIN. Genuinely spooky.':t>=14?'📡 In sync! You people hang out too much.':t>=7?'🌫 Some static on the line…':'📴 Do you even know each other?';
  M.innerHTML='<div class="card center"><h2>'+t+' / 28 points</h2><div class="bigword" style="font-size:24px">'+v+'</div></div>'
    +'<button class="btn" id="again">Play again</button>';
  document.getElementById('again').onclick=function(){ L={phase:'menu',round:0,total:0,psychic:0}; render(); };
}
function render(){ ({menu:rMenu,peek:rPeek,guess:rGuess,reveal:rReveal,verdict:rVerdict})[L.phase](); }
IRL.init(); render();
</script>`;

  // ============================ PARTY ROULETTE ===============================
  // Tap for a card; the deck bosses the room around. Names get pulled in.
  const ROULETTE_CARDS = [
    '{p}, speak in a fancy accent until your next card',
    'Everyone point at the best cook on 3… 1, 2, 3!',
    '{p}, show the last photo in your camera roll — or do 10 jumping jacks',
    'Swap seats with the person across from you, {p}',
    '{p} and {q}: staring contest. Loser tells an embarrassing story',
    'Everyone who has cried at a movie, stand up and own it',
    '{p}, do your best impression of {q} for 15 seconds',
    'Last person to touch the floor owes the group a snack run',
    '{p}, name 5 pizza toppings in 10 seconds — group counts down',
    'Compliment battle: {p} vs {q}. First to laugh loses',
    'Everyone must end sentences with “…allegedly” until the next card',
    '{p}, hum a song until someone guesses it',
    'Group vote on 3: who would survive longest in a zombie movie?',
    '{p}, what’s your most controversial food opinion? Defend it',
    'Talk like a pirate, everyone, until the next card',
    '{p}, tell a two-sentence story starring {q}. Group rates it out of 10',
    'Rock-paper-scissors tournament. Everyone. Right now',
    '{p}, hold a superhero pose until your next card',
    '{p}, guess {q}’s middle name in 3 tries',
    'Everyone born in summer: victory dance, 5 seconds',
    '{p}, say the alphabet backwards from M. One mistake = sing a chorus instead',
    'On 3, point at who texts back the slowest',
    '{p}, trade an accessory with {q} until the game ends',
    'Everyone: 10 seconds of your best slow-motion action scene',
    '{p}, describe your day so far as a movie trailer voiceover',
    'The floor is lava for 10 seconds. Go',
    '{p}, invent a secret handshake with {q}. Perform it twice',
    'Whoever’s phone battery is lowest: dramatic reading of their last text (if they consent!)',
    '{p}, balance something on your head until your next card',
    'Group hum: everyone hums one note together. Harmony or chaos?',
    'On 3, everyone point at who’d win a karaoke contest',
    '{p}, give a 15-second TED talk on socks',
    'Everyone swap seats! Musical chairs rules, no music, one lap',
    '{p}, speak only in questions until your next card. Got it?',
    'High-five chain: {p} starts, must travel the whole room in 10 seconds',
    '{p}, your elbows are now your hands until the next card',
  ];

  const ROULETTE_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${STYLE('#7b5cff')}
  .prompt{font-size:24px;font-weight:800;line-height:1.35;text-align:center;padding:30px 8px;min-height:150px;display:flex;align-items:center;justify-content:center}
  .count{text-align:center;color:#7a7391;font-size:13px}
</style>
<header>🎲 Party Roulette</header>
<main id="m"></main>
<script>
${PARTY_LIB}
const CARDS=${JSON.stringify(ROULETTE_CARDS)};
const M=document.getElementById('m');
let names=[], deck=[], n=0;

function rSetup(){
  M.innerHTML='<div class="card"><h2>The deck is the boss 🎲</h2>'
    +'<div class="muted">Add everyone\\'s name, put the phone in the middle, tap for a card, do what it says. That\\'s it. That\\'s the game.</div></div>'
    +'<div class="card"><h2>Who\\'s in?</h2><div class="chips" id="chips"></div>'
    +'<input type="text" id="nm" placeholder="Add a name, press Enter"></div>'
    +'<button class="btn" id="go" '+(names.length<2?'disabled':'')+'>Shuffle up &amp; deal</button>';
  const chips=document.getElementById('chips');
  chips.innerHTML=names.map(function(x,i){return '<span class="chip" data-i="'+i+'">'+IRL.esc(x)+' ✕</span>';}).join('')||'<span class="muted">No players yet</span>';
  chips.onclick=function(e){ const i=e.target.dataset.i; if(i!==undefined){ names.splice(+i,1); rSetup(); } };
  const nm=document.getElementById('nm');
  nm.onkeydown=function(e){ if(e.key==='Enter'&&nm.value.trim()){ names.push(nm.value.trim()); rSetup(); } };
  document.getElementById('go').onclick=function(){ deck=IRL.shuffle(CARDS); n=0; rCard(); };
}
function fill(c){
  const pool=IRL.shuffle(names);
  return c.replace('{p}','<b>'+IRL.esc(pool[0])+'</b>').replace('{q}','<b>'+IRL.esc(pool[1]||pool[0])+'</b>');
}
function rCard(){
  if(n>=deck.length){ deck=IRL.shuffle(CARDS); n=0; }
  M.innerHTML='<div class="card"><div class="prompt">'+fill(deck[n])+'</div></div>'
    +'<div class="count">card '+(n+1)+'</div>'
    +'<button class="btn" id="next">Next card →</button>'
    +'<button class="btn alt small" id="players">Players</button>';
  n++;
  document.getElementById('next').onclick=rCard;
  document.getElementById('players').onclick=rSetup;
}
IRL.init(); rSetup();
</script>`;

  // ============================ FAKE FACTS ===================================
  // Everyone invents a lie on their own phone; the truth hides among them.
  // Reading the options aloud and watching friends fall for YOUR lie is the game.
  const ABOUT_PROMPTS = [
    'The weirdest thing {s} has ever eaten is ___','{s}’s first celebrity crush was ___',
    'The movie that made {s} cry is ___','{s}’s most-used emoji is ___',
    'The chore {s} secretly enjoys is ___','{s}’s irrational fear is ___',
    'The app {s} wastes the most time on is ___','{s}’s go-to karaoke song is ___',
    'The food {s} refuses to try is ___','{s}’s hidden talent is ___',
    'At age 8, {s} wanted to be ___','The item {s} would grab first in a fire is ___',
    '{s}’s most rewatched show is ___','The word {s} can never spell is ___',
    '{s}’s weirdest habit is ___','The smell {s} loves that others find odd is ___',
    '{s}’s go-to excuse for canceling plans is ___','The thing {s} is always losing is ___',
    '{s}’s dream vacation is ___','{s}’s most controversial opinion is ___',
  ];
  const TRUE_FACTS = [
    ['In Switzerland it is illegal to own just one ___','guinea pig'],
    ['The national animal of Scotland is the ___','unicorn'],
    ['A group of flamingos is called a ___','flamboyance'],
    ['Bananas are technically ___','berries'],
    ['The Eiffel Tower grows about 6 inches taller every ___','summer'],
    ['Astronauts in space cannot ___','cry'],
    ['A shrimp’s heart is located in its ___','head'],
    ['Sea otters sleep holding each other’s ___','paws'],
    ['Wombat poop is shaped like a ___','cube'],
    ['The first thing ever sold on eBay was a broken ___','laser pointer'],
    ['Scotland has 421 words for ___','snow'],
    ['In France it is illegal to name a pig ___','Napoleon'],
    ['Honey is the one food that never ___','spoils'],
    ['An octopus has ___ hearts','three'],
    ['It is impossible for most people to lick their own ___','elbow'],
    ['A bolt of lightning is five times hotter than the surface of the ___','sun'],
  ];

  const FAKEFACTS_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${STYLE('#d4703d')}
  .opt{border:3px solid #2b2440;border-radius:14px;background:#fff;padding:12px 14px;font-weight:700;margin:8px 0;cursor:pointer}
  .opt.sel{background:#d4703d;color:#fff}
  .opt.truth{background:#3ba55d;color:#fff}
  .opt .who{display:block;font-size:12.5px;font-weight:600;margin-top:4px;opacity:.85}
  .waitbar{font-weight:800;text-align:center;margin:6px 0}
</style>
<header>🤥 Fake Facts</header>
<main id="m"></main>
<script>
${PARTY_LIB}
const ABOUT=${JSON.stringify(ABOUT_PROMPTS)};
const FACTS=${JSON.stringify(TRUE_FACTS)};
const M=document.getElementById('m');
let myPick=null;

function start(mode){
  const ids=IRL.players.map(function(p){return p.id.slice(2);});
  const names=IRL.players.map(function(p){return p.name;});
  IRL.save({ phase:'write', mode:mode, round:0, ids:ids, names:names,
    seed:Math.floor(Math.random()*1e9), scores:{}, order:IRL.shuffle(ids) });
}
function promptFor(g){
  if(g.mode==='about'){ const s=g.names[g.ids.indexOf(g.order[g.round%g.ids.length])];
    return IRL.seededShuffle(ABOUT,g.seed)[g.round%ABOUT.length].replace('{s}','<b>'+IRL.esc(s)+'</b>'); }
  return IRL.esc(IRL.seededShuffle(FACTS,g.seed)[g.round%FACTS.length][0]);
}
function truthOf(g){
  if(g.mode==='about'){ const t=IRL.docs('t',g.round)[0]; return t?t.text:null; }
  return IRL.seededShuffle(FACTS,g.seed)[g.round%FACTS.length][1];
}
function subjectId(g){ return g.mode==='about' ? g.order[g.round%g.ids.length] : null; }
function writersOf(g){ const s=subjectId(g); return g.ids.filter(function(id){ return id!==s; }); }
function options(g){
  const truth=truthOf(g); if(truth===null) return null;
  const opts=[{k:'t',text:truth,authors:[]}];
  IRL.docs('f',g.round).forEach(function(f){
    const pid=f.id.split('_')[1];
    if(IRL.norm(f.text)===IRL.norm(truth)){ return; } // a fake that IS the truth folds into it
    const dup=opts.find(function(o){ return o.k!=='t'&&IRL.norm(o.text)===IRL.norm(f.text); });
    if(dup){ dup.authors.push(pid); } else opts.push({k:pid,text:f.text,authors:[pid]});
  });
  return IRL.seededShuffle(opts, g.seed+g.round*7+1);
}
function nameOf(g,pid){ return g.names[g.ids.indexOf(pid)]||'?'; }
function scoreTable(g){ const sc=g.scores||{}; const ks=g.ids.slice().sort(function(a,b){return (sc[b]||0)-(sc[a]||0);});
  return '<div class="card"><h2>Scores</h2><table class="scores">'+ks.map(function(k){return '<tr><td>'+IRL.esc(nameOf(g,k))+'</td><td><b>'+(sc[k]||0)+'</b></td></tr>';}).join('')+'</table></div>'; }

function render(){
  const g=IRL.g;
  if(!g||!g.phase||g.phase==='lobby'){
    M.innerHTML=IRL.lobby(3,'The truth is hiding among your lies 🤥',
      'A question appears on every phone. Everyone secretly types a convincing FAKE answer, then all answers (plus the real one) show up on all phones — read them aloud, vote, and cackle at who fell for whose lie.','Pick a mode to start')
      +'<div class="card"><h2>Mode</h2>'
      +'<button class="btn alt" id="mAbout">🫵 About Us — the truth comes from YOU (one round per player)</button>'
      +'<button class="btn alt" id="mFacts">🌍 Weird But True — real trivia, unbelievable answers</button></div>';
    const st=document.getElementById('start'); if(st) st.style.display='none'; // the mode buttons ARE the start
    document.getElementById('mAbout').onclick=function(){ if(IRL.players.length>=3) start('about'); };
    document.getElementById('mFacts').onclick=function(){ if(IRL.players.length>=3) start('facts'); };
    IRL.bindLobby(function(){});
    return;
  }
  const meId=IRL.me.id, subj=subjectId(g);
  if(g.phase==='write'){
    myPick=null;
    const fakes=IRL.docs('f',g.round), truthDoc=IRL.docs('t',g.round)[0];
    const need=writersOf(g).length, have=fakes.length;
    const allIn=have>=need && (g.mode!=='about'||!!truthDoc);
    let html='<div class="card"><h2>Round '+(g.round+1)+'</h2><div class="bigword" style="font-size:22px">'+promptFor(g)+'</div></div>';
    const iWrote=fakes.some(function(f){return f.id==='f'+g.round+'_'+meId;});
    if(meId===subj){
      html+= truthDoc?'<div class="card center"><h2>✅ Truth locked in</h2><div class="muted">Now look innocent while they write lies about you.</div></div>'
        :'<div class="card"><h2>You\\'re the subject! Type the TRUE answer</h2><input type="text" id="inp" maxlength="60"><button class="btn" id="sub">Lock in the truth</button></div>';
    } else if(!iWrote){
      html+='<div class="card"><h2>Type a convincing FAKE answer</h2><input type="text" id="inp" maxlength="60"><button class="btn" id="sub">Submit my lie</button></div>';
    } else {
      html+='<div class="card center"><h2>😇 Lie submitted</h2><div class="muted">Keep a straight face.</div></div>';
    }
    html+='<div class="waitbar">'+have+'/'+need+' lies in'+(g.mode==='about'?(truthDoc?' · truth in':' · waiting for the truth'):'')+'</div>';
    if(allIn) html+='<button class="btn" id="toVote">Everyone\\'s in → show the ballot</button>';
    IRL.setHtml(M, html+scoreTable(g));
    const sub=document.getElementById('sub');
    if(sub) sub.onclick=function(){
      const v=document.getElementById('inp').value.trim(); if(!v) return;
      if(meId===subj){ IRL.put({id:'t'+g.round,text:v}); return; }
      const tr=truthOf(g);
      if(tr!==null&&IRL.norm(v)===IRL.norm(tr)){ alert('Ooh — too close to the truth! Try a different lie.'); return; }
      IRL.put({id:'f'+g.round+'_'+meId,text:v});
    };
    const tv=document.getElementById('toVote');
    if(tv) tv.onclick=function(){ IRL.save(Object.assign({},g,{phase:'vote'})); };
    if(allIn&&IRL.coordinator(g)) IRL.save(Object.assign({},g,{phase:'vote'}));
  } else if(g.phase==='vote'){
    const opts=options(g)||[];
    const votes=IRL.docs('v',g.round);
    const voters=g.mode==='about'?writersOf(g):g.ids;
    const canVote=voters.indexOf(meId)>=0;
    const mine=votes.find(function(v){return v.id==='v'+g.round+'_'+meId;});
    let html='<div class="card"><h2>🗣 Read these aloud… which is TRUE?</h2><div class="muted">'+promptFor(g)+'</div></div>';
    html+=opts.map(function(o,i){
      const isMine=o.authors.indexOf(meId)>=0;
      const sel=mine&&mine.k===o.k;
      return '<div class="opt'+(sel?' sel':'')+'" data-k="'+IRL.esc(o.k)+'">'+IRL.esc(o.text)
        +(isMine?'<span class="who">(that\\'s your lie — can\\'t vote for it)</span>':'')+'</div>';
    }).join('');
    html+='<div class="waitbar">'+votes.length+'/'+voters.length+' votes in</div>';
    if(votes.length>=voters.length) html+='<button class="btn" id="rev">🥁 The big reveal</button>';
    M.innerHTML=html+scoreTable(g);
    if(canVote&&!g.revealed) M.querySelectorAll('.opt').forEach(function(el){
      el.onclick=function(){ const k=el.dataset.k;
        const o=opts.find(function(x){return x.k===k;});
        if(o&&o.authors.indexOf(meId)>=0){ IRL.beep(220,150); return; }
        IRL.put({id:'v'+g.round+'_'+meId,k:k}); };
    });
    const rv=document.getElementById('rev');
    if(rv) rv.onclick=function(){ advance(g); };
    if(votes.length>=voters.length&&IRL.coordinator(g)) advance(g);
  } else if(g.phase==='reveal'){
    const opts=options(g)||[];
    const votes=IRL.docs('v',g.round);
    let html='<div class="card"><h2>The truth comes out 🎉</h2></div>';
    opts.forEach(function(o){
      const fooled=votes.filter(function(v){return v.k===o.k;}).map(function(v){return nameOf(g,v.id.split('_')[1]);});
      if(o.k==='t') html+='<div class="opt truth">'+IRL.esc(o.text)+'<span class="who">✅ THE TRUTH — found by: '+(fooled.join(', ')||'nobody!')+'</span></div>';
      else html+='<div class="opt">'+IRL.esc(o.text)+'<span class="who">🤥 '+o.authors.map(function(a){return IRL.esc(nameOf(g,a));}).join(' & ')+' fooled: '+(fooled.join(', ')||'no one')+'</span></div>';
    });
    const last=g.mode==='about'?g.round+1>=g.ids.length:g.round+1>=8;
    html+='<button class="btn" id="next">'+(last?'Final scores':'Next round')+'</button>';
    M.innerHTML=html+scoreTable(g);
    document.getElementById('next').onclick=function(){
      if(last){ IRL.save(Object.assign({},g,{phase:'end'})); }
      else IRL.save(Object.assign({},g,{phase:'write',round:g.round+1}));
    };
  } else if(g.phase==='end'){
    const sc=g.scores||{}; const ks=g.ids.slice().sort(function(a,b){return (sc[b]||0)-(sc[a]||0);});
    M.innerHTML='<div class="card center"><h2>🏆 '+IRL.esc(nameOf(g,ks[0]))+' is the smoothest liar</h2></div>'+scoreTable(g)
      +'<button class="btn" id="again">Back to the lobby</button>';
    document.getElementById('again').onclick=function(){ IRL.save({phase:'lobby'}); };
  }
}
// tally votes into scores exactly once, on the vote→reveal transition
function advance(g){
  if(g.phase!=='vote') return;
  const opts=options(g)||[], votes=IRL.docs('v',g.round);
  const sc=Object.assign({},g.scores||{});
  votes.forEach(function(v){
    const voter=v.id.split('_')[1];
    const o=opts.find(function(x){return x.k===v.k;});
    if(!o) return;
    if(o.k==='t'){ sc[voter]=(sc[voter]||0)+1000; }
    else o.authors.forEach(function(a){ if(a!==voter) sc[a]=(sc[a]||0)+500; });
  });
  IRL.save(Object.assign({},g,{phase:'reveal',scores:sc}));
}
IRL.onchange=render;
IRL.init().then(render); render();
</script>`;

  // ============================ ONE CLUE =====================================
  // Cooperative: everyone secretly writes ONE one-word clue; duplicates
  // vanish before the guesser sees them. Four people writing "banana" is the game.
  const ONECLUE_WORDS = ['Pirate','Chocolate','Rainbow','Dentist','Volcano','Paris','Guitar','Penguin','Birthday','Shadow','Honey','Astronaut','Pillow','Thunder','Circus','Spaghetti','Diamond','Robot','Beach','Winter','Magician','Bridge','Cactus','Whisper','Trophy','Jungle','Clock','Marshmallow','Lighthouse','Karate'];

  const ONECLUE_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${STYLE('#3ba5a0')}
  .clue{display:inline-block;border:3px solid #2b2440;border-radius:12px;background:#fff;padding:8px 14px;font-weight:800;font-size:19px;margin:4px}
  .clue.dead{opacity:.4;text-decoration:line-through;background:#eee}
  .waitbar{font-weight:800;text-align:center;margin:6px 0}
</style>
<header>💡 One Clue</header>
<main id="m"></main>
<script>
${PARTY_LIB}
const WORDS=${JSON.stringify(ONECLUE_WORDS)};
const M=document.getElementById('m');

function start(){
  const ids=IRL.players.map(function(p){return p.id.slice(2);});
  const names=IRL.players.map(function(p){return p.name;});
  IRL.save({ phase:'clue', ids:ids, names:names, seed:Math.floor(Math.random()*1e9),
    turn:0, round:0, idx:0, score:0, results:[] });
}
function deck(g){ return IRL.seededShuffle(WORDS,g.seed).slice(0,13); }
function guesserId(g){ return g.ids[g.turn%g.ids.length]; }
function nameOf(g,pid){ return g.names[g.ids.indexOf(pid)]||'?'; }
function clueDocs(g){ return IRL.docs('c',g.round); }
function surviving(g){
  const cs=clueDocs(g).map(function(c){ return {pid:c.id.split('_')[1], text:c.text, n:IRL.norm(c.text)}; });
  cs.forEach(function(c){ c.dead=cs.some(function(o){ return o!==c&&o.n===c.n; }); });
  return cs;
}
function render(){
  const g=IRL.g;
  if(!g||!g.phase||g.phase==='lobby'){
    M.innerHTML=IRL.lobby(3,'One word each. No collisions. 💡',
      'The whole room sees a mystery word — except the guesser. Everyone secretly writes ONE one-word clue on their phone… and identical clues CANCEL OUT before the guesser sees them. You win or lose together: 13 words.','Start the 13 words');
    IRL.bindLobby(function(){ if(IRL.players.length>=3) start(); });
    return;
  }
  const meId=IRL.me.id, word=deck(g)[g.idx], gsr=guesserId(g), isGuesser=meId===gsr;
  const progress='<div class="waitbar">Word '+(g.idx+1)+'/13 · team score '+g.score+'</div>';
  if(g.phase==='clue'){
    const cs=clueDocs(g), need=g.ids.length-1;
    const iWrote=cs.some(function(c){return c.id==='c'+g.round+'_'+meId;});
    let html='<div class="card center"><h2>'+IRL.esc(nameOf(g,gsr))+' is guessing</h2>'+progress+'</div>';
    if(isGuesser){
      html+='<div class="card center"><h2>🙈 Eyes on your friends, not their phones</h2><div class="muted">They\\'re writing clues for you… '+cs.length+'/'+need+' in.</div></div>';
    } else {
      html+='<div class="card"><h2>The word is</h2><div class="bigword">'+IRL.esc(word)+'</div>'
        +(iWrote?'<div class="muted center">Clue locked in ('+cs.length+'/'+need+'). If someone wrote the same one, both vanish!</div>'
                :'<h2>Your ONE one-word clue</h2><input type="text" id="inp" maxlength="24"><button class="btn" id="sub">Lock it in</button>')+'</div>';
    }
    if(cs.length>=need) html+='<button class="btn" id="show">All clues in → show the guesser</button>';
    IRL.setHtml(M, html);
    const sub=document.getElementById('sub');
    if(sub) sub.onclick=function(){ const v=document.getElementById('inp').value.trim().split(/\\s+/)[0];
      if(!v) return; if(IRL.norm(v)===IRL.norm(word)){ alert('That IS the word — nice try 😄'); return; }
      IRL.put({id:'c'+g.round+'_'+meId,text:v}); };
    const sh=document.getElementById('show');
    if(sh) sh.onclick=function(){ IRL.save(Object.assign({},g,{phase:'guess'})); };
    if(clueDocs(g).length>=need&&IRL.coordinator(g)) IRL.save(Object.assign({},g,{phase:'guess'}));
  } else if(g.phase==='guess'){
    const cs=surviving(g);
    let html='<div class="card center"><h2>'+(isGuesser?'Your clues — say your guess OUT LOUD':'The clues '+IRL.esc(nameOf(g,gsr))+' can see')+'</h2>'+progress+'</div><div class="card center">';
    cs.forEach(function(c){
      if(isGuesser){ if(!c.dead) html+='<span class="clue">'+IRL.esc(c.text)+'</span>'; }
      else html+='<span class="clue'+(c.dead?' dead':'')+'">'+IRL.esc(c.text)+'</span>';
    });
    if(isGuesser&&!cs.some(function(c){return !c.dead;})) html+='<div class="muted">…every clue cancelled out. Ouch. Good luck!</div>';
    if(!isGuesser) html+='<div class="muted" style="margin-top:8px">Word: <b>'+IRL.esc(word)+'</b> · struck clues cancelled out</div>';
    html+='</div>';
    if(!isGuesser){
      html+='<div class="card"><h2>Did they get it?</h2>'
        +'<button class="btn" id="ok">✅ Correct (+1)</button>'
        +'<button class="btn alt" id="skip">⏭ They passed (lose this word)</button>'
        +'<button class="btn alt" id="no">❌ Wrong (lose this word AND the next)</button></div>';
    }
    M.innerHTML=html;
    const done=function(delta,pts){ return function(){
      const idx=g.idx+delta, score=g.score+pts;
      if(idx>=13) IRL.save(Object.assign({},g,{phase:'end',idx:Math.min(idx,13),score:score}));
      else IRL.save(Object.assign({},g,{phase:'clue',idx:idx,score:score,turn:g.turn+1,round:g.round+1}));
    };};
    const ok=document.getElementById('ok'); if(ok){ ok.onclick=done(1,1);
      document.getElementById('skip').onclick=done(1,0);
      document.getElementById('no').onclick=done(2,0); }
  } else if(g.phase==='end'){
    const s=g.score;
    const band=s>=13?'PERFECT. Frame this.':s>=12?'Amazing!':s>=10?'Great minds!':s>=7?'Solid team.':s>=4?'Not bad…':'Try again — with more coffee.';
    M.innerHTML='<div class="card center"><h2>'+s+' / 13</h2><div class="bigword" style="font-size:24px">'+band+'</div></div>'
      +'<button class="btn" id="again">Play again</button>';
    document.getElementById('again').onclick=function(){ IRL.save({phase:'lobby'}); };
  }
}
IRL.onchange=render;
IRL.init().then(render); render();
</script>`;

  // ============================ SAME BRAIN ===================================
  // Type what the MAJORITY will type. Lone weird answer = the Pink Cow,
  // and you cannot win while you hold the cow.
  const SAMEBRAIN_QS = [
    'Name a food that’s better the next day','The best pizza topping','A famous wizard',
    'The worst chore','An animal you’d hate to be chased by','The best superpower',
    'A fruit that doesn’t belong in fruit salad','The best decade for music','Something you always lose',
    'The best movie snack','A sport that’s boring to watch','The scariest room in a house at night',
    'The best day of the week','An instrument that’s annoying to live with','Something you shouldn’t microwave',
    'The best holiday','A job that deserves more money','The best sauce for fries',
    'An animal that would be rude if it could talk','The most useless school subject as an adult',
    'The best breakfast food','Something everyone pretends to understand','The best age to be',
    'A word that’s fun to say','The best ice cream flavor','The most overrated fast food chain',
    'The best board game','Something you’d grab first in a fire (besides people or pets)',
  ];

  const SAMEBRAIN_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${STYLE('#e05c8a')}
  .grp{border:3px solid #2b2440;border-radius:14px;background:#fff;padding:10px 14px;margin:8px 0}
  .grp.win{background:#ffe3ee;border-color:#e05c8a}
  .grp b{font-size:18px}
  .grp .who{display:block;font-size:13px;color:#7a7391}
  .cow{background:#ffd7e6;border:3px solid #2b2440;border-radius:14px;padding:10px 14px;font-weight:800;margin:8px 0;text-align:center}
  .waitbar{font-weight:800;text-align:center;margin:6px 0}
</style>
<header>🐮 Same Brain</header>
<main id="m"></main>
<script>
${PARTY_LIB}
const QS=${JSON.stringify(SAMEBRAIN_QS)};
const M=document.getElementById('m');

function start(){
  const ids=IRL.players.map(function(p){return p.id.slice(2);});
  const names=IRL.players.map(function(p){return p.name;});
  IRL.save({ phase:'answer', ids:ids, names:names, seed:Math.floor(Math.random()*1e9),
    round:0, scores:{}, cow:null });
}
function q(g){ return IRL.seededShuffle(QS,g.seed)[g.round%QS.length]; }
function nameOf(g,pid){ return g.names[g.ids.indexOf(pid)]||'?'; }
function grouped(g){
  const as=IRL.docs('a',g.round).map(function(a){ return {pid:a.id.split('_')[1], text:a.text, n:IRL.norm(a.text)}; });
  const map={};
  as.forEach(function(a){ (map[a.n]=map[a.n]||[]).push(a); });
  const groups=Object.keys(map).map(function(k){ return map[k]; });
  groups.sort(function(x,y){ return y.length-x.length; });
  return groups;
}
function outcome(g){
  const groups=grouped(g);
  const top=groups.length?groups[0].length:0;
  const winners=(top>1&&groups.filter(function(gr){return gr.length===top;}).length===1)?groups[0]:[];
  const solos=groups.filter(function(gr){return gr.length===1;});
  const cow=(solos.length===1&&groups.length>1)?solos[0][0].pid:null;
  return { groups:groups, winners:winners, cow:cow };
}
function scoreTable(g){ const sc=g.scores||{}; const ks=g.ids.slice().sort(function(a,b){return (sc[b]||0)-(sc[a]||0);});
  return '<div class="card"><h2>🐄 Herd points (first to 8 wins — unless you hold the Pink Cow)</h2><table class="scores">'
    +ks.map(function(k){return '<tr><td>'+IRL.esc(nameOf(g,k))+(g.cow===k?' 🩷🐮':'')+'</td><td><b>'+(sc[k]||0)+'</b></td></tr>';}).join('')+'</table></div>'; }

function render(){
  const g=IRL.g;
  if(!g||!g.phase||g.phase==='lobby'){
    M.innerHTML=IRL.lobby(3,'Think like the herd 🐮',
      'A question shows on every phone; everyone secretly types what they think MOST people will type. Match the majority to score. The one player left alone with a weird answer gets the Pink Cow — and you can\\'t win while you\\'re holding it.','Start mooing');
    IRL.bindLobby(function(){ if(IRL.players.length>=3) start(); });
    return;
  }
  const meId=IRL.me.id;
  if(g.phase==='answer'){
    const as=IRL.docs('a',g.round);
    const iWrote=as.some(function(a){return a.id==='a'+g.round+'_'+meId;});
    let html='<div class="card"><h2>Round '+(g.round+1)+'</h2><div class="bigword" style="font-size:24px">'+IRL.esc(q(g))+'</div>'
      +(iWrote?'<div class="muted center">Locked in. Stare at your friends menacingly.</div>'
              :'<input type="text" id="inp" maxlength="40" placeholder="What will the HERD say?"><button class="btn" id="sub">Lock it in</button>')+'</div>'
      +'<div class="waitbar">'+as.length+'/'+g.ids.length+' answers in</div>';
    if(as.length>=g.ids.length) html+='<button class="btn" id="rev">🐄 Stampede! (reveal)</button>';
    IRL.setHtml(M, html+scoreTable(g));
    const sub=document.getElementById('sub');
    if(sub) sub.onclick=function(){ const v=document.getElementById('inp').value.trim(); if(v) IRL.put({id:'a'+g.round+'_'+meId,text:v}); };
    const rv=document.getElementById('rev');
    if(rv) rv.onclick=function(){ reveal(g); };
    if(as.length>=g.ids.length&&IRL.coordinator(g)) reveal(g);
  } else if(g.phase==='reveal'){
    const o=outcome(g);
    let html='<div class="card"><h2>'+IRL.esc(q(g))+'</h2></div>';
    o.groups.forEach(function(gr){
      const win=o.winners===gr;
      html+='<div class="grp'+(win?' win':'')+'"><b>'+IRL.esc(gr[0].text)+'</b> ×'+gr.length+(win?' 🏆 +1':'')
        +'<span class="who">'+gr.map(function(a){return IRL.esc(nameOf(g,a.pid));}).join(', ')+'</span></div>';
    });
    if(o.cow) html+='<div class="cow">🩷🐮 The Pink Cow moos over to '+IRL.esc(nameOf(g,o.cow))+' — all alone with that answer</div>';
    if(!o.winners.length) html+='<div class="muted center">Tie for the biggest herd — nobody scores!</div>';
    html+='<button class="btn" id="next">Next question</button>';
    M.innerHTML=html+scoreTable(g);
    document.getElementById('next').onclick=function(){
      const sc=Object.assign({},g.scores||{});
      o.winners.forEach(function(a){ sc[a.pid]=(sc[a.pid]||0)+1; });
      const cow=o.cow||g.cow;
      const champ=g.ids.find(function(id){ return (sc[id]||0)>=8&&cow!==id; });
      if(champ) IRL.save(Object.assign({},g,{phase:'won',scores:sc,cow:cow,champ:champ}));
      else IRL.save(Object.assign({},g,{phase:'answer',round:g.round+1,scores:sc,cow:cow}));
    };
  } else if(g.phase==='won'){
    M.innerHTML='<div class="card center"><h2>🏆 '+IRL.esc(nameOf(g,g.champ))+' thinks like everyone!</h2><div class="muted">Which is a compliment. Probably.</div></div>'
      +scoreTable(g)+'<button class="btn" id="again">Play again</button>';
    document.getElementById('again').onclick=function(){ IRL.save({phase:'lobby'}); };
  }
}
// reveal is a pure phase flip; scoring happens once on "Next question"
function reveal(g){ if(g.phase==='answer') IRL.save(Object.assign({},g,{phase:'reveal'})); }
IRL.onchange=render;
IRL.init().then(render); render();
</script>`;

  // ========================== ONE NIGHT WOLVES ===============================
  // Roles dealt silently to each phone, one secret night action each, five
  // loud minutes of accusations, one vote. No moderator, no elimination.
  const WOLVES_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${STYLE('#5a4a8a')}
  body{background:#221d33;color:#efe9db}
  .card{background:#2e2745;border-color:#0f0c1a;color:#efe9db;box-shadow:0 4px 0 rgba(0,0,0,.35)}
  .muted{color:#a99ec7}
  .role{background:#0f0c1a;color:#fff;border-radius:16px;padding:22px 16px;text-align:center;margin:10px 0}
  .role .r{font-size:26px;font-weight:900;min-height:36px}
  .pick{border:3px solid #0f0c1a;border-radius:12px;background:#3a3157;color:#efe9db;padding:10px 12px;font-weight:700;margin:6px 0;cursor:pointer}
  .pick.sel{background:#8a6bd6}
  .waitbar{font-weight:800;text-align:center;margin:6px 0}
  .timer{color:#f5cf6e}
  input[type=text]{background:#3a3157;color:#efe9db;border-color:#0f0c1a}
  table{width:100%;border-collapse:collapse}
  td{padding:5px 8px;border-bottom:1px solid #3a3157}
</style>
<header>🌙 One Night Wolves</header>
<main id="m"></main>
<script>
${PARTY_LIB}
const M=document.getElementById('m');
const ORDER=['Werewolf','Seer','Robber','Troublemaker','Insomniac'];
const DESC={
  Werewolf:'You know the other wolf. Survive the vote — lie, deflect, accuse!',
  Seer:'You peeked at the truth. Share it… or someone claiming to be you is lying.',
  Robber:'You stole a card in the night — you ARE that role now. The old you? Someone else\\'s problem.',
  Troublemaker:'You swapped two OTHER players\\' cards. They don\\'t know. Watch the chaos.',
  Insomniac:'You woke at dawn and checked your own card — the only player who KNOWS what they are now.',
  Villager:'Plain villager. Your weapon is logic (and yelling).',
  Hunter:'If the group votes you out, whoever YOU voted for goes down with you.',
};
function buildRoles(n){
  const roles=['Werewolf','Werewolf','Seer','Robber','Troublemaker','Villager','Villager'];
  const extras=['Insomniac','Hunter','Villager','Villager','Villager','Villager'];
  for(let i=0;i<n-4;i++) roles.push(extras[i]);
  return roles;
}
function start(){
  const ids=IRL.players.map(function(p){return p.id.slice(2);});
  const names=IRL.players.map(function(p){return p.name;});
  const seed=Math.floor(Math.random()*1e9);
  IRL.save({ phase:'night', ids:ids, names:names, seed:seed, round:(IRL.g&&IRL.g.round||0)+1,
    deal:IRL.seededShuffle(buildRoles(ids.length),seed), scores:(IRL.g&&IRL.g.scores)||{} });
}
function myIdx(g){ return g.ids.indexOf(IRL.me.id); }
function nameOf(g,i){ return g.names[i]||'?'; }
function acts(g){ return IRL.docs('a',g.round); }
function actOf(g,i){ return acts(g).find(function(a){ return a.id==='a'+g.round+'_'+g.ids[i]; })||null; }
function idxOfRole(g,role){ for(let i=0;i<g.ids.length;i++) if(g.deal[i]===role) return i; return -1; }
// robber then troublemaker swaps, applied to the dealt cards
function finalRoles(g){
  const fr=g.deal.slice();
  const ri=idxOfRole(g,'Robber');
  if(ri>=0){ const a=actOf(g,ri); if(a&&typeof a.target==='number'){ const t=fr[a.target]; fr[a.target]=fr[ri]; fr[ri]=t; } }
  const ti=idxOfRole(g,'Troublemaker');
  if(ti>=0){ const a=actOf(g,ti); if(a&&typeof a.a==='number'){ const t=fr[a.a]; fr[a.a]=fr[a.b]; fr[a.b]=t; } }
  return fr;
}
function swapsDone(g){
  return ['Robber','Troublemaker'].every(function(r){ const i=idxOfRole(g,r); return i<0||!!actOf(g,i); });
}
function myNightInfo(g){
  const i=myIdx(g), role=g.deal[i], a=actOf(g,i);
  if(role==='Werewolf'){ const others=[]; for(let j=0;j<g.ids.length;j++) if(j!==i&&g.deal[j]==='Werewolf') others.push(nameOf(g,j));
    let s=others.length?('Your fellow wolf: '+others.join(', ')):'You are the LONE wolf.';
    if(a&&typeof a.peek==='number') s+=' Center card '+(a.peek+1)+' was: '+g.deal[g.ids.length+a.peek]+'.';
    return s; }
  if(role==='Seer'&&a){ if(typeof a.player==='number') return nameOf(g,a.player)+' was dealt: '+g.deal[a.player]+'.';
    if(a.center) return 'Center cards '+(a.center[0]+1)+' & '+(a.center[1]+1)+': '+g.deal[g.ids.length+a.center[0]]+' & '+g.deal[g.ids.length+a.center[1]]+'.'; }
  if(role==='Robber'&&a&&typeof a.target==='number') return 'You stole from '+nameOf(g,a.target)+' — you are now: '+g.deal[a.target]+'.';
  if(role==='Troublemaker'&&a&&typeof a.a==='number') return 'You swapped '+nameOf(g,a.a)+' and '+nameOf(g,a.b)+'.';
  if(role==='Insomniac') return swapsDone(g)?('At dawn your card reads: '+finalRoles(g)[i]+'.'):'(waiting for dawn…)';
  return 'You slept like a rock.';
}
function scoreTable(g){ const sc=g.scores||{}; if(!Object.keys(sc).length) return '';
  const ks=g.ids.slice().sort(function(a,b){return (sc[b]||0)-(sc[a]||0);});
  return '<div class="card"><h2>Wins</h2><table>'+ks.map(function(k,i){return '<tr><td>'+IRL.esc(g.names[g.ids.indexOf(k)])+'</td><td><b>'+(sc[k]||0)+'</b></td></tr>';}).join('')+'</table></div>'; }

let dayInt=null;
function render(){
  clearInterval(dayInt);
  const g=IRL.g;
  if(!g||!g.phase||g.phase==='lobby'){
    M.innerHTML=IRL.lobby(4,'One night. One vote. No mercy. 🌙',
      'Each phone secretly receives a role — two players are werewolves. Everyone does one hidden night action on their own phone, then FIVE minutes of loud accusations in the room, then a vote. Village wins if a wolf goes down. Roles may have been SWAPPED in the night… even yours.','Deal the roles');
    IRL.bindLobby(function(){ if(IRL.players.length>=4) start(); });
    return;
  }
  const i=myIdx(g), role=i>=0?g.deal[i]:null, n=g.ids.length;
  if(g.phase==='night'){
    const done=acts(g).length, mine=i>=0?actOf(g,i):true;
    let html='<div class="card center"><h2>🌙 Night falls — total silence</h2><div class="muted">Do your night action below. Nobody talks until dawn.</div></div>'
      +'<div class="role"><div class="muted" style="color:#888">Hold to peek — your secret role</div><div class="r" id="r">·····</div></div>';
    if(i<0){ html+='<div class="card center"><div class="muted">You\\'re watching this one.</div></div>'; }
    else if(mine){ html+='<div class="card center"><h2>😴 Action done</h2><div class="muted">'+IRL.esc(myNightInfo(g))+'</div></div>'; }
    else if(role==='Werewolf'){
      const others=g.deal.slice(0,n).filter(function(r,j){return j!==i&&r==='Werewolf';}).length;
      html+='<div class="card"><h2>'+(others?'You know your pack. Sleep.':'Lone wolf — peek at one center card?')+'</h2>';
      if(!others) html+='[0,1,2]'.replace('[0,1,2]', [0,1,2].map(function(c){return '<button class="pick" data-peek="'+c+'">Center card '+(c+1)+'</button>';}).join(''));
      html+='<button class="btn" id="sleep">'+(others?'Back to sleep':'Skip the peek')+'</button></div>';
    }
    else if(role==='Seer'){
      html+='<div class="card"><h2>Peek at one player…</h2>'+g.names.map(function(nm,j){ return j===i?'':'<button class="pick" data-player="'+j+'">'+IRL.esc(nm)+'</button>'; }).join('')
        +'<h2>…or two center cards</h2>'
        +[[0,1],[0,2],[1,2]].map(function(p){return '<button class="pick" data-c="'+p[0]+p[1]+'">Cards '+(p[0]+1)+' & '+(p[1]+1)+'</button>';}).join('')+'</div>';
    }
    else if(role==='Robber'){
      html+='<div class="card"><h2>Steal someone\\'s role</h2>'+g.names.map(function(nm,j){ return j===i?'':'<button class="pick" data-rob="'+j+'">'+IRL.esc(nm)+'</button>'; }).join('')+'</div>';
    }
    else if(role==='Troublemaker'){
      html+='<div class="card"><h2>Swap two OTHER players (tap two)</h2><div id="tm">'+g.names.map(function(nm,j){ return j===i?'':'<button class="pick" data-tm="'+j+'">'+IRL.esc(nm)+'</button>'; }).join('')+'</div></div>';
    }
    else { // Villager, Hunter, Insomniac
      html+='<div class="card center"><div class="muted">'+(role==='Insomniac'?'You\\'ll check your card at dawn.':'Nothing to do tonight.')+'</div><button class="btn" id="sleep">😴 Sleep</button></div>';
    }
    html+='<div class="waitbar">'+done+'/'+n+' asleep</div>';
    const allIn=done>=n;
    if(allIn) html+='<button class="btn" id="dawn">🌅 Dawn breaks — wake up!</button>';
    M.innerHTML=html;
    const r=document.getElementById('r');
    ['pointerdown','touchstart'].forEach(function(ev){ r.parentElement.addEventListener(ev,function(e){ e.preventDefault(); r.textContent=role||'(spectator)'; }); });
    ['pointerup','pointerleave','touchend'].forEach(function(ev){ r.parentElement.addEventListener(ev,function(){ r.textContent='·····'; }); });
    const submit=function(v){ IRL.put(Object.assign({id:'a'+g.round+'_'+IRL.me.id},v)); };
    const sleep=document.getElementById('sleep'); if(sleep) sleep.onclick=function(){ submit({}); };
    M.querySelectorAll('[data-peek]').forEach(function(el){ el.onclick=function(){ submit({peek:+el.dataset.peek}); }; });
    M.querySelectorAll('[data-player]').forEach(function(el){ el.onclick=function(){ submit({player:+el.dataset.player}); }; });
    M.querySelectorAll('[data-c]').forEach(function(el){ el.onclick=function(){ submit({center:[+el.dataset.c[0],+el.dataset.c[1]]}); }; });
    M.querySelectorAll('[data-rob]').forEach(function(el){ el.onclick=function(){ submit({target:+el.dataset.rob}); }; });
    let tmSel=[];
    M.querySelectorAll('[data-tm]').forEach(function(el){ el.onclick=function(){
      el.classList.toggle('sel');
      const j=+el.dataset.tm;
      if(tmSel.indexOf(j)>=0) tmSel=tmSel.filter(function(x){return x!==j;}); else tmSel.push(j);
      if(tmSel.length===2) submit({a:tmSel[0],b:tmSel[1]});
    }; });
    const dawn=document.getElementById('dawn');
    if(dawn) dawn.onclick=function(){ IRL.save(Object.assign({},g,{phase:'day',dayEnds:Date.now()+5*60000})); };
    if(allIn&&IRL.coordinator(g)) IRL.save(Object.assign({},g,{phase:'day',dayEnds:Date.now()+5*60000}));
  } else if(g.phase==='day'){
    const votes=IRL.docs('v',g.round);
    const mine=votes.find(function(v){return v.id==='v'+g.round+'_'+IRL.me.id;});
    let html='<div class="card center"><h2>☀️ Talk. Accuse. Lie.</h2><div class="timer" id="tm">5:00</div>'
      +'<div class="muted">Remember: your card may have been swapped. You might not BE what you were dealt.</div></div>'
      +'<div class="role"><div class="muted" style="color:#888">Hold to peek — your night recap</div><div class="r" id="r">·····</div></div>'
      +'<div class="card"><h2>🗳 Your vote ('+votes.length+'/'+n+' in — hidden until all are in)</h2>'
      +g.names.map(function(nm,j){ return '<button class="pick'+(mine&&mine.t===j?' sel':'')+'" data-v="'+j+'">'+IRL.esc(nm)+'</button>'; }).join('')
      +'<button class="pick'+(mine&&mine.t==='x'?' sel':'')+'" data-v="x">🕊 No one dies</button></div>';
    if(votes.length>=n) html+='<button class="btn" id="rev">Reveal the vote!</button>';
    M.innerHTML=html;
    const r=document.getElementById('r');
    const recap=(role?('Dealt: '+role+'. ')+myNightInfo(g):'(spectator)');
    ['pointerdown','touchstart'].forEach(function(ev){ r.parentElement.addEventListener(ev,function(e){ e.preventDefault(); r.textContent=recap; r.style.fontSize='16px'; }); });
    ['pointerup','pointerleave','touchend'].forEach(function(ev){ r.parentElement.addEventListener(ev,function(){ r.textContent='·····'; r.style.fontSize=''; }); });
    M.querySelectorAll('[data-v]').forEach(function(el){ el.onclick=function(){
      const t=el.dataset.v==='x'?'x':+el.dataset.v;
      IRL.put({id:'v'+g.round+'_'+IRL.me.id,t:t}); }; });
    const tick=function(){ const el=document.getElementById('tm'); if(!el) return;
      const left=Math.max(0,(g.dayEnds||0)-Date.now()), s=Math.ceil(left/1000);
      el.textContent=Math.floor(s/60)+':'+('0'+s%60).slice(-2);
      if(!left){ el.textContent='⏰ VOTE NOW'; } };
    tick(); dayInt=setInterval(tick,500);
    const rv=document.getElementById('rev');
    if(rv) rv.onclick=function(){ IRL.save(Object.assign({},g,{phase:'reveal'})); };
    if(votes.length>=n&&IRL.coordinator(g)) IRL.save(Object.assign({},g,{phase:'reveal'}));
  } else if(g.phase==='reveal'){
    const fr=finalRoles(g), votes=IRL.docs('v',g.round);
    const tally={}; votes.forEach(function(v){ tally[v.t]=(tally[v.t]||0)+1; });
    let max=0; Object.keys(tally).forEach(function(k){ if(tally[k]>max) max=tally[k]; });
    let dead=[];
    if(!(tally['x']===max&&Object.keys(tally).filter(function(k){return tally[k]===max;}).length===1)){
      for(let j=0;j<n;j++) if(tally[j]===max) dead.push(j);
    }
    // the Hunter drags their vote target down with them
    dead.slice().forEach(function(d){ if(fr[d]==='Hunter'){ const hv=votes.find(function(v){return v.id==='v'+g.round+'_'+g.ids[d];});
      if(hv&&hv.t!=='x'&&dead.indexOf(hv.t)<0) dead.push(hv.t); } });
    const wolves=[]; for(let j=0;j<n;j++) if(fr[j]==='Werewolf') wolves.push(j);
    const wolfDied=dead.some(function(d){ return fr[d]==='Werewolf'; });
    const villageWins=wolves.length?wolfDied:dead.length===0;
    let html='<div class="card center"><h2>'+(villageWins?'🏡 The village wins!':'🐺 The wolves win!')+'</h2>'
      +'<div class="muted">'+(wolves.length?('The wolv'+(wolves.length>1?'es were':'f was')+': '+wolves.map(function(w){return IRL.esc(nameOf(g,w));}).join(' & ')):'Nobody was a wolf — both cards slept in the center!')+'</div></div>';
    html+='<div class="card"><h2>Who ended up as what</h2><table>';
    for(let j=0;j<n;j++){
      html+='<tr><td>'+(dead.indexOf(j)>=0?'💀 ':'')+IRL.esc(nameOf(g,j))+'</td><td>'+g.deal[j]+(fr[j]!==g.deal[j]?' → <b>'+fr[j]+'</b>':'')+'</td><td>'+(tally[j]||0)+' votes</td></tr>';
    }
    html+='</table><div class="muted" style="margin-top:6px">Center cards: '+g.deal.slice(n).join(', ')+'</div></div>';
    html+='<button class="btn" id="next">🌙 Another night</button>';
    // score the win once, at reveal render, keyed by round — idempotent write
    if(!g.scored){
      const sc=Object.assign({},g.scores||{});
      for(let j=0;j<n;j++){ const isWolf=fr[j]==='Werewolf'; if(isWolf!==villageWins) sc[g.ids[j]]=(sc[g.ids[j]]||0)+1; }
      if(IRL.coordinator(g)) IRL.save(Object.assign({},g,{scored:true,scores:sc}));
    }
    M.innerHTML=html+scoreTable(g);
    document.getElementById('next').onclick=start;
  }
}
IRL.onchange=render;
IRL.init().then(render); render();
</script>`;

  GifOS.irl = {
    netApps: [
      { name: 'Fake Facts',       appId: 'fakefacts', accent: [212, 112, 61],  html: FAKEFACTS_HTML },
      { name: 'One Clue',         appId: 'oneclue',   accent: [59, 165, 160],  html: ONECLUE_HTML },
      { name: 'Same Brain',       appId: 'samebrain', accent: [224, 92, 138],  html: SAMEBRAIN_HTML },
      { name: 'One Night Wolves', appId: 'wolves',    accent: [90, 74, 138],   html: WOLVES_HTML },
    ],
    apps: [
      { name: 'Odd Word Out',   appId: 'imposter', accent: [59, 165, 93],   html: ODDWORD_HTML },
      { name: 'Catch the Spy',  appId: 'spy',      accent: [77, 124, 214],  html: SPY_HTML },
      { name: 'Tilt',           appId: 'tilt',     accent: [232, 163, 60],  html: TILT_HTML },
      { name: 'The Dial',       appId: 'dial',     accent: [198, 92, 204],  html: DIAL_HTML },
      { name: 'Party Roulette', appId: 'roulette', accent: [123, 92, 255],  html: ROULETTE_HTML },
    ],
  };
})(typeof window !== 'undefined' ? window : globalThis);
