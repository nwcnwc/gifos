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

  GifOS.irl = {
    apps: [
      { name: 'Odd Word Out',   appId: 'imposter', accent: [59, 165, 93],   html: ODDWORD_HTML },
      { name: 'Catch the Spy',  appId: 'spy',      accent: [77, 124, 214],  html: SPY_HTML },
      { name: 'Tilt',           appId: 'tilt',     accent: [232, 163, 60],  html: TILT_HTML },
      { name: 'The Dial',       appId: 'dial',     accent: [198, 92, 204],  html: DIAL_HTML },
      { name: 'Party Roulette', appId: 'roulette', accent: [123, 92, 255],  html: ROULETTE_HTML },
    ],
  };
})(typeof window !== 'undefined' ? window : globalThis);
