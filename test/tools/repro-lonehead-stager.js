// repro-lonehead-stager.js — OPEN BUG (2026-07-29): a deep stager that is the
// LONE occupant of its row gets its feed to exactly ONE Section-1 seat and no
// further. Deterministic: seat 6 browsers at C=2, then forceSeat the stager's
// section-mate into another section so the stager is a solitary head.
//
//   stager P4@1/0.0 isHead=true hasRowMate=false
//   STAGER ships: 1 job (its up-target only)
//   P0@0/0.0 held:1   P1/P2/P3/P5 held:0   → "feed reached 1 seats"
//
// PRE-EXISTING, not caused by the 2026-07-29 echo fix: the same signature
// (every e2e-mosaic stage leg failing with "strip video 0x0") appears in runs
// taken before the owner/sender skip existed. It is topology-dependent, so it
// surfaced as ~30% flake in e2e-mosaic until the seating was compared across
// runs: every FAIL had the deep seats split across sections/rows, every PASS
// had the stager sharing its row.
//
// This is a DIAGNOSTIC, not a gate — the gate must not carry a known red.
// Fix it, then promote these assertions into e2e-mosaic.
//
//   node test/tools/repro-lonehead-stager.js     (needs site:8099 + relay:8790)
const { chromium, CHROME } = require('/home/nathan/projects/gifos/test/lib/pw');
const BASE='http://127.0.0.1:8099', RELAY='ws://127.0.0.1:8790', N=6;
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const browser=await chromium.launch({executablePath:CHROME,args:['--disable-features=WebRtcHideLocalIpsWithMdns','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
  const room='ls'+Math.random().toString(36).slice(2,7); const pages=[];
  for(let i=0;i<N;i++){const ctx=await browser.newContext({permissions:['camera','microphone']});
    await ctx.addInitScript({content:`try{localStorage.setItem('gifos_relay','${RELAY}');localStorage.setItem('gifos_name','P${i}')}catch(e){}; window.GIFOS_SCALE={C:2};`});
    const p=await ctx.newPage(); await p.goto(BASE+'/run.html#v='+room+'&DEBUG=on'); pages.push(p); await sleep(1200);}
  let coords=[]; const t0=Date.now();
  while(Date.now()-t0<90000){coords=await Promise.all(pages.map(p=>p.evaluate(()=>window.__gifosVideo&&__gifosVideo.meshCoord()).catch(()=>null)));
    if(coords.every(Boolean)&&coords.filter(c=>c.pc!==0).length>=2)break; await sleep(1500);}
  const cs=c=>c.pc+'/'+c.r+'.'+c.i;
  console.log('initial: '+coords.map(cs).join(' '));
  const deep=coords.map((c,i)=>({c,i})).filter(x=>x.c.pc!==0);
  const S=deep[0].i, M=deep[1].i;   // stager, and its section-mate to strand away
  const pids=await Promise.all(pages.map(p=>p.evaluate(()=>__gifosVideo.debugDump().me.peer)));
  const seed={}; coords.forEach((c,i)=>{ seed[cs(c)]=pids[i]; });
  // move the stager's neighbour into a DIFFERENT section → stager becomes a lone head
  const tgt={pc:(coords[S].pc===1?2:1), r:0, i:0};
  console.log('moving P'+M+' '+cs(coords[M])+' -> '+cs(tgt));
  await pages[M].evaluate((a)=>__gifosVideo.forceSeat(a.pc,a.r,a.i,a.seed),{pc:tgt.pc,r:tgt.r,i:tgt.i,seed});
  await sleep(12000);
  coords=await Promise.all(pages.map(p=>p.evaluate(()=>__gifosVideo.meshCoord()).catch(()=>null)));
  console.log('after:   '+coords.map(c=>c?cs(c):'?').join(' '));
  const sc=coords[S]; const mate=coords.some((c,i)=>i!==S&&c&&c.pc===sc.pc&&c.r===sc.r);
  console.log('stager P'+S+'@'+cs(sc)+' isHead='+(sc.i===0)+' hasRowMate='+mate);
  for(const p of pages) await p.evaluate(()=>{const n=document.getElementById('blur-none');if(n)n.click();const c=document.getElementById('cam');if(c&&c.classList.contains('off'))c.click();}).catch(()=>{});
  await sleep(3000);
  await pages[S].evaluate(()=>__gifosVideo.stageForTest(true));
  await sleep(18000);
  const st=await pages[S].evaluate(()=>{const m=__gifosVideo.mosaic();return{jobs:m.jobsActive,claims:m.claims};});
  console.log('STAGER ships: '+JSON.stringify(st.jobs));
  let held=0;
  for(let i=0;i<N;i++){ if(i===S)continue;
    const h=await pages[i].evaluate(()=>({held:__gifosVideo.stageInfo().held.length,painted:__gifosVideo.stageInfo().stripPainted}));
    if(h.held) held++;
    console.log('P'+i+'@'+(coords[i]?cs(coords[i]):'?')+' '+JSON.stringify(h));}
  console.log(held>0 ? 'RESULT: feed reached '+held+' seats' : 'RESULT: FEED REACHED NOBODY');
  await browser.close(); process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
const { chromium, CHROME } = require('/home/nathan/projects/gifos/test/lib/pw');
const BASE='http://127.0.0.1:8099', RELAY='ws://127.0.0.1:8790', N=6;
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const browser=await chromium.launch({executablePath:CHROME,args:['--disable-features=WebRtcHideLocalIpsWithMdns','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
  const room='ls'+Math.random().toString(36).slice(2,7); const pages=[];
  for(let i=0;i<N;i++){const ctx=await browser.newContext({permissions:['camera','microphone']});
    await ctx.addInitScript({content:`try{localStorage.setItem('gifos_relay','${RELAY}');localStorage.setItem('gifos_name','P${i}')}catch(e){}; window.GIFOS_SCALE={C:2};`});
    const p=await ctx.newPage(); await p.goto(BASE+'/run.html#v='+room+'&DEBUG=on'); pages.push(p); await sleep(1200);}
  let coords=[]; const t0=Date.now();
  while(Date.now()-t0<90000){coords=await Promise.all(pages.map(p=>p.evaluate(()=>window.__gifosVideo&&__gifosVideo.meshCoord()).catch(()=>null)));
    if(coords.every(Boolean)&&coords.filter(c=>c.pc!==0).length>=2)break; await sleep(1500);}
  const cs=c=>c.pc+'/'+c.r+'.'+c.i;
  console.log('initial: '+coords.map(cs).join(' '));
  const deep=coords.map((c,i)=>({c,i})).filter(x=>x.c.pc!==0);
  const S=deep[0].i, M=deep[1].i;   // stager, and its section-mate to strand away
  const pids=await Promise.all(pages.map(p=>p.evaluate(()=>__gifosVideo.debugDump().me.peer)));
  const seed={}; coords.forEach((c,i)=>{ seed[cs(c)]=pids[i]; });
  // move the stager's neighbour into a DIFFERENT section → stager becomes a lone head
  const tgt={pc:(coords[S].pc===1?2:1), r:0, i:0};
  console.log('moving P'+M+' '+cs(coords[M])+' -> '+cs(tgt));
  await pages[M].evaluate((a)=>__gifosVideo.forceSeat(a.pc,a.r,a.i,a.seed),{pc:tgt.pc,r:tgt.r,i:tgt.i,seed});
  await sleep(12000);
  coords=await Promise.all(pages.map(p=>p.evaluate(()=>__gifosVideo.meshCoord()).catch(()=>null)));
  console.log('after:   '+coords.map(c=>c?cs(c):'?').join(' '));
  const sc=coords[S]; const mate=coords.some((c,i)=>i!==S&&c&&c.pc===sc.pc&&c.r===sc.r);
  console.log('stager P'+S+'@'+cs(sc)+' isHead='+(sc.i===0)+' hasRowMate='+mate);
  for(const p of pages) await p.evaluate(()=>{const n=document.getElementById('blur-none');if(n)n.click();const c=document.getElementById('cam');if(c&&c.classList.contains('off'))c.click();}).catch(()=>{});
  await sleep(3000);
  await pages[S].evaluate(()=>__gifosVideo.stageForTest(true));
  await sleep(18000);
  const st=await pages[S].evaluate(()=>{const m=__gifosVideo.mosaic();return{jobs:m.jobsActive,claims:m.claims};});
  console.log('STAGER ships: '+JSON.stringify(st.jobs));
  let held=0;
  for(let i=0;i<N;i++){ if(i===S)continue;
    const h=await pages[i].evaluate(()=>({held:__gifosVideo.stageInfo().held.length,painted:__gifosVideo.stageInfo().stripPainted}));
    if(h.held) held++;
    console.log('P'+i+'@'+(coords[i]?cs(coords[i]):'?')+' '+JSON.stringify(h));}
  console.log(held>0 ? 'RESULT: feed reached '+held+' seats' : 'RESULT: FEED REACHED NOBODY');
  await browser.close(); process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
